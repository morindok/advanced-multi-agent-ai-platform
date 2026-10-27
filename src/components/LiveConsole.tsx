"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BrainCircuit, Hammer, PlayCircle, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { EngineEvent } from "@/lib/meta/engine";
import { fmtNum } from "@/lib/api";
import { Badge, Bar, Btn } from "./ui";

const CHANNELS: Record<string, { fa: string; color: string; dot: string }> = {
  status: { fa: "وضعیت", color: "border-slate-600/60", dot: "bg-slate-400" },
  agent: { fa: "ایجنت", color: "border-plasma-500/60", dot: "bg-plasma-400" },
  token: { fa: "توکن", color: "border-neuro-500/50", dot: "bg-neuro-400" },
  tool: { fa: "ابزار", color: "border-warn/60", dot: "bg-warn" },
  consensus: { fa: "اجماع", color: "border-plasma-400/70", dot: "bg-plasma-300" },
  gate: { fa: "دروازه", color: "border-ok/60", dot: "bg-ok" },
  artifact: { fa: "اثر", color: "border-neuro-400/70", dot: "bg-neuro-300" },
  progress: { fa: "پیشرفت", color: "border-line", dot: "bg-slate-500" },
  evolution: { fa: "تکامل", color: "border-ok/70", dot: "bg-ok" },
  error: { fa: "خطا", color: "border-bad/70", dot: "bg-bad" },
};

export default function LiveConsole({
  events,
  running,
  progress,
  phase,
  produced,
  target,
  runId,
  runStatus,
  onContinue,
  counts,
}: {
  events: EngineEvent[];
  running: boolean;
  progress: number;
  phase: string;
  produced: number;
  target: number;
  runId: number | null;
  runStatus: string;
  onContinue: () => void;
  counts: { agents: number; models: number };
}) {
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () => events.filter((e) => e.channel !== "token" && (filter.size === 0 || filter.has(e.channel))),
    [events, filter],
  );

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [list.length, autoScroll]);

  const toggle = (c: string) =>
    setFilter((f) => {
      const n = new Set(f);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const pct = target > 0 ? produced / target : progress;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* سنجاق وضعیت مغز */}
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative grid h-6 w-6 place-items-center">
              <BrainCircuit size={15} className="text-plasma-400" />
              {running && <span className="absolute inset-0 rounded-full border border-plasma-400/70" style={{ animation: "pulsering 2.4s ease-out infinite" }} />}
            </span>
            <span className="text-[12px] font-bold text-slate-200">مغز یکپارچه</span>
          </div>
          <Badge tone={running ? "plasma" : runStatus === "paused" ? "warn" : runStatus === "failed" ? "bad" : "slate"}>
            {running ? "در حال پردازش" : runStatus === "paused" ? "متوقف — قابل ادامه" : runStatus === "failed" ? "خطا" : "آماده"}
          </Badge>
        </div>

        <div className="mt-2.5 flex items-center gap-2 font-mono text-[10.5px] text-slate-500">
          <span className="text-plasma-300">{fmtNum(counts.agents)}</span> ایجنت
          <span className="text-line">|</span>
          <span className="text-neuro-300">{fmtNum(counts.models)}</span> مدل فعال
          <span className="text-line">|</span>
          <span>{fmtNum(events.filter((e) => e.channel !== "token").length)} رویداد</span>
        </div>

        {target > 0 && (
          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between font-mono text-[10.5px]">
              <span className="text-slate-400">{phaseLabel(phase)}</span>
              <span className={pct >= 1 ? "text-ok" : "text-plasma-300"}>
                {fmtNum(produced)} / {fmtNum(target)} کاراکتر
              </span>
            </div>
            <Bar value={pct} tone={pct >= 1 ? "ok" : "plasma"} height={5} />
            <div className="mt-1 text-end font-mono text-[10px] text-slate-500">{(pct * 100).toFixed(1)}٪</div>
          </div>
        )}

        {runStatus === "paused" && !running && (
          <Btn variant="neuro" size="sm" className="mt-2 w-full" onClick={onContinue} title="موتور دقیقاً از همان نقطه ادامه می‌یابد">
            <PlayCircle size={14} /> ادامه‌ی انبساط معماری (#{runId})
          </Btn>
        )}
      </div>

      {/* فیلتر کانال‌ها */}
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
        {Object.entries(CHANNELS)
          .filter(([k]) => k !== "token")
          .map(([k, v]) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                filter.size === 0 || filter.has(k) ? "border-line bg-void-850 text-slate-300" : "border-line-soft bg-transparent text-slate-600"
              }`}
            >
              <span className={`me-1 inline-block h-1.5 w-1.5 rounded-full ${v.dot}`} />
              {v.fa}
            </button>
          ))}
        <button
          onClick={() => setAutoScroll((a) => !a)}
          className={`ms-auto rounded border px-1.5 py-0.5 font-mono text-[10px] ${autoScroll ? "border-plasma-500/50 text-plasma-300" : "border-line text-slate-600"}`}
        >
          پیمایش خودکار
        </button>
      </div>

      {/* جریان رویدادها */}
      <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto scroll-thin px-2.5 py-2">
        {!list.length && (
          <div className="mt-10 px-4 text-center">
            <Activity size={22} className="mx-auto text-slate-700" />
            <p className="mt-2 text-[12px] text-slate-500">هنوز رویدادی نیست. درخواستی بفرست تا فعالیت ۱۰۰۰ ایجنت را زنده ببینی.</p>
          </div>
        )}
        <ul className="space-y-1.5">
          {list.map((e, i) => {
            const c = CHANNELS[e.channel] ?? CHANNELS.status;
            return (
              <li key={i} className={`rounded-e-md border-s-2 ${c.color} bg-void-850/45 px-2.5 py-1.5 transition hover:bg-void-850/80`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} ${e.channel === "agent" && running ? "animate-blink" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-medium text-slate-200">{e.title}</span>
                      {e.agentCode && <span className="rounded bg-plasma-500/12 px-1 font-mono text-[9.5px] text-plasma-300">{e.agentCode}</span>}
                      {e.modelId && <span dir="ltr" className="rounded bg-neuro-500/12 px-1 font-mono text-[9.5px] text-neuro-300">{e.modelId}</span>}
                    </div>
                    {e.body && (
                      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-slate-400">{e.body.slice(0, 700)}</pre>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {running && (
          <div className="mt-2 flex items-center gap-2 px-2 text-[11px] text-plasma-300/80">
            <Sparkles size={12} className="animate-pulse" />
            <span className="font-mono">مغز در حال پردازش موازی…</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[10.5px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Hammer size={11} className="text-warn" /> فاز: <span className="font-mono text-slate-300">{phase || "—"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={11} className="text-ok" />
          <Wrench size={11} className="text-plasma-400" />
          {fmtNum(events.filter((e) => e.channel === "tool").length)} فراخوانی ابزار
        </span>
      </div>
    </div>
  );
}

export function phaseLabel(p: string) {
  const map: Record<string, string> = {
    bootstrap: "راه‌اندازی",
    council: "تشکیل شورا",
    tooling: "جعبه‌ابزار",
    consensus: "اجماع",
    refine: "بازسازی",
    gate: "دروازه‌ی کیفیت",
    converge: "همگرایی",
    outline: "هستی‌شناسی سند",
    expand: "انبساط معماری",
    build: "ساخت واقعی",
    media: "خط رسانه",
    done: "تکمیل",
  };
  return map[p] ?? p;
}
