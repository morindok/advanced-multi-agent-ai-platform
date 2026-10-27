export type RegionStat = { region: string; n: number; tier5: number };

export type SettingsInfo = {
  agents: number;
  regions: RegionStat[];
  models: { total: number; n: number; text: number; vision: number; image: number; video: number };
  runs: number;
  artifacts: number;
  tools: number;
  endpoints: { label: string; url: string }[];
  keys: { label: string; masked: string }[];
  genome: Record<string, unknown>;
  dry: boolean;
};

export type ModelInfo = {
  id: number;
  endpoint: string;
  keyLabel: string;
  modelId: string;
  displayName: string | null;
  canText: boolean;
  canVision: boolean;
  canImage: boolean;
  canVideo: boolean;
  enabled: boolean;
  score: number;
  latencyMs: number;
  calls: number;
  failures: number;
  contextLen: number | null;
  hasKey: boolean;
  lastError: string | null;
};

export type AgentInfo = {
  id: number;
  code: string;
  name: string;
  region: string;
  tier: number;
  specialty: string;
  functions: string[];
  skill: number;
  tasks: number;
  status: string;
};

export type ArtifactMeta = {
  id: number;
  runId: number | null;
  sessionId: string | null;
  kind: string;
  title: string;
  lang: string | null;
  bytes: number;
  url: string | null;
  version: number;
  parentId: number | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type RunInfo = {
  id: number;
  sessionId: string;
  prompt: string;
  intent: string;
  mode: string;
  status: string;
  phase: string;
  progress: number;
  council: string[];
  gate: { score?: number; pass?: boolean };
  stats: { calls?: number; tokens?: number; ms?: number; tools?: number };
  targetChars: number;
  producedChars: number;
  createdAt: string;
  partial?: string;
  error?: string | null;
  attempts?: number;
  nextAt?: string;
};

export type ToolInfo = {
  id: number;
  key: string;
  name: string;
  description: string;
  category: string;
  risk: string;
  builtin: boolean;
  enabled: boolean;
  params: { name: string; type?: string; required?: boolean }[];
  source: string | null;
  uses: number;
  failures: number;
};

export type GeneInfo = { gene: string; value: unknown; generation: number; note: string | null; updatedAt: string };
export type MutationInfo = {
  id: number;
  gene: string;
  from: unknown;
  to: unknown;
  reason: string | null;
  fitness: number | null;
  accepted: boolean;
  generation: number;
  createdAt: string;
};

export type MsgPart = { type: string; name?: string; data?: string };
export type MsgInfo = {
  id: number;
  sessionId: string;
  runId: number | null;
  role: string;
  content: string;
  parts: MsgPart[];
  createdAt: string;
};

export type SessionInfo = { id: string; title: string; createdAt: string; updatedAt: string };
