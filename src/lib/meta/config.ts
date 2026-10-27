import { db } from "@/db";
import { genome, settings } from "@/db/schema";
import { ensureBrainSeeded } from "./agents";

export type EndpointEntry = { label: string; url: string };
export type KeyEntry = { label: string; value: string; endpoint?: string };

export const DEFAULT_GENOME: Record<string, { value: unknown; note: string }> = {
  "consensus.threshold": { value: 0.86, note: "آستانه‌ی اجماع مغز — تا رسیدن به آن، موتور برنمی‌گردد" },
  "consensus.jury": { value: 100, note: "اندازه‌ی هیئت داوران کیفیت" },
  "consensus.maxIterations": { value: 4, note: "حداکثر چرخه‌ی نقد و بازسازی" },
  "engine.parallelism": { value: 6, note: "درجه‌ی موازی‌سازی نورون‌ها" },
  "engine.timeoutMs": { value: 180000, note: "سقف زمان هر فراخوانی مدل" },
  "engine.maxToolSteps": { value: 8, note: "حداکثر گام خودکار جعبه‌ابزار" },
  "blueprint.targetChars": { value: 1000000, note: "حداقل حجم معماری پیش از ساخت (کاراکتر)" },
  "blueprint.batch": { value: 6, note: "اندازه‌ی دسته‌ی انبساط موازی" },
  "blueprint.maxCalls": { value: 60, note: "بودجه‌ی فراخوانی در هر اجرا (قابل ادامه)" },
  "blueprint.sectionChars": { value: 3000, note: "حجم هدف هر بخش معماری" },
  "router.strategy": { value: "weighted", note: "weighted | round-robin | fastest" },
  "security.allowShell": { value: false, note: "دسترسی پوسته‌ی محدود (نیازمند فعال‌سازی دستی)" },
  "evolution.rate": { value: 0.18, note: "نرخ یادگیری ژنوم از هر اجرا" },
};

async function ensureGenome() {
  const rows = await db.select().from(genome);
  if (rows.length === 0) {
    await db.insert(genome).values(
      Object.entries(DEFAULT_GENOME).map(([gene, v]) => ({
        gene,
        value: v.value,
        generation: 0,
        note: v.note,
      })),
    );
  }
}

export async function bootstrap() {
  await ensureBrainSeeded();
  await ensureGenome();
}

export async function getGenome(): Promise<Record<string, unknown>> {
  await ensureGenome();
  const rows = await db.select().from(genome);
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.gene] = r.value;
  for (const [k, v] of Object.entries(DEFAULT_GENOME)) if (!(k in out)) out[k] = v.value;
  return out;
}

export function gene<T>(g: Record<string, unknown>, key: string, fallback: T): T {
  const v = g[key];
  return (v === undefined || v === null ? fallback : v) as T;
}

export async function getSettings() {
  const rows = await db.select().from(settings);
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    endpoints: (map.endpoints as EndpointEntry[]) ?? [],
    keys: (map.keys as KeyEntry[]) ?? [],
    ui: (map.ui as Record<string, unknown>) ?? {},
    raw: map,
  };
}

export async function putSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** تبدیل ورودی چندخطی کاربر به ساختار: هر خط «برچسب|کلید» یا فقط «کلید» */
export function parseKeys(text: string): KeyEntry[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      if (line.includes("|")) {
        const [label, value] = line.split("|").map((s) => s.trim());
        return { label: label || `key-${i + 1}`, value: value || "" };
      }
      if (line.includes("=")) {
        const [label, value] = line.split("=").map((s) => s.trim());
        return { label: label || `key-${i + 1}`, value: value || "" };
      }
      return { label: `key-${i + 1}`, value: line };
    })
    .filter((k) => k.value.length > 3);
}

export function parseEndpoints(text: string): EndpointEntry[] {
  return text
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((url, i) => {
      let clean = url.replace(/\/+$/, "");
      if (!/^https?:\/\//.test(clean)) clean = `https://${clean}`;
      let label = `endpoint-${i + 1}`;
      try {
        label = new URL(clean).host;
      } catch {
        /* ignore */
      }
      return { label, url: clean };
    });
}

export function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 10) return `${k.slice(0, 2)}••••`;
  return `${k.slice(0, 6)}••••${k.slice(-4)}`;
}
