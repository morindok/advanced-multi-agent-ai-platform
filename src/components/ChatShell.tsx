"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Blocks, Bot, Boxes, BrainCircuit, ChevronDown, Dna, Download, History, Layers,
  MessageSquarePlus, Pause, PanelRight, Play, RotateCcw, Settings2, Sparkles, Trash2, Wrench, Zap,
} from "lucide-react";
import { api, fmtNum, streamGet, timeAgo, type RawEvent } from "@/lib/api";
import type { EngineEvent } from "@/lib/meta/engine";
import type { ArtifactMeta, MsgInfo, RunInfo, SessionInfo, SettingsInfo } from "@/lib/ui-types";
import Composer, { type Attachment } from "./Composer";
import LiveConsole, { phaseLabel } from "./LiveConsole";
import Markdown from "./Markdown";
import ArtifactViewer from "./ArtifactViewer";
import SettingsPanel from "./SettingsPanel";
import AgentsPanel from "./AgentsPanel";
import ToolsPanel from "./ToolsPanel";
import GenomePanel from "./GenomePanel";
import { Badge, Bar, Btn, Drawer } from "./ui";

const ACTIVE = ["queued", "running"];
type DrawerKey = "settings" | "agents" | "tools" | "genome" | "artifacts" | "console" | null;

function toEvent(e: RawEvent): EngineEvent {
  return {
    channel: e.channel as EngineEvent["channel"],
    title: e.title,
    body: e.body ?? undefined,
    agentCode: e.agentCode ?? undefined,
    modelId: e.modelId ?? undefined,
    payload: (e.payload ?? {}) as Record<string, unknown>,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function ChatShell() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sid, setSid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MsgInfo[]>([]);
  const [arts, setArts] = useState<ArtifactMeta[]>([]);
  const [runsMap, setRunsMap] = useState<Record<number, RunInfo>>({});
  const [watchId, setWatchId] = useState<number | null>(null);
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [stream, setStream] = useState("");
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [selArtifact, setSelArtifact] = useState<number | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const sidRef = useRef<string | null>(null);
  const cursorRef = useRef(0);
  const watchRef = useRef<{ id: number; ac: AbortController } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const artTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshInfo = useCallback(async () => {
    try {
      setInfo(await api.get<SettingsInfo>("/api/settings"));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const s = await api.get<{ sessions: SessionInfo[] }>("/api/sessions");
    setSessions(s.sessions);
  }, []);

  const loadSession = useCallback(async (id: string | null): Promise<RunInfo[]> => {
    if (!id) {
      setMsgs([]);
      setArts([]);
      setRunsMap({});
      return [];
    }
    const r = await api.get<{ messages: MsgInfo[]; runs: RunInfo[]; artifacts: ArtifactMeta[] }>(`/api/sessions/${id}`);
    setMsgs(r.messages);
    setArts(r.artifacts);
    setRunsMap(Object.fromEntries(r.runs.map((x) => [x.id, x])));
    return r.runs;
  }, []);

  const reloadSession = useCallback(async () => {
    await loadSession(sidRef.current);
    await refreshSessions();
  }, [loadSession, refreshSessions]);

  const scheduleArtifacts = useCallback(() => {
    if (artTimer.current) clearTimeout(artTimer.current);
    artTimer.current = setTimeout(async () => {
      const cur = sidRef.current;
      if (!cur) return;
      const r = await api.get<{ artifacts: ArtifactMeta[] }>(`/api/artifacts?sessionId=${cur}`);
      setArts(r.artifacts);
    }, 600);
  }, []);

  const stopWatch = useCallback(() => {
    watchRef.current?.ac.abort();
    watchRef.current = null;
  }, []);

  /**
   * اشتراک زنده‌ی یک اجرا. اگر اتصال قطع شود (رفرش، اینترنت، خواب مرورگر)،
   * از همان cursor دوباره وصل می‌شود تا وقتی اجرا تمام شود.
   */
  const watch = useCallback(
    async (runId: number) => {
      stopWatch();
      const ac = new AbortController();
      watchRef.current = { id: runId, ac };
      setWatchId(runId);
      try {
        const detail = await api.get<{ run: RunInfo; events: (RawEvent & { seq: number })[] }>(`/api/runs/${runId}`);
        if (ac.signal.aborted) return;
        setEvents(detail.events.map(toEvent));
        cursorRef.current = detail.events.reduce((mx, e) => Math.max(mx, e.seq), 0);
        setStream(detail.run.partial ?? "");
        setRunsMap((m) => ({ ...m, [runId]: { ...m[runId], ...detail.run } as RunInfo }));
      } catch {
        return;
      }

      while (!ac.signal.aborted) {
        try {
          await streamGet(
            `/api/runs/${runId}/stream?after=${cursorRef.current}`,
            (msg) => {
              if (msg.type !== "batch") return;
              if (msg.events.length) {
                cursorRef.current = msg.cursor;
                setEvents((prev) => [...prev, ...msg.events.map(toEvent)].slice(-900));
                if (msg.events.some((e) => e.channel === "artifact" || e.channel === "done")) scheduleArtifacts();
              }
              if (msg.partial !== undefined) setStream(msg.partial);
              setRunsMap((m) => ({ ...m, [runId]: { ...m[runId], ...msg.run } as RunInfo }));
            },
            ac.signal,
          );
          if (ac.signal.aborted) return;
          const fresh = await api.get<{ run: RunInfo }>(`/api/runs/${runId}`);
          setRunsMap((m) => ({ ...m, [runId]: { ...m[runId], ...fresh.run } }));
          if (!ACTIVE.includes(fresh.run.status)) break;
        } catch {
          if (ac.signal.aborted) return;
          await sleep(2000);
          continue;
        }
        await sleep(1200);
      }
      if (!ac.signal.aborted) {
        watchRef.current = null;
        await reloadSession();
      }
    },
    [stopWatch, scheduleArtifacts, reloadSession],
  );

  /** انتخاب نشست: اگر اجرای فعالی باشد، به آن وصل می‌شود؛ وگرنه آخرین اجرا را نشان می‌دهد */
  const attachSession = useCallback(
    async (id: string | null) => {
      sidRef.current = id;
      setSid(id);
      setErr(null);
      const list = await loadSession(id);
      const live = list.find((r) => ACTIVE.includes(r.status));
      const target = live ?? list[0];
      if (target) void watch(target.id);
      else {
        stopWatch();
        setWatchId(null);
        setEvents([]);
        setStream("");
      }
    },
    [loadSession, watch, stopWatch],
  );

  useEffect(() => {
    void (async () => {
      await refreshInfo();
      const s = await api.get<{ sessions: SessionInfo[] }>("/api/sessions");
      setSessions(s.sessions);
      await attachSession(s.sessions[0]?.id ?? null);
    })();
    const t = setInterval(() => {
      void refreshInfo();
      void refreshSessions();
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible" && !watchRef.current && sidRef.current) void attachSession(sidRef.current);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, stream, events.length]);

  const send = useCallback(
    async (prompt: string, attachments: Attachment[], forceMode?: string) => {
      setErr(null);
      setMsgs((m) => [
        ...m,
        {
          id: -Date.now(),
          sessionId: sidRef.current ?? "",
          runId: null,
          role: "user",
          content: prompt,
          parts: attachments.map((a) => ({ type: "image", name: a.name, data: a.data })),
          createdAt: new Date().toISOString(),
        },
      ]);
      try {
        const r = await api.post<{ runId: number; sessionId: string }>("/api/chat", {
          sessionId: sidRef.current,
          prompt,
          attachments,
          forceMode,
        });
        await refreshSessions();
        await attachSession(r.sessionId);
      } catch (e) {
        setErr((e as Error).message);
        await reloadSession();
      }
    },
    [attachSession, refreshSessions, reloadSession],
  );

  const stopRun = useCallback(
    async (runId: number) => {
      await api.post(`/api/runs/${runId}/cancel`, {});
      await reloadSession();
    },
    [reloadSession],
  );

  const resumeRun = useCallback(
    async (runId: number) => {
      try {
        await api.post(`/api/runs/${runId}`, {});
      } catch (e) {
        setErr((e as Error).message);
        return;
      }
      await attachSession(sidRef.current);
    },
    [attachSession],
  );

  const newChat = async () => {
    const r = await api.post<{ session: SessionInfo }>("/api/sessions", {});
    setSessions((s) => [r.session, ...s]);
    await attachSession(r.session.id);
  };

  const deleteSession = async (id: string) => {
    await api.del(`/api/sessions/${id}`);
    setSessions((x) => x.filter((y) => y.id !== id));
    if (sidRef.current === id) await attachSession(null);
  };

  const live = watchId !== null ? runsMap[watchId] : undefined;
  const liveActive = !!live && ACTIVE.includes(live.status);
  const councilCodes = useMemo(() => (live?.council as string[] | undefined) ?? [], [live]);
  const liveArtifacts = useMemo(() => arts.slice(0, 12), [arts]);
  const lastStopped = useMemo(
    () =>
      Object.values(runsMap)
        .filter((r) => !ACTIVE.includes(r.status) && r.status !== "done")
        .sort((a, b) => b.id - a.id)[0],
    [runsMap],
  );
  const consoleRun = live ?? lastStopped ?? null;
  const consoleProps = {
    events,
    running: liveActive,
    progress: live?.progress ?? 0,
    phase: live?.phase ?? "idle",
    produced: live?.producedChars ?? 0,
    target: live?.targetChars ?? 0,
    runId: consoleRun?.id ?? null,
    runStatus: live?.status ?? consoleRun?.status ?? "idle",
    onContinue: () => {
      if (consoleRun) void resumeRun(consoleRun.id);
    },
    counts: { agents: info?.agents ?? 0, models: info?.models.n ?? 0 },
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-void-950">
      {/* ================= نوار بالا ================= */}
      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-line bg-void-900/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <button className="grid h-7 w-7 shrink-0 place-items-center lg:hidden" onClick={() => setSidebar((s) => !s)} title="نشست‌ها">
          <History size={16} className="text-slate-400" />
        </button>

        <div className="flex items-center gap-2.5">
          <LogoMark pulse={liveActive} />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold tracking-tight text-slate-100">NCP</span>
              <span className="hidden text-[11px] text-slate-500 sm:inline">مغز یکپارچه‌ی هزار ایجنت</span>
              <Badge tone={info?.dry ? "warn" : "ok"}>{info?.dry ? "خاموش" : "زنده"}</Badge>
            </div>
            <div className="mt-0.5 hidden items-center gap-2 font-mono text-[10px] text-slate-500 md:flex">
              <span className="text-plasma-300">{fmtNum(info?.agents ?? 0)}</span> ایجنت
              <span className="text-line">·</span>
              <span className="text-neuro-300">{fmtNum(info?.models.n ?? 0)}</span> مدل فعال
              <span className="text-line">·</span>
              <span>{fmtNum(info?.runs ?? 0)} اجرا</span>
              <span className="text-line">·</span>
              <span>{fmtNum(info?.artifacts ?? 0)} اثر</span>
              <span className="text-line">·</span>
              <span>{fmtNum(info?.tools ?? 0)} ابزار</span>
            </div>
          </div>
        </div>

        <nav className="ms-auto flex items-center gap-1.5">
          <NavBtn icon={<Layers size={14} />} label="آثار" count={arts.length} onClick={() => { setSelArtifact(null); setDrawer("artifacts"); }} />
          <NavBtn icon={<Bot size={14} />} label="ایجنت‌ها" count={info?.agents ?? 0} onClick={() => setDrawer("agents")} className="hidden sm:inline-flex" />
          <NavBtn icon={<Wrench size={14} />} label="ابزارها" count={info?.tools ?? 0} onClick={() => setDrawer("tools")} className="hidden md:inline-flex" />
          <NavBtn icon={<Dna size={14} />} label="ژنوم" onClick={() => setDrawer("genome")} className="hidden md:inline-flex" />
          <NavBtn icon={<Activity size={14} />} label="کنسول" onClick={() => setDrawer("console")} className="xl:hidden" active={liveActive} />
          <Btn variant="primary" size="sm" onClick={() => setDrawer("settings")}>
            <Settings2 size={14} /> تنظیمات
          </Btn>
        </nav>
      </header>

      <div className="grid-bg flex min-h-0 flex-1">
        {/* ================= نشست‌ها ================= */}
        <aside className={`${sidebar ? "flex" : "hidden"} w-60 shrink-0 flex-col border-e border-line bg-void-900/70 lg:flex`}>
          <div className="border-b border-line p-2.5">
            <Btn variant="ghost" size="sm" className="w-full" onClick={() => void newChat()}>
              <MessageSquarePlus size={14} /> گفت‌وگوی تازه
            </Btn>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-2">
            <div className="panel-title px-1 pb-1.5">تاریخچه</div>
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li key={s.id} className={`group flex items-center gap-1 rounded-md border transition ${sid === s.id ? "border-plasma-500/50 bg-plasma-500/10" : "border-transparent hover:border-line hover:bg-void-850/60"}`}>
                  <button className="min-w-0 flex-1 px-2 py-1.5 text-start" onClick={() => void attachSession(s.id)}>
                    <span className="block truncate text-[11.5px] text-slate-300">{s.title}</span>
                    <span className="block font-mono text-[9.5px] text-slate-600">{timeAgo(s.updatedAt)}</span>
                  </button>
                  <button className="px-1.5 text-slate-700 opacity-0 transition group-hover:opacity-100 hover:text-bad" onClick={() => void deleteSession(s.id)}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
              {!sessions.length && <li className="px-2 py-6 text-center text-[11px] text-slate-600">هنوز نشستی نداری</li>}
            </ul>
          </div>
          <div className="border-t border-line p-2.5">
            <div className="panel-title mb-1.5">چرخه‌ی فراالگوریتم</div>
            <ol className="space-y-1 text-[10.5px] leading-5 text-slate-500">
              {["نیت‌سنجی و سطح عملیات", "تشکیل شورا از نواحی هفت‌گانه", "فن‌اوت موازی با پروتکل NCP", "جعبه‌ابزار و داده‌ی واقعی", "اجماع وزنی و حل تعارض", "دروازه‌ی هیئت ۱۰۰ نفره", "ساخت، اعتبارسنجی و تحویل"].map((t, i) => (
                <li key={t} className="flex items-start gap-1.5">
                  <span className="mt-0.5 font-mono text-[9px] text-plasma-500">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* ================= ستون چت ================= */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-thin px-3 py-4 sm:px-5">
            {!msgs.length ? (
              <Briefing dry={!!info?.dry} info={info} onPick={(t) => void send(t, [], undefined)} />
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {msgs.map((m) => (
                  <Fragment key={m.id}>
                    {m.role === "user" ? (
                      <UserMsg m={m} />
                    ) : (
                      <AssistantMsg
                        m={m}
                        run={m.runId ? runsMap[m.runId] : undefined}
                        artifacts={arts.filter((a) => a.runId === m.runId && !a.parentId)}
                        onOpenArtifact={(id) => { setSelArtifact(id); setDrawer("artifacts"); }}
                      />
                    )}
                    {m.role === "user" && m.runId && runsMap[m.runId] && runsMap[m.runId].status !== "done" && (
                      <RunCard
                        run={runsMap[m.runId]}
                        live={watchId === m.runId}
                        partial={watchId === m.runId ? stream : (runsMap[m.runId].partial ?? "")}
                        events={watchId === m.runId ? events : []}
                        onStop={() => void stopRun(m.runId as number)}
                        onResume={() => void resumeRun(m.runId as number)}
                      />
                    )}
                  </Fragment>
                ))}
                {err && <div className="rounded-md border border-bad/40 bg-bad/[0.07] px-3 py-2 text-[12px] text-bad">{err}</div>}
              </div>
            )}
          </div>

          {liveArtifacts.length > 0 && (
            <div className="shrink-0 border-t border-line-soft bg-void-900/60 px-3 py-1.5 sm:px-5">
              <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="shrink-0 font-mono text-[10px] text-slate-500">آثار:</span>
                {liveArtifacts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelArtifact(a.id); setDrawer("artifacts"); }}
                    className="flex shrink-0 items-center gap-1 rounded border border-line bg-void-850 px-2 py-0.5 text-[10.5px] text-slate-400 transition hover:border-plasma-500/50 hover:text-plasma-300"
                  >
                    <Blocks size={10} /> {a.title.length > 34 ? a.title.slice(0, 34) + "…" : a.title}
                    <span className="font-mono text-slate-600">{fmtNum(a.bytes)}ch</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl">
            <Composer
              onSend={(p, a, f) => void send(p, a, f)}
              running={liveActive}
              onStop={() => {
                if (live) void stopRun(live.id);
              }}
              dry={!!info?.dry}
            />
          </div>
        </main>

        {/* ================= کنسول ================= */}
        <aside className="hidden w-[380px] shrink-0 border-s border-line bg-void-900/80 xl:flex xl:flex-col">
          <LiveConsole {...consoleProps} />
        </aside>
      </div>

      <Drawer open={drawer === "settings"} onClose={() => setDrawer(null)} title="تنظیمات مغز" subtitle="آدرس پایه، کلیدها، کشف مدل‌ها و نگاشت توانمندی‌ها" icon={<Settings2 size={16} />} width="max-w-5xl">
        <SettingsPanel onChanged={() => void refreshInfo()} />
      </Drawer>
      <Drawer open={drawer === "agents"} onClose={() => setDrawer(null)} title="۱۰۰۰ ایجنت مغز" subtitle="هفت ناحیه‌ی عصبی — تخصص، لایه و مهارت هر نورون" icon={<Bot size={16} />} width="max-w-5xl">
        <AgentsPanel activeCodes={councilCodes} />
      </Drawer>
      <Drawer open={drawer === "tools"} onClose={() => setDrawer(null)} title="جعبه‌ابزار زنده" subtitle="ابزارهای درون‌ساخت + سنتز ابزار توسط جن" icon={<Wrench size={16} />} width="max-w-4xl">
        <ToolsPanel onChanged={() => void refreshInfo()} />
      </Drawer>
      <Drawer open={drawer === "genome"} onClose={() => setDrawer(null)} title="ژنوم و تکامل" subtitle="پارامترهای فراالگوریتم، جهش‌ها و پروتکل NCP" icon={<Dna size={16} />} width="max-w-4xl">
        <GenomePanel />
      </Drawer>
      <ArtifactViewer open={drawer === "artifacts"} onClose={() => setDrawer(null)} artifacts={arts} selectedId={selArtifact} onSelect={setSelArtifact} />
      <Drawer open={drawer === "console"} onClose={() => setDrawer(null)} title="کنسول زنده" subtitle="فعالیت لحظه‌به‌لحظه‌ی ایجنت‌ها" icon={<PanelRight size={16} />} width="max-w-xl">
        <div className="h-[70vh]">
          <LiveConsole {...consoleProps} />
        </div>
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RunCard({
  run,
  live,
  partial,
  events,
  onStop,
  onResume,
}: {
  run: RunInfo;
  live: boolean;
  partial: string;
  events: EngineEvent[];
  onStop: () => void;
  onResume: () => void;
}) {
  const active = ACTIVE.includes(run.status);
  const pct = run.targetChars > 0 ? run.producedChars / run.targetChars : run.progress;
  const title =
    run.status === "queued"
      ? run.error
        ? "تلاش مجدد خودکار — از همان نقطه"
        : "در صف اجرا"
      : run.status === "running"
        ? "مغز در حال کار است"
        : run.status === "paused"
          ? "متوقف شده — قابل ادامه"
          : run.status === "failed"
            ? "خطا — ادامه از همان نقطه"
            : "";
  const lastTitle = events.length ? events[events.length - 1].title : "";

  return (
    <div className="hud rounded-xl p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {active ? <Sparkles size={14} className="animate-pulse text-plasma-400" /> : <RotateCcw size={14} className="text-warn" />}
        <span className="text-[12px] font-bold text-slate-200">{title}</span>
        <Badge tone="plasma">اجرا #{run.id}</Badge>
        {run.attempts ? <Badge tone="slate">تلاش {run.attempts}</Badge> : null}
        <span className="ms-auto font-mono text-[10px] text-slate-500">{phaseLabel(run.phase)}</span>
      </div>

      {run.error && (
        <div className="mt-2 whitespace-pre-wrap rounded border border-warn/40 bg-warn/[0.06] px-2.5 py-2 text-[11.5px] leading-6 text-warn">{run.error}</div>
      )}

      {run.targetChars > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between font-mono text-[10.5px] text-slate-500">
            <span>{fmtNum(run.producedChars)} / {fmtNum(run.targetChars)} کاراکتر</span>
            <span>{(Math.min(1, pct) * 100).toFixed(1)}٪</span>
          </div>
          <Bar value={Math.min(1, pct)} tone={pct >= 1 ? "ok" : "plasma"} height={5} />
        </div>
      )}

      {partial ? (
        <div className="mt-3 max-h-[50vh] overflow-y-auto scroll-thin">
          <Markdown text={partial} />
        </div>
      ) : active ? (
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-slate-500">
          <span className="inline-block h-1.5 w-1.5 animate-blink rounded-full bg-plasma-400" />
          {live
            ? lastTitle || "در حال تشکیل شورا…"
            : "روی سرور در حال اجراست — می‌توانی این صفحه را ببندی؛ کار ادامه می‌یابد."}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {active ? (
          <Btn size="xs" variant="ghost" onClick={onStop} title="متوقف می‌کند؛ وضعیت حفظ می‌شود">
            <Pause size={12} /> توقف (قابل ادامه)
          </Btn>
        ) : (
          <Btn size="xs" variant="neuro" onClick={onResume}>
            <Play size={12} /> ادامه از همان نقطه
          </Btn>
        )}
      </div>
    </div>
  );
}

function NavBtn({ icon, label, count, onClick, className = "", active }: { icon: React.ReactNode; label: string; count?: number; onClick: () => void; className?: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] transition ${className} ${
        active ? "border-plasma-400/70 bg-plasma-500/15 text-plasma-300" : "border-line bg-void-850/60 text-slate-400 hover:border-plasma-500/40 hover:text-plasma-300"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {typeof count === "number" && count > 0 && <span className="font-mono text-[9.5px] text-slate-600">{fmtNum(count)}</span>}
    </button>
  );
}

function LogoMark({ pulse }: { pulse: boolean }) {
  return (
    <span className="relative grid h-9 w-9 place-items-center">
      <svg viewBox="0 0 40 40" className="h-9 w-9">
        <defs>
          <linearGradient id="ncpG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38dcf5" />
            <stop offset="100%" stopColor="#8b4dff" />
          </linearGradient>
        </defs>
        <path d="M20 2.5 35 11v18L20 37.5 5 29V11z" fill="none" stroke="url(#ncpG)" strokeWidth="1.4" />
        <circle cx="20" cy="20" r="4.2" fill="none" stroke="url(#ncpG)" strokeWidth="1.3" />
        <circle cx="20" cy="20" r="1.7" fill="#7ef0ff" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line key={a} x1="20" y1="20" x2={20 + 11 * Math.cos((a * Math.PI) / 180)} y2={20 + 11 * Math.sin((a * Math.PI) / 180)} stroke="#1e4b5c" strokeWidth="0.9" />
        ))}
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle key={`d${a}`} cx={20 + 11 * Math.cos((a * Math.PI) / 180)} cy={20 + 11 * Math.sin((a * Math.PI) / 180)} r="1.5" fill={pulse ? "#38dcf5" : "#173a49"} />
        ))}
      </svg>
      {pulse && <span className="absolute inset-0 rounded-full border border-plasma-400/50" style={{ animation: "pulsering 2.4s ease-out infinite" }} />}
    </span>
  );
}

function UserMsg({ m }: { m: MsgInfo }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl rounded-ss-sm border border-neuro-500/35 bg-neuro-500/[0.07] px-3.5 py-2.5">
        {m.parts?.filter((p) => p.type === "image").length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {m.parts.filter((p) => p.type === "image").map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`data:image/png;base64,${p.data}`} alt={p.name ?? ""} className="h-20 w-20 rounded-md border border-line object-cover" />
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-[13.5px] leading-7 text-slate-100">{m.content}</p>
        <div className="mt-1 font-mono text-[9.5px] text-slate-600">{timeAgo(m.createdAt)}</div>
      </div>
    </div>
  );
}

function AssistantMsg({
  m,
  run,
  artifacts,
  onOpenArtifact,
}: {
  m: MsgInfo;
  run?: RunInfo;
  artifacts: ArtifactMeta[];
  onOpenArtifact: (id: number) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<EngineEvent[] | null>(null);

  async function loadLogs() {
    if (!m.runId) return;
    if (logs) return setShowLog((s) => !s);
    const r = await api.get<{ events: RawEvent[] }>(`/api/runs/${m.runId}`);
    setLogs(r.events.map(toEvent));
    setShowLog(true);
  }

  const project = artifacts.find((a) => a.kind === "project");
  const pm = (project?.meta ?? {}) as {
    previewUrl?: string;
    playUrl?: string;
    zipUrl?: string;
    kind?: string;
    verified?: boolean;
    tested?: boolean;
    screenshot?: string;
  };
  const playHref = pm.playUrl || (m.runId ? `/play/${m.runId}` : pm.previewUrl);

  return (
    <div className="hud rounded-xl rounded-ss-sm">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-3 py-2">
        <BrainCircuit size={13} className="text-plasma-400" />
        <span className="text-[11.5px] font-bold text-slate-200">مغز یکپارچه</span>
        {run && (
          <>
            <Badge tone="plasma">#{run.id}</Badge>
            <Badge>{run.intent}</Badge>
            <Badge tone={run.mode === "forge" ? "warn" : "neuro"}>{run.mode}</Badge>
            {typeof run.gate?.score === "number" && <Badge tone={run.gate.score >= 0.86 ? "ok" : "warn"}>هیئت {run.gate.score.toFixed(2)}</Badge>}
            {run.stats?.calls ? <Badge tone="slate">{fmtNum(run.stats.calls)} فراخوانی</Badge> : null}
            {run.stats?.tools ? <Badge tone="warn">{fmtNum(run.stats.tools)} ابزار</Badge> : null}
          </>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          {m.runId && (
            <button onClick={() => void loadLogs()} className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-slate-500 transition hover:border-plasma-500/50 hover:text-plasma-300">
              لاگ اجرا <ChevronDown size={11} className={`transition ${showLog ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {project && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
          <span className={`text-[12px] font-bold ${pm.tested ? "text-ok" : "text-warn"}`}>
            {pm.tested ? "✓ تست زنده پاس شد — آمادهٔ اجرا" : "هنوز تست اجرا پاس نشده"}
          </span>
          {pm.kind !== "node" && playHref && (
            <a href={playHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-plasma-400/70 bg-plasma-500/20 px-2.5 py-1 text-[11px] font-bold text-plasma-200 hover:bg-plasma-500/30">
              <Play size={12} /> اجرا
            </a>
          )}
          {pm.zipUrl && (
            <a href={pm.zipUrl} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-slate-300 hover:border-plasma-500/40">
              <Download size={12} /> ZIP
            </a>
          )}
          <Btn size="xs" onClick={() => onOpenArtifact(project.id)}>
            پیش‌نمایش و فایل‌ها
          </Btn>
          {pm.tested === false && <Badge tone="warn">دکمه‌ی اجرا تا پاس شدن تست، بازی سالم را باز نمی‌کند</Badge>}
        </div>
      )}

      {showLog && logs && (
        <div className="max-h-64 overflow-y-auto scroll-thin border-b border-line-soft bg-void-950/60 px-3 py-2">
          <ul className="space-y-1">
            {logs.map((l, i) => (
              <li key={i} className="flex items-start gap-2 border-s-2 border-line ps-2 text-[10.5px] leading-5">
                <span className="font-mono text-slate-600">{l.channel}</span>
                <span className="text-slate-300">{l.title}</span>
                {l.agentCode && <span className="font-mono text-plasma-500">{l.agentCode}</span>}
                {l.body && <span className="text-slate-500">— {l.body.slice(0, 120)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-3.5 py-3">
        <Markdown text={m.content || "…"} />
      </div>

      {artifacts.filter((a) => a.kind !== "project").length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line-soft px-3 py-2">
          <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
            <Layers size={11} /> آثار:
          </span>
          {artifacts.filter((a) => a.kind !== "project").slice(0, 10).map((a) => (
            <button
              key={a.id}
              onClick={() => onOpenArtifact(a.id)}
              className="inline-flex items-center gap-1 rounded border border-neuro-500/40 bg-neuro-500/10 px-2 py-0.5 text-[10.5px] text-neuro-300 transition hover:bg-neuro-500/20"
            >
              <Boxes size={10} /> {a.title.length > 40 ? a.title.slice(0, 40) + "…" : a.title}
              <span className="font-mono text-[9.5px] text-slate-500">{fmtNum(a.bytes)}ch</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Briefing({ dry, info, onPick }: { dry: boolean; info: SettingsInfo | null; onPick: (t: string) => void }) {
  const tiles = [
    { icon: <Bot size={15} />, t: "۱۰۰۰ ایجنت", d: "در هفت ناحیه‌ی عصبی: پیش‌پیشانی، قشر، هیپوکامپ، لیمبیک، بینایی، مخچه و ساقه‌ی مغز.", c: "text-plasma-300" },
    { icon: <Zap size={15} />, t: "پروتکل NCP", d: "مدل‌ها تکی پاسخ نمی‌دهند؛ هرکدام یک برش از عملیات را برمی‌گردانند و مغز آنها را با رأی وزنی ادغام می‌کند.", c: "text-neuro-300" },
    { icon: <Wrench size={15} />, t: "ساخت واقعی", d: "پروژه‌ی اجرایی می‌سازد، فایل‌ها را اعتبارسنجی و تعمیر می‌کند و خروجی قابل اجرا و ZIP تحویل می‌دهد.", c: "text-warn" },
    { icon: <Dna size={15} />, t: "اجرای مستقل", d: "کار روی سرور ادامه می‌یابد؛ بستن مرورگر یا رفرش، اجرا را متوقف نمی‌کند و خطاها خودکار تکرار می‌شوند.", c: "text-ok" },
  ];
  const ideas = [
    "یک بازی آرکید کامل و قابل اجرا در مرورگر بساز (امتیاز، مرحله، صدا و منوی شروع)",
    "یک سیستم عامل جدید با هسته‌ی میکروکرِنل از صفر تا صد بساز (فرا-حالت)",
    "یک داشبورد تحلیل بازار با نمودار و شاخص‌های تکنیکال بساز که بدون سرور اجرا شود",
    "یک پوستر سینمایی از شهری شناور بر فراز ابرها بساز",
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="hud relative overflow-hidden rounded-2xl p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ background: "radial-gradient(600px 200px at 20% 0%, #38dcf5, transparent), radial-gradient(500px 200px at 90% 100%, #8b4dff, transparent)" }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Badge tone={dry ? "warn" : "ok"}>{dry ? "مغز خاموش — حالت نمایشی" : "مغز زنده"}</Badge>
            <Badge tone="plasma">NCP/1.5-meta</Badge>
            <span className="font-mono text-[10px] text-slate-500">{fmtNum(info?.agents ?? 0)} نورون آماده</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.35rem,3.4vw,2rem)] font-extrabold leading-tight text-slate-50">
            یک صفحه‌ی چت. <span className="glow text-plasma-300">هزار ایجنت.</span> یک مغز.
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-7 text-slate-400">
            هر چیزی بخواهی را روی سرور اجرا می‌کند و تا رسیدن به کیفیت برنمی‌گردد. می‌توانی مرورگر را ببندی؛ کار ادامه دارد و هر وقت برگردی، پیشرفت را همان‌جا می‌بینی.
          </p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {tiles.map((t) => (
              <div key={t.t} className="rounded-lg border border-line bg-void-850/50 px-3 py-2.5">
                <div className={`flex items-center gap-1.5 text-[12px] font-bold ${t.c}`}>
                  {t.icon} {t.t}
                </div>
                <p className="mt-1 text-[11px] leading-6 text-slate-500">{t.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="panel-title mb-1.5">چند مأموریت برای آزمودن موتور</div>
            <div className="flex flex-col gap-1.5">
              {ideas.map((i) => (
                <button
                  key={i}
                  onClick={() => onPick(i)}
                  className="group flex items-center gap-2 rounded-md border border-line bg-void-900/60 px-3 py-2 text-start text-[12px] text-slate-300 transition hover:border-plasma-500/50 hover:bg-plasma-500/[0.06] hover:text-plasma-200"
                >
                  <Sparkles size={12} className="shrink-0 text-plasma-500 opacity-60 group-hover:opacity-100" />
                  <span className="min-w-0 flex-1">{i}</span>
                  <span className="font-mono text-[10px] text-slate-600 opacity-0 transition group-hover:opacity-100">اجرا ←</span>
                </button>
              ))}
            </div>
          </div>

          {dry && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2.5">
              <span className="text-[12px] text-warn">مغز هنوز کلید ندارد.</span>
              <span className="text-[11.5px] text-slate-400">
                در تنظیمات، آدرس پایه و کلیدها را وارد کن و «کشف مدل‌ها» را بزن. تا آن زمان نمونه‌ی نمایشی ساخته می‌شود.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
