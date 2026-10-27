import { db } from "@/db";
import { models as modelsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bootstrap, getSettings } from "@/lib/meta/config";
import { discoverAll, type DiscoveredModel } from "@/lib/meta/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Guess = { canText: boolean; canVision: boolean; canImage: boolean; canVideo: boolean };

/** حدس توانمندی از شناسه‌ی مدل — کاربر همیشه می‌تواند دستی اصلاح کند */
function guessCaps(id: string, meta?: Record<string, unknown>): Guess {
  const s = `${id} ${JSON.stringify(meta ?? {})}`.toLowerCase();
  const isImage = /(dall-e|dalle|flux|stable-diffusion|sdxl|midjourney|imagen|ideogram|recraft|kolors|playground|sora-image)/.test(s);
  const isVideo = /(sora|veo|runway|kling|luma|hailuo|minimax|pika|gen-3|gen3|cogvideo|mochi|wan2|video)/.test(s) && !isImage;
  const isVision = /(gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4|claude-3|claude-4|claude-opus|claude-sonnet|gemini|qwen-vl|qwen2\.5-vl|llava|internvl|vision|nvlm|pixtral|llama-3\.2-11b|mistral-large)/.test(s);
  const isEmbedding = /(embedding|embed|rerank|whisper|tts|audio|moderation|guard)/.test(s);
  return {
    canText: !isImage && !isVideo && !isEmbedding,
    canVision: !isImage && !isVideo && isVision,
    canImage: isImage,
    canVideo: isVideo,
  };
}

export async function GET() {
  await bootstrap();
  const rows = await db.select().from(modelsTable);
  const { keys } = await getSettings();
  return Response.json({
    models: rows.map((r) => ({ ...r, hasKey: keys.some((k) => k.label === r.keyLabel) })),
    count: rows.length,
  });
}

/** کشف یک‌جای مدل‌ها برای همه‌ی کلیدها × همه‌ی اندپوینت‌ها */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { autoEnable?: boolean };
  await bootstrap();
  const { endpoints, keys } = await getSettings();
  if (!endpoints.length || !keys.length) {
    return Response.json({ ok: false, error: "ابتدا در تنظیمات، آدرس پایه و حداقل یک کلید وارد کنید." }, { status: 400 });
  }
  const results = await discoverAll();
  let inserted = 0;
  for (const r of results) {
    for (const m of r.models as DiscoveredModel[]) {
      const caps = guessCaps(m.id, (m as Record<string, unknown>).capabilities as Record<string, unknown>);
      const ctx = Number((m as Record<string, unknown>).context_length ?? 0) || null;
      try {
        await db
          .insert(modelsTable)
          .values({
            endpoint: r.endpoint,
            keyLabel: r.keyLabel,
            modelId: m.id,
            displayName: m.id,
            contextLen: ctx,
            meta: { owned_by: m.owned_by ?? null, raw: m },
            ...caps,
            enabled: false,
          })
          .onConflictDoUpdate({
            target: [modelsTable.endpoint, modelsTable.keyLabel, modelsTable.modelId],
            set: { contextLen: ctx, meta: { owned_by: m.owned_by ?? null } },
          });
        inserted += 1;
      } catch {
        /* رد کردن تکراری‌ها */
      }
    }
  }
  // اگر هیچ مدل فعالی نیست، چند مدل متنی قوی را خودکار فعال کن تا مغز روشن شود
  let autoEnabled = 0;
  if (body.autoEnable !== false) {
    const all = await db.select().from(modelsTable);
    if (!all.some((a) => a.enabled)) {
      const textModels = all.filter((a) => a.canText).slice(0, 8);
      for (const t of textModels) {
        await db.update(modelsTable).set({ enabled: true }).where(eq(modelsTable.id, t.id));
        autoEnabled += 1;
      }
    }
  }
  return Response.json({
    ok: true,
    discovered: inserted,
    autoEnabled,
    results: results.map((r) => ({ endpoint: r.endpoint, keyLabel: r.keyLabel, ok: r.ok, count: r.count, error: r.error })),
  });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id?: number;
    ids?: number[];
    enabled?: boolean;
    canText?: boolean;
    canVision?: boolean;
    canImage?: boolean;
    canVideo?: boolean;
  };
  const set: Record<string, unknown> = {};
  for (const k of ["enabled", "canText", "canVision", "canImage", "canVideo"] as const) {
    if (typeof body[k] === "boolean") set[k] = body[k];
  }
  const ids = body.ids ?? (body.id ? [body.id] : []);
  if (!ids.length || !Object.keys(set).length) return Response.json({ ok: false, error: "پارامتر ناکافی" }, { status: 400 });
  for (const id of ids) await db.update(modelsTable).set(set).where(eq(modelsTable.id, id));
  return Response.json({ ok: true, updated: ids.length, set });
}
