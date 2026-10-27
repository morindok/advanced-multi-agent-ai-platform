/** ثابت‌های خالص نواحی مغزی — بدون وابستگی به پایگاه‌داده (قابل استفاده در کلاینت) */
export type Region =
  | "prefrontal"
  | "cortex"
  | "hippocampus"
  | "limbic"
  | "visual"
  | "cerebellum"
  | "brainstem";

export const REGIONS: Record<Region, { fa: string; en: string; duty: string }> = {
  prefrontal: { fa: "قشر پیش‌پیشانی", en: "Prefrontal", duty: "تصمیم، برنامه‌ریزی، داوری نهایی" },
  cortex: { fa: "قشر شناختی", en: "Cortex", duty: "تحلیل عمیق، دانش، استدلال" },
  hippocampus: { fa: "هیپوکامپ", en: "Hippocampus", duty: "حافظه، زمینه، تداوم معنا" },
  limbic: { fa: "سامانه لیمبیک", en: "Limbic", duty: "لحن، خلاقیت، زیبایی‌شناسی" },
  visual: { fa: "قشر بینایی", en: "Visual", duty: "ویژن، تصویر، ویدیو، طراحی" },
  cerebellum: { fa: "مخچه اجرایی", en: "Cerebellum", duty: "کد، ابزار، تست، دقت عملیاتی" },
  brainstem: { fa: "ساقه‌ی مغز", en: "Brainstem", duty: "پروتکل، مسیریابی، امنیت، همگام‌سازی" },
};

export const REGION_KEYS = Object.keys(REGIONS) as Region[];
