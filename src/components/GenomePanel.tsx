"use client";

import { useEffect, useState } from "react";
import { Dna, GitBranch, ScrollText, Trophy } from "lucide-react";
import { api, fmtNum, timeAgo } from "@/lib/api";
import type { GeneInfo, MutationInfo } from "@/lib/ui-types";
import { NCP_VERSION, PROTOCOL_SPEC } from "@/lib/meta/protocol";
import { Badge, Bar, Btn, SectionTitle, inputCls } from "./ui";

type Resp = {
  genes: GeneInfo[];
  mutations: MutationInfo[];
  defaults: Record<string, { value: unknown; note: string }>;
  modelStats: { n: number; calls: number; failures: number; avgLatency: number; avgScore: number };
  top: { modelId: string; score: number; calls: number; failures: number; latencyMs: number }[];
};

export default function GenomePanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function load() {
    const r = await api.get<Resp>("/api/genome");
    setData(r);
    setDraft(Object.fromEntries(r.genes.map((g) => [g.gene, String(g.value)])));
  }
  useEffect(() => {
    void load();
  }, []);

  async function apply(gene: string) {
    const raw = draft[gene];
    const value = Number.isNaN(Number(raw)) ? raw === "true" ? true : raw === "false" ? false : raw : Number(raw);
    await api.patch("/api/genome", { gene, value, reason: "جهش دستی از پنل ژنوم" });
    setSaved(gene);
    setTimeout(() => setSaved(null), 1500);
    await load();
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { l: "مدل در رجیستری", v: fmtNum(data?.modelStats.n ?? 0), c: "text-plasma-300" },
          { l: "فراخوانی موفق", v: fmtNum(data?.modelStats.calls ?? 0), c: "text-ok" },
          { l: "شکست‌ها", v: fmtNum(data?.modelStats.failures ?? 0), c: "text-bad" },
          { l: "میانگین تأخیر", v: `${Math.round(data?.modelStats.avgLatency ?? 0)}ms`, c: "text-warn" },
        ].map((s) => (
          <div key={s.l} className="hud rounded-lg px-3 py-2.5">
            <div className="panel-title">{s.l}</div>
            <div className={`mt-1 font-mono text-lg font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Dna size={13} /> ژن‌های فراالگوریتم
        </span>
      </SectionTitle>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {(data?.genes ?? []).map((g) => (
          <div key={g.gene} className="hud rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span dir="ltr" className="font-mono text-[11px] text-plasma-300">{g.gene}</span>
              <Badge tone="neuro">نسل {g.generation}</Badge>
              {saved === g.gene && <Badge tone="ok">ذخیره شد</Badge>}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{g.note ?? data?.defaults[g.gene]?.note ?? ""}</p>
            <div className="mt-2 flex gap-2">
              <input dir="ltr" className={`${inputCls} font-mono text-[11.5px]`} value={draft[g.gene] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [g.gene]: e.target.value }))} />
              <Btn size="sm" variant="primary" onClick={() => void apply(g.gene)}>
                جهش
              </Btn>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Trophy size={13} /> رتبه‌بندی مدل‌ها در مغز
        </span>
      </SectionTitle>
      <div className="space-y-1.5">
        {(data?.top ?? []).map((m) => (
          <div key={m.modelId} className="flex items-center gap-3 rounded-md border border-line-soft bg-void-850/40 px-3 py-2">
            <span dir="ltr" className="w-52 truncate font-mono text-[11px] text-slate-300">{m.modelId}</span>
            <div className="flex-1">
              <Bar value={m.score} tone={m.score > 0.7 ? "ok" : m.score > 0.4 ? "plasma" : "warn"} />
            </div>
            <span className="font-mono text-[10.5px] text-slate-500">
              {m.score.toFixed(2)} · {fmtNum(m.calls)} فراخوانی · {m.latencyMs}ms · {fmtNum(m.failures)} خطا
            </span>
          </div>
        ))}
        {!data?.top?.length && <p className="text-[11.5px] text-slate-600">هنوز مدلی ثبت نشده است.</p>}
      </div>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <GitBranch size={13} /> تاریخچه‌ی تکامل (جهش‌ها)
        </span>
      </SectionTitle>
      <ol className="space-y-1.5">
        {(data?.mutations ?? []).map((m) => (
          <li key={m.id} className="rounded-md border border-line-soft bg-void-850/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="font-mono text-[11px] text-neuro-300">{m.gene}</span>
              <Badge tone={m.accepted ? "ok" : "bad"}>{m.accepted ? "پذیرفته" : "رد"}</Badge>
              <span className="font-mono text-[10.5px] text-slate-500">
                {JSON.stringify(m.from)} → {JSON.stringify(m.to)}
              </span>
              <span className="ms-auto text-[10.5px] text-slate-600">{timeAgo(m.createdAt)}</span>
            </div>
            {m.reason && <p className="mt-1 text-[11px] leading-5 text-slate-400">{m.reason}</p>}
          </li>
        ))}
        {!data?.mutations?.length && <p className="text-[11.5px] text-slate-600">هنوز جهشی ثبت نشده — ژنوم پس از هر اجرا خود را تنظیم می‌کند.</p>}
      </ol>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <ScrollText size={13} /> پروتکل اجماع عصبی — همان چیزی که مدل‌ها دریافت می‌کنند
        </span>
      </SectionTitle>
      <pre className="max-h-80 overflow-auto scroll-thin whitespace-pre-wrap rounded-lg border border-line bg-void-950 p-3 text-[11.5px] leading-6 text-slate-400">
        {`${NCP_VERSION}\n\n${PROTOCOL_SPEC}`}
      </pre>
    </div>
  );
}
