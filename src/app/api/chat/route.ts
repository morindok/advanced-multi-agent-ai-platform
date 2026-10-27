import { db } from "@/db";
import { messages, runs, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";
import { kickWorker } from "@/lib/meta/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ورودی کاربر: اجرا را در صف می‌گذارد و بلافاصله شناسه برمی‌گرداند.
 * پردازش روی سرور انجام می‌شود؛ بستن مرورگر آن را متوقف نمی‌کند.
 */
export async function POST(req: Request) {
  await bootstrap();
  const body = (await req.json()) as {
    sessionId?: string;
    prompt?: string;
    attachments?: { name: string; type: string; data: string }[];
    forceMode?: "standard" | "deep" | "forge";
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "درخواست خالی است" }, { status: 400 });

  let sessionId = body.sessionId;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    await db.insert(sessions).values({ id: sessionId, title: prompt.slice(0, 60) || "گفت‌وگوی تازه" });
  } else {
    await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  const attachments = body.attachments ?? [];
  const images = attachments.filter((a) => a.type.startsWith("image")).map((a) => a.data);

  const [run] = await db
    .insert(runs)
    .values({
      sessionId,
      prompt,
      status: "queued",
      phase: "bootstrap",
      state: { attachments: images, forceMode: body.forceMode ?? null },
    })
    .returning({ id: runs.id });

  await db.insert(messages).values({
    sessionId,
    runId: run.id,
    role: "user",
    content: prompt,
    parts: attachments.map((a) => ({ type: a.type.startsWith("image") ? "image" : "file", name: a.name, data: a.data })),
  });

  kickWorker();
  return Response.json({ runId: run.id, sessionId });
}
