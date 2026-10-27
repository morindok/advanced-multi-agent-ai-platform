import { db } from "@/db";
import { agents } from "@/db/schema";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";
import { REGIONS } from "@/lib/meta/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** فهرست ۱۰۰۰ ایجنت با صفحه‌بندی، فیلتر ناحیه و جست‌وجو */
export async function GET(req: Request) {
  await bootstrap();
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 60));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const region = url.searchParams.get("region");
  const q = url.searchParams.get("q");
  const tier = url.searchParams.get("tier");

  const conds = [];
  if (region && region !== "all") conds.push(eq(agents.region, region));
  if (tier) conds.push(eq(agents.tier, Number(tier)));
  if (q) conds.push(sql`(${ilike(agents.name, `%${q}%`)} or ${ilike(agents.code, `%${q}%`)} or ${ilike(agents.specialty, `%${q}%`)})`);

  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(agents)
    .where(where)
    .orderBy(desc(agents.tier), asc(agents.id))
    .limit(limit)
    .offset(offset);
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(agents).where(where);
  const stats = await db
    .select({
      region: agents.region,
      n: sql<number>`count(*)::int`,
      avgSkill: sql<number>`avg(skill)::float`,
      tasks: sql<number>`sum(tasks)::int`,
    })
    .from(agents)
    .groupBy(agents.region);

  return Response.json({
    agents: rows,
    total: c.n,
    limit,
    offset,
    stats: stats.map((s) => ({ ...s, fa: REGIONS[s.region as keyof typeof REGIONS]?.fa ?? s.region })),
    regions: Object.entries(REGIONS).map(([k, v]) => ({ key: k, ...v })),
  });
}

/** ماموریت‌دهی دستی به یک ایجنت (تست پروتکل) */
export async function PATCH(req: Request) {
  const body = (await req.json()) as { codes?: string[]; status?: string; skill?: number };
  if (body.codes?.length) {
    const set: Record<string, unknown> = {};
    if (body.status) set.status = body.status;
    if (typeof body.skill === "number") set.skill = body.skill;
    if (Object.keys(set).length) await db.update(agents).set(set).where(inArray(agents.code, body.codes.slice(0, 200)));
  }
  return Response.json({ ok: true });
}
