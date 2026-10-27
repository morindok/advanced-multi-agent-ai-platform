import { db } from "@/db";
import { tools as toolsTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import vm from "node:vm";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchJSON } from "./llm";
import { putSetting, getSettings, maskKey } from "./config";

export type ToolCtx = {
  runId?: number;
  sessionId?: string;
  log?: (title: string, body?: string, payload?: Record<string, unknown>) => void;
  allowShell?: boolean;
};

export type ToolResult = { ok: boolean; text: string; data?: unknown; error?: string };

const WORKSPACE = path.join(process.cwd(), "workspace");

async function ws(p: string) {
  const full = path.resolve(WORKSPACE, p.replace(/^\/+/, ""));
  if (!full.startsWith(WORKSPACE)) throw new Error("خارج از فضای کاری مجاز");
  await fs.mkdir(path.dirname(full), { recursive: true });
  return full;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/*  ابزارهای بازار — داده‌ی واقعی                                       */
/* ------------------------------------------------------------------ */

const TV_COLUMNS = [
  "name", "description", "type", "sector", "industry", "close", "change", "change_abs",
  "volume", "Volatility.D", "market_cap_basic", "price_earnings_ttm", "RSI", "RSI[1]",
  "SMA10", "SMA20", "SMA30", "SMA50", "SMA100", "SMA200", "EMA10", "EMA20", "EMA50",
  "MACD.macd", "MACD.signal", "Stoch.K", "Stoch.D", "ATR", "ADX", "ADX+DI", "ADX-DI",
  "Recommend.All", "Recommend.MA", "Recommend.Other", "Pivot.M.Classic.S3", "Pivot.M.Classic.R3",
  "high", "low", "open", "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M", "Perf.Y",
];

async function tvScan(tickers: string[], market = "global", columns = TV_COLUMNS) {
  const res = (await fetchJSON(`https://scanner.tradingview.com/${market}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://www.tradingview.com" },
    body: JSON.stringify({ symbols: { tickers, query: { types: [] } }, columns }),
    timeoutMs: 30000,
  })) as { data?: { s?: string; d?: unknown[] }[] | Record<string, unknown>[]; totalCount?: number };
  // اسکنر TradingView پاسخ را به‌صورت {s, d:[...]} می‌دهد — ستون‌ها را زیپ می‌کنیم
  const rows = (res?.data ?? []).map((r) => {
    if (Array.isArray((r as { d?: unknown[] }).d)) {
      const d = (r as { d: unknown[] }).d;
      const obj: Record<string, unknown> = { symbol: (r as { s?: string }).s };
      columns.forEach((c, i) => (obj[c] = d[i]));
      return obj;
    }
    return r as Record<string, unknown>;
  });
  return { rows, totalCount: res?.totalCount ?? rows.length };
}

async function tvSearch(query: string, limit = 12) {
  const url = `https://symbol-search.tradingview.com/symbol_search/?query=${encodeURIComponent(query)}&limit=${limit}`;
  return (await fetchJSON(url, {
    headers: { "User-Agent": UA, Origin: "https://www.tradingview.com", Accept: "application/json" },
    timeoutMs: 25000,
  })) as { symbol?: string; description?: string; exchange?: string; type?: string }[];
}

const RANGE_LIMIT: Record<string, number> = { "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1000, "max": 1000 };

async function binanceHistory(symbol: string, range: string, interval: string) {
  const raw = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const pair = raw.endsWith("USDT") || raw.endsWith("USDC") || raw.endsWith("BUSD") ? raw : raw.endsWith("BTC") || raw.endsWith("ETH") ? raw : `${raw}USDT`;
  const limit = Math.min(1000, RANGE_LIMIT[range] ?? 180);
  const iv = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"].includes(interval) ? interval : "1d";
  const j = (await fetchJSON(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${iv}&limit=${limit}`, {
    headers: { "User-Agent": UA },
    timeoutMs: 25000,
  })) as [number, string, string, string, string, string][];
  if (!Array.isArray(j) || !j.length) throw new Error("binance: بدون داده");
  return {
    source: `binance:${pair}:${iv}`,
    rows: j.map((k) => ({
      t: new Date(k[0]).toISOString().slice(0, 10),
      o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]),
    })),
  };
}

const KRAKEN_IV: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "3h": 180, "6h": 360, "12h": 720, "1d": 1440, "1w": 10080 };

async function krakenHistory(symbol: string, range: string, interval: string) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = clean.replace(/(USD|USDT|USDC|EUR|GBP)$/, "");
  const quote = clean.endsWith("USDT") ? "USDT" : "USD";
  const pair = `${base === "BTC" ? "XBT" : base}${quote}`;
  const days = RANGE_LIMIT[range] ?? 180;
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const iv = KRAKEN_IV[interval] ?? 1440;
  const j = (await fetchJSON(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${iv}&since=${since}`, {
    headers: { "User-Agent": UA },
    timeoutMs: 25000,
  })) as { error?: string[]; result?: Record<string, unknown> };
  if (j?.error?.length) throw new Error(`kraken: ${j.error.join(",")}`);
  const result = (j?.result ?? {}) as Record<string, unknown>;
  const key = Object.keys(result).find((k) => k !== "last");
  const bars = key ? ((result[key] as (string | number)[][]) ?? []) : [];
  if (!bars.length) throw new Error("kraken: بدون داده");
  return {
    source: `kraken:${pair}:${interval}`,
    rows: bars.map((b) => ({
      t: new Date(Number(b[0]) * 1000).toISOString().slice(0, 10),
      o: Number(b[1]), h: Number(b[2]), l: Number(b[3]), c: Number(b[4]), v: Number(b[6]),
    })),
  };
}

async function stooqHistory(symbol: string, range: string) {
  const sym = symbol.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const s = sym.includes(".") ? sym : `${sym}.us`;
  const days = (RANGE_LIMIT[range] ?? 180) + 5;
  const d2 = new Date();
  const d1 = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const csv = await fetch(`https://stooq.com/q/d/l/?s=${s}&i=d&d1=${fmt(d1)}&d2=${fmt(d2)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(25000),
  }).then((r) => r.text());
  const lines = csv.trim().split("\n");
  if (lines.length < 3 || /No data/i.test(csv)) throw new Error("stooq: بدون داده");
  const rows = lines.slice(1).map((l) => {
    const [t, o, h, lo, c, v] = l.split(",");
    return { t, o: Number(o), h: Number(h), l: Number(lo), c: Number(c), v: Number(v ?? 0) };
  }).filter((r) => Number.isFinite(r.c));
  if (!rows.length) throw new Error("stooq: پاسخ نامعتبر");
  return { source: `stooq:${s}`, rows };
}

async function yahooHistory(symbol: string, range = "6mo", interval = "1d") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const j = (await fetchJSON(url, { headers: { "User-Agent": UA }, timeoutMs: 30000 })) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }[] }; meta?: Record<string, unknown> }[] };
  };
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("داده‌ای یافت نشد");
  const q = r.indicators?.quote?.[0] ?? {};
  const rows = (r.timestamp ?? []).map((t, i) => ({
    t: new Date(t * 1000).toISOString().slice(0, 10),
    o: q.open?.[i] ?? null,
    h: q.high?.[i] ?? null,
    l: q.low?.[i] ?? null,
    c: q.close?.[i] ?? null,
    v: q.volume?.[i] ?? null,
  }));
  return { source: "yahoo", meta: r.meta, rows };
}

export type Candle = { t: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null };

/** تلاش زنجیره‌ای روی چند منبع داده تا تاریخچه حتماً به دست آید */
async function fetchHistoryAny(symbol: string, range: string, interval: string) {
  const cryptoLike = /(USDT|USDC|BTC|ETH|-USD$)/i.test(symbol) && !/\.us$/i.test(symbol);
  const attempts: (() => Promise<{ source: string; rows: Candle[] }>)[] = cryptoLike
    ? [
        () => krakenHistory(symbol, range, interval),
        () => binanceHistory(symbol, range, interval),
        () => stooqHistory(symbol, range),
        () => yahooHistory(symbol, range, interval),
      ]
    : [
        () => stooqHistory(symbol, range),
        () => yahooHistory(symbol, range, interval),
        () => krakenHistory(symbol, range, interval),
        () => binanceHistory(symbol, range, interval),
      ];
  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const r = await a();
      if (r.rows.length) return { ...r, errors };
    } catch (e) {
      errors.push((e as Error).message.slice(0, 120));
    }
  }
  throw new Error(`هیچ منبع داده‌ای پاسخ نداد: ${errors.join(" | ")}`);
}

export function sma(vals: number[], p: number) {
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    if (i < p - 1) { out.push(NaN); continue; }
    const s = vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0);
    out.push(s / p);
  }
  return out;
}
export function ema(vals: number[], p: number) {
  const k = 2 / (p + 1);
  const out: number[] = [];
  let prev = vals[0] ?? NaN;
  for (let i = 0; i < vals.length; i++) {
    prev = i === 0 ? vals[0] : vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
export function rsi(vals: number[], p = 14) {
  const out: number[] = [NaN];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    const g = Math.max(0, d);
    const l = Math.max(0, -d);
    if (i <= p) {
      gain += g / p;
      loss += l / p;
      out.push(NaN);
      if (i === p) {
        const rs = gain / (loss || 1e-9);
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    gain = (gain * (p - 1) + g) / p;
    loss = (loss * (p - 1) + l) / p;
    const rs = gain / (loss || 1e-9);
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}
export function macd(vals: number[]) {
  const e12 = ema(vals, 12);
  const e26 = ema(vals, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line, 9);
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

function computeIndicators(closes: number[]) {
  const last = (a: number[]) => {
    for (let i = a.length - 1; i >= 0; i--) if (!Number.isNaN(a[i])) return a[i];
    return NaN;
  };
  const r = rsi(closes);
  const m = macd(closes);
  return {
    points: closes.length,
    lastClose: closes[closes.length - 1] ?? null,
    rsi14: Number(last(r).toFixed(2)),
    sma20: Number(last(sma(closes, 20)).toFixed(4)),
    sma50: Number(last(sma(closes, 50)).toFixed(4)),
    sma200: Number(last(sma(closes, 200)).toFixed(4)),
    ema20: Number(last(ema(closes, 20)).toFixed(4)),
    macd: Number(last(m.line).toFixed(4)),
    macdSignal: Number(last(m.signal).toFixed(4)),
    macdHist: Number(last(m.hist).toFixed(4)),
    change5: closes.length > 5 ? Number((((closes.at(-1)! - closes.at(-6)!) / closes.at(-6)!) * 100).toFixed(2)) : null,
    change20: closes.length > 20 ? Number((((closes.at(-1)! - closes.at(-21)!) / closes.at(-21)!) * 100).toFixed(2)) : null,
    volatility: Number(Math.sqrt(closes.slice(-30).reduce((s, c, i, a) => (i ? s + (c - a[i - 1]) ** 2 : s), 0) / Math.max(1, Math.min(30, closes.length) - 1)).toPrecision(4)),
  };
}

/* ------------------------------------------------------------------ */
/*  رجیستری ابزارهای درون‌ساخت                                          */
/* ------------------------------------------------------------------ */

type ToolImpl = (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolResult>;

const IMPLS: Record<string, ToolImpl> = {
  "web.search": async (args) => {
    const q = String(args.query ?? "").trim();
    if (!q) return { ok: false, text: "", error: "پرسش خالی است" };
    const found: { title: string; url: string; snippet: string; source: string }[] = [];

    // ۱) DuckDuckGo Instant Answer (JSON — پایدارترین)
    try {
      const j = (await fetchJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, {
        headers: { "User-Agent": UA }, timeoutMs: 20000,
      })) as { AbstractText?: string; AbstractURL?: string; Heading?: string; RelatedTopics?: { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }[]; Results?: { Text?: string; FirstURL?: string }[] };
      if (j?.AbstractText) found.push({ title: j.Heading || q, url: j.AbstractURL || "", snippet: j.AbstractText.slice(0, 700), source: "ddg-instant" });
      for (const r of j?.Results ?? []) if (r.FirstURL) found.push({ title: r.Text ?? "", url: r.FirstURL, snippet: "", source: "ddg-instant" });
      for (const t of j?.RelatedTopics ?? []) {
        if (t.FirstURL) found.push({ title: (t.Text ?? "").slice(0, 140), url: t.FirstURL, snippet: t.Text ?? "", source: "ddg-related" });
        for (const st of t.Topics ?? []) if (st.FirstURL) found.push({ title: (st.Text ?? "").slice(0, 140), url: st.FirstURL, snippet: st.Text ?? "", source: "ddg-related" });
      }
    } catch { /* موتور بعدی */ }

    // ۲) Wikipedia (دانش ساخت‌یافته)
    try {
      const w = (await fetchJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=6`, {
        headers: { "User-Agent": UA }, timeoutMs: 20000,
      })) as { query?: { search?: { title: string; snippet: string; pageid: number }[] } };
      for (const r of w?.query?.search ?? []) {
        found.push({
          title: r.title,
          url: `https://en.wikipedia.org/?curid=${r.pageid}`,
          snippet: htmlToText(r.snippet).slice(0, 400),
          source: "wikipedia",
        });
      }
    } catch { /* موتور بعدی */ }

    // ۳) موتورهای HTML (ممکن است در برخی شبکه‌ها بسته باشند)
    const engines = [
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    ];
    let lastErr = "";
    for (const u of engines) {
      try {
        const res = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en,fa;q=0.8" }, signal: AbortSignal.timeout(20000) });
        const html = await res.text();
        const items: { title: string; url: string; snippet: string }[] = [];
        const re = /<a[^>]+href="(http[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && items.length < 10) {
          const url2 = m[1].replace(/&amp;/g, "&");
          if (/duckduckgo|bing\.com\/(ck|search)|microsoft|go\.micro/.test(url2)) continue;
          items.push({ title: htmlToText(m[2]).slice(0, 160), url: url2, snippet: "" });
        }
        for (const it of items) found.push({ ...it, source: "html-engine" });
        lastErr = items.length ? "" : "نتیجه‌ای استخراج نشد";
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
    const uniq = found.filter((f, i) => f.url && found.findIndex((x) => x.url === f.url) === i).slice(0, 12);
    if (uniq.length) {
      const text = uniq.map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}\n   [${it.source}] ${it.snippet.slice(0, 240)}`).join("\n\n");
      return { ok: true, text, data: uniq };
    }
    return { ok: false, text: "", error: lastErr || "هیچ موتور جست‌وجویی پاسخ نداد" };
  },

  "knowledge.summary": async (args) => {
    const title = String(args.title ?? args.query ?? "").trim();
    if (!title) return { ok: false, text: "", error: "عنوانی داده نشد" };
    const lang = String(args.lang ?? "en");
    const j = (await fetchJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { "User-Agent": UA },
      timeoutMs: 20000,
    })) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string } };
    if (!j?.extract) return { ok: false, text: "", error: "خلاصه‌ای یافت نشد" };
    return {
      ok: true,
      text: `# ${j.title}\n\n${j.extract}\n\nمنبع: ${j.content_urls?.desktop?.page ?? ""}`,
      data: j,
    };
  },

  "web.fetch": async (args) => {
    const url = String(args.url ?? "");
    if (!/^https?:\/\//.test(url)) return { ok: false, text: "", error: "آدرس نامعتبر" };
    const limit = Number(args.limit ?? 16000);
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(30000) });
    const type = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (type.includes("json")) return { ok: true, text: raw.slice(0, limit), data: JSON.parse(raw || "null") };
    const text = type.includes("html") ? htmlToText(raw) : raw;
    return { ok: true, text: text.slice(0, limit), data: { url, chars: text.length } };
  },

  "market.scan": async (args) => {
    const tickers = Array.isArray(args.tickers) ? (args.tickers as string[]) : String(args.tickers ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const market = String(args.market ?? "global");
    if (!tickers.length) return { ok: false, text: "", error: "هیچ نمادی داده نشد" };
    const data = await tvScan(tickers.slice(0, 20), market);
    const rows = data.rows;
    if (!rows.length) return { ok: false, text: "", error: "اسکنر TradingView داده‌ای برنگرداند" };
    const text = rows
      .map((r) => {
        const f = (k: string) => (r[k] === undefined || r[k] === null ? "—" : typeof r[k] === "number" ? Number(r[k]).toFixed(4).replace(/\.?0+$/, "") : String(r[k]));
        return `◆ ${f("symbol")} ${f("name")} | قیمت ${f("close")} (${f("change_abs")} / ${f("change")}%) | RSI ${f("RSI")} | SMA20 ${f("SMA20")} | SMA50 ${f("SMA50")} | SMA200 ${f("SMA200")} | MACD ${f("MACD.macd")}/${f("MACD.signal")} | ADX ${f("ADX")} | توصیه‌ی جامع ${f("Recommend.All")} | نوسان روز ${f("Volatility.D")} | حجم ${f("volume")} | 1ه ${f("Perf.W")} 1م ${f("Perf.1M")} 3م ${f("Perf.3M")} 1س ${f("Perf.Y")}`;
      })
      .join("\n");
    return { ok: true, text, data: rows };
  },

  "market.search": async (args) => {
    const q = String(args.query ?? "");
    const res = await tvSearch(q, Number(args.limit ?? 12));
    const text = res.map((r) => `${r.symbol} — ${r.description} (${r.exchange}/${r.type})`).join("\n");
    return { ok: true, text, data: res };
  },

  "market.history": async (args) => {
    const symbol = String(args.symbol ?? "");
    const { rows, source, errors } = await fetchHistoryAny(symbol, String(args.range ?? "1y"), String(args.interval ?? "1d"));
    const closes = rows.map((r) => r.c).filter((c): c is number => typeof c === "number");
    const ind = computeIndicators(closes);
    const tail = rows.slice(-12).map((r) => `${r.t}  O:${r.o?.toFixed(2)}  H:${r.h?.toFixed(2)}  L:${r.l?.toFixed(2)}  C:${r.c?.toFixed(2)}  V:${r.v}`).join("\n");
    return {
      ok: true,
      text: `نماد ${symbol} — ${rows.length} کندل (منبع: ${source})\nاندیکاتورهای محاسبه‌شده:\n${JSON.stringify(ind, null, 2)}\n\n۱۲ کندل آخر:\n${tail}${errors.length ? `\n\n(منابع ناموفق: ${errors.join(" | ")})` : ""}`,
      data: { source, indicators: ind, rows: rows.slice(-400) },
    };
  },

  "code.exec": async (args) => {
    const code = String(args.code ?? "");
    if (!code.trim()) return { ok: false, text: "", error: "کدی داده نشد" };
    const logs: string[] = [];
    const sandbox = {
      console: { log: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")), error: (...a: unknown[]) => logs.push("ERR " + a.map(fmt).join(" ")), info: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")) },
      JSON, Math, Date, Object, Array, String, Number, Boolean, Map, Set, RegExp, parseInt, parseFloat, isNaN,
      result: undefined as unknown,
    };
    try {
      const ctx = vm.createContext(sandbox);
      const script = new vm.Script(`(async () => { ${code} })()`);
      const p = script.runInContext(ctx, { timeout: Number(args.timeoutMs ?? 5000) });
      const val = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), Number(args.timeoutMs ?? 5000)))]);
      sandbox.result = val;
      return { ok: true, text: [...logs, `→ ${fmt(val)}`].join("\n"), data: { logs, result: safe(val) } };
    } catch (e) {
      return { ok: false, text: [...logs, `✖ ${(e as Error).message}`].join("\n"), error: (e as Error).message };
    }
  },

  "fs.workspace": async (args) => {
    const op = String(args.op ?? "list");
    const p = String(args.path ?? ".");
    if (op === "write") {
      const full = await ws(p);
      await fs.writeFile(full, String(args.content ?? ""), "utf8");
      return { ok: true, text: `نوشته شد: ${p} (${String(args.content ?? "").length} بایت)` };
    }
    if (op === "read") {
      const full = await ws(p);
      const c = await fs.readFile(full, "utf8");
      return { ok: true, text: c.slice(0, 40000), data: { bytes: c.length } };
    }
    const full = await ws(p);
    const entries = await fs.readdir(full, { withFileTypes: true });
    const text = entries.map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n") || "(خالی)";
    return { ok: true, text, data: entries.map((e) => ({ name: e.name, dir: e.isDirectory() })) };
  },

  "shell.exec": async (args, ctx) => {
    if (!ctx.allowShell) return { ok: false, text: "", error: "پوسته در ژنوم غیرفعال است (security.allowShell)" };
    const cmd = String(args.command ?? "");
    const blocked = /(rm\s+-rf|mkfs|dd\s+if=|:\(\)\{|curl[^|]*\|\s*sh|sudo)/i;
    if (blocked.test(cmd)) return { ok: false, text: "", error: "فرمان پرخطر مسدود شد" };
    const { exec } = await import("node:child_process");
    return new Promise((resolve) => {
      exec(cmd, { cwd: WORKSPACE, timeout: Number(args.timeoutMs ?? 20000), maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout) resolve({ ok: false, text: stderr, error: err.message });
        else resolve({ ok: true, text: `${stdout}\n${stderr}`.slice(0, 30000) });
      });
    });
  },

  "settings.read": async () => {
    const s = await getSettings();
    return {
      ok: true,
      text: `اندپوینت‌ها: ${s.endpoints.map((e) => e.url).join(", ") || "—"}\nکلیدها: ${s.keys.map((k) => `${k.label}=${maskKey(k.value)}`).join(", ") || "—"}`,
      data: { endpoints: s.endpoints, keys: s.keys.map((k) => ({ label: k.label, masked: maskKey(k.value) })) },
    };
  },

  "tool.synthesize": async (args, ctx) => {
    const key = String(args.key ?? "").trim();
    const source = String(args.source ?? "");
    if (!/^[a-z0-9_.-]{3,48}$/.test(key)) return { ok: false, text: "", error: "کلید ابزار نامعتبر" };
    if (!source.trim()) return { ok: false, text: "", error: "کد ابزار خالی است" };
    const v = validateToolSource(source);
    if (!v.ok) return { ok: false, text: "", error: v.error };
    await db
      .insert(toolsTable)
      .values({
        key,
        name: String(args.name ?? key),
        description: String(args.description ?? "ابزار سنتزشده توسط جن"),
        category: String(args.category ?? "synthesized"),
        risk: String(args.risk ?? "medium"),
        builtin: false,
        enabled: true,
        params: Array.isArray(args.params) ? args.params : [],
        source,
      })
      .onConflictDoNothing();
    await registerDynamic(key, source);
    ctx.log?.(`ابزار تازه سنتز شد: ${key}`, String(args.description ?? ""));
    return { ok: true, text: `ابزار «${key}» ساخته، اعتبارسنجی و در رجیستری فعال شد.` };
  },

  "genome.mutate": async (args, ctx) => {
    const geneName = String(args.gene ?? "");
    if (!geneName) return { ok: false, text: "", error: "ژن مشخص نیست" };
    await putSetting(`genome.override.${geneName}`, args.value);
    const { mutations } = await import("@/db/schema");
    const { genome } = await import("@/db/schema");
    const cur = await db.select().from(genome).where(eq(genome.gene, geneName));
    await db.insert(mutations).values({
      gene: geneName,
      from: cur[0]?.value ?? null,
      to: args.value ?? null,
      reason: String(args.reason ?? "جهش خودکار توسط جن"),
      fitness: null,
      accepted: true,
      generation: (cur[0]?.generation ?? 0) + 1,
    });
    if (cur[0]) await db.update(genome).set({ value: args.value ?? null, generation: cur[0].generation + 1, updatedAt: new Date() }).where(eq(genome.gene, geneName));
    else await db.insert(genome).values({ gene: geneName, value: args.value ?? null, generation: 1, note: String(args.reason ?? "") });
    ctx.log?.(`جهش ژنوم اعمال شد: ${geneName}`, JSON.stringify(args.value ?? null));
    return { ok: true, text: `ژن «${geneName}» به ${JSON.stringify(args.value)} جهش یافت.` };
  },
};

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2)?.slice(0, 4000) ?? String(v);
  } catch {
    return String(v);
  }
}
function safe(v: unknown): unknown {
  try {
    JSON.stringify(v);
    return v;
  } catch {
    return String(v);
  }
}

function validateToolSource(source: string) {
  const banned = [/child_process/, /process\.env/, /require\s*\(/, /import\s*\(/, /eval\s*\(/, /Function\s*\(/, /fs\./, /net\./, /dgram/];
  for (const b of banned) if (b.test(source)) return { ok: false, error: `الگوی ممنوعه در کد ابزار: ${b.source}` };
  try {
    new vm.Script(`(async function(args, ctx, H) { ${source} })`);
    return { ok: true, error: "" };
  } catch (e) {
    return { ok: false, error: `خطای نحوی: ${(e as Error).message}` };
  }
}

/* ابزارهای سنتزشده در حافظه‌ی زمان اجرا */
const DYNAMIC = new Map<string, string>();

async function registerDynamic(key: string, source: string) {
  DYNAMIC.set(key, source);
}

export async function loadDynamicTools() {
  if (DYNAMIC.size) return;
  const rows = await db.select().from(toolsTable).where(eq(toolsTable.builtin, false));
  for (const r of rows) if (r.source && r.enabled) DYNAMIC.set(r.key, r.source);
}

const BUILTIN_DEFS = [
  { key: "web.search", name: "جست‌وجوی وب", category: "research", risk: "low", description: "جست‌وجوی زنده در وب و بازگرداندن منابع (DuckDuckGo/Bing).", params: [{ name: "query", type: "string", required: true }, { name: "limit", type: "number" }] },
  { key: "web.fetch", name: "واکاوی صفحه", category: "research", risk: "low", description: "دریافت و استخراج متن هر URL — از جمله صفحات نیازمند پیمایش.", params: [{ name: "url", type: "string", required: true }, { name: "limit", type: "number" }] },
  { key: "market.scan", name: "اسکنر TradingView", category: "market", risk: "low", description: "اسکن لحظه‌ای نمادها از اسکنر رسمی TradingView با ۴۰+ ستون تکنیکال و فاندامنتال.", params: [{ name: "tickers", type: "string[]", required: true }, { name: "market", type: "string" }] },
  { key: "market.search", name: "یابش نماد TradingView", category: "market", risk: "low", description: "پیدا کردن تیکر دقیق از نام دارایی/صرافی.", params: [{ name: "query", type: "string", required: true }] },
  { key: "market.history", name: "تاریخچه‌ی کندل + اندیکاتور", category: "market", risk: "low", description: "دریافت OHLCV و محاسبه‌ی RSI/SMA/EMA/MACD/نوسان به‌صورت محلی.", params: [{ name: "symbol", type: "string", required: true }, { name: "range", type: "string" }, { name: "interval", type: "string" }] },
  { key: "knowledge.summary", name: "خلاصه‌ی دانشنامه‌ای", category: "research", risk: "low", description: "خلاصه‌ی معتبر و ساخت‌یافته از ویکی‌پدیا برای هر موضوع — برای ریشه‌گیری دانش.", params: [{ name: "title", type: "string", required: true }, { name: "lang", type: "string" }] },
  { key: "code.exec", name: "اجرای کد (سندباکس)", category: "compute", risk: "medium", description: "اجرای JavaScript در سندباکس ایزوله با تایم‌اوت — برای آزمون، محاسبه و اثبات.", params: [{ name: "code", type: "string", required: true }, { name: "timeoutMs", type: "number" }] },
  { key: "fs.workspace", name: "فضای کاری فایل", category: "compute", risk: "medium", description: "خواندن/نوشتن/فهرست فایل‌ها در workspace ایزوله — محل ساخت واقعی پروژه‌ها.", params: [{ name: "op", type: "read|write|list", required: true }, { name: "path", type: "string" }, { name: "content", type: "string" }] },
  { key: "shell.exec", name: "پوسته‌ی محافظتی‌شده", category: "compute", risk: "high", description: "اجرای فرمان در workspace (نیازمند فعال‌سازی security.allowShell در ژنوم).", params: [{ name: "command", type: "string", required: true }] },
  { key: "settings.read", name: "خواندن پیکربندی", category: "system", risk: "low", description: "مشاهده‌ی اندپوینت‌ها و کلیدهای ماسک‌شده.", params: [] },
  { key: "tool.synthesize", name: "سنتز ابزار تازه", category: "meta", risk: "high", description: "خودبرنامه‌نویسی: جن ابزار جدید را می‌نویسد، اعتبارسنجی و در رجیستری فعال می‌کند.", params: [{ name: "key", type: "string", required: true }, { name: "source", type: "string", required: true }, { name: "description", type: "string" }] },
  { key: "genome.mutate", name: "جهش ژنوم", category: "meta", risk: "high", description: "تغییر پارامترهای فراالگوریتم و ثبت در تاریخچه‌ی تکامل.", params: [{ name: "gene", type: "string", required: true }, { name: "value", type: "any", required: true }, { name: "reason", type: "string" }] },
];

export async function ensureToolsSeeded() {
  await fs.mkdir(WORKSPACE, { recursive: true }).catch(() => undefined);
  const rows = await db.select({ key: toolsTable.key }).from(toolsTable);
  const have = new Set(rows.map((r) => r.key));
  const missing = BUILTIN_DEFS.filter((t) => !have.has(t.key));
  if (missing.length) await db.insert(toolsTable).values(missing.map((t) => ({ ...t, builtin: true, enabled: true })));
}

export async function listTools() {
  await ensureToolsSeeded();
  await loadDynamicTools();
  return db.select().from(toolsTable);
}

/** اجرای یک ابزار (درون‌ساخت یا سنتزشده) */
export async function execTool(key: string, args: Record<string, unknown>, ctx: ToolCtx = {}): Promise<ToolResult> {
  await ensureToolsSeeded();
  await loadDynamicTools();
  const started = Date.now();
  try {
    let res: ToolResult;
    if (IMPLS[key]) {
      res = await IMPLS[key](args, ctx);
    } else if (DYNAMIC.has(key)) {
      res = await runDynamic(key, DYNAMIC.get(key)!, args, ctx);
    } else {
      const row = await db.select().from(toolsTable).where(eq(toolsTable.key, key));
      if (row[0]?.source) {
        DYNAMIC.set(key, row[0].source);
        res = await runDynamic(key, row[0].source, args, ctx);
      } else {
        res = { ok: false, text: "", error: `ابزار «${key}» در رجیستری وجود ندارد` };
      }
    }
    await db
      .update(toolsTable)
      .set(res.ok ? { uses: sqlInc("uses") } : { uses: sqlInc("uses"), failures: sqlInc("failures") })
      .where(eq(toolsTable.key, key))
      .catch(() => undefined);
    ctx.log?.(`ابزار ${key} → ${res.ok ? "موفق" : "ناموفق"} (${Date.now() - started}ms)`, res.ok ? res.text.slice(0, 500) : res.error);
    return res;
  } catch (e) {
    return { ok: false, text: "", error: (e as Error).message };
  }
}

function sqlInc(col: "uses" | "failures") {
  return sql`${col === "uses" ? toolsTable.uses : toolsTable.failures} + 1`;
}

async function runDynamic(key: string, source: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const helpers = {
    http: (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }).then((r) => r.text()),
    json: (url: string, init?: RequestInit) => fetchJSON(url, { ...init, timeoutMs: 30000 }),
    sma, ema, rsi, macd,
    read: async (p: string) => (await fs.readFile(await ws(p), "utf8")),
    write: async (p: string, c: string) => { await fs.writeFile(await ws(p), c, "utf8"); return true; },
    log: (m: string) => ctx.log?.(`[${key}] ${m}`),
  };
  const sandbox = {
    args, H: helpers, console: { log: (m: unknown) => ctx.log?.(`[${key}] ${fmt(m)}`) },
    JSON, Math, Date, Object, Array, String, Number, Boolean, Map, Set, RegExp, Promise,
    __out: null as ToolResult | null,
  };
  try {
    const vmCtx = vm.createContext(sandbox);
    const script = new vm.Script(
      `(async () => { const __r = await (async function(args, ctx, H) { ${source} })(args, {log: console.log}, H); __out = (typeof __r === 'string') ? {ok:true, text:__r} : (__r && typeof __r === 'object' && 'ok' in __r) ? __r : {ok:true, text: JSON.stringify(__r ?? null), data: __r ?? null}; })()`,
    );
    await script.runInContext(vmCtx, { timeout: 25000 });
    return sandbox.__out ?? { ok: false, text: "", error: "ابزار خروجی برنگرداند" };
  } catch (e) {
    return { ok: false, text: "", error: (e as Error).message };
  }
}

export { BUILTIN_DEFS, WORKSPACE, htmlToText };
