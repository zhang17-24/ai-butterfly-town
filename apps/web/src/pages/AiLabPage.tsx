import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiTrace, WorldSummary } from "@ai-town/shared";
import "./AiLabPage.css";

/**
 * AiLabApi 契约 —— 由主线 A 接线时替换为 services/api 中的真实方法
 * (GET /ai/traces、POST /ai/replay、POST /ai/compare、GET /worlds)。
 * 本组件只依赖注入的 api 实例,自身不发起任何运行时请求。
 */
export interface TraceListFilter {
  worldId?: string;
  agentId?: string;
  role?: AiTrace["role"];
  status?: AiTrace["status"];
  source?: AiTrace["source"];
}

export interface AiReplayRequest {
  traceId: string;
  /** 重放默认不写回世界(技术方案 §9.4);勾选后由接线层决定是否提交快进,不改变世界因果 */
  writeBack: boolean;
  sandboxContext?: Record<string, unknown>;
}

export interface AiReplayResult {
  ok: boolean;
  traceId: string;
  output: Record<string, unknown>;
  writeBack: boolean;
  durationMs: number;
  note?: string;
}

export interface AiCompareRequest {
  traceId: string;
  /** real = 用原记录 provider/模型 重放;mock = 可复现 Mock 重放(§9.5) */
  mode: "real" | "mock";
}

export interface AiCompareCell {
  source: AiTrace["source"];
  model: string;
  output: Record<string, unknown>;
  latencyMs: number;
}

export interface AiCompareResult {
  traceId: string;
  original: AiCompareCell;
  replay: AiCompareCell;
  verdict: string;
}

export interface AiLabApi {
  listTraces(filter?: TraceListFilter): Promise<AiTrace[]>;
  listWorlds(): Promise<WorldSummary[]>;
  replay(request: AiReplayRequest): Promise<AiReplayResult>;
  compare(request: AiCompareRequest): Promise<AiCompareResult>;
}

export interface AiLabPageProps {
  api?: AiLabApi;
}

const ROLE_LABELS: Record<AiTrace["role"], string> = {
  SIMULATION: "决策 SIMULATION",
  DIALOGUE: "对话 DIALOGUE",
};

function traceTime(trace: AiTrace): string {
  const date = new Date(trace.createdAt);
  return Number.isNaN(date.getTime()) ? trace.createdAt : date.toLocaleString("zh-CN", { hour12: false });
}

function renderJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 本地预览用模拟实现:数据纯内存,无任何网络调用。*/
export const mockApi: AiLabApi = {
  async listTraces(filter = {}): Promise<AiTrace[]> {
    return mockTraces.filter((trace) =>
      (filter.worldId === undefined || trace.worldId === filter.worldId) &&
      (filter.agentId === undefined || trace.agentId === filter.agentId) &&
      (filter.role === undefined || trace.role === filter.role) &&
      (filter.status === undefined || trace.status === filter.status) &&
      (filter.source === undefined || trace.source === filter.source),
    );
  },
  async listWorlds(): Promise<WorldSummary[]> {
    return mockWorlds;
  },
  async replay(request: AiReplayRequest): Promise<AiReplayResult> {
    const trace = mockTraces.find((item) => item.id === request.traceId);
    return {
      ok: true,
      traceId: request.traceId,
      output: { finalActionId: trace?.finalActionId ?? null, note: "沙盒重放,未写回世界" },
      writeBack: request.writeBack,
      durationMs: trace?.latencyMs ?? 1,
      note: "Mock 演示:真实重放由主线路由投递到原 provider/模型。",
    };
  },
  async compare(request: AiCompareRequest): Promise<AiCompareResult> {
    const trace = mockTraces.find((item) => item.id === request.traceId) ?? mockTraces[0];
    const replay: AiCompareCell = request.mode === "real"
      ? { source: trace.source, model: trace.model, output: { finalActionId: trace.finalActionId }, latencyMs: trace.latencyMs }
      : { source: "mock", model: "mock-deterministic-v1", output: { finalActionId: "act_walk_around", finalReason: "规则评分 + 固定种子" }, latencyMs: 2 };
    return {
      traceId: request.traceId,
      original: { source: trace.source, model: trace.model, output: { finalActionId: trace.finalActionId }, latencyMs: trace.latencyMs },
      replay,
      verdict: replay.output.finalActionId === trace.finalActionId ? "两路结论一致" : "两路结论不一致(差异见输出列)",
    };
  },
};

const mockWorlds: WorldSummary[] = [
  {
    id: "world_qixi",
    name: "栖溪镇·demo",
    description: "内置演示世界:河岸、市集、咖啡馆与五名居民。",
    gameMinute: 508,
    version: 42,
    paused: false,
    activeBranchId: "branch_main",
    npcCount: 5,
  },
];

const mockTraces: AiTrace[] = [
  {
    id: "trace_sim_zf_001",
    worldId: "world_qixi",
    branchId: "branch_main",
    worldVersion: 42,
    agentId: "npc_zhou_fang",
    role: "SIMULATION",
    status: "success",
    source: "ai",
    provider: "openai",
    model: "gpt-4o-mini",
    context: { 时段: "上午", 心情: 78, 今日计划: ["去市集采购"], 相关记忆: ["暴雨预警"] },
    candidates: [
      { id: "c1", label: "去市集采购竹子", score: 0.82, reason: "计划契合且市集上午人多", destinationId: "riverside", durationMinutes: 40 },
      { id: "c2", label: "在河岸闲逛", score: 0.41, reason: "心情放松,但无计划支撑", destinationId: "riverside", durationMinutes: 25 },
      { id: "c3", label: "回家休息", score: 0.22, reason: "当前精力尚可,无需休息", destinationId: "apartment", durationMinutes: 60 },
    ],
    rawOutput: { actionId: "act_market_trip", reason: "上午市集采购是当日计划首选" },
    validationErrors: [],
    fallbackReason: null,
    finalActionId: "act_market_trip",
    finalReason: "上午市集采购是当日计划首选",
    latencyMs: 812,
    attempts: 1,
    usage: { inputTokens: 1480, outputTokens: 96 },
    stateChanges: { energy: { before: 60, after: 42 } },
    createdAt: "2026-08-28T02:10:04.000Z",
  },
  {
    id: "trace_sim_ly_002",
    worldId: "world_qixi",
    branchId: "branch_main",
    worldVersion: 40,
    agentId: "npc_lin_xia",
    role: "SIMULATION",
    status: "fallback",
    source: "mock",
    provider: "mock-rules",
    model: "mock-deterministic-v1",
    context: { 时段: "早晨", 心情: 55, 候选动作: 4 },
    candidates: [
      { id: "c1", label: "巡视诊所", score: 0.9, reason: "值班计划与职业职责", destinationId: "clinic", durationMinutes: 60 },
    ],
    rawOutput: { actionId: "act_factory_inspect", reason: "模型幻觉动作" },
    validationErrors: ["Zod: finalActionId 'act_factory_inspect' 不在世界动作定义内"],
    fallbackReason: "模型输出校验未通过,已降级为可复现 Mock 决策",
    finalActionId: "act_clinic_shift",
    finalReason: "规则评分最高:值班巡视(确定性 seed)",
    latencyMs: 3,
    attempts: 2,
    usage: { inputTokens: null, outputTokens: null },
    stateChanges: { mood: { before: 55, after: 62 } },
    createdAt: "2026-08-28T01:58:10.000Z",
  },
  {
    id: "trace_dlg_zh_003",
    worldId: "world_qixi",
    branchId: "branch_main",
    worldVersion: 39,
    agentId: "npc_shen_zhiheng",
    role: "DIALOGUE",
    status: "success",
    source: "ai",
    provider: "openai",
    model: "gpt-4o-mini",
    context: { 玩家消息: "下午咖啡馆还营业吗?", 关系: "熟客", 心情: 70 },
    candidates: [
      { id: "c1", label: "邀请顾客来店", score: 0.77, reason: "回应营业咨询并提供引子", destinationId: "cafe", durationMinutes: 5 },
    ],
    rawOutput: { reply: "下午照常营业,新烘的豆子刚到。" },
    validationErrors: [],
    fallbackReason: null,
    finalActionId: "act_chat_reply",
    finalReason: "对话模板 + 人格综合",
    latencyMs: 614,
    attempts: 1,
    usage: { inputTokens: 902, outputTokens: 61 },
    stateChanges: {},
    createdAt: "2026-08-28T00:47:33.000Z",
  },
];

const selectOptions = {
  role: Object.entries(ROLE_LABELS) as Array<[AiTrace["role"], string]>,
  status: [["success", "成功"], ["fallback", "降级 fallback"]] as Array<[AiTrace["status"], string]>,
  source: [["ai", "真实 AI"], ["mock", "Mock"]] as Array<[AiTrace["source"], string]>,
};

export function AiLabPage(props: AiLabPageProps) {
  const api: AiLabApi = props.api ?? mockApi;

  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [allTraces, setAllTraces] = useState<AiTrace[]>([]);
  const [traces, setTraces] = useState<AiTrace[]>([]);
  const [worldId, setWorldId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replayTraceId, setReplayTraceId] = useState("");
  const [replayWriteBack, setReplayWriteBack] = useState(false);
  const [replayResult, setReplayResult] = useState<AiReplayResult | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);

  const [compareMode, setCompareMode] = useState<AiCompareRequest["mode"]>("mock");
  const [compareResult, setCompareResult] = useState<AiCompareResult | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);

  const load = useCallback(async (filter: TraceListFilter) => {
    setLoading(true);
    setError(null);
    try {
      setTraces(await api.listTraces(filter));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [worldList, traceList] = await Promise.all([api.listWorlds(), api.listTraces({})]);
        if (cancelled) return;
        setWorlds(worldList);
        setAllTraces(traceList);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // api 实例由 props 注入,契约不变;仅首挂载拉取选项。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const filter: TraceListFilter = {
      ...(worldId ? { worldId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(role ? { role: role as AiTrace["role"] } : {}),
      ...(status ? { status: status as AiTrace["status"] } : {}),
      ...(source ? { source: source as AiTrace["source"] } : {}),
    };
    load(filter);
  }, [worldId, agentId, role, status, source, load]);

  const agentOptions = useMemo(() => {
    const names = new Set(allTraces.map((trace) => trace.agentId));
    return [...names].sort();
  }, [allTraces]);

  const selected = traces.find((trace) => trace.id === selectedId) ?? null;

  const runReplay = async () => {
    if (!replayTraceId) return;
    setReplayBusy(true);
    try {
      setReplayResult(await api.replay({ traceId: replayTraceId, writeBack: replayWriteBack }));
    } catch (err) {
      setReplayResult({ ok: false, traceId: replayTraceId, output: {}, writeBack: replayWriteBack, durationMs: 0, note: err instanceof Error ? err.message : String(err) });
    } finally {
      setReplayBusy(false);
    }
  };

  const runCompare = async () => {
    if (!selected) return;
    setCompareBusy(true);
    try {
      setCompareResult(await api.compare({ traceId: selected.id, mode: compareMode }));
    } catch (err) {
      setCompareResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompareBusy(false);
    }
  };

  return (
    <main className="ai-lab">
      <header className="ai-lab-header">
        <div>
          <div className="brand-mark dark">AI BUTTERFLY TOWN</div>
          <h1>AI 调试工作台</h1>
          <p className="ai-lab-sub">M8 组件 · 未接线预览(交互数据来自内置 mockApi)</p>
        </div>
      </header>

      <section className="ai-lab-filters">
        <label>世界
          <select value={worldId} onChange={(event) => setWorldId(event.target.value)}>
            <option value="">全部</option>
            {worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
          </select>
        </label>
        <label>居民
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">全部</option>
            {agentOptions.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>角色
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">全部</option>
            {selectOptions.role.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>状态
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部</option>
            {selectOptions.status.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>来源
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">全部</option>
            {selectOptions.source.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="ai-lab-minor" onClick={() => load({})}>刷新</button>
      </section>

      {error && <p className="ai-lab-error">{error}</p>}

      <div className="ai-lab-body">
        <section className="ai-lab-list">
          {loading && <p className="ai-lab-empty">载入中…</p>}
          {!loading && traces.length === 0 && <p className="ai-lab-empty">没有匹配的 Trace 记录</p>}
          {traces.map((trace) => (
            <button
              key={trace.id}
              className={`ai-lab-card ${trace.id === selectedId ? "selected" : ""}`}
              onClick={() => setSelectedId(trace.id)}
            >
              <div className="ai-lab-card-head">
                <span className={`badge badge-${trace.source}`}>{trace.source === "ai" ? "AI" : "MOCK"}</span>
                <span className={`badge badge-${trace.status}`}>{trace.status === "fallback" ? "降级" : "成功"}</span>
                <span className="ai-lab-card-time">{traceTime(trace)}</span>
              </div>
              <div className="ai-lab-card-title">{trace.agentId}</div>
              <div className="ai-lab-card-meta">
                {ROLE_LABELS[trace.role]} · v{trace.worldVersion} · {trace.model} · {trace.latencyMs}ms
              </div>
              <div className="ai-lab-card-reason">{trace.finalReason}</div>
            </button>
          ))}
        </section>

        <section className="ai-lab-detail">
          {!selected && <p className="ai-lab-empty">选择左侧 Trace 查看详情 / 重放 / 对比</p>}
          {selected && (
            <>
              <div className="ai-lab-detail-card">
                <h2>Trace {selected.id}</h2>
                <dl>
                  <dt>角色 / 来源</dt><dd>{ROLE_LABELS[selected.role]} · {selected.source} · {selected.model}</dd>
                  <dt>世界版本</dt><dd>world {selected.worldId} · branch {selected.branchId} · v{selected.worldVersion}</dd>
                  <dt>最终动作</dt><dd>{selected.finalActionId} — {selected.finalReason}</dd>
                  <dt>Token 成本</dt><dd>in {selected.usage.inputTokens ?? "—"} / out {selected.usage.outputTokens ?? "—"} · 尝试 {selected.attempts} 次 · {selected.latencyMs}ms</dd>
                  {selected.fallbackReason && <dt className="warn">降级原因</dt>}
                  {selected.fallbackReason && <dd className="warn">{selected.fallbackReason}</dd>}
                  {selected.validationErrors.length > 0 && <dt className="warn">校验错误</dt>}
                  {selected.validationErrors.length > 0 && <dd>{selected.validationErrors.map((item) => <div key={item}>{item}</div>)}</dd>}
                </dl>
                <h3>候选动作</h3>
                <table className="ai-lab-table"><tbody>
                  {selected.candidates.map((candidate) => (
                    <tr key={candidate.id}>
                      <td>{candidate.label}</td>
                      <td>{candidate.score.toFixed(2)}</td>
                      <td>{candidate.reason}</td>
                    </tr>
                  ))}
                </tbody></table>
                <details className="ai-lab-raw"><summary>上下文 / 原始输出 / 状态差异</summary>
                  <pre>上下文 {renderJson(selected.context)}</pre>
                  <pre>原始输出 {renderJson(selected.rawOutput)}</pre>
                  <pre>前后状态差异 {renderJson(selected.stateChanges)}</pre>
                </details>
              </div>

              <div className="ai-lab-panel">
                <h2>沙盒重放</h2>
                <p className="ai-lab-note">重放默认不写回世界;调用已编辑沙盒上下文需接线层透传。</p>
                <label className="ai-lab-row">Trace
                  <input value={replayTraceId || selected.id} onChange={(event) => setReplayTraceId(event.target.value)} placeholder={selected.id} />
                </label>
                <label className="ai-lab-check"><input type="checkbox" checked={replayWriteBack} onChange={(event) => setReplayWriteBack(event.target.checked)} /> 写回世界(默认不写回)</label>
                <button onClick={runReplay} disabled={replayBusy}>{replayBusy ? "重放中…" : "重放"}</button>
                {replayResult && (
                  <div className="ai-lab-result">
                    <p>{replayResult.ok ? "重放完成" : "重放失败"}:{replayResult.note ?? ""}</p>
                    <pre>{renderJson(replayResult.output)}</pre>
                  </div>
                )}
              </div>

              <div className="ai-lab-panel">
                <h2>AI vs Mock 对比</h2>
                <label className="ai-lab-row">对比模式
                  <select value={compareMode} onChange={(event) => setCompareMode(event.target.value as AiCompareRequest["mode"])}>
                    <option value="mock">原 Trace 数据 vs Mock 重放</option>
                    <option value="real">原 Trace 数据 vs 同模型重放</option>
                  </select>
                </label>
                <button onClick={runCompare} disabled={compareBusy || !selected}>{compareBusy ? "对比中…" : "执行对比"}</button>
                {compareResult && (
                  <div className="ai-lab-compare">
                    <div className="ai-lab-compare-cell">
                      <h3>原记录 {compareResult.original.source} · {compareResult.original.model}</h3>
                      <pre>{renderJson(compareResult.original.output)}</pre>
                      <p>{compareResult.original.latencyMs}ms</p>
                    </div>
                    <div className="ai-lab-compare-cell">
                      <h3>重放 {compareResult.replay.source} · {compareResult.replay.model}</h3>
                      <pre>{renderJson(compareResult.replay.output)}</pre>
                      <p>{compareResult.replay.latencyMs}ms</p>
                    </div>
                    <p className="ai-lab-verdict">结论:{compareResult.verdict}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default AiLabPage;
