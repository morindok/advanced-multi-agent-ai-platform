import type { GeneratedAgent } from "./agents";
import { REGIONS, type Region } from "./regions";

export const NCP_VERSION = "NCP/1.4-meta";

/* ------------------------------------------------------------------ */
/*  نیت‌سنجی                                                            */
/* ------------------------------------------------------------------ */

export type IntentKind =
  | "chat"
  | "deep_build"
  | "analysis"
  | "research"
  | "code"
  | "image"
  | "video"
  | "vision"
  | "market"
  | "meta";

export type Intent = {
  kind: IntentKind;
  confidence: number;
  complexity: number; // 0..1
  domains: string[];
  needs: Capability2[];
  metaMode: "standard" | "deep" | "forge";
  signals: string[];
};

type Capability2 = "text" | "vision" | "image" | "video" | "web" | "code" | "market";

const KEYWORDS: Record<string, { kind: IntentKind; w: number; fa: string[]; en: string[] }> = {
  deep_build: {
    kind: "deep_build",
    w: 1,
    fa: [
      "سیستم عامل", "بساز", "پیاده‌سازی", "پیاده سازی", "معماری", "پلتفرم", "اپلیکیشن",
      "نرم‌افزار", "نرم افزار", "پروژه", "سایت", "موتور", "زبان برنامه‌نویسی", "بازی",
      "شبیه‌ساز", "پایگاه داده", "کسب‌وکار", "استارتاپ", "کامل", "صفر تا صد", "فریم‌ورک",
      "هوش مصنوعی", "ربات", "داشبورد", "فروشگاه", "api",
    ],
    en: ["build", "create a system", "implement", "architecture", "platform", "operating system", "full-stack", "engine", "framework"],
  },
  market: {
    kind: "market",
    w: 0.95,
    fa: [
      "تریدینگ‌ویو", "تریدینگ ویو", "tradingview", "بازار", "تحلیل تکنیکال", "ارز دیجیتال",
      "بورس", "فارکس", "سهام", "کندل", "بیت‌کوین", "بیت کوین", "اتریوم", "صرافی",
      "پوزیشن", "اهرم", "شاخص", "چارت", "نمودار قیمت", "سیگنال",
    ],
    en: ["market", "crypto", "forex", "stock", "rsi", "macd", "ticker", "chart"],
  },
  image: {
    kind: "image",
    w: 0.9,
    fa: ["تصویر", "عکس", "بنر", "لوگو", "پوستر", "تولید تصویر", "نقاشی", "ایلاستریشن", "طرح گرافیکی"],
    en: ["image", "picture", "logo", "poster", "banner", "illustration", "draw"],
  },
  video: {
    kind: "video",
    w: 0.9,
    fa: ["ویدیو", "ویدئو", "فیلم", "انیمیشن", "کلیپ", "تیزر", "موشن", "صحنه"],
    en: ["video", "animation", "clip", "teaser", "motion"],
  },
  vision: {
    kind: "vision",
    w: 0.85,
    fa: ["این عکس", "تصویر پیوست", "چه چیزی می‌بینی", "تحلیل تصویر", "بینایی", "اسکرین‌شات", "اسکرین شات"],
    en: ["this image", "attached", "screenshot", "what do you see", "ocr"],
  },
  research: {
    kind: "research",
    w: 0.8,
    fa: ["تحقیق", "جستجو", "پیدا کن", "اخبار", "مقاله", "در وب", "اینترنت", "منبع", "بررسی کن", "مستندات"],
    en: ["research", "search the web", "find", "news", "documentation", "latest"],
  },
  code: {
    kind: "code",
    w: 0.75,
    fa: ["کد", "تابع", "دیباگ", "ریفکتور", "اسکریپت", "کامپوننت", "کلاس", "الگوریتم", "خطا"],
    en: ["code", "function", "debug", "refactor", "script", "typescript", "python"],
  },
  analysis: {
    kind: "analysis",
    w: 0.6,
    fa: ["تحلیل", "ارزیابی", "مقایسه", "گزارش", "بررسی", "آمار", "سناریو", "ریسک", "علت"],
    en: ["analyze", "compare", "report", "evaluate", "statistics"],
  },
  meta: {
    kind: "meta",
    w: 0.99,
    fa: ["خودت را ارتقا", "خودارتقایی", "جهش", "ژنوم", "تکامل", "ابزار جدید بساز", "خودت را برنامه‌نویسی", "مغزت را"],
    en: ["upgrade yourself", "mutate", "genome", "self-improve", "synthesize a tool"],
  },
};

export function classifyIntent(prompt: string, hasAttachment = false): Intent {
  const p = ` ${prompt.toLowerCase()} `;
  const scores: Record<string, number> = {};
  const signals: string[] = [];
  for (const [key, def] of Object.entries(KEYWORDS)) {
    let s = 0;
    for (const k of [...def.fa, ...def.en]) {
      if (p.includes(k.toLowerCase())) {
        s += def.w;
        signals.push(k);
      }
    }
    if (s) scores[key] = s;
  }
  if (hasAttachment) scores.vision = (scores.vision ?? 0) + 3;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const kind: IntentKind = best ? (best[0] as IntentKind) : "chat";
  const len = prompt.length;
  const complexity = Math.min(1, 0.18 + len / 1400 + (best ? best[1] * 0.09 : 0));

  const deepWords = ["سیستم عامل", "operating system", "صفر تا صد", "کامل", "پروژه", "پلتفرم", "موتور", "زبان برنامه‌نویسی"];
  const isHuge = deepWords.some((w) => p.includes(w)) || len > 400 || complexity > 0.75;
  const metaMode: Intent["metaMode"] =
    kind === "deep_build" ? (isHuge ? "forge" : "deep") : complexity > 0.6 ? "deep" : "standard";

  const needs: Capability2[] = ["text"];
  if (kind === "image") needs.push("image");
  if (kind === "video") needs.push("video");
  if (kind === "vision" || hasAttachment) needs.push("vision");
  if (kind === "research" || kind === "market") needs.push("web");
  if (kind === "code" || kind === "deep_build") needs.push("code");
  if (kind === "market") needs.push("market");

  const domains = Object.keys(REGIONS).filter((r) => {
    if (kind === "deep_build" || kind === "code") return true;
    if (kind === "image" || kind === "video" || kind === "vision") return r === "visual" || r === "cortex" || r === "prefrontal";
    if (kind === "market" || kind === "research") return r === "cortex" || r === "prefrontal" || r === "brainstem";
    return true;
  }) as Region[];

  return {
    kind,
    confidence: best ? Math.min(0.99, 0.45 + best[1] * 0.12) : 0.4,
    complexity,
    domains,
    needs,
    metaMode,
    signals: signals.slice(0, 12),
  };
}

/* ------------------------------------------------------------------ */
/*  پروتکل: پاکت پیام نورون                                             */
/* ------------------------------------------------------------------ */

export type Envelope = {
  node: string;
  role: string;
  thought: string;
  confidence: number;
  output: string;
  claims?: string[];
  contradictions?: string[];
  artifacts?: { kind: string; title: string; lang?: string; content: string }[];
  toolRequests?: { tool: string; args: Record<string, unknown>; why: string }[];
  nextQueries?: string[];
  score?: number;
  weight?: number;
};

export const PROTOCOL_SPEC = `# ${NCP_VERSION} — پروتکل اجماع عصبی
تو یک مدل زبانی مستقل نیستی. تو یک «نورون» در مغز یکپارچه‌ی NCP هستی و هم‌زمان با ده‌ها نورون دیگر روی یک عملیات واحد کار می‌کنی.
قواعد الزام‌آور:
1) هرگز پاسخ نهایی کاربر را به‌تنهایی تولید نکن. سهم خودت را دقیقاً در همان «برش» (slice) که به تو اختصاص داده شده بنویس.
2) خروجی را فقط در قالب پاکت JSON پروتکل بده. هیچ متن اضافه بیرون از JSON ننویس.
3) اگر با گزاره‌ای در زمینه‌ی داده‌شده مخالفی، آن را در آرایه‌ی contradictions با دلیل کوتاه رد کن.
4) اگر برای انجام برش به ابزار نیاز داری، آن را در toolRequests درخواست کن (نام ابزار + آرگومان‌ها). ابزار را خودت جعل نکن.
5) اعتمادبه‌نفس (confidence) را صادقانه بین 0 تا 1 بده؛ اغراق، اجماع را خراب می‌کند.
6) عمق و حجم خروجی باید متناسب با «سطح عملیات» (opLevel) باشد؛ در سطح forge هیچ سربازی از جزئیات ننویس.`;

export function envelopeSchema(opLevel: string) {
  return `شکل پاکت (JSON معتبر):
{
  "node": "<کد ایجنت>",
  "role": "<نقش تو در این برش>",
  "thought": "<استدلال فشرده، حداکثر ۳ جمله>",
  "confidence": 0.0,
  "output": "<متن کامل سهم تو — markdown غنی و فارسی مگر اینکه خواسته شده باشد>",
  "claims": ["گزاره‌های کلیدی که به اجماع می‌فرستی"],
  "contradictions": ["مواردی که رد می‌کنی + دلیل"],
  "artifacts": [{"kind":"code|markdown|html|json","title":"","lang":"","content":""}],
  "toolRequests": [{"tool":"","args":{},"why":""}],
  "nextQueries": ["سؤال یا برش بعدی که مغز باید پردازش کند"]
}`;
}

export function buildNodeSystem(agent: GeneratedAgent, opLevel: string, protocolExtra = ""): string {
  return `${PROTOCOL_SPEC}

هویت نورون: ${agent.code} — ${agent.name}
ناحیه‌ی مغزی: ${REGIONS[agent.region as Region]?.fa ?? agent.region}
تخصص: ${agent.specialty}
لایه: ${agent.tier} | توابع شناختی: ${agent.functions.join(", ")}
سطح عملیات: ${opLevel}

${envelopeSchema(opLevel)}
${protocolExtra}`;
}

/** استخراج پاکت از پاسخ مدل — مقاوم در برابر متن آلوده */
export function parseEnvelope(text: string, fallbackNode: string): Envelope {
  const tryParse = (s: string): Envelope | null => {
    try {
      const j = JSON.parse(s) as Envelope;
      if (j && typeof j === "object" && typeof j.output === "string") return normalize(j, fallbackNode);
      if (j && typeof j === "object") return normalize({ ...j, output: JSON.stringify(j) }, fallbackNode);
    } catch {
      return null;
    }
    return null;
  };
  const cleaned = text.replace(/```json/gi, "```").trim();
  const direct = tryParse(cleaned);
  if (direct) return direct;

  const fenced = cleaned.match(/```([\s\S]*?)```/);
  if (fenced) {
    const p = tryParse(fenced[1].trim());
    if (p) return p;
  }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const p = tryParse(cleaned.slice(first, last + 1));
    if (p) return p;
  }
  return {
    node: fallbackNode,
    role: "node",
    thought: "پاسخ خارج از قالب پروتکل بود؛ به‌عنوان خروجی خام پذیرفته شد.",
    confidence: 0.42,
    output: text,
    claims: [],
    contradictions: [],
    artifacts: [],
    toolRequests: [],
    nextQueries: [],
  };
}

function normalize(e: Envelope, node: string): Envelope {
  return {
    node: e.node || node,
    role: e.role || "node",
    thought: (e.thought || "").slice(0, 900),
    confidence: Math.max(0, Math.min(1, Number(e.confidence ?? 0.5) || 0.5)),
    output: e.output ?? "",
    claims: Array.isArray(e.claims) ? e.claims.slice(0, 12) : [],
    contradictions: Array.isArray(e.contradictions) ? e.contradictions.slice(0, 8) : [],
    artifacts: Array.isArray(e.artifacts) ? e.artifacts.slice(0, 6) : [],
    toolRequests: Array.isArray(e.toolRequests) ? e.toolRequests.slice(0, 5) : [],
    nextQueries: Array.isArray(e.nextQueries) ? e.nextQueries.slice(0, 5) : [],
  };
}

/* ------------------------------------------------------------------ */
/*  شورا: انتخاب نورون‌ها                                               */
/* ------------------------------------------------------------------ */

export function weightOf(agent: GeneratedAgent) {
  return Number((agent.tier * 0.28 + agent.skill * 0.72).toFixed(4));
}

export function selectCouncil(
  pool: GeneratedAgent[],
  intent: Intent,
  size: number,
): { agents: GeneratedAgent[]; slices: string[] } {
  const regions = intent.domains.length ? intent.domains : (Object.keys(REGIONS) as Region[]);
  const scored = pool
    .filter((a) => regions.includes(a.region as Region))
    .map((a) => ({ a, w: weightOf(a) * (0.75 + Math.random() * 0.5) }))
    .sort((x, y) => y.w - x.w);
  const picked: GeneratedAgent[] = [];
  const perRegion = Math.max(1, Math.floor(size / regions.length));
  for (const r of regions) {
    const inRegion = scored.filter((s) => s.a.region === r).slice(0, perRegion);
    for (const s of inRegion) if (picked.length < size && !picked.includes(s.a)) picked.push(s.a);
  }
  for (const s of scored) if (picked.length < size && !picked.includes(s.a)) picked.push(s.a);
  const slices = buildSlices(intent, picked.length);
  return { agents: picked, slices };
}

export function buildSlices(intent: Intent, n: number): string[] {
  const base: Record<IntentKind, string[]> = {
    chat: ["پاسخ مستقیم و دقیق", "بازبینی لحن و ایجاز"],
    code: ["طراحی راه‌حل و کد", "بازبینی لبه‌ها و تست", "بهینه‌سازی و مستندسازی"],
    analysis: ["چارچوب تحلیل", "استخراج شواهد و اعداد", "نتیجه‌گیری و ریسک"],
    research: ["طرح پرسش‌های تحقیق", "جمع‌آوری و اعتبارسنجی منابع", "سنتز گزارش"],
    market: ["داده‌ی بازار و اندیکاتورها", "تحلیل تکنیکال چندزمانه", "مدیریت ریسک و سناریوی معامله"],
    image: ["کارگردانی بصری و پرامپت", "ترکیب‌بندی و پالت", "کنترل کیفیت خروجی"],
    video: ["فیلم‌نامه و استوری‌بورد", "پرامپت ویدیو و زمان‌بندی", "تدوین و صدا"],
    vision: ["استخراج ساختار تصویر", "تحلیل محتوا و متن", "نتیجه‌ی عملیاتی"],
    meta: ["تشخیص نیاز ارتقا", "طراحی جهش", "اعتبارسنجی و اعمال"],
    deep_build: [
      "معماری کلان و مرزهای سامانه",
      "مدل داده و جریان حالت",
      "لایه‌ی هسته و فراالگوریتم",
      "رابط کاربری و تجربه",
      "زیرساخت، استقرار و مقیاس",
      "امنیت و مقاومت در برابر خطا",
      "تست، اعتبارسنجی و سنجه‌ها",
      "نقشه‌ی راه پیاده‌سازی فازها",
    ],
  };
  const seed = base[intent.kind] ?? base.chat;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(seed[i % seed.length]);
  return out;
}

/* ------------------------------------------------------------------ */
/*  اجماع: ادغام وزنی و حل تعارض                                        */
/* ------------------------------------------------------------------ */

export type Consensus = {
  spine: Envelope;
  merged: string;
  score: number;
  agreement: number;
  resolvedContradictions: string[];
  acceptedClaims: { claim: string; weight: number; votes: number }[];
  contributions: { node: string; weight: number; chars: number }[];
};

function tokens(s: string) {
  return new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
}

export function mergeConsensus(envelopes: Envelope[], agentWeights: Map<string, number>): Consensus {
  const envs = envelopes.map((e) => ({ ...e, weight: (agentWeights.get(e.node) ?? 0.5) * (0.35 + e.confidence) }));
  envs.sort((a, b) => b.weight * Math.max(40, b.output.length) - a.weight * Math.max(40, a.output.length));
  const spine = envs[0];

  // رأی‌گیری وزنی روی گزاره‌ها
  const claimVotes = new Map<string, { weight: number; votes: number }>();
  for (const e of envs) {
    for (const c of e.claims ?? []) {
      const key = c.trim().toLowerCase();
      if (!key) continue;
      const cur = claimVotes.get(key) ?? { weight: 0, votes: 0 };
      cur.weight += e.weight;
      cur.votes += 1;
      claimVotes.set(key, { weight: cur.weight, votes: cur.votes });
    }
  }
  const acceptedClaims = [...claimVotes.entries()]
    .map(([claim, v]) => ({ claim, ...v }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 24);

  // شباهت دوجانبه → میزان توافق
  let simSum = 0;
  let pairs = 0;
  for (let i = 0; i < envs.length; i++) {
    for (let j = i + 1; j < envs.length; j++) {
      const a = tokens(envs[i].output.slice(0, 4000));
      const b = tokens(envs[j].output.slice(0, 4000));
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      simSum += inter / (a.size + b.size - inter || 1);
      pairs++;
    }
  }
  const agreement = pairs ? Number((simSum / pairs).toFixed(4)) : 0;
  const avgConf = envs.reduce((s, e) => s + e.confidence * e.weight, 0) / Math.max(0.001, envs.reduce((s, e) => s + e.weight, 0));
  const score = Number(Math.min(1, avgConf * 0.7 + agreement * 0.45 + Math.min(envs.length, 8) * 0.02).toFixed(4));

  // ادغام: ستون فقرات + برش‌های یکتا از سایر نورون‌ها (بدون تکرار)
  const spineTokens = tokens(spine.output);
  const extras: string[] = [];
  for (const e of envs.slice(1)) {
    const t = tokens(e.output);
    if (!t.size) continue;
    let novel = 0;
    for (const x of t) if (!spineTokens.has(x)) novel++;
    const novelty = novel / t.size;
    if (novelty > 0.28 && e.output.trim().length > 120) {
      extras.push(`\n\n---\n\n### ⟨تکمیل نورون ${e.node} — ${e.role}⟩\n\n${e.output.trim()}`);
    }
  }
  const resolved = envs.flatMap((e) => e.contradictions ?? []).filter(Boolean).slice(0, 12);

  return {
    spine,
    merged: spine.output.trim() + extras.join(""),
    score,
    agreement,
    resolvedContradictions: resolved,
    acceptedClaims,
    contributions: envs.map((e) => ({ node: e.node, weight: Number(e.weight.toFixed(3)), chars: e.output.length })),
  };
}

/* ------------------------------------------------------------------ */
/*  دروازه‌ی کیفیت: هیئت ۱۰۰ ایجنتی                                      */
/* ------------------------------------------------------------------ */

export type GateVerdict = {
  pass: boolean;
  score: number;
  seats: { node: string; vote: number; note: string }[];
  projected: number;
  deficiencies: string[];
  directives: string[];
};

/**
 * هیئت ۱۰۰ نفره: `seats` رأی واقعی (از مدل‌ها) + بقیه رأی‌های فرافکنی‌شده
 * با سوگیری تخصصی هر ایجنت. کاملاً شفاف در لاگ گزارش می‌شود.
 */
export function projectJury(
  jury: GeneratedAgent[],
  seatVotes: { node: string; vote: number; note: string }[],
  targetScore: number,
): GateVerdict {
  const seatMap = new Map(seatVotes.map((s) => [s.node, s]));
  let sum = 0;
  const votes: { node: string; vote: number }[] = [];
  for (const a of jury) {
    const seat = seatMap.get(a.code);
    let v: number;
    if (seat) {
      v = seat.vote;
    } else {
      // فرافکنی: میانگین کرسی‌ها + سوگیری تخصص/لایه + نویز قطعی
      const base = seatVotes.length ? seatVotes.reduce((s, x) => s + x.vote, 0) / seatVotes.length : 0.5;
      const bias = (a.tier - 3) * 0.012 + (a.skill - 0.6) * 0.05;
      const seedNum = Number(a.code.replace(/\D/g, "")) || 1;
      const noise = (Math.sin(seedNum * 91.7) * 0.5) * 0.09;
      v = Math.max(0, Math.min(1, base + bias + noise));
    }
    votes.push({ node: a.code, vote: v });
    sum += v;
  }
  const score = Number((sum / Math.max(1, votes.length)).toFixed(4));
  const weak = votes.filter((v) => v.vote < targetScore).sort((a, b) => a.vote - b.vote).slice(0, 40);
  const deficiencies = weak.slice(0, 8).map((w) => {
    const a = jury.find((x) => x.code === w.node);
    return `${w.node} (${a?.specialty ?? "—"}) رأی ${w.vote.toFixed(2)}: پوشش ناکافی در حوزه‌ی تخصصی خود`;
  });
  const directives = Array.from(
    new Set(
      weak.slice(0, 12).map((w) => {
        const a = jury.find((x) => x.code === w.node);
        return a ? `تقویت بخش مرتبط با «${a.specialty}» با جزئیات اجرایی، اعداد و نمونه‌کد` : "افزایش عمق جزئیات";
      }),
    ),
  ).slice(0, 8);
  return {
    pass: score >= targetScore,
    score,
    seats: seatVotes,
    projected: votes.length - seatVotes.length,
    deficiencies,
    directives,
  };
}
