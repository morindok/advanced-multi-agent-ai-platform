import { db } from "@/db";
import { agents } from "@/db/schema";
import { sql } from "drizzle-orm";

export { REGIONS, REGION_KEYS, type Region } from "./regions";
import { REGIONS, REGION_KEYS, type Region } from "./regions";

const PREFIX = [
  "فرا", "نور", "سینا", "آرش", "مهر", "کیان", "دانا", "رهی", "بامداد", "هیراد",
  "پرتو", "ژرف", "توانا", "فرزین", "سام", "مانی", "رها", "آذرخش", "سپنتا", "هومان",
];

const ROOT = [
  "اندیشه", "پندار", "کاوش", "معمار", "نگهبان", "سازنده", "سنجه", "پژواک", "راهبر", "جوینده",
  "داور", "هسته", "تار", "رشته", "ساختار", "پرداز", "پیوند", "رویه", "الگو", "قانون",
  "سامانه", "دروازه", "کلید", "مدار", "توان", "ژرفا", "بینش", "گمانه", "برآورد", "تراز",
  "همگرا", "واگرا", "پالایه", "آزمون", "باریکه", "پیکره", "دستور", "فهرست", "شاخص", "سنگ‌بنا",
  "شکاف", "گره", "لایه", "میدان", "نبض", "هاله", "سپهر", "کارا", "فروغ", "پیوندک",
];

const SPECIALTIES: Record<Region, string[]> = {
  prefrontal: [
    "تصمیم‌گیری چندمعیاره", "برنامه‌ریزی راهبردی", "تخصیص منابع", "داوری اجماع",
    "مدیریت ریسک", "اولویت‌بندی", "تعریف دروازه کیفیت", "شکست تعارض",
  ],
  cortex: [
    "تحلیل سامانه‌های پیچیده", "استدلال ریاضی", "معماری نرم‌افزار", "علم داده",
    "فیزیک و مهندسی", "حقوق و قرارداد", "پزشکی و زیست", "اقتصاد و بازار",
    "زبان‌شناسی", "فلسفه و منطق", "امنیت سایبری", "شبکه و توزیع",
  ],
  hippocampus: [
    "بازیابی زمینه", "فشرده‌سازی حافظه", "تداوم گفتار", "نمایه‌سازی دانش",
    "یادآوری بلندمدت", "پیوند اسناد",
  ],
  limbic: [
    "روایت‌پردازی", "لحن و سبک", "شعر و ادب", "طراحی تجربه کاربری",
    "زیبایی‌شناسی بصری", "همدلی و مشاوره", "بازاریابی و اقناع",
  ],
  visual: [
    "تولید تصویر", "کارگردانی ویدیو", "بینایی ماشین", "طراحی رابط",
    "تایپوگرافی", "معماری بصری", "پردازش رسانه", "داده‌نمایی",
  ],
  cerebellum: [
    "مهندسی کد", "دیباگ و آزمون", "زیرساخت و DevOps", "پایگاه داده",
    "بهینه‌سازی عملکرد", "اتوماسیون", "سنتز ابزار", "یکپارچه‌سازی API",
  ],
  brainstem: [
    "پروتکل شبکه", "مسیریابی مدل", "کنترل جریان", "رمزنگاری",
    "مقاومت در برابر خطا", "همگام‌سازی موازی", "نظارت و تله‌متری",
  ],
};

const FUNCTIONS = [
  "synthesize", "critique", "verify", "expand", "route", "vote", "plan",
  "code", "test", "design", "research", "audit", "merge", "quantify",
  "simulate", "compress", "challenge", "prove",
];

/** تولیدکننده‌ی شبه‌تصادفی قطعی تا مغز در هر بار زایش یکسان باشد */
function seeded(n: number) {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export type GeneratedAgent = {
  code: string;
  name: string;
  region: Region;
  tier: number;
  specialty: string;
  functions: string[];
  skill: number;
};

export function generateAgents(count = 1000): GeneratedAgent[] {
  const out: GeneratedAgent[] = [];
  for (let i = 0; i < count; i++) {
    const region = REGION_KEYS[i % REGION_KEYS.length];
    const r1 = seeded(i + 1);
    const r2 = seeded(i + 1001);
    const r3 = seeded(i + 2001);
    const spec = SPECIALTIES[region];
    // توزیع لایه‌ها: هرمی — تعداد کمی لایه ۵ (هسته‌ی ارشد)
    const tier = r1 > 0.965 ? 5 : r1 > 0.86 ? 4 : r1 > 0.6 ? 3 : r1 > 0.25 ? 2 : 1;
    const fns = FUNCTIONS.filter((_, k) => seeded(i * 31 + k * 7) > 0.72).slice(0, 4);
    out.push({
      code: `NCP-${String(i + 1).padStart(4, "0")}`,
      name: `${PREFIX[i % PREFIX.length]}‌${ROOT[Math.floor(i / PREFIX.length) % ROOT.length]}`,
      region,
      tier,
      specialty: spec[Math.floor(r2 * spec.length) % spec.length],
      functions: fns.length ? fns : ["synthesize"],
      skill: Number((0.35 + tier * 0.11 + r3 * 0.12).toFixed(3)),
    });
  }
  return out;
}

/** زایش یک‌باره‌ی مغز (idempotent) */
export async function ensureBrainSeeded() {
  const row = await db.execute<{ n: string }>(sql`select count(*)::text as n from ncp_agents`);
  const n = Number((row as unknown as { rows?: { n: string }[] }).rows?.[0]?.n ?? "0");
  if (n >= 1000) return n;
  const gen = generateAgents(1000);
  const CHUNK = 100;
  for (let i = 0; i < gen.length; i += CHUNK) {
    const slice = gen.slice(i, i + CHUNK);
    await db
      .insert(agents)
      .values(slice.map((a) => ({ ...a, memory: {}, status: "idle" })))
      .onConflictDoNothing();
  }
  return 1000;
}
