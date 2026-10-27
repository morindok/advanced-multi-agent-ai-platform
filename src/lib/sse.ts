import type { EngineEvent } from "./meta/engine";

export type Send = (e: EngineEvent) => void;

/** پاسخ SSE با ضربان زنده برای جلوگیری از قطع اتصال */
export function sseResponse(producer: (send: Send, close: () => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let beat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      ctrl = c;
      const send: Send = (e) => {
        if (closed) return;
        try {
          c.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (beat) clearInterval(beat);
        try {
          c.enqueue(encoder.encode("data: [DONE]\n\n"));
          c.close();
        } catch {
          /* noop */
        }
      };
      beat = setInterval(() => {
        if (!closed) {
          try {
            c.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
          } catch {
            close();
          }
        }
      }, 15000);
      try {
        await producer(send, close);
      } catch (e) {
        send({ channel: "error", title: "خطای غیرمنتظره", body: (e as Error).message });
      } finally {
        close();
      }
    },
    cancel() {
      closed = true;
      if (beat) clearInterval(beat);
      void ctrl;
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

export const NODE_RUNTIME = "nodejs";
