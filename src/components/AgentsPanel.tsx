"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Search } from "lucide-react";
import { api, fmtNum } from "@/lib/api";
import type { AgentInfo } from "@/lib/ui-types";
import { Badge, Bar, Btn, inputCls } from "./ui";

type Resp = {
  agents: AgentInfo[];
  total: number;
  stats: { region: string; n: number; avgSkill: number; tasks: number; fa: string }[];
  regions: { key: string; fa: string; en: string; duty: string }[];
};

const TIER_TONE = ["slate", "slate", "plasma", "neuro", "ok"] as const;

export default function AgentsPanel({ activeCodes }: { activeCodes: string[] }) {
  const [data, setData] = useState<Resp | null>(null);
  const [region, setRegion] = useState("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [all, setAll] = useState<AgentInfo[]>([]);
  const LIMIT = 80;

  async function load(reset = false) {
    const off = reset ? 0 : offset;
    const url = `/api/agents?limit=${LIMIT}&offset=${off}&region=${region}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const r = await api.get<Resp>(url);
    setData(r);
    setAll(reset || off === 0 ? r.agents : [...all, ...r.agents]);
    setOffset(off + r.agents.length);
  }

  useEffect(() => {
    setAll([]);
    setOffset(0);
    void (async () => {
      const r = await api.get<Resp>(`/api/agents?limit=${LIMIT}&offset=0&region=${region}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setData(r);
      setAll(r.agents);
      setOffset(r.agents.length);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, q]);

  const active = useMemo(() => new Set(activeCodes), [activeCodes]);
  const statsByRegion = useMemo(() => new Map((data?.stats ?? []).map((s) => [s.region, s])), [data]);

  return (
    <div className="space-y-4 pb-8">
      <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(data?.regions ?? []).map((r) => {
          const s = statsByRegion.get(r.key);
          return (
            <button
              key={r.key}
              onClick={() => setRegion(region === r.key ? "all" : r.key)}
              className={`hud rounded-lg px-2.5 py-2 text-start transition ${region === r.key ? "border-plasma-500/60 shadow-[0_0_22px_-8px_rgba(56,220,245,0.9)]" : "hover:border-plasma-500/30"}`}
              title={r.duty}
            >
              <div className="truncate text-[11px] font-bold text-slate-200">{r.fa}</div>
              <div className="mt-0.5 font-mono text-[10px] text-plasma-300">{fmtNum(s?.n ?? 0)} ایجنت</div>
              <div className="mt-1">
                <Bar value={(s?.avgSkill ?? 0) / 1} tone="neuro" height={3} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={13} className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-slate-600" />
          <input
            className={`${inputCls} ps-8`}
            placeholder="جست‌وجو در ۱۰۰۰ ایجنت: نام، کد یا تخصص…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Badge tone="plasma">
          <Brain size={11} /> {fmtNum(data?.total ?? 0)} ایجنت
        </Badge>
        {activeCodes.length > 0 && <Badge tone="ok">{fmtNum(activeCodes.length)} ایجنت در شورای فعال</Badge>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead className="bg-void-850/80 text-slate-400">
            <tr>
              <th className="px-2 py-2 text-start font-medium">کد</th>
              <th className="px-2 py-2 text-start font-medium">نام</th>
              <th className="px-2 py-2 text-start font-medium">ناحیه</th>
              <th className="px-2 py-2 text-start font-medium">تخصص</th>
              <th className="px-2 py-2 text-start font-medium">توانایی شناختی</th>
              <th className="px-2 py-2 text-start font-medium">لایه</th>
              <th className="px-2 py-2 text-start font-medium">مهارت</th>
              <th className="px-2 py-2 text-start font-medium">مأموریت‌ها</th>
            </tr>
          </thead>
          <tbody>
            {all.map((a) => (
              <tr key={a.id} className={`border-t border-line-soft transition hover:bg-void-850/60 ${active.has(a.code) ? "bg-ok/[0.06]" : ""}`}>
                <td className="px-2 py-1.5 font-mono text-[10.5px] text-plasma-300">{a.code}</td>
                <td className="px-2 py-1.5 text-slate-200">{a.name}</td>
                <td className="px-2 py-1.5 text-slate-400">{data?.regions.find((r) => r.key === a.region)?.fa ?? a.region}</td>
                <td className="px-2 py-1.5 text-slate-300">{a.specialty}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {a.functions.slice(0, 3).map((f) => (
                      <span key={f} className="rounded bg-void-800 px-1 font-mono text-[9.5px] text-slate-500">{f}</span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={TIER_TONE[a.tier - 1]}>T{a.tier}</Badge>
                </td>
                <td className="w-[110px] px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Bar value={a.skill} tone={a.skill > 0.75 ? "ok" : "plasma"} height={3} />
                    <span className="font-mono text-[10px] text-slate-500">{a.skill.toFixed(2)}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10.5px] text-slate-500">{fmtNum(a.tasks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {offset < (data?.total ?? 0) && (
        <div className="flex justify-center">
          <Btn onClick={() => void load()}>بارگذاری {Math.min(LIMIT, (data?.total ?? 0) - offset)} ایجنت دیگر</Btn>
        </div>
      )}
    </div>
  );
}
