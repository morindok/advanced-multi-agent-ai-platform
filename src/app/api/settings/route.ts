import { db } from "@/db";
import { agents, artifacts, models, runs, tools } from "@/db/schema";
import { sql } from "drizzle-orm";
import { bootstrap, getGenome, getSettings, maskKey, parseEndpoints, parseKeys, putSetting } from "@/lib/meta/config";
import { countEnabledModels } from "@/lib/meta/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** وضعیت کل مغز — یک‌جا برای رابط کاربری */
export async function GET() {
  await bootstrap();
  const [s, caps, g] = await Promise.all([getSettings(), countEnabledModels(), getGenome()]);
  const [agentCount] = await db.select({ n: sql<number>`count(*)::int` }).from(agents);
  const [modelCount] = await db.select({ n: sql<number>`count(*)::int` }).from(models);
  const [runCount] = await db.select({ n: sql<number>`count(*)::int` }).from(runs);
  const [artCount] = await db.select({ n: sql<number>`count(*)::int` }).from(artifacts);
  const [toolCount] = await db.select({ n: sql<number>`count(*)::int` }).from(tools);
  const regions = await db
    .select({ region: agents.region, n: sql<number>`count(*)::int`, tier5: sql<number>`sum(case when tier=5 then 1 else 0 end)::int` })
    .from(agents)
    .groupBy(agents.region);

  return Response.json({
    agents: agentCount.n,
    regions,
    models: { total: modelCount.n, ...caps },
    runs: runCount.n,
    artifacts: artCount.n,
    tools: toolCount.n,
    endpoints: s.endpoints,
    keys: s.keys.map((k) => ({ label: k.label, masked: maskKey(k.value) })),
    genome: g,
    dry: caps.n === 0,
  });
}

/** ذخیره‌ی آدرس پایه + کلیدها (چندخطی) + پارامترهای ژنوم */
export async function PUT(req: Request) {
  const body = (await req.json()) as {
    endpointsText?: string;
    keysText?: string;
    keepKeyLabels?: string[];
    removeKeyLabels?: string[];
    replaceKeys?: boolean;
    genome?: Record<string, unknown>;
  };
  if (typeof body.endpointsText === "string") await putSetting("endpoints", parseEndpoints(body.endpointsText));

  const cur = await getSettings();
  if (typeof body.keysText === "string" || body.replaceKeys || body.removeKeyLabels?.length) {
    let keys = body.replaceKeys ? [] : cur.keys;
    if (body.removeKeyLabels?.length) keys = keys.filter((k) => !body.removeKeyLabels!.includes(k.label));
    const fresh = parseKeys(body.keysText ?? "").filter((k) => !k.value.includes("•"));
    const map = new Map(keys.map((k) => [k.label, k]));
    for (const f of fresh) map.set(f.label, f);
    await putSetting("keys", [...map.values()]);
  }
  if (body.genome) {
    for (const [k, v] of Object.entries(body.genome)) await putSetting(`genome.override.${k}`, v);
    const { genome } = await import("@/db/schema");
    for (const [k, v] of Object.entries(body.genome)) {
      const cur = await db.select().from(genome).where(sql`${genome.gene} = ${k}`);
      if (cur[0]) await db.update(genome).set({ value: v, generation: cur[0].generation + 1, updatedAt: new Date() }).where(sql`${genome.gene} = ${k}`);
      else await db.insert(genome).values({ gene: k, value: v, generation: 1, note: "تنظیم دستی کاربر" });
    }
  }
  return GET();
}
