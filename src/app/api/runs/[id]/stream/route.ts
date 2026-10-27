import { db } from "@/db";
import { runEvents, runs, type RunRow } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const ACTIVE = ["queued", "running"];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function summary(r: RunRow) {
  return {
    id: r.id,
    status: r.status,
    phase: r.phase,
    progress: r.progress,
    producedChars: r.producedChars,
    targetChars: r.targetChars,
    error: r.error,
    attempts: r.attempts,
    nextAt: r.nextAt,
    council: r.council,
    gate: r.gate,
    stats: r.stats,
    mode: r.mode,
    intent: r.intent,
  };
}

/**
 * جریان زنده‌ی یک اجرا از روی دیتابیس (نه از حافظه‌ی درخواست).
 * بستن تب فقط این اتصال را می‌بندد؛ خود اجرا روی سرور ادامه دارد.
 * ?after=seq برای ادامه‌ی دقیق پس از اتصال مجدد.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const id = Number((await ctx.params).id);
  let cursor = Math.max(0, Number(new URL(req.url).searchParams.get("after") ?? 0) || 0);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (obj: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          open = false;
        }
      };
      const started = Date.now();
      let lastPartial: string | null = null;
      let lastPing = Date.now();
      try {
        while (open && !req.signal.aborted) {
          const [run] = await db.select().from(runs).where(eq(runs.id, id));
          if (!run) {
            send({ type: "error", message: "اجرا یافت نشد" });
            break;
          }
          const evs = await db
            .select()
            .from(runEvents)
            .where(and(eq(runEvents.runId, id), gt(runEvents.seq, cursor)))
            .orderBy(asc(runEvents.seq))
            .limit(400);
          if (evs.length) cursor = evs[evs.length - 1].seq;
          const partialChanged = run.partial !== lastPartial;
          lastPartial = run.partial;
          send({
            type: "batch",
            cursor,
            events: evs.map((e) => ({
              seq: e.seq,
              channel: e.channel,
              title: e.title,
              body: e.body,
              agentCode: e.agentCode,
              modelId: e.modelId,
              payload: e.payload,
            })),
            partial: partialChanged ? run.partial : undefined,
            run: summary(run),
          });

          const active = ACTIVE.includes(run.status);
          if (!active && evs.length === 0) break;
          if (Date.now() - lastPing > 10000) {
            try {
              controller.enqueue(enc.encode(": ping\n\n"));
            } catch {
              open = false;
            }
            lastPing = Date.now();
          }
          if (Date.now() - started > 50 * 60 * 1000) break;
          await sleep(active ? 900 : 300);
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        try {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* اتصال بسته شده */
        }
        open = false;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
