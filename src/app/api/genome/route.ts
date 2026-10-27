import { db } from "@/db";
import { genome, mutations, models as modelsTable } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { bootstrap, DEFAULT_GENOME, getGenome } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  const genes = await db.select().from(genome);
  const muts = await db.select().from(mutations).orderBy(desc(mutations.id)).limit(100);
  const [modelStats] = await db
    .select({
      n: sql<number>`count(*)::int`,
      calls: sql<number>`coalesce(sum(calls),0)::int`,
      failures: sql<number>`coalesce(sum(failures),0)::int`,
      avgLatency: sql<number>`coalesce(avg(latency_ms),0)::float`,
      avgScore: sql<number>`coalesce(avg(score),0)::float`,
    })
    .from(modelsTable);
  const top = await db
    .select({ modelId: modelsTable.modelId, score: modelsTable.score, calls: modelsTable.calls, failures: modelsTable.failures, latencyMs: modelsTable.latencyMs })
    .from(modelsTable)
    .orderBy(desc(modelsTable.score))
    .limit(12);
  return Response.json({ genes, mutations: muts, genome: await getGenome(), defaults: DEFAULT_GENOME, modelStats, top });
}

/** جهش دستی یک ژن توسط کاربر */
export async function PATCH(req: Request) {
  const body = (await req.json()) as { gene: string; value: unknown; reason?: string };
  if (!body.gene) return Response.json({ ok: false }, { status: 400 });
  const [cur] = await db.select().from(genome).where(eq(genome.gene, body.gene));
  const gen = (cur?.generation ?? 0) + 1;
  if (cur) await db.update(genome).set({ value: body.value, generation: gen, updatedAt: new Date() }).where(eq(genome.gene, body.gene));
  else await db.insert(genome).values({ gene: body.gene, value: body.value, generation: gen, note: body.reason ?? "دستی" });
  await db.insert(mutations).values({
    gene: body.gene,
    from: cur?.value ?? null,
    to: body.value ?? null,
    reason: body.reason ?? "تغییر دستی توسط کاربر",
    accepted: true,
    generation: gen,
  });
  return Response.json({ ok: true, gene: body.gene, value: body.value, generation: gen });
}
