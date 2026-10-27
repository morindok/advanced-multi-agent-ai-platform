import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** کلید/مقدار سراسری موتور (آدرس‌های پایه، کلیدها، پارامترهای فراالگوریتم) */
export const settings = pgTable("ncp_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** مدل‌های کشف‌شده از همه‌ی کلیدها/اندپوینت‌ها + نگاشت توانمندی (متن/ویژن/تصویر/ویدیو) */
export const models = pgTable(
  "ncp_models",
  {
    id: serial("id").primaryKey(),
    endpoint: text("endpoint").notNull(),
    keyLabel: text("key_label").notNull().default("default"),
    modelId: text("model_id").notNull(),
    displayName: text("display_name"),
    canText: boolean("can_text").notNull().default(false),
    canVision: boolean("can_vision").notNull().default(false),
    canImage: boolean("can_image").notNull().default(false),
    canVideo: boolean("can_video").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    score: real("score").notNull().default(0.5),
    latencyMs: integer("latency_ms").notNull().default(0),
    calls: integer("calls").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    contextLen: integer("context_len"),
    meta: jsonb("meta").notNull().default({}),
    lastError: text("last_error"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_model_endpoint_key").on(t.endpoint, t.keyLabel, t.modelId)],
);

/** ۱۰۰۰ ایجنت مغز یکپارچه — هر ایجنت یک نورون تخصصی در یکی از نواحی هفت‌گانه */
export const agents = pgTable(
  "ncp_agents",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    region: text("region").notNull(),
    tier: integer("tier").notNull().default(1),
    specialty: text("specialty").notNull(),
    functions: jsonb("functions").notNull().default([]),
    skill: real("skill").notNull().default(0.5),
    tasks: integer("tasks").notNull().default(0),
    status: text("status").notNull().default("idle"),
    memory: jsonb("memory").notNull().default({}),
  },
  (t) => [uniqueIndex("uq_agent_code").on(t.code), index("ix_agent_region").on(t.region)],
);

export const sessions = pgTable("ncp_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("گفت‌وگوی تازه"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb("meta").notNull().default({}),
});

export const messages = pgTable(
  "ncp_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    runId: integer("run_id"),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    parts: jsonb("parts").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_msg_session").on(t.sessionId)],
);

/** یک اجرای کامل فراالگوریتم */
export const runs = pgTable(
  "ncp_runs",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull().default(""),
    intent: text("intent").notNull().default("general"),
    mode: text("mode").notNull().default("standard"),
    status: text("status").notNull().default("queued"),
    phase: text("phase").notNull().default("bootstrap"),
    progress: real("progress").notNull().default(0),
    council: jsonb("council").notNull().default([]),
    plan: jsonb("plan").notNull().default([]),
    gate: jsonb("gate").notNull().default({}),
    stats: jsonb("stats").notNull().default({}),
    blueprint: jsonb("blueprint").notNull().default({}),
    targetChars: integer("target_chars").notNull().default(0),
    producedChars: integer("produced_chars").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** نقطه‌ی بازیابی: وضعیت برش‌ها، فایل‌های انجام‌شده، بودجه‌ها */
    state: jsonb("state").notNull().default({}),
    /** متن زنده‌ی در حال تولید (برای بازگشت پس از بستن مرورگر) */
    partial: text("partial").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
    heartbeat: timestamp("heartbeat", { withTimezone: true }),
    worker: text("worker"),
  },
  (t) => [index("ix_run_session").on(t.sessionId)],
);

/** لاگ زنده‌ی فعالیت ایجنت‌های جن دیجیتال */
export const runEvents = pgTable(
  "ncp_run_events",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull().default(0),
    channel: text("channel").notNull().default("log"),
    agentCode: text("agent_code"),
    modelId: text("model_id"),
    title: text("title").notNull().default(""),
    body: text("body"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_event_run").on(t.runId)],
);

/** خروجی‌های قابل پیش‌نمایش (کد، سند، HTML، تصویر، ویدیو، نمودار، فایل) */
export const artifacts = pgTable(
  "ncp_artifacts",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").references(() => runs.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    kind: text("kind").notNull().default("markdown"),
    title: text("title").notNull().default("اثر"),
    lang: text("lang"),
    mime: text("mime"),
    content: text("content").notNull().default(""),
    url: text("url"),
    bytes: integer("bytes").notNull().default(0),
    version: integer("version").notNull().default(1),
    parentId: integer("parent_id"),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_artifact_run").on(t.runId)],
);

/** جعبه‌ابزار زنده — ابزارها می‌توانند توسط خودِ جن سنتز (ساخته) شوند */
export const tools = pgTable("ncp_tools", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  risk: text("risk").notNull().default("low"),
  builtin: boolean("builtin").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  params: jsonb("params").notNull().default([]),
  source: text("source"),
  uses: integer("uses").notNull().default(0),
  failures: integer("failures").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** ژنوم فراالگوریتم — خودتنظیم‌گر و تکامل‌پذیر */
export const genome = pgTable("ncp_genome", {
  gene: text("gene").primaryKey(),
  value: jsonb("value").notNull(),
  generation: integer("generation").notNull().default(0),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** جهش‌های ثبت‌شده (تاریخچه‌ی تکامل) */
export const mutations = pgTable("ncp_mutations", {
  id: serial("id").primaryKey(),
  gene: text("gene").notNull(),
  from: jsonb("from"),
  to: jsonb("to"),
  reason: text("reason"),
  fitness: real("fitness"),
  accepted: boolean("accepted").notNull().default(true),
  generation: integer("generation").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ModelRow = typeof models.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type ToolRow = typeof tools.$inferSelect;
