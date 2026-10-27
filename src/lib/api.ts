import type { EngineEvent } from "./meta/engine";
import type { RunInfo } from "./ui-types";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(url: string) => fetch(url, { cache: "no-store" }).then((r) => unwrap<T>(r)),
  post: <T,>(url: string, body?: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) =>
      unwrap<T>(r),
    ),
  put: <T,>(url: string, body?: unknown) =>
    fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) =>
      unwrap<T>(r),
    ),
  patch: <T,>(url: string, body?: unknown) =>
    fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) =>
      unwrap<T>(r),
    ),
  del: <T,>(url: string) => fetch(url, { method: "DELETE" }).then((r) => unwrap<T>(r)),
};

export type StreamHandlers = {
  onEvent: (e: EngineEvent) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
};

/** خواندن جریان SSE مغز */
export async function openStream(url: string, payload: unknown, h: StreamHandlers, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal,
    });
  } catch (e) {
    h.onError?.((e as Error).message);
    return;
  }
  if (!res.ok || !res.body) {
    h.onError?.(`HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        h.onEvent(JSON.parse(data) as EngineEvent);
      } catch {
        /* keep-alive */
      }
    }
  }
  h.onDone?.();
}

export type RawEvent = {
  seq: number;
  channel: string;
  title: string;
  body: string | null;
  agentCode: string | null;
  modelId: string | null;
  payload: unknown;
};

export type StreamMsg =
  | { type: "batch"; cursor: number; events: RawEvent[]; partial?: string; run: Partial<RunInfo> & { id: number } }
  | { type: "error"; message: string };

/** اشتراک زنده‌ی یک اجرا (GET + SSE). در قطع اتصال، خطا پرتاب می‌شود تا فراخواننده دوباره وصل شود. */
export async function streamGet(url: string, onMessage: (m: StreamMsg) => void, signal?: AbortSignal) {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        onMessage(JSON.parse(data) as StreamMsg);
      } catch {
        /* keep-alive */
      }
    }
  }
}

export function fmtNum(n: number) {
  try {
    return n.toLocaleString("fa-IR");
  } catch {
    return String(n);
  }
}

export function timeAgo(d: string | Date) {
  const t = new Date(d).getTime();
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} ثانیه پیش`;
  if (s < 3600) return `${Math.round(s / 60)} دقیقه پیش`;
  if (s < 86400) return `${Math.round(s / 3600)} ساعت پیش`;
  return `${Math.round(s / 86400)} روز پیش`;
}
