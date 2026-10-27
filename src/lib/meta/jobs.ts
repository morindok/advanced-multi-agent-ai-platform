import { db } from "@/db";
import { runEvents, runs } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { EngineEvent } from "./engine";

/** حداکثر تلاش خودکار پیش از رسیدن به وضعیت failed (قابل ادامه‌ی دستی) */
export const MAX_AUTO_ATTEMPTS = 5;

/** سیگنال توقف: کاربر اجرا را متوقف کرده یا وضعیت از بیرون تغییر کرده */
export class Cancelled extends Error {
  constructor() {
    super("متوقف شد");
    this.name = "Cancelled";
  }
}

export async function getRunStatus(runId: number): Promise<string | null> {
  const [r] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
  return r?.status ?? null;
}

/** در هر گام کاری صدا زده می‌شود تا توقف کاربر سریع اعمال شود */
export async function assertRunning(runId: number) {
  const s = await getRunStatus(runId);
  if (s !== "running") throw new Cancelled();
}

/** یک اجرای آماده‌ی صف را اتمی برمی‌دارد (امن برای چند کارگر) */
export async function claimNext(workerId: string): Promise<{ id: number; attempts: number } | null> {
  const res = await db.execute(sql`
    update ncp_runs
       set status = 'running', heartbeat = now(), worker = ${workerId}, attempts = attempts + 1
     where id = (
       select id from ncp_runs
        where status = 'queued' and next_at <= now()
        order by id
        limit 1
        for update skip locked
     )
    returning id, attempts`);
  const rows = (res as unknown as { rows: { id: number; attempts: number }[] }).rows ?? [];
  return rows[0] ? { id: Number(rows[0].id), attempts: Number(rows[0].attempts) } : null;
}

/** اجرای متوقف یا شکست‌خورده را دوباره در صف می‌گذارد (از همان نقطه‌ی بازیابی) */
export async function resumeRunRow(runId: number): Promise<{ ok: boolean; error?: string }> {
  const [r] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
  if (!r) return { ok: false, error: "اجرا یافت نشد" };
  if (r.status === "running" || r.status === "queued") {
    return { ok: false, error: "این اجرا هم‌اکنون در صف یا در حال اجراست" };
  }
  await db
    .update(runs)
    .set({ status: "queued", attempts: 0, error: null, nextAt: new Date(), worker: null })
    .where(eq(runs.id, runId));
  return { ok: true };
}

export async function cancelRunRow(runId: number) {
  await db
    .update(runs)
    .set({ status: "paused", worker: null, error: "متوقف توسط کاربر — با «ادامه» از همان نقطه برمی‌گردد" })
    .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running"])));
}

/**
 * ثبت‌کننده‌ی رویداد: رویدادها را با seq پشت‌سرهم در DB می‌نویسد،
 * و متن زنده (توکن‌ها) را هر چند صد میلی‌ثانیه در runs.partial ذخیره می‌کند.
 */
export function makeEmitter(runId: number, startSeq: number) {
  let seq = startSeq;
  let chain: Promise<unknown> = Promise.resolve();
  let partial = "";
  let dirty = false;

  const enqueue = (fn: () => PromiseLike<unknown>) => {
    chain = chain.then(fn).catch(() => undefined);
  };

  const flush = () => {
    if (!dirty) return;
    dirty = false;
    const snap = partial;
    enqueue(() => db.update(runs).set({ partial: snap }).where(eq(runs.id, runId)));
  };

  const timer = setInterval(flush, 800);

  const emit = (e: EngineEvent) => {
    if (e.channel === "token") {
      if (e.title === "reset") partial = "";
      else partial += e.body ?? "";
      dirty = true;
      return;
    }
    seq += 1;
    const mySeq = seq;
    enqueue(() =>
      db.insert(runEvents).values({
        runId,
        seq: mySeq,
        channel: e.channel,
        agentCode: e.agentCode ?? null,
        modelId: e.modelId ?? null,
        title: (e.title || "").slice(0, 500),
        body: e.body ? e.body.slice(0, 4000) : null,
        payload: e.payload ?? {},
      }),
    );
  };

  const finish = async () => {
    clearInterval(timer);
    flush();
    await chain;
  };

  return { emit, finish, seq: () => seq };
}
