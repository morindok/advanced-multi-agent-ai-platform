import { db } from "@/db";
import { sessions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  const rows = await db.select().from(sessions).orderBy(desc(sessions.updatedAt)).limit(100);
  return Response.json({ sessions: rows });
}

export async function POST(req: Request) {
  await bootstrap();
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(sessions)
    .values({ id, title: body.title?.slice(0, 80) || "گفت‌وگوی تازه" })
    .returning();
  return Response.json({ session: row });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  return Response.json({ ok: true });
}

