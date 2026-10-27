import { db } from "@/db";
import { models as modelsTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSettings } from "./config";

export type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string };
export type Capability = "text" | "vision" | "image" | "video";

const baseCache = new Map<string, string>();

function withTimeout(ms: number, external?: AbortSignal | null) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  const onAbort = () => ctrl.abort();
  external?.addEventListener("abort", onAbort);
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(t);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

export async function fetchJSON(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 60000, ...rest } = init;
  const t = withTimeout(timeoutMs, rest.signal);
  try {
    const res = await fetch(url, { ...rest, signal: t.signal });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        typeof data === "object" && data && "error" in (data as Record<string, unknown>)
          ? JSON.stringify((data as Record<string, unknown>).error)
          : text.slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    return data;
  } finally {
    t.done();
  }
}

/** ریشه‌ی واقعی API را پیدا می‌کند (با/بدون /v1) و کش می‌کند */
export async function resolveBase(endpoint: string, apiKey: string): Promise<string> {
  const cleaned = endpoint.replace(/\/+$/, "");
  const cached = baseCache.get(`${cleaned}|${apiKey.slice(0, 6)}`);
  if (cached) return cached;
  const candidates = cleaned.endsWith("/v1")
    ? [cleaned, cleaned.replace(/\/v1$/, "")]
    : [`${cleaned}/v1`, cleaned];
  for (const c of candidates) {
    try {
      await fetchJSON(`${c}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 25000,
      });
      baseCache.set(`${cleaned}|${apiKey.slice(0, 6)}`, c);
      return c;
    } catch {
      /* try next */
    }
  }
  baseCache.set(`${cleaned}|${apiKey.slice(0, 6)}`, candidates[0]);
  return candidates[0];
}

export type DiscoveredModel = {
  id: string;
  owned_by?: string;
  context_length?: number;
  capabilities?: Record<string, unknown>;
};

/** کشف مدل‌ها از یک اندپوینت+کلید */
export async function discoverModels(endpoint: string, apiKey: string) {
  const base = await resolveBase(endpoint, apiKey);
  const data = (await fetchJSON(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeoutMs: 30000,
  })) as { data?: DiscoveredModel[] } | DiscoveredModel[];
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return { base, list: list.filter((m) => m && typeof m.id === "string") };
}

/** کشف یک‌جای همه‌ی مدل‌ها برای همه‌ی کلیدها و اندپوینت‌ها */
export async function discoverAll() {
  const { endpoints, keys } = await getSettings();
  const results: {
    endpoint: string;
    keyLabel: string;
    ok: boolean;
    count: number;
    error?: string;
    models: DiscoveredModel[];
  }[] = [];

  const eps = endpoints.length ? endpoints : [];
  const jobs: Promise<void>[] = [];
  for (const ep of eps) {
    for (const k of keys) {
      jobs.push(
        (async () => {
          try {
            const { list } = await discoverModels(ep.url, k.value);
            results.push({
              endpoint: ep.url,
              keyLabel: k.label,
              ok: true,
              count: list.length,
              models: list,
            });
          } catch (e) {
            results.push({
              endpoint: ep.url,
              keyLabel: k.label,
              ok: false,
              count: 0,
              error: (e as Error).message.slice(0, 240),
              models: [],
            });
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);
  return results;
}

export type CallOpts = {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: Msg[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  images?: string[];
};

function buildContent(o: CallOpts, m: Msg) {
  if (m.role === "user" && o.images?.length) {
    const parts: unknown[] = [{ type: "text", text: m.content }];
    for (const img of o.images) {
      if (img.startsWith("http")) parts.push({ type: "image_url", image_url: { url: img } });
      else parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${img}` } });
    }
    return parts;
  }
  return m.content;
}

function payload(o: CallOpts, v: { json?: boolean; maxTokens?: boolean; temp?: boolean; stream?: boolean; capStyle?: boolean }) {
  const base: Record<string, unknown> = {
    model: o.model,
    messages: o.messages.map((m) => ({ role: m.role, content: buildContent(o, m) })),
    stream: !!v.stream,
  };
  if (v.temp !== false) base.temperature = o.temperature ?? 0.7;
  if (v.maxTokens !== false) {
    if (v.capStyle) base.max_completion_tokens = o.maxTokens ?? 4096;
    else base.max_tokens = o.maxTokens ?? 4096;
  }
  if (v.json !== false && o.json) base.response_format = { type: "json_object" };
  return JSON.stringify(base);
}

/**
 * چند شکلِ سازگار از یک درخواست: بسیاری از فراهم‌کننده‌های OpenAI-سازگار
 * response_format یا max_tokens یا temperature را نمی‌پذیرند.
 */
function bodyVariants(o: CallOpts, stream = false) {
  return [
    payload(o, { stream }),
    payload(o, { json: false, stream }),
    payload(o, { capStyle: true, stream }),
    payload(o, { json: false, temp: false, maxTokens: false, stream }),
  ];
}

type ChatResponse = {
  choices?: { message?: { content?: string | unknown[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type CallResult = {
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  latencyMs: number;
};

/** یک فراخوانی همگام با ثبت آمار زنده در مغز */
export async function chat(o: CallOpts, dbRowId?: number): Promise<CallResult> {
  const started = Date.now();
  const base = await resolveBase(o.endpoint, o.apiKey);
  try {
    let data: ChatResponse | null = null;
    let lastErr: Error | null = null;
    for (const variant of bodyVariants(o)) {
      try {
        data = (await fetchJSON(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
          body: variant,
          timeoutMs: o.timeoutMs ?? 180000,
          signal: o.signal,
        })) as ChatResponse | null;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e as Error;
        const msg = (e as Error).message;
        const retriable = /400|422|response_format|max_tokens|temperature|unsupported|invalid_request/i.test(msg);
        if (!retriable || o.signal?.aborted) throw e;
      }
    }
    if (lastErr) throw lastErr;
    if (!data) throw new Error("پاسخ خالی از فراهم‌کننده");
    const raw = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(raw)
      ? raw.map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? ""))).join("")
      : (raw ?? "");
    const latencyMs = Date.now() - started;
    if (dbRowId) await recordStats(dbRowId, latencyMs, true);
    return { text: String(text), model: o.model, usage: data?.usage, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (dbRowId) await recordStats(dbRowId, latencyMs, false, (e as Error).message.slice(0, 300));
    throw e;
  }
}

export async function chatStream(
  o: CallOpts,
  onDelta: (chunk: string) => void,
  dbRowId?: number,
): Promise<CallResult> {
  const started = Date.now();
  const base = await resolveBase(o.endpoint, o.apiKey);
  const t = withTimeout(o.timeoutMs ?? 300000, o.signal);
  try {
    let res: Response | null = null;
    let lastMsg = "";
    for (const variant of bodyVariants(o, true)) {
      const attempt = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
        body: variant,
        signal: t.signal,
      });
      if (attempt.ok && attempt.body) {
        res = attempt;
        break;
      }
      lastMsg = `HTTP ${attempt.status}: ${(await attempt.text().catch(() => "")).slice(0, 240)}`;
      if (!/400|422|response_format|max_tokens|temperature|unsupported/i.test(lastMsg)) break;
    }
    if (!res || !res.body) throw new Error(lastMsg || "جریان برقرار نشد");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; text?: string }[];
          };
          const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
          if (d) {
            full += d;
            onDelta(d);
          }
        } catch {
          /* keep-alive */
        }
      }
    }
    const latencyMs = Date.now() - started;
    if (dbRowId) await recordStats(dbRowId, latencyMs, true);
    return { text: full, model: o.model, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (dbRowId) await recordStats(dbRowId, latencyMs, false, (e as Error).message.slice(0, 300));
    throw e;
  } finally {
    t.done();
  }
}

async function recordStats(id: number, latencyMs: number, ok: boolean, error?: string) {
  try {
    if (ok) {
      await db
        .update(modelsTable)
        .set({
          calls: sql`${modelsTable.calls} + 1`,
          latencyMs: sql`((${modelsTable.latencyMs} * 3) + ${latencyMs}) / 4`,
          score: sql`LEAST(1, (${modelsTable.score} * 0.9) + 0.1 * (1.0 - LEAST(${latencyMs}, 20000) / 25000.0))`,
        })
        .where(eq(modelsTable.id, id));
    } else {
      await db
        .update(modelsTable)
        .set({
          failures: sql`${modelsTable.failures} + 1`,
          score: sql`GREATEST(0.05, ${modelsTable.score} - 0.08)`,
          lastError: error ?? null,
        })
        .where(eq(modelsTable.id, id));
    }
  } catch {
    /* stats never break a run */
  }
}

/* ------------------------------------------------------------------ */
/*  رسانه: تولید تصویر و ویدیو                                          */
/* ------------------------------------------------------------------ */

export type MediaResult = { ok: boolean; url?: string; b64?: string; error?: string; raw?: unknown };

export async function generateImage(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  size = "1024x1024",
): Promise<MediaResult> {
  const base = await resolveBase(endpoint, apiKey);
  const paths = [`${base}/images/generations`, `${base}/image/generations`];
  let lastErr = "";
  for (const p of paths) {
    try {
      const data = (await fetchJSON(p, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1, size, response_format: "url" }),
        timeoutMs: 240000,
      })) as { data?: { url?: string; b64_json?: string }[] };
      const first = data?.data?.[0];
      if (first?.url) return { ok: true, url: first.url };
      if (first?.b64_json) return { ok: true, b64: first.b64_json };
      // برخی فراهم‌کننده‌ها خروجی را در chat/completions می‌دهند
      const alt = await chat({ endpoint, apiKey, model, messages: [{ role: "user", content: prompt }], maxTokens: 2048 });
      const m = alt.text.match(/https?:\/\/\S+\.(?:png|jpe?g|webp)\S*/i);
      if (m) return { ok: true, url: m[0] };
      return { ok: false, error: "پاسخ تصویر بدون URL/b64 بود", raw: data };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return { ok: false, error: lastErr };
}

export async function generateVideo(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<MediaResult> {
  const base = await resolveBase(endpoint, apiKey);
  const paths = [`${base}/videos/generations`, `${base}/video/generations`, `${base}/videos`];
  let lastErr = "";
  for (const p of paths) {
    try {
      const data = (await fetchJSON(p, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, duration: 5, size: "1280x720" }),
        timeoutMs: 300000,
      })) as Record<string, unknown>;
      const flat = JSON.stringify(data);
      const m = flat.match(/https?:\/\/[^"\\ ]+\.(?:mp4|webm|mov)[^"\\ ]*/i);
      if (m) return { ok: true, url: m[0], raw: data };
      const b64 = (data as { video?: string }).video;
      if (typeof b64 === "string" && b64.length > 500) return { ok: true, b64, raw: data };
      return { ok: false, error: "پاسخ ویدیو قابل استخراج نبود", raw: data };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return { ok: false, error: lastErr };
}

/* ------------------------------------------------------------------ */
/*  مسیریاب توانمندی                                                    */
/* ------------------------------------------------------------------ */

export type RoutedModel = {
  id: number;
  modelId: string;
  endpoint: string;
  apiKey: string;
  keyLabel: string;
  score: number;
};

/** انتخاب n مدل فعال برای یک توانمندی با چرخش کلیدها (موازی‌سازی مغزی) */
export async function routeModels(cap: Capability, n: number, strategy = "weighted"): Promise<RoutedModel[]> {
  const capCol =
    cap === "vision" ? modelsTable.canVision : cap === "image" ? modelsTable.canImage : cap === "video" ? modelsTable.canVideo : modelsTable.canText;
  const rows = await db
    .select()
    .from(modelsTable)
    .where(and(eq(modelsTable.enabled, true), eq(capCol, true)));
  if (!rows.length) return [];
  const { keys } = await getSettings();
  const keyMap = new Map(keys.map((k) => [k.label, k.value]));

  const enriched = rows.map((r, i) => ({
    id: r.id,
    modelId: r.modelId,
    endpoint: r.endpoint,
    keyLabel: r.keyLabel,
    apiKey: keyMap.get(r.keyLabel) ?? keys[i % Math.max(keys.length, 1)]?.value ?? "",
    score: r.score,
    latency: r.latencyMs,
    calls: r.calls,
  }));

  if (strategy === "round-robin") {
    enriched.sort((a, b) => a.calls - b.calls);
  } else if (strategy === "fastest") {
    enriched.sort((a, b) => (a.latency || 1e9) - (b.latency || 1e9));
  } else {
    // وزن‌دار تصادفی: مدل‌های قوی‌تر شانس بیشتری دارند اما همه دیده می‌شوند
    enriched.sort((a, b) => b.score * (0.7 + Math.random() * 0.6) - a.score * (0.7 + Math.random() * 0.6));
  }
  const picked = enriched.filter((e) => e.apiKey).slice(0, Math.max(1, n));
  if (!picked.length && enriched.length) return [enriched[0]];
  return picked;
}

export async function countEnabledModels() {
  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
      text: sql<number>`sum(case when can_text then 1 else 0 end)::int`,
      vision: sql<number>`sum(case when can_vision then 1 else 0 end)::int`,
      image: sql<number>`sum(case when can_image then 1 else 0 end)::int`,
      video: sql<number>`sum(case when can_video then 1 else 0 end)::int`,
    })
    .from(modelsTable)
    .where(eq(modelsTable.enabled, true));
  const r = rows[0] ?? { n: 0, text: 0, vision: 0, image: 0, video: 0 };
  return {
    n: Number(r.n ?? 0),
    text: Number(r.text ?? 0),
    vision: Number(r.vision ?? 0),
    image: Number(r.image ?? 0),
    video: Number(r.video ?? 0),
  };
}
