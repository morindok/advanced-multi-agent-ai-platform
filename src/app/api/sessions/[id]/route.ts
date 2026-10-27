import { db } from "@/db";
import { artifacts, messages, runs, sessions } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** تاریخچه‌ی کامل یک نشست: پیام‌ها + اجراها + آثار */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const { id } = await ctx.params;
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!session) return Response.json({ error: "یافت نشد" }, { status: 404 });
  const msgs = await db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(asc(messages.id));
  const rs = await db.select().from(runs).where(eq(runs.sessionId, id)).orderBy(desc(runs.id));
  const arts = await db
    .select({
      id: artifacts.id, runId: artifacts.runId, kind: artifacts.kind, title: artifacts.title,
      lang: artifacts.lang, bytes: artifacts.bytes, url: artifacts.url, version: artifacts.version,
      parentId: artifacts.parentId, meta: artifacts.meta, createdAt: artifacts.createdAt,
    })
    .from(artifacts)
    .where(eq(artifacts.sessionId, id))
    .orderBy(desc(artifacts.id));
  return Response.json({ session, messages: msgs, runs: rs, artifacts: arts });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { title?: string };
  if (body.title) await db.update(sessions).set({ title: body.title.slice(0, 80), updatedAt: new Date() }).where(eq(sessions.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(sessions).where(eq(sessions.id, id));
  return Response.json({ ok: true });
}
