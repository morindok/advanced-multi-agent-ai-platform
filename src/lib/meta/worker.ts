import { db } from "@/db";
import { messages, runEvents, runs } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { Cancelled, MAX_AUTO_ATTEMPTS, claimNext, getRunStatus, makeEmitter } from "./jobs";
import { runJob } from "./engine";

/**
 * کارگر پس‌زمینه: اجراها را از صف برمی‌دارد و مستقل از مرورگر اجرا می‌کند.
 * با instrumentation.ts هنگام بالا آمدن سرور شروع می‌شود و تا خاموش شدن سرور ادامه دارد.
 */
const WORKER_ID = `ncp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const CONCURRENCY = 2;
const KEY = "__ncpWorker";

type WState = { started: boolean; active: number; claiming: boolean };

function st(): WState {
  const g = globalThis as unknown as Record<string, WState | undefined>;
  if (!g[KEY]) g[KEY] = { started: false, active: 0, claiming: false };
  return g[KEY] as WState;
}

export function startWorker() {
  const s = st();
  if (s.started) return;
  s.started = true;
  void (async () => {
    try {
      // اجراهایی که در زمان قطع سرور در حال اجرا بودند، دوباره در صف قرار می‌گیرند
      await db.update(runs).set({ status: "queued", worker: null }).where(eq(runs.status, "running"));
    } catch {
      /* دیتابیس ممکن است هنوز آماده نباشد؛ تیک‌ها دوباره تلاش می‌کنند */
    }
    setInterval(() => void tick(), 2000);
    setInterval(() => {
      void db.update(runs).set({ heartbeat: new Date() }).where(eq(runs.status, "running")).catch(() => undefined);
    }, 15000);
    void tick();
  })();
}

export function kickWorker() {
  void tick();
}

async function tick(): Promise<void> {
  const s = st();
  if (s.claiming) return;
  s.claiming = true;
  try {
    while (s.active < CONCURRENCY) {
      let job: { id: number; attempts: number } | null = null;
      try {
        job = await claimNext(WORKER_ID);
      } catch {
        return;
      }
      if (!job) return;
      s.active += 1;
      void runOne(job.id, job.attempts)
        .catch(() => undefined)
        .finally(() => {
          s.active -= 1;
          void tick();
        });
    }
  } finally {
    s.claiming = false;
  }
}

async function runOne(runId: number, attempts: number) {
  const [seqRow] = await db
    .select({ seq: sql<number>`coalesce(max(${runEvents.seq}), 0)::int` })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  const em = makeEmitter(runId, Number(seqRow?.seq ?? 0));

  try {
    await runJob(runId, em.emit);
    await em.finish();

    // اگر موتور خودش را در صف گذاشته (برش بعدی) یا متوقف کرده، تمام نشده است
    if ((await getRunStatus(runId)) !== "running") return;

    const [r] = await db.select().from(runs).where(eq(runs.id, runId));
    await db
      .update(runs)
      .set({ status: "done", phase: "done", progress: 1, finishedAt: new Date(), worker: null, error: null, attempts: 0 })
      .where(eq(runs.id, runId));
    const body = r?.partial?.trim() ? r.partial : "اجرا کامل شد. آثار را در پنل «آثار» ببین.";
    await db.insert(messages).values({ sessionId: r.sessionId, runId, role: "assistant", content: body });
    em.emit({ channel: "done", title: "اجرا کامل شد", payload: { runId } });
    await em.finish();
  } catch (e) {
    if (e instanceof Cancelled) {
      await em.finish();
      await db
        .update(runs)
        .set({ status: "paused", worker: null })
        .where(and(eq(runs.id, runId), eq(runs.status, "running")));
      return;
    }
    const msg = (e as Error)?.message || String(e);
    em.emit({ channel: "error", title: `خطا در اجرا (تلاش ${attempts})`, body: msg.slice(0, 1500) });
    await em.finish();

    if (attempts < MAX_AUTO_ATTEMPTS) {
      const delayMs = Math.min(10 * 60 * 1000, 20_000 * 2 ** Math.max(0, attempts - 1));
      await db
        .update(runs)
        .set({
          status: "queued",
          worker: null,
          error: `خطا: ${msg.slice(0, 600)} — تلاش خودکار ${attempts + 1} از ${MAX_AUTO_ATTEMPTS} تا ${Math.round(delayMs / 1000)} ثانیه دیگر (از همان نقطه)`,
          nextAt: new Date(Date.now() + delayMs),
        })
        .where(eq(runs.id, runId));
    } else {
      await db
        .update(runs)
        .set({ status: "failed", worker: null, error: msg.slice(0, 1500), finishedAt: new Date() })
        .where(eq(runs.id, runId));
    }
  }
}
