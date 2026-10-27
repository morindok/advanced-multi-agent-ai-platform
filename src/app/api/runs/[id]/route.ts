import { db } from "@/db";
import { artifacts, runEvents, runs } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";
import { resumeRunRow } from "@/lib/meta/jobs";
import { kickWorker } from "@/lib/meta/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** وضعیت کامل یک اجرا + آخرین رویدادها (برای بازگشت پس از رفرش یا بستن مرورگر) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const id = Number((await ctx.params).id);
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return Response.json({ error: "اجرا یافت نشد" }, { status: 404 });
  const evs = await db.select().from(runEvents).where(eq(runEvents.runId, id)).orderBy(desc(runEvents.seq)).limit(800);
  const arts = await db
    .select({
      id: artifacts.id,
      runId: artifacts.runId,
      sessionId: artifacts.sessionId,
      kind: artifacts.kind,
      title: artifacts.title,
      lang: artifacts.lang,
      bytes: artifacts.bytes,
      url: artifacts.url,
      version: artifacts.version,
      parentId: artifacts.parentId,
      meta: artifacts.meta,
      createdAt: artifacts.createdAt,
    })
    .from(artifacts)
    .where(eq(artifacts.runId, id))
    .orderBy(asc(artifacts.id));
  return Response.json({ run, events: evs.reverse(), artifacts: arts });
}

/** ادامه از همان نقطه: اجرا دوباره در صف قرار می‌گیرد و از نقطه‌ی بازیابی ادامه می‌دهد */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const id = Number((await ctx.params).id);
  const r = await resumeRunRow(id);
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 409 });
  kickWorker();
  return Response.json({ ok: true, runId: id });
}
