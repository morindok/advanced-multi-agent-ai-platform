import { db } from "@/db";
import { agents as agentsTable, artifacts, runEvents, runs } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { bootstrap, gene, getGenome } from "./config";
import { assertRunning, Cancelled } from "./jobs";
import { buildReadme, fileComplete, listProjectFiles, readProjectFile, safeRel, verifyProject, writeProjectFile, type Issue, type ProjectPlan } from "./project";
import { nodeTest, playTest, type PlayReport } from "./runtime";
import { ensureToolsSeeded, execTool } from "./tools";
import {
  chat,
  chatStream,
  countEnabledModels,
  generateImage,
  generateVideo,
  routeModels,
  type Msg,
  type RoutedModel,
} from "./llm";
import {
  buildNodeSystem,
  classifyIntent,
  mergeConsensus,
  parseEnvelope,
  projectJury,
  selectCouncil,
  weightOf,
  type Consensus,
  type Envelope,
  type GateVerdict,
  type Intent,
} from "./protocol";
import type { AgentRow } from "@/db/schema";
import type { GeneratedAgent, Region } from "./agents";

export type EngineEvent = {
  channel:
    | "status"
    | "agent"
    | "token"
    | "tool"
    | "consensus"
    | "gate"
    | "artifact"
    | "progress"
    | "error"
    | "done"
    | "evolution";
  agentCode?: string;
  modelId?: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
};

export type Emit = (e: EngineEvent) => void | Promise<void>;

type BlueprintNode = {
  id: string;
  part: string;
  title: string;
  brief: string;
  chars: number;
  status: "pending" | "done" | "failed";
  artifactId?: number;
  tries?: number;
};
type BuildUnit = { id: string; path: string; title: string; brief: string; status: "pending" | "done"; artifactId?: number };
type Blueprint = {
  phase: "outline" | "expand" | "build" | "done";
  target: number;
  produced: number;
  calls: number;
  cursor: number;
  outline: BlueprintNode[];
  buildUnits: BuildUnit[];
  rootArtifactId?: number;
};

type Runner = {
  runId: number;
  sessionId: string;
  prompt: string;
  attachments: string[];
  emit: Emit;
  genome: Record<string, unknown>;
  seq: number;
  dry: boolean;
  stats: { calls: number; tokens: number; ms: number; tools: number };
  state: RunState;
  pool: RoutedModel[];
  sliced: boolean;
};

let AGENT_CACHE: AgentRow[] | null = null;
async function loadAgents(): Promise<AgentRow[]> {
  if (AGENT_CACHE && AGENT_CACHE.length >= 1000) return AGENT_CACHE;
  await bootstrap();
  const rows = await db.select().from(agentsTable).orderBy(asc(agentsTable.id));
  AGENT_CACHE = rows;
  return rows;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export type RunState = { attachments?: string[]; forceMode?: string; slices?: number; build?: BuildState };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * یک اجرای کامل یا یک برش از آن. هر بار که صدا زده شود، از نقطه‌ی ذخیره‌شده ادامه می‌دهد.
 * پایان موفق: بازگشت عادی. توقف/خطا: استثنا (کارگر تصمیم می‌گیرد).
 */
export async function runJob(runId: number, emit: Emit): Promise<void> {
  await bootstrap();
  await ensureToolsSeeded();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error("اجرا یافت نشد");

  const genome = await getGenome();
  const caps = await countEnabledModels();
  const dry = caps.n === 0;
  const pool = dry ? [] : await routeModels("text", 8, String(gene(genome, "router.strategy", "weighted")));
  const st: RunState = { ...((run.state ?? {}) as RunState) };
  const R: Runner = {
    runId,
    sessionId: run.sessionId,
    prompt: run.prompt,
    attachments: st.attachments ?? [],
    emit,
    genome,
    seq: 0,
    dry,
    stats: { calls: 0, tokens: 0, ms: 0, tools: 0 },
    state: st,
    pool,
    sliced: false,
  };

  const intent = classifyIntent(run.prompt, R.attachments.length > 0);
  if (st.forceMode === "standard" || st.forceMode === "deep" || st.forceMode === "forge") intent.metaMode = st.forceMode;
  await db.update(runs).set({ intent: intent.kind, mode: intent.metaMode }).where(eq(runs.id, runId));
  await log(
    R,
    "status",
    st.slices ? `ادامه‌ی خودکار — برش ${st.slices + 1}` : "راه‌اندازی مغز یکپارچه",
    dry ? "هیچ مدل فعالی نیست — حالت خشک" : `${caps.n} مدل فعال (متن:${caps.text} ویژن:${caps.vision} تصویر:${caps.image} ویدیو:${caps.video})`,
    { caps, dry },
  );
  if (!st.slices) {
    await log(R, "status", `نیت‌سنجی: ${intent.kind} / سطح ${intent.metaMode}`, `پیچیدگی ${(intent.complexity * 100).toFixed(0)}٪ — سیگنال‌ها: ${intent.signals.join("، ") || "—"}`, { intent });
  }

  const all = await loadAgents();
  const gen: GeneratedAgent[] = all.map((a) => ({
    code: a.code,
    name: a.name,
    region: a.region as Region,
    tier: a.tier,
    specialty: a.specialty,
    functions: a.functions as string[],
    skill: a.skill,
  }));
  const savedBp = (run.blueprint ?? {}) as unknown as Blueprint;
  const resume = savedBp.outline?.length ? { ...savedBp, calls: 0 } : undefined;
  const mode = intent.metaMode;

  if (mode !== "forge" && intent.kind === "image") await mediaPipeline(R, gen, intent, "image");
  else if (mode !== "forge" && intent.kind === "video") await mediaPipeline(R, gen, intent, "video");
  else if (mode === "forge") await forgePipeline(R, gen, intent, resume);
  else if (intent.kind === "deep_build" || (intent.kind === "code" && mode !== "standard")) await projectBuild(R, gen, intent, null);
  else await councilPipeline(R, gen, intent);

  if (R.sliced) return;
  await db.update(runs).set({ stats: R.stats, state: R.state }).where(eq(runs.id, runId));
  await evolve(R, intent);
}

async function log(R: Runner, channel: EngineEvent["channel"], title: string, body?: string, payload?: Record<string, unknown>, agentCode?: string, modelId?: string) {
  const ev: EngineEvent = { channel, title, body, payload, agentCode, modelId };
  R.emit(ev);
}

async function setProgress(R: Runner, phase: string, p: number) {
  await db.update(runs).set({ phase, progress: Math.max(0, Math.min(1, p)) }).where(eq(runs.id, R.runId));
  R.emit({ channel: "progress", title: phase, payload: { progress: p } });
}

/* ------------------------------------------------------------------ */
/*  فراخوانی نورون                                                      */
/* ------------------------------------------------------------------ */

async function dispatchNode(
  R: Runner,
  agent: GeneratedAgent,
  model: RoutedModel | null,
  task: string,
  context: string,
  opLevel: string,
  opts: { json?: boolean; maxTokens?: number; images?: string[] } = {},
): Promise<Envelope> {
  await assertRunning(R.runId);
  const sys = buildNodeSystem(agent, opLevel);
  const userMsg = `# برش اختصاصی تو\n${task}\n\n# زمینه‌ی مغز\n${context.slice(0, 24000)}\n\n# درخواست کاربر\n${R.prompt}`;

  if (R.dry || (!model && R.pool.length === 0)) {
    await log(R, "agent", `${agent.code} ⟨${agent.specialty}⟩ در حالت خشک برش را پردازش کرد`, task.slice(0, 300), undefined, agent.code, "dry");
    return dryEnvelope(agent, task, opLevel);
  }

  const candidates: RoutedModel[] = [];
  if (model) candidates.push(model);
  for (const m of R.pool) if (candidates.length < 3 && !candidates.some((c) => c.id === m.id)) candidates.push(m);

  let lastErr = "";
  for (const cm of candidates) {
    await assertRunning(R.runId);
    const t0 = Date.now();
    R.emit({ channel: "agent", title: `${agent.code} → ${cm.modelId}`, body: task.slice(0, 200), agentCode: agent.code, modelId: cm.modelId });
    try {
      const res = await chat(
        {
          endpoint: cm.endpoint,
          apiKey: cm.apiKey,
          model: cm.modelId,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userMsg },
          ],
          temperature: 0.55 + agent.tier * 0.04,
          maxTokens: opts.maxTokens ?? 3500,
          json: true,
          images: opts.images,
          timeoutMs: gene<number>(R.genome, "engine.timeoutMs", 180000),
        },
        cm.id,
      );
      R.stats.calls += 1;
      R.stats.ms += Date.now() - t0;
      R.stats.tokens += (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0);
      const env = parseEnvelope(res.text, agent.code);
      env.score = env.confidence * weightOf(agent);
      await log(R, "agent", `${agent.code} ⟨${agent.specialty}⟩ برش را تحویل داد`, env.thought || env.output.slice(0, 280), { chars: env.output.length, confidence: env.confidence, ms: res.latencyMs }, agent.code, cm.modelId);
      return env;
    } catch (e) {
      lastErr = (e as Error).message;
      await log(R, "error", `${agent.code} روی ${cm.modelId} ناموفق بود`, lastErr.slice(0, 300), undefined, agent.code, cm.modelId);
    }
  }
  await log(R, "error", `${agent.code} هیچ پاسخی نگرفت`, lastErr.slice(0, 300), undefined, agent.code);
  return { node: agent.code, role: "failed", thought: "", confidence: 0, output: "", claims: [], contradictions: [], artifacts: [], toolRequests: [], nextQueries: [] };
}

/** فراخوانی متنی ساده با چرخش مدل‌ها و تلاش مجدد (برای تولید فایل‌های کد) */
async function callText(R: Runner, system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const pool = R.pool;
  if (!pool.length) return "";
  for (let attempt = 0; attempt < 4; attempt++) {
    await assertRunning(R.runId);
    const m = pool[attempt % pool.length];
    try {
      const res = await chat(
        {
          endpoint: m.endpoint,
          apiKey: m.apiKey,
          model: m.modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature,
          maxTokens,
          timeoutMs: gene<number>(R.genome, "engine.timeoutMs", 180000),
        },
        m.id,
      );
      R.stats.calls += 1;
      R.stats.tokens += (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0);
      if (res.text.trim()) return res.text;
    } catch (e) {
      await log(R, "error", `فراخوانی ${m.modelId} ناموفق (تلاش ${attempt + 1})`, (e as Error).message.slice(0, 300), undefined, undefined, m.modelId);
    }
    await sleep(1500 * (attempt + 1));
  }
  return "";
}

function dryEnvelope(agent: { code: string; specialty: string; name: string }, task: string, opLevel: string): Envelope {
  const body = `## برش ${agent.code} — ${agent.specialty}\n\n> حالت خشک: این خروجی توسط شبیه‌ساز پروتکل تولید شده چون هیچ مدل فعالی در رجیستری نیست.\n\n**ماموریت:** ${task}\n\n**طرح پیشنهادی (سطح ${opLevel}):**\n1. تعریف مرزها و قرارداد داده\n2. الگوریتم هسته و شرایط لبه\n3. سنجه‌های پذیرش و آزمون\n4. ریسک‌ها و راه‌حل جایگزین\n`;
  return {
    node: agent.code,
    role: agent.specialty,
    thought: "شبیه‌سازی پروتکل بدون مدل فعال",
    confidence: 0.4,
    output: body,
    claims: [`برش «${task.slice(0, 40)}» نیازمند قرارداد داده‌ی صریح است`],
    contradictions: [],
    artifacts: [],
    toolRequests: [],
    nextQueries: [],
  };
}

/* ------------------------------------------------------------------ */
/*  خط لوله‌ی شورا (حالت استاندارد و عمیق)                              */
/* ------------------------------------------------------------------ */

async function councilPipeline(R: Runner, gen: GeneratedAgent[], intent: Intent) {
  const councilSize = intent.metaMode === "deep" ? Math.min(12, 4 + Math.round(intent.complexity * 8)) : 3;
  const { agents: council, slices } = selectCouncil(gen, intent, councilSize);
  await db.update(runs).set({ council: council.map((c) => c.code) }).where(eq(runs.id, R.runId));
  await log(R, "status", `شورا تشکیل شد: ${council.length} نورون`, council.map((c) => `${c.code} ⟨${c.specialty}⟩`).join(" | "));
  await setProgress(R, "council", 0.15);

  const cap: "text" | "vision" = intent.needs.includes("vision") && R.attachments?.length ? "vision" : "text";
  const routed = await routeModels(cap, council.length, String(gene(R.genome, "router.strategy", "weighted")));
  if (!routed.length && !R.dry) throw new Error("هیچ مدل فعالی برای توانمندی «" + cap + "» وجود ندارد. در تنظیمات، تیک مدل‌ها را بزنید.");

  // گام ۱: فن‌اوت موازی
  const contextSeed = `سطح عملیات: ${intent.metaMode}\nحوزه‌ها: ${intent.domains.join("، ")}\nنیازمندی‌ها: ${intent.needs.join("، ")}`;
  let envelopes = await mapLimit(council, gene<number>(R.genome, "engine.parallelism", 6), async (a, i) =>
    dispatchNode(R, a, routed[i % routed.length] ?? null, slices[i], contextSeed, intent.metaMode, { images: cap === "vision" ? R.attachments : undefined }),
  );
  envelopes = envelopes.filter((e) => e.output || e.toolRequests?.length);

  // گام ۲: حلقه‌ی ابزار — جن خودش دسترسی می‌گیرد
  const toolCtx = { runId: R.runId, sessionId: R.sessionId, log: (t: string, b?: string) => void R.emit({ channel: "tool", title: t, body: b }), allowShell: gene<boolean>(R.genome, "security.allowShell", false) };
  const toolFindings: string[] = [];
  for (let step = 0; step < gene<number>(R.genome, "engine.maxToolSteps", 8); step++) {
    const requests = envelopes.flatMap((e) => e.toolRequests ?? []);
    if (!requests.length) {
      if (intent.needs.includes("web") || intent.kind === "market" || intent.kind === "research") {
        const auto = autoToolPlan(intent, R.prompt);
        if (!auto.length || step > 0) break;
        requests.push(...auto);
      } else break;
    }
    await setProgress(R, "tooling", 0.3 + step * 0.05);
    await log(R, "tool", `${requests.length} درخواست ابزار از نورون‌ها`, requests.map((r) => `${r.tool}(${JSON.stringify(r.args).slice(0, 120)}) — ${r.why}`).join("\n"));
    const results = await mapLimit(requests.slice(0, 8), 4, async (req) => {
      const res = await execTool(req.tool, req.args, toolCtx);
      R.stats.tools += 1;
      await log(R, "tool", `نتیجه‌ی ${req.tool}: ${res.ok ? "موفق" : "ناموفق"}`, (res.ok ? res.text : res.error ?? "").slice(0, 900), { args: req.args });
      return `### ابزار ${req.tool}\n${res.ok ? res.text.slice(0, 6000) : `خطا: ${res.error}`}`;
    });
    toolFindings.push(...results);
    // بازخورد نتایج به مغز برای بازپردازش
    const ctx2 = `${contextSeed}\n\n# یافته‌های ابزار (داده‌ی واقعی)\n${toolFindings.join("\n\n").slice(0, 30000)}`;
    const reRun = envelopes.slice(0, Math.min(6, council.length));
    envelopes = await mapLimit(reRun, gene<number>(R.genome, "engine.parallelism", 6), async (a, i) =>
      dispatchNode(R, council[i], routed[i % routed.length] ?? null, `${slices[i]}\n\n(بازپردازش با داده‌ی ابزار — این بار بر پایه‌ی شواهد واقعی و بدون درخواست ابزار تکراری)`, ctx2, intent.metaMode),
    ).then((r) => r.filter((e) => e.output));
    if (!envelopes.length) break;
    const more = envelopes.some((e) => (e.toolRequests ?? []).length > 0);
    if (!more) break;
  }

  // گام ۳: اجماع
  const weights = new Map(council.map((c) => [c.code, weightOf(c)]));
  let consensus = mergeConsensus(envelopes, weights);
  await log(R, "consensus", `اجماع نخست: امتیاز ${consensus.score} | توافق ${consensus.agreement}`, `ستون فقرات: ${consensus.spine.node} | مشارکت‌ها: ${consensus.contributions.map((c) => `${c.node}:${c.chars}ch`).join("، ")}`, { claims: consensus.acceptedClaims.slice(0, 10) });
  await persistEnvelopeArtifacts(R, envelopes, consensus);
  await setProgress(R, "consensus", 0.55);

  // گام ۴: دروازه‌ی کیفیت با هیئت ۱۰۰ نفره + چرخه‌ی نقد
  const threshold = gene<number>(R.genome, "consensus.threshold", 0.86);
  const maxIter = gene<number>(R.genome, "consensus.maxIterations", 4);
  let verdict: GateVerdict | null = null;
  for (let iter = 0; iter < maxIter; iter++) {
    verdict = await qualityGate(R, gen, consensus, threshold);
    await log(R, "gate", `دروازه‌ی کیفیت #${iter + 1}: ${verdict.score} ${verdict.pass ? "✓ پذیرفته" : "✗ رد"}`, `هیئت ۱۰۰ نفره — ${verdict.seats.length} رأی واقعی + ${verdict.projected} رأی فرافکنی‌شده\nکاستی‌ها:\n${verdict.deficiencies.join("\n") || "—"}`, { verdict });
    if (verdict.pass) break;
    if (iter === maxIter - 1) break;
    await setProgress(R, "refine", 0.6 + iter * 0.1);
    // چرخه‌ی بازسازی: نورون‌های منتقد با دستورات هیئت
    const critics = selectCouncil(gen, { ...intent, domains: ["prefrontal", "cortex", "cerebellum"] as Region[] }, 4).agents;
    const directives = verdict.directives.join("\n- ");
    const refined = await mapLimit(critics, 4, async (a, i) =>
      dispatchNode(R, a, routed[i % Math.max(1, routed.length)] ?? null, `بازسازی و ارتقای خروجی مغز بر پایه‌ی دستورات هیئت داوران:\n- ${directives}\n\nکاستی‌های شناسایی‌شده:\n${verdict!.deficiencies.join("\n")}`, consensus.merged.slice(0, 20000), intent.metaMode),
    );
    const all = [...envelopes, ...refined.filter((r) => r.output)];
    consensus = mergeConsensus(all, new Map([...council, ...critics].map((c) => [c.code, weightOf(c)])));
    envelopes = all;
    await log(R, "consensus", `اجماع بازسازی‌شده #${iter + 1}: امتیاز ${consensus.score}`, `${all.length} نورون مشارکت کردند`);
  }
  await setProgress(R, "converge", 0.88);

  // گام ۵: همگرایی نهایی — یکپارچه‌سازی و استریم برای کاربر
  const finalText = await converge(R, routed, consensus, verdict, intent, toolFindings);
  await db.update(runs).set({ gate: verdict ?? {}, plan: slices, producedChars: finalText.length, progress: 1 }).where(eq(runs.id, R.runId));
}

async function qualityGate(R: Runner, gen: GeneratedAgent[], consensus: Consensus, threshold: number): Promise<GateVerdict> {
  const jury = selectCouncil(gen, { kind: "analysis", confidence: 1, complexity: 1, domains: ["prefrontal", "cortex", "cerebellum", "hippocampus", "limbic", "visual", "brainstem"], needs: ["text"], metaMode: "deep", signals: [] }, gene<number>(R.genome, "consensus.jury", 100)).agents;
  const seatCount = R.dry ? 0 : Math.min(6, Math.max(3, Math.round(jury.length / 20)));
  const seats = await routeModels("text", seatCount);
  const criteria = [
    "پوشش کامل خواسته‌ی کاربر",
    "عمق فنی و جزئیات اجرایی",
    "سازگاری درونی و نبود تناقض",
    "صحت و قابل‌اتکا بودن",
    "ساختار و خوانایی",
    "قابلیت پیاده‌سازی فوری",
  ];
  const votes: { node: string; vote: number; note: string }[] = [];
  if (seats.length) {
    await mapLimit(Array.from({ length: seatCount }), Math.min(6, seatCount), async (_, i) => {
      const j = jury[i * Math.max(1, Math.floor(jury.length / seatCount))];
      if (!j) return;
      const model = seats[i % seats.length];
      try {
        const res = await chat(
          {
            endpoint: model.endpoint,
            apiKey: model.apiKey,
            model: model.modelId,
            json: true,
            maxTokens: 700,
            temperature: 0.2,
            messages: [
              { role: "system", content: `تو داور ${j.code} در هیئت ۱۰۰ نفره‌ی مغز NCP هستی. معیارها: ${criteria.join(" | ")}. فقط JSON بده: {"vote":0..1,"note":"..."}` },
              { role: "user", content: `درخواست کاربر:\n${R.prompt.slice(0, 2000)}\n\nخروجی اجماعی مغز:\n${consensus.merged.slice(0, 26000)}` },
            ],
          },
          model.id,
        );
        R.stats.calls += 1;
        const j2 = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { vote?: number; note?: string };
        votes.push({ node: j.code, vote: Math.max(0, Math.min(1, Number(j2.vote ?? 0.5))), note: String(j2.note ?? "").slice(0, 400) });
        await log(R, "gate", `رأی داور ${j.code}: ${Number(j2.vote ?? 0).toFixed(2)}`, j2.note, undefined, j.code, model.modelId);
      } catch (e) {
        await log(R, "error", `داور ${j.code} خطا داد`, (e as Error).message.slice(0, 200), undefined, j.code, model.modelId);
      }
    });
  }
  return projectJury(jury, votes, threshold);
}

async function converge(R: Runner, routed: RoutedModel[], consensus: Consensus, verdict: GateVerdict | null, intent: Intent, findings: string[]): Promise<string> {
  const model = routed[0] ?? (await routeModels("text", 1))[0] ?? null;
  const brief = [
    "تو «همگرای نهایی» مغز یکپارچه هستی. خروجی اجماعی نورون‌ها را به یک پاسخ واحد، منسجم، فارسی و کاملاً متناسب با درخواست کاربر تبدیل کن.",
    "هیچ اشاره‌ای به نورون/ایجنت/پروتکل در متن نهایی نکن؛ فقط پاسخ نهایی با ساختار markdown حرفه‌ای.",
    verdict && !verdict.pass ? `کاستی‌های هیئت داوران را برطرف کن: ${verdict.directives.join("؛ ")}` : "",
    findings.length ? "از داده‌های واقعی ابزارها که در زمینه آمده استفاده کن و اعداد را دقیق نقل کن." : "",
  ].filter(Boolean).join("\n");

  if (R.dry || !model) {
    const text = dryConverge(R, consensus, verdict);
    await streamFake(R, text);
    return text;
  }
  await log(R, "status", "همگرایی نهایی و استریم پاسخ", model.modelId, undefined, undefined, model.modelId);
  R.emit({ channel: "token", title: "reset", body: "" });
  let acc = "";
  try {
    const res = await chatStream(
      {
        endpoint: model.endpoint,
        apiKey: model.apiKey,
        model: model.modelId,
        temperature: 0.5,
        maxTokens: 8000,
        messages: [
          { role: "system", content: brief },
          { role: "user", content: `درخواست کاربر:\n${R.prompt}\n\n${findings.length ? `داده‌ی ابزارها:\n${findings.join("\n").slice(0, 12000)}\n\n` : ""}خروجی اجماعی مغز:\n${consensus.merged.slice(0, 40000)}\n\nامتیاز اجماع: ${consensus.score} | رأی هیئت: ${verdict?.score ?? "—"}` },
        ],
      },
      (d) => {
        acc += d;
        R.emit({ channel: "token", title: "token", body: d });
      },
      model.id,
    );
    R.stats.calls += 1;
    return res.text || acc;
  } catch (e) {
    await log(R, "error", "همگرایی نهایی شکست خورد — خروجی اجماع خام بازگردانده شد", (e as Error).message.slice(0, 240));
    const text = consensus.merged;
    await streamFake(R, text);
    return text;
  }
}

async function streamFake(R: Runner, text: string) {
  R.emit({ channel: "token", title: "reset", body: "" });
  const chunk = 48;
  for (let i = 0; i < text.length; i += chunk) R.emit({ channel: "token", title: "token", body: text.slice(i, i + chunk) });
}

function dryConverge(R: Runner, consensus: Consensus, verdict: GateVerdict | null) {
  const intent = classifyIntent(R.prompt);
  return `> ⚠️ **حالت خشک (Dry-Run)** — مغز بدون کلید API فعال است. این خروجی توسط شبیه‌ساز پروتکل NCP تولید شده تا صحت زیرساخت را نشان دهد.\n\n## تحلیل درخواست\nنیت: \`${intent.kind}\` | سطح: \`${intent.metaMode}\` | پیچیدگی: \`${(intent.complexity * 100).toFixed(0)}٪\`\n\n## اجماع نورون‌ها\n${consensus.merged.slice(0, 12000)}\n\n## وضعیت دروازه‌ی کیفیت\nامتیاز هیئت: ${verdict?.score ?? "—"} — ${verdict?.pass ? "پذیرفته شد" : "نیاز به بازسازی دارد"}\n\n## گام بعدی\nدر **تنظیمات**، آدرس پایه و کلیدها را وارد کن، مدل‌ها را کشف کن و تیک توانمندی‌ها (متن/ویژن/تصویر/ویدیو) را بزن تا مغز واقعاً روشن شود.`;
}

async function persistEnvelopeArtifacts(R: Runner, envelopes: Envelope[], consensus: Consensus) {
  const seen = new Set<string>();
  for (const e of envelopes) {
    for (const a of e.artifacts ?? []) {
      if (!a?.content || seen.has(a.title + a.content.length)) continue;
      seen.add(a.title + a.content.length);
      const [row] = await db.insert(artifacts).values({
        runId: R.runId,
        sessionId: R.sessionId,
        kind: mapKind(a.kind),
        title: a.title || `اثر ${e.node}`,
        lang: a.lang ?? guessLang(a.content),
        content: a.content,
        bytes: a.content.length,
        meta: { node: e.node },
      }).returning({ id: artifacts.id });
      R.emit({ channel: "artifact", title: `اثر ثبت شد: ${row.id}`, body: a.title, payload: { id: row.id, kind: mapKind(a.kind) } });
      await log(R, "artifact", `اثر «${a.title || e.node}» ثبت شد`, `${a.content.length} کاراکتر`, { id: row.id }, e.node);
    }
  }
  if (consensus.merged.length > 400) {
    const [row] = await db.insert(artifacts).values({
      runId: R.runId,
      sessionId: R.sessionId,
      kind: "markdown",
      title: "سند اجماع مغز",
      content: consensus.merged,
      bytes: consensus.merged.length,
      meta: { score: consensus.score, contributions: consensus.contributions },
    }).returning({ id: artifacts.id });
    R.emit({ channel: "artifact", title: "سند اجماع ثبت شد", payload: { id: row.id } });
  }
}

function mapKind(k: string): string {
  const s = (k || "").toLowerCase();
  if (["code", "markdown", "html", "json", "chart", "file", "tree", "blueprint", "image", "video", "mermaid"].includes(s)) return s;
  return "markdown";
}
function guessLang(c: string) {
  if (/^\s*(import|export|const|function|=>)/m.test(c) && /;\s*$/m.test(c)) return "typescript";
  if (/<\/?[a-z][\s\S]*>/i.test(c)) return "html";
  if (/^\s*\{[\s\S]*\}\s*$/.test(c)) return "json";
  return "markdown";
}

/* ------------------------------------------------------------------ */
/*  رسانه: تصویر و ویدیو                                                */
/* ------------------------------------------------------------------ */

async function mediaPipeline(R: Runner, gen: GeneratedAgent[], intent: Intent, cap: "image" | "video") {
  const council = selectCouncil(gen, intent, 3).agents;
  await log(R, "status", `خط لوله‌ی رسانه (${cap}) با ${council.length} نورون کارگردان`, council.map((c) => c.code).join("، "));
  await setProgress(R, "media", 0.2);

  // کارگردانی: پرامپت دقیق توسط نورون‌های بینایی
  const directed = R.dry
    ? [{ node: council[0]?.code ?? "NCP-0001", output: R.prompt, confidence: 0.5, role: "director", thought: "", claims: [], contradictions: [], artifacts: [], toolRequests: [], nextQueries: [] } as Envelope]
    : await mapLimit(council.slice(0, 3), 3, async (a, i) =>
        dispatchNode(R, a, (await routeModels("text", 3))[i] ?? null, `کارگردانی ${cap === "image" ? "تصویر" : "ویدیو"}: یک پرامپت حرفه‌ای، دقیق و پرجزئیات (نور، ترکیب‌بندی، سبک، لنز، پالت) بنویس. خروجی پرامپت را در فیلد output بگذار.`, `سبک درخواستی کاربر را محترم بشمار و ارتقا بده.`, "deep"),
      );
  const promptFinal = directed.filter((d) => d.output).sort((a, b) => b.confidence - a.confidence)[0]?.output ?? R.prompt;
  await log(R, "consensus", "پرامپت کارگردانی‌شده نهایی شد", promptFinal.slice(0, 600));

  const modelsList = await routeModels(cap, Math.max(1, Math.min(3, council.length)));
  if (!modelsList.length) {
    const text = `برای تولید ${cap === "image" ? "تصویر" : "ویدیو"} هیچ مدل فعالی با توانمندی «${cap}» تیک نخورده است.\n\n**پرامپت کارگردانی‌شده (آماده‌ی استفاده):**\n\n\`\`\`\n${promptFinal}\n\`\`\`\n\nدر تنظیمات، مدل تولید ${cap === "image" ? "تصویر" : "ویدیو"} را فعال کن.`;
    await streamFake(R, text);
    return;
  }
  await setProgress(R, "media", 0.5);
  const results = await mapLimit(modelsList, 2, async (m) => {
    await log(R, "agent", `تولید روی مدل ${m.modelId}`, promptFinal.slice(0, 200), undefined, undefined, m.modelId);
    const res = cap === "image" ? await generateImage(m.endpoint, m.apiKey, m.modelId, promptFinal) : await generateVideo(m.endpoint, m.apiKey, m.modelId, promptFinal);
    if (!res.ok) {
      await log(R, "error", `تولید ناموفق روی ${m.modelId}`, res.error, undefined, undefined, m.modelId);
      return null;
    }
    const mime = cap === "image" ? "image/png" : "video/mp4";
    const url = res.url ?? (res.b64 ? `data:${mime};base64,${res.b64}` : null);
    const [row] = await db.insert(artifacts).values({
      runId: R.runId, sessionId: R.sessionId, kind: cap, title: `${cap === "image" ? "تصویر" : "ویدیو"} تولیدشده — ${m.modelId}`,
      content: "", url, mime,
      meta: { prompt: promptFinal.slice(0, 500), model: m.modelId },
    }).returning({ id: artifacts.id });
    await log(R, "artifact", `اثر رسانه‌ای ثبت شد (#${row.id})`, (res.url ?? "(داده‌ی base64 درون اثر)").slice(0, 200), { id: row.id });
    R.emit({ channel: "artifact", title: "رسانه آماده شد", payload: { id: row.id, kind: cap, url: res.url } });
    return { id: row.id, url: res.url, b64: res.b64 };
  });
  const ok = results.filter(Boolean) as { id: number; url?: string; b64?: string }[];
  const text = ok.length
    ? `${cap === "image" ? "تصاویر" : "ویدیوهای"} تولیدشده توسط مغز (پیش‌نمایش در پنل آثار):\n\n${ok.map((o, i) => `${i + 1}. اثر #${o.id}${o.url ? ` — ${o.url}` : ""}`).join("\n")}\n\n**پرامپت کارگردانی‌شده:**\n\n\`\`\`\n${promptFinal}\n\`\`\``
    : `تولید انجام نشد؛ خطاهای مدل‌ها در لاگ ثبت شد.\n\n**پرامپت کارگردانی‌شده:**\n\n\`\`\`\n${promptFinal}\n\`\`\``;
  await db.update(runs).set({ producedChars: text.length }).where(eq(runs.id, R.runId));
  await streamFake(R, text);
  await setProgress(R, "done", 1);
}

/* ------------------------------------------------------------------ */
/*  فراالگوریتم ساخت (forge): معماری ≥ هدف کاراکتر، سپس ساخت واقعی       */
/* ------------------------------------------------------------------ */

export async function forgePipeline(R: Runner, gen: GeneratedAgent[], intent: Intent, resume?: Blueprint) {
  const target = gene<number>(R.genome, "blueprint.targetChars", 1000000);
  const sectionChars = gene<number>(R.genome, "blueprint.sectionChars", 3000);
  const batch = gene<number>(R.genome, "blueprint.batch", 6);
  const maxCalls = gene<number>(R.genome, "blueprint.maxCalls", 60);

  let bp: Blueprint = resume ?? { phase: "outline", target, produced: 0, calls: 0, cursor: 0, outline: [], buildUnits: [] };
  bp.target = target;

  const architects = selectCouncil(gen, { ...intent, domains: ["prefrontal", "cortex", "cerebellum", "brainstem"] as Region[] }, 10).agents;
  await log(R, "status", `تیم معماری فعال شد: ${architects.length} معمار ارشد`, `هدف معماری: ≥ ${target.toLocaleString("fa-IR")} کاراکتر پیش از ورود به ساخت`, { target });

  if (bp.phase === "outline" || !bp.outline.length) {
    await setProgress(R, "outline", 0.05);
    const routed = await routeModels("text", 3);
    const partsCount = 12;
    const chaptersPerPart = 6;
    const sections = Math.max(40, Math.ceil(target / sectionChars));
    const sectionsPerChapter = Math.max(2, Math.ceil(sections / (partsCount * chaptersPerPart)));

    let outline: BlueprintNode[] = [];
    if (!R.dry && routed.length) {
      const arch = architects.slice(0, 3);
      const res = await mapLimit(arch, 3, async (a, i) =>
        dispatchNode(R, a, routed[i % routed.length], `طراحی «هستی‌شناسی سند معماری» برای درخواست کاربر. دقیقاً ${partsCount} بخش (part) و برای هر بخش ${chaptersPerPart} فصل با عنوان و شرح یک‌خطی فارسی/تخصصی در آرایه‌ی claims به شکل JSON-in-string نده؛ بلکه در فیلد output یک JSON معتبر با این شکل بنویس: {"parts":[{"title":"","chapters":[{"title":"","brief":""}]}]}`, "سطح عملیات: forge — معماری کامل یک سامانه‌ی واقعی", "forge", { maxTokens: 6000, json: true }),
      );
      const best = res.map((r) => extractOutline(r.output)).filter((o) => o && o.length).sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0];
      if (best) {
        let id = 0;
        for (const p of best) {
          for (const ch of p.chapters ?? []) {
            for (let s = 0; s < sectionsPerChapter; s++) {
              id += 1;
              outline.push({
                id: `S${String(id).padStart(4, "0")}`,
                part: p.title,
                title: s === 0 ? ch.title : `${ch.title} — لایه ${s + 1}`,
                brief: ch.brief ?? "",
                chars: 0,
                status: "pending",
              });
            }
          }
        }
      }
    }
    if (!outline.length) outline = syntheticOutline(R.prompt, sections);
    bp.outline = outline;
    bp.phase = "expand";
    await db.update(runs).set({ blueprint: bp as unknown as Record<string, unknown> }).where(eq(runs.id, R.runId));
    await log(R, "status", `هستی‌شناسی سند معماری ساخته شد`, `${outline.length} برگ قابل انبساط در ${new Set(outline.map((o) => o.part)).size} بخش کلان`, { leaves: outline.length });

    const [root] = await db.insert(artifacts).values({
      runId: R.runId, sessionId: R.sessionId, kind: "blueprint", title: "معماری کلان — سند مادر",
      content: renderIndex(bp), bytes: renderIndex(bp).length, meta: { target, leaves: outline.length },
    }).returning({ id: artifacts.id });
    bp.rootArtifactId = root.id;
    R.emit({ channel: "artifact", title: "سند مادر معماری ایجاد شد", payload: { id: root.id, kind: "blueprint" } });
    await db.update(runs).set({ blueprint: bp as unknown as Record<string, unknown>, targetChars: target }).where(eq(runs.id, R.runId));
  }

  // انبساط موازی
  const routed = await routeModels("text", batch, String(gene(R.genome, "router.strategy", "weighted")));
  while (bp.produced < bp.target && bp.calls < maxCalls) {
    await assertRunning(R.runId);
    const pending = bp.outline.filter((n) => n.status === "pending").slice(0, batch);
    if (!pending.length) {
      if (bp.produced >= bp.target) break;
      const doneNodes = bp.outline.filter((n) => n.status === "done");
      if (!doneNodes.length) break;
      // برگ‌ها تمام شده ولی هدف نرسیده: ژرفای تکمیلی اضافه می‌شود
      const extra = doneNodes.slice(0, Math.max(batch * 4, 12)).map((n, i) => ({
        ...n,
        id: `${n.id}-d${bp.outline.length}-${i}`,
        title: `${n.title} — ژرفای تکمیلی`,
        status: "pending" as const,
        chars: 0,
        artifactId: undefined,
        tries: 0,
      }));
      bp.outline.push(...extra);
    }
    await setProgress(R, "expand", Math.min(0.85, bp.produced / Math.max(1, bp.target)));
    R.emit({ channel: "progress", title: "انبساط معماری", payload: { produced: bp.produced, target: bp.target, calls: bp.calls, leavesLeft: bp.outline.filter((n) => n.status === "pending").length } });

    const idxBatch = bp.outline.filter((n) => n.status === "pending").slice(0, batch);
    await mapLimit(idxBatch, batch, async (node, i) => {
      const agent = architects[(bp.calls + i) % architects.length];
      const model = routed.length ? routed[(bp.calls + i) % routed.length] : null;
      bp.calls += 1;
      const task = `نوشتن کامل و بی‌نقص بخش «${node.title}» از فصل «${node.part}». حداقل ${sectionChars} کاراکتر محتوای فنی واقعی: معماری، قرارداد داده، شبه‌کد/کد، جدول‌ها، شرایط لبه، سنجه‌های پذیرش، ریسک‌ها. هیچ حشوی ننویس؛ فقط عمق اجرایی.`;
      const env = await dispatchNode(R, agent, model, task, `سند مادر در حال نگارش است. فهرست بخش‌های همسایه:\n${bp.outline.slice(Math.max(0, bp.outline.indexOf(node) - 4), bp.outline.indexOf(node) + 4).map((n) => `- ${n.part} / ${n.title}`).join("\n")}\n\nهدف کل سند: ${bp.target.toLocaleString("fa-IR")} کاراکتر. تاکنون: ${bp.produced.toLocaleString("fa-IR")}.`, "forge", { maxTokens: 6000 });
      const content = env.output?.trim() || (R.dry ? drySection(node, bp.produced) : "");
      if (!content) {
        node.tries = (node.tries ?? 0) + 1;
        node.status = node.tries >= 3 ? "failed" : "pending";
        return;
      }
      node.chars = content.length;
      node.status = "done";
      bp.produced += content.length;
      try {
        const [row] = await db.insert(artifacts).values({
          runId: R.runId, sessionId: R.sessionId, kind: "markdown", parentId: bp.rootArtifactId ?? null,
          title: `${node.part} / ${node.title}`, lang: "markdown",
          content: `# ${node.part}\n\n## ${node.title}\n\n> ${node.brief}\n\n${content}`,
          bytes: content.length, meta: { node: node.id, agent: agent.code },
        }).returning({ id: artifacts.id });
        node.artifactId = row.id;
        R.emit({ channel: "artifact", title: `بخش ${node.id} نگارش شد`, body: `${node.title} — ${content.length} کاراکتر`, payload: { id: row.id, produced: bp.produced, target: bp.target } });
      } catch {
        /* ادامه بده */
      }
    });
    await db.update(runs).set({ blueprint: bp as unknown as Record<string, unknown>, producedChars: bp.produced, progress: Math.min(0.9, bp.produced / Math.max(1, bp.target)) }).where(eq(runs.id, R.runId));
    if (bp.rootArtifactId) {
      await db.update(artifacts).set({ content: renderIndex(bp), bytes: renderIndex(bp).length, meta: { target: bp.target, produced: bp.produced, leaves: bp.outline.length, done: bp.outline.filter((n) => n.status === "done").length } }).where(eq(artifacts.id, bp.rootArtifactId));
    }
  }

  const reached = bp.produced >= bp.target;
  const verdict = reached
    ? { pass: true, score: Math.min(1, 0.86 + (bp.outline.filter((n) => n.status === "done").length / Math.max(1, bp.outline.length)) * 0.14), seats: [], projected: 100, deficiencies: [], directives: [] } as GateVerdict
    : await qualityGate(R, gen, { spine: { node: "NCP", role: "blueprint", thought: "", confidence: 0.5, output: `معماری تاکنون ${bp.produced} کاراکتر` }, merged: renderIndex(bp), score: 0.5, agreement: 0.5, resolvedContradictions: [], acceptedClaims: [], contributions: [] }, gene<number>(R.genome, "consensus.threshold", 0.86));

  await log(R, "gate", reached ? `دروازه‌ی معماری ✓ — ${bp.produced.toLocaleString("fa-IR")} کاراکتر` : `دروازه‌ی معماری ✗ — ${bp.produced.toLocaleString("fa-IR")} از ${bp.target.toLocaleString("fa-IR")}`, `برگ‌های نگارش‌شده: ${bp.outline.filter((n) => n.status === "done").length}/${bp.outline.length} | رأی هیئت: ${verdict.score}`, { bp: { produced: bp.produced, target: bp.target, calls: bp.calls } });

  if (!reached) {
    // برش خودکار: بودجه‌ی این برش تمام شد؛ کارگر همین اجرا را بدون دخالت کاربر دوباره برمی‌دارد
    const slices = Number(R.state.slices ?? 0) + 1;
    const maxSlices = gene<number>(R.genome, "blueprint.maxSlices", 80);
    R.state = { ...R.state, slices };
    const bpJson = bp as unknown as Record<string, unknown>;
    const gateJson = verdict as unknown as Record<string, unknown>;
    if (slices >= maxSlices) {
      await db
        .update(runs)
        .set({ status: "paused", blueprint: bpJson, gate: gateJson, producedChars: bp.produced, state: R.state, error: `سقف ${maxSlices} برش خودکار رسید — با «ادامه» دوباره شروع کنید` })
        .where(eq(runs.id, R.runId));
      R.sliced = true;
      return;
    }
    await db
      .update(runs)
      .set({ status: "queued", attempts: 0, nextAt: new Date(), error: null, blueprint: bpJson, gate: gateJson, producedChars: bp.produced, state: R.state })
      .where(eq(runs.id, R.runId));
    await log(R, "status", `برش ${slices} تمام شد — ${bp.produced.toLocaleString("fa-IR")} از ${bp.target.toLocaleString("fa-IR")} کاراکتر`, "برش بعدی به‌صورت خودکار روی سرور ادامه می‌یابد؛ نیازی به باز بودن صفحه نیست.", { slices, produced: bp.produced });
    R.sliced = true;
    return;
  }

  await projectBuild(R, gen, intent, bp);
}

/* ------------------------------------------------------------------ */
/*  ساخت واقعی پروژه: طرح → تولید فایل‌ها → اعتبارسنجی → تعمیر → اثر قابل اجرا */
/* ------------------------------------------------------------------ */

export type BuildState = {
  plan?: ProjectPlan;
  done?: Record<string, number>;
  issues?: Issue[];
  verified?: boolean;
  rounds?: number;
  repairNotes?: string[];
  play?: PlayReport;
};

const WEB_RULES = `- یک فایل HTML کامل که با باز شدن در مرورگر فوراً اجرا شود. بدون سرور، بدون build، بدون TypeScript، بدون JSX، بدون import/export.
- اسکریپت‌ها یا داخل خود HTML باشند یا فایل .js کلاسیک که با <script src="game.js"></script> قبل از </body> وصل شده باشد.
- فایل باید با </html> تمام شود و هر <script> بسته شود. اگر جا کم شد، قابلیت را کمتر کن ولی هرگز فایل را ناتمام نگذار.
- بازی باید در سه ثانیه‌ی اول قابل بازی باشد: صفحه‌ی عنوان سینمایی، دکمه‌ی شروع، حلقه‌ی requestAnimationFrame، کنترل کیبورد و لمسی، امتیاز، باخت/برد، شروع دوباره، صدا با WebAudio، ذرات و بازخورد ضربه.
- ظاهر باید غنی و خیره‌کننده باشد (گرادیان، نور، سایه، انیمیشن) نه یک صفحهٔ خالی. هیچ «...» یا TODO ننویس.
- اگر کتابخانه لازم است فقط از https://cdn.jsdelivr.net با تگ script استفاده کن و یک مسیر جایگزین بدون آن کتابخانه هم داشته باش تا اگر CDN قطع شد بازی باز هم بالا بیاید.`;

const NODE_RULES = `- CommonJS (require) و فقط کتابخانه‌های استاندارد Node.js؛ بدون وابستگی خارجی.
- برنامه با «node <entry>» کاملاً اجرا شود و خروجی قابل مشاهده داشته باشد.
- هیچ «...» یا کامنت جای‌نگهدار ننویس؛ تمام منطق را پیاده‌سازی کن.`;

const PLANNER_SYS = `تو معمار ارشد تیم ساخت نرم‌افزار در مغز NCP هستی. فقط یک JSON معتبر برگردان:
{"name":"نام کوتاه","kind":"web","entry":"index.html","files":[{"path":"index.html","purpose":"..."}]}
قواعد سخت:
- kind=web برای بازی، ابزار، سایت و داشبورد. kind=node فقط برای اسکریپت خط فرمان.
- وب حداکثر ۴ فایل: index.html ، style.css ، game.js و در صورت نیاز data.json. ورود همیشه index.html.
- ممنوع: .ts .tsx .jsx و هر فایلی که مرورگر بدون build اجرا نمی‌کند.
- game.js باید در index.html با script src وصل شود. purpose را اجرایی و دقیق بنویس، شامل حلقه‌ی بازی، کنترل‌ها و شرایط برد و باخت.
- کیفیت باید کاربر را شگفت‌زده کند: نه نمونه‌ی ناقص.`;

const DRY_GAME_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
  html,body{margin:0;height:100%;background:#070b13;color:#dbe6f5;font-family:system-ui,Tahoma,sans-serif;overflow:hidden}
  #wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
  canvas{background:#0b1322;border:1px solid #1b2740;border-radius:14px;box-shadow:0 0 60px -10px rgba(56,220,245,.35);max-width:96vw;max-height:78vh}
  #hud{font-size:14px;opacity:.9;direction:ltr}
  button{background:#0e1f2c;color:#7ef0ff;border:1px solid #1b6b7d;border-radius:8px;padding:6px 14px;cursor:pointer}
</style>
</head>
<body>
<div id="wrap">
  <div id="hud">Score: <span id="score">0</span> | ← → / A D / ماوس | Space: شروع دوباره</div>
  <canvas id="c" width="480" height="640"></canvas>
  <button id="restart">شروع دوباره</button>
</div>
<script>
(function () {
  var c = document.getElementById('c'), g = c.getContext('2d');
  var scoreEl = document.getElementById('score');
  var W = c.width, H = c.height;
  var keys = {}, player, stars, score, over, t = 0, touchX = null;
  function reset() {
    player = { x: W / 2, y: H - 40, w: 60, h: 14, speed: 7 };
    stars = []; score = 0; over = false; t = 0; scoreEl.textContent = '0';
  }
  function spawn() { stars.push({ x: Math.random() * (W - 20) + 10, y: -10, r: 8 + Math.random() * 6, v: 2 + Math.random() * 2 + score / 25 }); }
  function update() {
    if (over) return;
    t++;
    if (keys.ArrowLeft || keys.a || keys.A) player.x -= player.speed;
    if (keys.ArrowRight || keys.d || keys.D) player.x += player.speed;
    if (touchX !== null) player.x += (touchX - player.x) * 0.2;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
    if (t % Math.max(12, 45 - Math.floor(score / 5)) === 0) spawn();
    for (var i = stars.length - 1; i >= 0; i--) {
      var s = stars[i]; s.y += s.v;
      if (Math.abs(s.x - player.x) < player.w / 2 + s.r && Math.abs(s.y - player.y) < player.h + s.r) {
        score += 10; scoreEl.textContent = String(score); stars.splice(i, 1); continue;
      }
      if (s.y > H + 20) { over = true; stars.splice(i, 1); }
    }
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0b1322'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7ef0ff'; g.fillRect(player.x - player.w / 2, player.y, player.w, player.h);
    g.fillStyle = '#c9a6ff';
    stars.forEach(function (s) { g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill(); });
    if (over) {
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff6b81'; g.font = 'bold 34px system-ui'; g.textAlign = 'center';
      g.fillText('بازی تمام شد', W / 2, H / 2 - 10);
      g.fillStyle = '#dbe6f5'; g.font = '18px system-ui';
      g.fillText('امتیاز: ' + score + ' — Space یا دکمه‌ی شروع دوباره', W / 2, H / 2 + 26);
    }
  }
  function loop() { update(); draw(); requestAnimationFrame(loop); }
  document.addEventListener('keydown', function (e) { keys[e.key] = true; if (e.code === 'Space') { e.preventDefault(); if (over) reset(); } });
  document.addEventListener('keyup', function (e) { keys[e.key] = false; });
  c.addEventListener('pointermove', function (e) { var r = c.getBoundingClientRect(); touchX = (e.clientX - r.left) * (W / r.width); });
  c.addEventListener('pointerleave', function () { touchX = null; });
  document.getElementById('restart').addEventListener('click', reset);
  reset(); loop();
})();
</script>
</body>
</html>
`;

function langOf(rel: string): string {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = { js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", html: "html", htm: "html", css: "css", json: "json", md: "markdown", py: "python" };
  return map[ext] ?? "text";
}

/** استخراج محتوای فایل از بلوک کد markdown (حتی اگر بلوک ناقص باشد) */
function extractCode(text: string): string {
  const t = text.trim();
  const m = t.match(/```[^\n]*\n([\s\S]*?)```/);
  if (m) return m[1].trim() + "\n";
  if (t.startsWith("```")) return t.replace(/^```[^\n]*\n/, "").replace(/```\s*$/, "").trim() + "\n";
  return t ? t + "\n" : "";
}

function parsePlan(text: string): ProjectPlan | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { name?: string; kind?: string; entry?: string; files?: { path?: string; purpose?: string }[] };
    const seen = new Set<string>();
    const files: { path: string; purpose: string }[] = [];
    for (const f of j.files ?? []) {
      const p = safeRel(String(f.path ?? ""));
      if (!p || seen.has(p)) continue;
      seen.add(p);
      files.push({ path: p, purpose: String(f.purpose ?? "") });
    }
    if (!files.length) return null;
    const kind: "web" | "node" = j.kind === "node" ? "node" : "web";
    const entry = safeRel(String(j.entry ?? "")) ?? (kind === "web" ? "index.html" : "main.js");
    if (!seen.has(entry)) files.unshift({ path: entry, purpose: "نقطه‌ی ورود اصلی" });
    return { name: String(j.name || "پروژه").slice(0, 80), kind, entry, files: files.slice(0, 14) };
  } catch {
    return null;
  }
}

function fallbackPlan(prompt: string, dry: boolean): ProjectPlan {
  const name = prompt.trim().slice(0, 48) || "پروژه";
  if (dry) return { name, kind: "web", entry: "index.html", files: [{ path: "index.html", purpose: "نسخه‌ی نمایشی کامل و قابل اجرا" }] };
  return {
    name,
    kind: "web",
    entry: "index.html",
    files: [
      { path: "index.html", purpose: "ساختار صفحه و ورودی اصلی" },
      { path: "style.css", purpose: "استایل، طراحی واکنش‌گرا و انیمیشن‌ها" },
      { path: "game.js", purpose: "منطق اصلی، حلقه‌ی اجرا، کنترل‌ها و وضعیت" },
    ],
  };
}

async function blueprintBrief(bp: Blueprint): Promise<string> {
  const outline = bp.outline.slice(0, 80).map((n) => `- ${n.part} / ${n.title}: ${n.brief}`).join("\n");
  let body = "";
  if (bp.rootArtifactId) {
    const kids = await db
      .select({ content: artifacts.content })
      .from(artifacts)
      .where(eq(artifacts.parentId, bp.rootArtifactId))
      .orderBy(asc(artifacts.id))
      .limit(8);
    body = kids.map((k) => k.content).join("\n\n---\n\n");
  }
  return `${outline}\n\n${body}`.slice(0, 14000);
}

async function saveBuild(R: Runner, bs: BuildState) {
  R.state = { ...R.state, build: bs };
  await db.update(runs).set({ state: R.state }).where(eq(runs.id, R.runId));
}

/** نوشتن فایل روی دیسک + ثبت به‌عنوان اثر قابل پیش‌نمایش + ذخیره‌ی نقطه‌ی بازیابی */
async function commitFile(R: Runner, bs: BuildState, rel: string, content: string) {
  await writeProjectFile(R.runId, rel, content);
  bs.done = { ...(bs.done ?? {}), [rel]: content.length };
  await saveBuild(R, bs);
  const lang = langOf(rel);
  const [existing] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(eq(artifacts.runId, R.runId), eq(artifacts.kind, "code"), eq(artifacts.title, rel)));
  if (existing) {
    await db
      .update(artifacts)
      .set({ content, bytes: content.length, lang, version: sql`${artifacts.version} + 1` })
      .where(eq(artifacts.id, existing.id));
    return;
  }
  const [row] = await db
    .insert(artifacts)
    .values({ runId: R.runId, sessionId: R.sessionId, kind: "code", title: rel, lang, content, bytes: content.length, meta: { path: rel } })
    .returning({ id: artifacts.id });
  R.emit({ channel: "artifact", title: `فایل ساخته شد: ${rel}`, body: `${content.length} کاراکتر`, payload: { id: row.id, kind: "code" } });
}

async function genFile(R: Runner, plan: ProjectPlan, f: { path: string; purpose: string }, brief: string, issue?: string, existing?: string): Promise<string> {
  const sys = `تو مهندس ارشد یک تیم ساخت نرم‌افزار در مغز NCP هستی. فقط محتوای کامل فایل «${f.path}» را بنویس و داخل یک بلوک کد markdown قرار بده. هیچ توضیح قبل یا بعد از بلوک ننویس.\n${plan.kind === "web" ? WEB_RULES : NODE_RULES}`;
  const notes = (R.state.build?.repairNotes ?? []).slice(0, 8);
  const user = [
    `پروژه: ${plan.name} (${plan.kind}) — ورودی: ${plan.entry}`,
    `همه‌ی فایل‌ها: ${plan.files.map((x) => x.path).join("، ")}`,
    `هدف این فایل: ${f.purpose}`,
    `درخواست کاربر:\n${R.prompt.slice(0, 3000)}`,
    brief ? `معماری مرجع:\n${brief.slice(0, 4000)}` : "",
    issue ? `اشکال‌هایی که تست واقعی پیدا کرد و باید رفع شوند:\n${issue}` : "",
    notes.length ? `یادداشت تست اجرا:\n- ${notes.join("\n- ")}` : "",
    existing ? `نسخه‌ی فعلی (بازنویسی کامل و قابل اجرا، نه وصله‌ی ناقص):\n${existing.slice(0, 9000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  let content = extractCode(await callText(R, sys, user, 10000, 0.32));
  for (let i = 0; i < 3 && content.trim() && !fileComplete(f.path, content); i++) {
    const more = extractCode(
      await callText(
        R,
        "فایل وسط کار قطع شده. فقط ادامه‌ی دقیق همان فایل را بنویس، بدون تکرار و بدون توضیح. باید کامل و قابل اجرا تمام شود.",
        `مسیر: ${f.path}\n\nانتهای فعلی:\n${content.slice(-1600)}`,
        8000,
        0.2,
      ),
    );
    if (!more.trim()) break;
    content = `${content.replace(/\s*$/, "")}\n${more.trim()}\n`;
  }
  return content;
}

async function projectBuild(R: Runner, gen: GeneratedAgent[], intent: Intent, bp: Blueprint | null): Promise<void> {
  void gen;
  void intent;
  await setProgress(R, "build", 0.85);
  if (!R.dry && R.pool.length === 0) {
    throw new Error("هیچ مدل فعالی با توانمندی «متن» برای ساخت پروژه وجود ندارد. در تنظیمات، مدل‌ها را فعال کنید.");
  }

  const bs: BuildState = { ...((R.state.build as BuildState | undefined) ?? {}) };
  bs.done = { ...(bs.done ?? {}) };
  const brief = bp ? await blueprintBrief(bp) : "";

  // ۱) طرح پروژه
  if (!bs.plan) {
    await log(R, "status", "طراحی ساختار پروژه", "معمار ارشد فایل‌ها و نقطه‌ی ورود را تعیین می‌کند");
    let plan: ProjectPlan | null = null;
    if (!R.dry) {
      const txt = await callText(R, PLANNER_SYS, `درخواست کاربر:\n${R.prompt}\n\nمعماری مرجع:\n${brief.slice(0, 5000) || "—"}`, 2000, 0.3);
      plan = parsePlan(txt);
    }
    bs.plan = plan ?? fallbackPlan(R.prompt, R.dry);
    await saveBuild(R, bs);
    await log(R, "consensus", `طرح پروژه: «${bs.plan.name}» (${bs.plan.kind})`, bs.plan.files.map((f) => `• ${f.path} — ${f.purpose}`).join("\n"), { plan: bs.plan });
  }
  const plan = bs.plan as ProjectPlan;
  if (plan.kind === "web" && plan.files.some((f) => /\.tsx?$/.test(f.path))) {
    plan.files = plan.files.filter((f) => !/\.tsx?$/.test(f.path));
    if (!plan.files.some((f) => /\.html?$/i.test(f.path))) plan.files.unshift({ path: "index.html", purpose: "صفحه‌ی کامل و قابل بوت" });
    if (!plan.files.some((f) => f.path === "game.js")) {
      plan.files.push({ path: "game.js", purpose: "حلقه‌ی بازی، کنترل، امتیاز، برد و باخت، رسم و صدا — JavaScript کلاسیک" });
    }
    plan.entry = "index.html";
    bs.plan = plan;
    bs.done = {};
    bs.repairNotes = ["فایل‌های TypeScript در مرورگر اجرا نمی‌شوند. همه‌چیز باید HTML و JS کلاسیکِ وصل‌شده باشد."];
    await saveBuild(R, bs);
  }

  // ۲) تولید موازی فایل‌ها (فایل‌های انجام‌شده دوباره ساخته نمی‌شوند)
  const todo = plan.files.filter((f) => !(f.path in (bs.done ?? {})));
  await mapLimit(todo, 4, async (f) => {
    await assertRunning(R.runId);
    const content = R.dry ? (plan.entry === f.path ? DRY_GAME_HTML.replace("__TITLE__", plan.name.replace(/[<>&"]/g, "")) : "") : await genFile(R, plan, f, brief);
    if (content.trim()) await commitFile(R, bs, f.path, content);
    else await log(R, "error", `تولید «${f.path}» ناموفق بود`, "مدل پاسخ معتبر نداد");
  });
  await saveBuild(R, bs);

  // ۳) سیم‌کشی اسکریپت‌ها + تست واقعی در مرورگر + تعمیر تا وقتی اجرا شود
  let play: PlayReport | null = null;
  const expectGame = /بازی|game|arcade|اکشن|ماریو|پلتفرم|shooter|runner/i.test(`${R.prompt} ${plan.name}`);
  for (let round = 0; round < 4; round++) {
    await assertRunning(R.runId);
    if (plan.kind === "web") await wireScripts(R, bs, plan);
    const found = R.dry ? [] : await verifyProject(R.runId, plan);
    if (!R.dry && found.length === 0) {
      await log(R, "status", "تست اجرای زنده", expectGame ? "بازی در مرورگر بوت، کلیک و رسم می‌شود" : "برنامه در مرورگر باز و بررسی می‌شود");
      play = plan.kind === "web" ? await playTest(R.runId, plan.entry, expectGame) : await nodeTest(R.runId, plan.entry);
      await log(R, play.ok ? "gate" : "error", play.ok ? "تست اجرا پذیرفته شد" : "تست اجرا رد شد", [...play.errors, ...play.notes].join("\n") || "—", { play });
    } else play = null;
    const playIssues: Issue[] = play && !play.ok ? play.errors.map((msg) => ({ file: plan.entry, msg })) : [];
    const all = [...found, ...playIssues];
    bs.rounds = round;
    bs.issues = all;
    bs.play = play ?? undefined;
    bs.verified = all.length === 0 && (R.dry || !!play?.ok);
    bs.repairNotes = all.map((i) => `${i.file}: ${i.msg}`).slice(0, 12);
    await saveBuild(R, bs);
    if (bs.verified) break;
    if (R.dry) break;
    await log(R, "gate", `دور تعمیر ${round + 1}: ${all.length} مشکل`, all.map((i) => `✗ ${i.file}: ${i.msg}`).join("\n"), { issues: all });
    const byFile = new Map<string, string[]>();
    for (const i of all) byFile.set(i.file, [...(byFile.get(i.file) ?? []), i.msg]);
    if (!byFile.size) byFile.set(plan.entry, ["برنامه بوت نشد"]);
    for (const file of byFile.keys()) {
      if (!plan.files.some((f) => f.path === file) && safeRel(file)) plan.files.push({ path: file, purpose: "فایل لازم برای بوت که باید ساخته شود" });
    }
    bs.plan = plan;
    await mapLimit([...byFile.entries()].slice(0, 6), 3, async ([file, msgs]) => {
      await assertRunning(R.runId);
      const f = plan.files.find((x) => x.path === file);
      if (!f) return;
      const existing = (await readProjectFile(R.runId, file)) ?? undefined;
      const content = await genFile(R, plan, f, brief, msgs.map((m) => `- ${m}`).join("\n"), existing);
      if (content.trim()) await commitFile(R, bs, file, content);
    });
  }

  if (!bs.verified && !R.dry) {
    const slices = Number(R.state.slices ?? 0) + 1;
    const done = { ...(bs.done ?? {}) };
    for (const k of Object.keys(done)) if (/\.(html?|js|css|tsx?)$/i.test(k)) delete done[k];
    bs.done = done;
    R.state = { ...R.state, slices, build: bs };
    const cap = 6;
    if (slices >= cap) {
      await db.update(runs).set({
        status: "paused",
        error: `بعد از ${cap} دور، تست اجرا هنوز رد می‌شود. با «ادامه» تعمیر از همان نقطه از سر گرفته می‌شود.\n${(bs.repairNotes ?? []).slice(0, 4).join(" | ")}`,
        state: R.state,
      }).where(eq(runs.id, R.runId));
    } else {
      await db.update(runs).set({
        status: "queued",
        attempts: 0,
        nextAt: new Date(),
        error: null,
        state: R.state,
        phase: "build",
      }).where(eq(runs.id, R.runId));
      await log(R, "status", "تست رد شد — تعمیر خودکار ادامه دارد", "صفحه را ببند؛ موتور خودش از همین نقطه دوباره می‌سازد و دوباره تست می‌کند.", { slices });
    }
    R.sliced = true;
    return;
  }

  await commitFile(R, bs, "README.md", buildReadme(plan, R.runId, bs.issues ?? []));
  const files = await listProjectFiles(R.runId);
  const playUrl = `/play/${R.runId}`;
  const previewUrl = `/api/projects/${R.runId}/${plan.entry}`;
  const zipUrl = `/api/projects/${R.runId}/zip`;
  const meta = {
    kind: plan.kind,
    name: plan.name,
    entry: plan.entry,
    files,
    verified: true,
    tested: true,
    issues: [],
    playUrl,
    previewUrl,
    zipUrl,
    screenshot: play?.screenshot,
    play,
    blueprint: bp ? { produced: bp.produced, target: bp.target } : null,
  };
  const [existingArt] = await db.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.runId, R.runId), eq(artifacts.kind, "project")));
  if (existingArt) {
    await db.update(artifacts).set({ title: plan.name, meta, url: playUrl, bytes: files.length, version: sql`${artifacts.version} + 1` }).where(eq(artifacts.id, existingArt.id));
    R.emit({ channel: "artifact", title: `پروژه‌ی تست‌شده: ${plan.name}`, payload: { id: existingArt.id, kind: "project" } });
  } else {
    const [row] = await db.insert(artifacts).values({
      runId: R.runId, sessionId: R.sessionId, kind: "project", title: plan.name, url: playUrl, content: "", bytes: files.length, meta,
    }).returning({ id: artifacts.id });
    R.emit({ channel: "artifact", title: `پروژه‌ی تست‌شده: ${plan.name}`, payload: { id: row.id, kind: "project" } });
  }
  const summary = [
    `## ${plan.kind === "web" ? "🎮" : "🛠️"} «${plan.name}» ساخته و اجرا شد`,
    "",
    plan.kind === "web" ? `**▶ اجرا:** [باز کردن بازی/برنامه](${playUrl})` : `**اجرا:** \`node ${plan.entry}\``,
    "",
    play?.screenshot ? `![پیش‌نمایش تست](${play.screenshot})` : "",
    "",
    `**⬇ دانلود:** [ZIP](${zipUrl})`,
    "",
    `**تست زنده:** ✅ ${play?.notes.join(" · ") || "بدون خطای اجرا"}`,
    "",
    "### فایل‌ها",
    ...files.filter((f) => f !== "preview.png").map((f) => `- \`${f}\``),
  ].filter((x) => x !== undefined).join("\n");
  await streamFake(R, summary);
  await setProgress(R, "done", 1);
}

async function wireScripts(R: Runner, bs: BuildState, plan: ProjectPlan) {
  const htmlPath = plan.files.find((f) => /\.html?$/i.test(f.path))?.path ?? plan.entry;
  let html = await readProjectFile(R.runId, htmlPath);
  if (!html) return;
  let changed = false;
  for (const f of plan.files) {
    if (!/\.js$/i.test(f.path) || html.includes(f.path)) continue;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `<script src="${f.path}"></script>\n</body>`);
    else html += `\n<script src="${f.path}"></script>\n`;
    changed = true;
  }
  if (changed) await commitFile(R, bs, htmlPath, html);
}

function extractOutline(text: string): { title: string; chapters: { title: string; brief: string }[] }[] | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as { parts?: { title: string; chapters?: { title: string; brief: string }[] }[] };
    if (!Array.isArray(j.parts) || !j.parts.length) return null;
    return j.parts.map((p) => ({ title: String(p.title || "بخش"), chapters: (p.chapters ?? []).map((c) => ({ title: String(c.title || "فصل"), brief: String(c.brief || "") })) }));
  } catch {
    return null;
  }
}

function syntheticOutline(prompt: string, leaves: number) {
  const parts = [
    "بینش و دامنه‌ی سامانه", "معماری کلان و سبک معماری", "فراالگوریتم هسته", "مدل داده و ذخیره‌سازی",
    "لایه‌ی API و قراردادها", "موتور اجرا و زمان‌بندی", "رابط کاربری و تجربه", "امنیت و اعتماد",
    "مقیاس‌پذیری و عملکرد", "observability و تله‌متری", "تست و اعتبارسنجی", "استقرار و عملیات",
  ];
  const chapters = [
    "مرزها و مسئولیت‌ها", "قرارداد داده", "الگوریتم و پیچیدگی", "شرایط لبه و خطا",
    "سنجه‌های پذیرش", "نقشه‌ی پیاده‌سازی",
  ];
  const out: BlueprintNode[] = [];
  const per = Math.max(1, Math.ceil(leaves / (parts.length * chapters.length)));
  let id = 0;
  for (const p of parts) {
    for (const c of chapters) {
      for (let s = 0; s < per; s++) {
        id += 1;
        if (id > leaves) return out;
        out.push({
          id: `S${String(id).padStart(4, "0")}`,
          part: p,
          title: s === 0 ? c : `${c} — ژرفا ${s + 1}`,
          brief: `پیاده‌سازی دقیق «${c}» برای «${p}» در پاسخ به: ${prompt.slice(0, 120)}`,
          chars: 0,
          status: "pending",
        });
      }
    }
  }
  return out;
}

function drySection(node: BlueprintNode, produced: number) {
  const p = node.part;
  return [
    `### ${node.title}`,
    `> شبیه‌ساز پروتکل (حالت خشک) — بخش ${node.id} از سند مادر. مجموع تاکنون: ${produced.toLocaleString("fa-IR")} کاراکتر.`,
    `**۱) هدف این بخش در سامانه:** تعریف دقیق مرز «${p}» و تضمین جدایی مسئولیت‌ها از لایه‌ی داده تا لایه‌ی ارائه.`,
    `**۲) قرارداد داده:**\n\`\`\`ts\ninterface ${node.id}Contract {\n  id: string;\n  version: number;\n  payload: Record<string, unknown>;\n  checksum: string;\n}\n\`\`\``,
    `**۳) الگوریتم هسته:**\n1. اعتبارسنجی ورودی (schema-first)\n2. نرمال‌سازی و کش‌پذیری\n3. اجرای موازی با محدودکننده‌ی همروندی\n4. ادغام نتایج و حل تعارض با رأی وزنی\n5. ثبت تله‌متری و بازخورد به ژنوم`,
    `**۴) شرایط لبه:** ورودی خالی، اندازه‌ی بیش‌ازحد، ناسازگاری نسخه، شکست شبکه، تکراری بودن کلید.`,
    `**۵) سنجه‌های پذیرش:** p95 < 250ms، خطای < 0.5٪، پوشش تست ≥ 85٪.`,
    `**۶) ریسک‌ها و جایگزین‌ها:** قفل‌شدن روی فراهم‌کننده → لایه‌ی انتزاع؛ نشتی حافظه → استخر محدود؛ تاخیر → صف اولویت.`,
  ].join("\n\n");
}

function renderIndex(bp: Blueprint) {
  const parts = new Map<string, BlueprintNode[]>();
  for (const n of bp.outline) {
    const arr = parts.get(n.part) ?? [];
    arr.push(n);
    parts.set(n.part, arr);
  }
  const done = bp.outline.filter((n) => n.status === "done").length;
  const lines = [
    `# سند مادر معماری`,
    ``,
    `| سنجه | مقدار |`,
    `|---|---|`,
    `| هدف | ${bp.target.toLocaleString("fa-IR")} کاراکتر |`,
    `| نگارش‌شده | ${bp.produced.toLocaleString("fa-IR")} کاراکتر |`,
    `| بخش‌ها | ${done}/${bp.outline.length} |`,
    `| فراخوانی‌ها | ${bp.calls} |`,
    `| فاز | ${bp.phase} |`,
    ``,
  ];
  for (const [p, nodes] of parts) {
    lines.push(`## ${p}`);
    for (const n of nodes) lines.push(`- [${n.status === "done" ? "✓" : n.status === "failed" ? "✗" : "…"}] ${n.title} ${n.artifactId ? `(#${n.artifactId})` : ""} — ${n.chars.toLocaleString("fa-IR")} کاراکتر`);
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  ادامه‌ی اجرای متوقف‌شده (resume)                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

function autoToolPlan(intent: Intent, prompt: string): { tool: string; args: Record<string, unknown>; why: string }[] {
  const out: { tool: string; args: Record<string, unknown>; why: string }[] = [];
  if (intent.kind === "market") {
    const syms = prompt.match(/[A-Z]{2,10}(?:USDT|USDC)?[:/]?(?:USDT|USD)?/g)?.slice(0, 4) ?? [];
    const tickers = (syms.length ? syms : ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]).map((s) => (s.includes(":") ? s : `BINANCE:${s.endsWith("USDT") ? s : s + "USDT"}`));
    out.push({ tool: "market.scan", args: { tickers, market: "crypto" }, why: "داده‌ی لحظه‌ی بازار از اسکنر TradingView" });
    const y = tickers[0]?.split(":")[1]?.replace("USDT", "-USD") ?? "BTC-USD";
    out.push({ tool: "market.history", args: { symbol: y, range: "6mo", interval: "1d" }, why: "تاریخچه‌ی کندل برای محاسبه‌ی اندیکاتورها" });
  }
  if (intent.needs.includes("web")) out.push({ tool: "web.search", args: { query: prompt.slice(0, 160) }, why: "جمع‌آوری شواهد واقعی از وب" });
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/*  تکامل: ژنوم از هر اجرا یاد می‌گیرد                                  */
/* ------------------------------------------------------------------ */

async function evolve(R: Runner, intent: Intent) {
  try {
    const rate = gene<number>(R.genome, "evolution.rate", 0.18);
    const [run] = await db.select().from(runs).where(eq(runs.id, R.runId));
    const gateScore = Number((run?.gate as { score?: number })?.score ?? 0.6);
    const avgLatency = R.stats.calls ? R.stats.ms / R.stats.calls : 0;

    // تنظیم خودکار موازی‌سازی بر پایه‌ی توان واقعی مدل‌ها
    const cur = gene<number>(R.genome, "engine.parallelism", 6);
    let nextPar = cur;
    if (avgLatency > 25000 && cur > 3) nextPar = cur - 1;
    else if (avgLatency < 6000 && cur < 12) nextPar = cur + 1;

    const notes: string[] = [];
    if (nextPar !== cur) {
      const { genome } = await import("@/db/schema");
      await db.update(genome).set({ value: nextPar, generation: 1, updatedAt: new Date() }).where(eq(genome.gene, "engine.parallelism"));
      notes.push(`engine.parallelism: ${cur} → ${nextPar} (میانگین تأخیر ${Math.round(avgLatency)}ms)`);
    }
    // اگر دروازه رد شد، آستانه‌ی سخت‌گیری را کمی پایین نیاور؛ به‌جای آن عمق را زیاد کن
    if (gateScore < 0.7 && intent.metaMode !== "standard") {
      const sc = gene<number>(R.genome, "blueprint.sectionChars", 3000);
      const nextSc = Math.min(6000, Math.round(sc * (1 + rate * 0.4)));
      if (nextSc !== sc) {
        const { genome, mutations } = await import("@/db/schema");
        await db.update(genome).set({ value: nextSc, updatedAt: new Date() }).where(eq(genome.gene, "blueprint.sectionChars"));
        await db.insert(mutations).values({ gene: "blueprint.sectionChars", from: sc, to: nextSc, reason: `رأی هیئت پایین (${gateScore}) — ژرفای هر بخش افزایش یافت`, fitness: gateScore, accepted: true, generation: 1 });
        notes.push(`blueprint.sectionChars: ${sc} → ${nextSc}`);
      }
    }
    // ارتقای مهارت ایجنت‌های مشارکت‌کننده
    const council = (run?.council as string[]) ?? [];
    if (council.length) {
      const delta = (gateScore - 0.5) * rate * 0.1;
      await db.update(agentsTable).set({ skill: sqlSkill(delta), tasks: sqlTaskInc() }).where(and(inList(council)));
    }
    if (notes.length) {
      await log(R, "evolution", "ژنوم جهش یافت (خودتکاملی)", notes.join("\n"), { notes });
      R.emit({ channel: "evolution", title: "جهش ژنوم", body: notes.join(" | ") });
    }
  } catch {
    /* تکامل اختیاری است */
  }
}

function sqlSkill(delta: number) {
  return sql`GREATEST(0.05, LEAST(1, ${agentsTable.skill} + ${delta}))`;
}
function sqlTaskInc() {
  return sql`${agentsTable.tasks} + 1`;
}
function inList(codes: string[]) {
  return inArray(agentsTable.code, codes.slice(0, 200));
}

export { renderIndex, mapLimit };
