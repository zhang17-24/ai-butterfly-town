import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RealtimeMessageSchema, type DialogueSession, type EventPreviewResult, type EventPreviewSpec, type Job, type MemoryEntry, type RealtimeMessage, type TownEvent, type WorldBlueprint } from "@ai-town/shared";
import { api, mapImageUrl as mapImageHref } from "../services/api";
import { gameEvents } from "../game/event-bus";
import { toSpeechLines } from "../game/speech-events";
import { useWorldStore } from "../state/world-store";
import { TownCanvas } from "../game/TownCanvas";

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatWeekday(minutes: number) {
  return ["周六", "周日", "周一", "周二", "周三", "周四", "周五"][Math.floor(minutes / 1440) % 7];
}

/** 把实时事件中的对话内容转发给场景,渲染 NPC 头顶气泡。 */
function dispatchSpeechLines(message: RealtimeMessage): void {
  const events: TownEvent[] = [];
  if (message.type === "world.status" && message.event) events.push(message.event);
  if (message.type === "world.tick") events.push(...message.data.events);
  for (const event of events) {
    for (const line of toSpeechLines(event)) {
      gameEvents.dispatchEvent(new CustomEvent("npc:speak", { detail: line }));
    }
  }
}

function StateBar({ label, value, reverse = false }: { label: string; value: number; reverse?: boolean }) {
  const display = reverse ? 100 - value : value;
  const level = display >= 70 ? "充足" : display >= 40 ? "一般" : display >= 20 ? "紧张" : "危险";
  return <div className="state-row"><span>{label}</span><div><i style={{ width: `${display}%` }} /></div><b title={`${Math.round(value)}/100`}>{level} · {Math.round(value)}</b></div>;
}

export function WorldPage() {
  const { worldId = "" } = useParams();
  const store = useWorldStore();
  const [dialogueDraft, setDialogueDraft] = useState("");
  const queryClient = useQueryClient();
  const [approachingNpcId, setApproachingNpcId] = useState<string | null>(null);
  const [walkableHigh, setWalkableHigh] = useState(false);
  const [npcSprites, setNpcSprites] = useState<Record<string, string>>({});
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState("");
  const [eventPreview, setEventPreview] = useState<EventPreviewResult | null>(null);
  const [blueprint, setBlueprint] = useState<WorldBlueprint | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [skipJobId, setSkipJobId] = useState<string | null>(null);
  const [skipProgress, setSkipProgress] = useState<Job | null>(null);
  const [skipTargetMinute, setSkipTargetMinute] = useState<number | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [branchNotice, setBranchNotice] = useState<string | null>(null);
  const previewEvent = useMutation({
    mutationFn: (text: string) => api.previewEvent(worldId, text),
    onSuccess: (result) => setEventPreview(result),
  });
  const commitEvent = useMutation({
    mutationFn: ({ preview, version }: { preview: EventPreviewSpec; version: number }) => api.commitEvent(worldId, preview, version),
    onSuccess: (result) => {
      useWorldStore.getState().applyEvent(result);
      setEventPanelOpen(false);
      setEventDraft("");
      setEventPreview(null);
    },
  });
  const initial = useQuery({ queryKey: ["world", worldId], queryFn: () => api.worldState(worldId), enabled: !!worldId });
  const decisions = useQuery({
    queryKey: ["decisions", worldId, store.selectedNpcId],
    queryFn: () => api.aiTraces(worldId, store.selectedNpcId!),
    enabled: Boolean(worldId && store.selectedNpcId),
    refetchInterval: 3000,
  });
  const activeDialogue = useQuery({ queryKey: ["active-dialogue", worldId], queryFn: () => api.activeDialogue(worldId), enabled: Boolean(worldId) });
  const dialogue = activeDialogue.data ?? null;
  const memories = useQuery({
    queryKey: ["memories", worldId, store.selectedNpcId],
    queryFn: () => api.agentMemories(worldId, store.selectedNpcId!, { limit: 20 }),
    enabled: Boolean(worldId && store.selectedNpcId),
  });
  const createBranch = useMutation({
    mutationFn: () => api.createBranch(worldId),
    onSuccess: () => {
      setBranchNotice("已创建分支并暂停");
      void initial.refetch();
      window.setTimeout(() => setBranchNotice(null), 4000);
    },
    onError: (error) => {
      setBranchNotice(`创建分支失败:${error instanceof Error ? error.message : String(error)}`);
      window.setTimeout(() => setBranchNotice(null), 4000);
    },
  });
  const pause = useMutation({ mutationFn: (paused: boolean) => api.setPaused(worldId, paused, store.world?.version ?? 0) });
  const move = useMutation({
    mutationFn: (target: { x: number; y: number }) => api.movePlayer(worldId, target, useWorldStore.getState().world?.version ?? 0),
    onSuccess: (result) => useWorldStore.getState().applyPlayerMove(result),
  });
  const startDialogue = useMutation({
    mutationFn: (npcId: string) => api.startDialogue(worldId, npcId, useWorldStore.getState().world?.version ?? 0),
    onMutate: (npcId) => setApproachingNpcId(npcId),
    onSuccess: (result) => {
      useWorldStore.getState().applyDialogueStart(result);
      const travelMs = Math.min(2400, Math.max(300, result.path.length * 85));
      window.setTimeout(() => {
        queryClient.setQueryData(["active-dialogue", worldId], result.session);
        setApproachingNpcId(null);
      }, travelMs);
    },
    onError: () => setApproachingNpcId(null),
  });
  const sendDialogue = useMutation({
    mutationFn: (content: string) => api.sendDialogueMessage(dialogue!.id, content),
    onSuccess: (result) => queryClient.setQueryData(["active-dialogue", worldId], result.session),
  });
  const endDialogue = useMutation({
    mutationFn: () => api.endDialogue(dialogue!.id),
    onSuccess: (result) => {
      useWorldStore.getState().applyDialogueEnd(result);
      queryClient.setQueryData(["active-dialogue", worldId], null);
    },
  });

  useEffect(() => {
    if (initial.data) store.applyMessage({
      eventId: crypto.randomUUID(),
      worldId: initial.data.world.id,
      branchId: initial.data.world.activeBranchId,
      version: initial.data.world.version,
      emittedAt: new Date().toISOString(),
      type: "world.snapshot",
      data: initial.data,
    });
  }, [initial.data]);

  useEffect(() => {
    // 用 getState 取 action(引用稳定),仅当对话数据变化时同步选中 NPC,避免与 store 订阅形成自激循环。
    if (activeDialogue.data) useWorldStore.getState().setSelectedNpc(activeDialogue.data.npcId);
  }, [activeDialogue.data]);

  useEffect(() => {
    const listener = (event: Event) => store.setSelectedNpc((event as CustomEvent<string>).detail);
    gameEvents.addEventListener("npc:selected", listener);
    return () => gameEvents.removeEventListener("npc:selected", listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => move.mutate((event as CustomEvent<{ x: number; y: number }>).detail);
    gameEvents.addEventListener("map:move", listener);
    return () => gameEvents.removeEventListener("map:move", listener);
  }, [worldId]);

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.worldBlueprint(worldId);
        if (cancelled) return;
        // 生成世界优先使用程序化地图 PNG;其次 AI 生成图;都没有则回退栖溪预置图
        setBlueprint(result.blueprint);
        setMapImageUrl(result.hasMapPng ? mapImageHref(worldId) : (result.asset?.imageUrl ?? null));
        const assets = await api.worldAssets(worldId);
        if (!cancelled) {
          const sprites: Record<string, string> = {};
          for (const asset of assets) {
            if (asset.kind === "sprite" && asset.agentId && asset.url) sprites[asset.agentId] = asset.url;
          }
          setNpcSprites(sprites);
        }
      } catch {
        // 世界尚无 blueprint(如早期世界),由 TownScene 回退到栖溪预置蓝图与地图
      }
    })();
    return () => { cancelled = true; };
  }, [worldId]);

  const startSkip = async (minutes: number) => {
    if (!store.world || skipJobId) return;
    setSkipError(null);
    try {
      const targetMinute = store.world.gameMinute + minutes;
      const job = await api.skipTime(worldId, targetMinute, store.world.version);
      setSkipProgress(job);
      setSkipTargetMinute(targetMinute);
      setSkipJobId(job.id);
    } catch (err) {
      setSkipError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!skipJobId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const next = await api.getJob(skipJobId);
        if (stopped) return;
        setSkipProgress(next);
        if (next.status === "succeeded") {
          setSkipJobId(null);
          setSkipTargetMinute(null);
          void initial.refetch();
        } else if (next.status === "failed") {
          setSkipJobId(null);
          setSkipTargetMinute(null);
          setSkipError(next.error ?? "跳过时间失败");
        }
      } catch (err) {
        if (stopped) return;
        setSkipJobId(null);
        setSkipTargetMinute(null);
        setSkipError(err instanceof Error ? err.message : String(err));
      }
    }, 800);
    return () => { stopped = true; clearInterval(timer); };
  }, [skipJobId, initial]);

  useEffect(() => {
    if (!worldId) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    let retry: number | undefined;
    let socket: WebSocket;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const afterVersion = useWorldStore.getState().world?.version;
      const resume = afterVersion === undefined ? "" : `&afterVersion=${afterVersion}`;
      socket = new WebSocket(`${protocol}://${location.host}/ws?worldId=${encodeURIComponent(worldId)}${resume}`);
      socket.onopen = () => store.setConnected(true);
      socket.onmessage = (event) => {
        const parsed = RealtimeMessageSchema.safeParse(JSON.parse(String(event.data)));
        if (parsed.success) {
          store.applyMessage(parsed.data);
          dispatchSpeechLines(parsed.data);
        }
      };
      socket.onclose = () => {
        store.setConnected(false);
        if (!disposed) retry = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [worldId]);

  const selected = store.npcs.find((npc) => npc.profile.id === store.selectedNpcId) ?? null;
  const submitDialogue = (event: FormEvent) => {
    event.preventDefault();
    const content = dialogueDraft.trim();
    if (!content || !dialogue) return;
    setDialogueDraft("");
    sendDialogue.mutate(content);
  };
  if (initial.isLoading || !store.world) return <div className="loading-page">正在进入栖溪镇…</div>;
  if (initial.isError) return <div className="loading-page error">{initial.error.message}</div>;

  return (
    <main className="world-page">
      <header className="world-topbar">
        <div className="world-title"><Link to="/" title="返回世界库">←</Link><div><b>{store.world.name}</b><span title={store.world.description}>{store.world.description}</span></div></div>
        <div className="world-clock"><span className="clock-label">{formatWeekday(store.world.gameMinute)}</span><strong>{formatTime(store.world.gameMinute)}</strong><span className={store.connected ? "live on" : "live"}>{store.connected ? "实时" : "重连中"}</span></div>
        <div className="top-actions"><span className="mode-chip">AI / Mock 自动</span><button className={walkableHigh ? "walkable-toggle on" : "walkable-toggle"} onClick={() => { setWalkableHigh((value) => !value); gameEvents.dispatchEvent(new CustomEvent("walkable:visible", { detail: !walkableHigh })); }}>行走区域</button><span className="skip-group">跳过<button disabled={Boolean(skipJobId)} onClick={() => { void startSkip(30); }}>+30分</button><button disabled={Boolean(skipJobId)} onClick={() => { void startSkip(60); }}>+1时</button><button disabled={Boolean(skipJobId)} onClick={() => { void startSkip(180); }}>+3时</button></span><button disabled={createBranch.isPending} onClick={() => createBranch.mutate()}>{createBranch.isPending ? "创建中…" : "创建分支"}</button><button onClick={() => pause.mutate(!store.world!.paused)}>{store.world.paused ? "▶ 继续" : "Ⅱ 暂停"}</button><button className="topbar-logout" onClick={async () => { await api.logout(); window.location.href = "/login"; }}>退出</button></div>
      </header>

      <section className="world-layout">
        <div className="map-stage">
          <TownCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} />
          <div className={move.isError ? "map-legend error" : "map-legend"}>
            {move.isPending ? "正在规划路线…" : move.isError ? move.error.message : "点击道路移动 · 点击居民查看状态"}
          </div>
          {skipProgress && skipJobId && (
            <div className="skip-progress">
              <div className="skip-progress-head"><b>世界推进中 → 第 {Math.floor((skipTargetMinute ?? store.world.gameMinute) / 1440) + 1} 天</b><span>{Math.round(skipProgress.progressPercent)}%</span></div>
              <div className="skip-bar"><i style={{ width: `${skipProgress.progressPercent}%` }} /></div>
              <p>{skipProgress.stageLabel ?? "正在推进世界模拟…"}</p>
            </div>
          )}
          {skipError && <div className="map-legend error">跳过失败:{skipError}</div>}
          {branchNotice && <div className="branch-notice">{branchNotice}</div>}
          <button className="event-inject-button" onClick={() => setEventPanelOpen((open) => !open)}>{eventPanelOpen ? "×" : "＋ 注入事件"}</button>
          {eventPanelOpen && <div className="event-inject-panel">
            <div className="inject-heading"><b>注入事件</b><span>文本将解析为结构化事实，确认后才写入世界</span></div>
            <div className="inject-templates">
              {[
                "气象台发布暴雨预警，河岸市集今天下午可能临时关闭。",
                "社区公告：河岸市集本周六上午 9 点开幕，现场招募志愿者。",
                "有居民传言，老何杂货铺月底要关门歇业。",
              ].map((template) => <button key={template} onClick={() => { setEventDraft(template); setEventPreview(null); }}>{template.slice(0, 18)}…</button>)}
            </div>
            <textarea value={eventDraft} onChange={(event) => { setEventDraft(event.target.value); setEventPreview(null); }} placeholder="一句话描述：谁 / 在哪里 / 发生了什么…" maxLength={200} rows={3} />
            {!eventPreview ? <button className="inject-preview" onClick={() => eventDraft.trim() && previewEvent.mutate(eventDraft)} disabled={!eventDraft.trim() || previewEvent.isPending}>{previewEvent.isPending ? "解析中…" : "预览影响范围"}</button>
              : <div className="inject-review">
                  <p><b>{eventPreview.preview.type}</b> · {eventPreview.preview.locationId ?? "镇中心"} · {eventPreview.preview.audience === "public" ? "全镇公开" : eventPreview.preview.audience === "private" ? "私密" : "镇上可见"} · 置信度 {Math.round(eventPreview.confidence)}%</p>
                  <p>将影响 <b>{eventPreview.affectedNpcCount}</b> 名居民：{eventPreview.spread.map((item) => item.agentId.replace("npc_", "")).join("、") || "无人知晓"}</p>
                  <div className="inject-actions">
                    <button onClick={() => { setEventPreview(null); setEventDraft(""); }}>取消</button>
                    <button className="commit" onClick={() => { const version = useWorldStore.getState().world?.version ?? 0; commitEvent.mutate({ preview: eventPreview.preview, version }); }} disabled={commitEvent.isPending}>{commitEvent.isPending ? "写入中…" : "确认写入"}</button>
                  </div>
                </div>}
            {previewEvent.isError && <p className="inject-error">{previewEvent.error.message}</p>}
            {commitEvent.isError && <p className="inject-error">{commitEvent.error.message}</p>}
          </div>}
          <Link className="causal-link" to={`/world/${worldId}/causal`}>时间线 / 因果</Link>
        </div>
        <aside className="event-sidebar">
          <div className="sidebar-heading"><span>小镇动态</span><b>{store.events.length}</b></div>
          <div className="event-list">
            {[...store.events].reverse().slice(0, 16).map((event) => {
              const npc = store.npcs.find((item) => item.profile.id === event.actorId);
              return <button key={event.id} onClick={() => npc && store.setSelectedNpc(npc.profile.id)}>
                <span className="event-dot" style={{ background: npc?.profile.color ?? "#789" }} />
                <div><b>{formatTime(event.gameMinute)} · {npc?.profile.name ?? "世界"}</b><p>{event.summary}</p></div>
              </button>;
            })}
            {store.events.length === 0 && <div className="empty-events">居民正在完成当前动作，新的决定很快出现。</div>}
          </div>
        </aside>
      </section>

      {selected && <div className="drawer-backdrop" onClick={() => store.setSelectedNpc(null)}>
        <aside className="npc-drawer" onClick={(event) => event.stopPropagation()}>
          <button className="drawer-close" onClick={() => store.setSelectedNpc(null)}>×</button>
          <div className="npc-identity"><span style={{ background: selected.profile.color }}>{selected.profile.name.slice(-1)}</span><div><div className="eyebrow">RESIDENT PROFILE</div><h2>{selected.profile.name}</h2><p>{selected.profile.age} 岁 · {selected.profile.role}</p></div></div>
          <div className="current-action"><span>正在做</span><b>{selected.state.currentAction}</b><p>{selected.state.actionReason}</p></div>
          {dialogue?.npcId === selected.profile.id ? <section className="dialogue-panel">
            <div className="dialogue-heading"><div><span>现场对话</span><b>与 {selected.profile.name}</b></div><button onClick={() => endDialogue.mutate()} disabled={endDialogue.isPending}>结束</button></div>
            <div className="dialogue-messages">
              {dialogue.messages.length === 0 && <p className="dialogue-empty">你已经来到 {selected.profile.name} 身边。说点什么吧。</p>}
              {dialogue.messages.map((message) => <div key={message.id} className={message.speakerId === dialogue.playerId ? "dialogue-bubble mine" : "dialogue-bubble theirs"}>
                <span>{message.speakerId === dialogue.playerId ? "你" : selected.profile.name}{message.source === "mock" ? " · Mock" : ""}</span>
                <p>{message.content}</p>
              </div>)}
            </div>
            <div className="dialogue-quick">
              {["你好，最近怎么样？", "河岸市集准备得怎么样？", "有什么需要我帮忙的吗？"].map((prompt) => <button key={prompt} onClick={() => sendDialogue.mutate(prompt)} disabled={sendDialogue.isPending}>{prompt}</button>)}
            </div>
            <form className="dialogue-form" onSubmit={submitDialogue}>
              <input value={dialogueDraft} onChange={(event) => setDialogueDraft(event.target.value)} placeholder="输入你想说的话…" maxLength={500} />
              <button disabled={!dialogueDraft.trim() || sendDialogue.isPending}>{sendDialogue.isPending ? "回应中…" : "发送"}</button>
            </form>
            {sendDialogue.isError && <p className="dialogue-error">{sendDialogue.error.message}</p>}
          </section> : <div className="dialogue-entry">
            <button onClick={() => startDialogue.mutate(selected.profile.id)} disabled={startDialogue.isPending || Boolean(approachingNpcId)}>
              {approachingNpcId === selected.profile.id ? "正在自动接近…" : "走近并交谈"}
            </button>
            <span>系统会规划路线，到达合法距离后开始对话。</span>
            {startDialogue.isError && <p>{startDialogue.error.message}</p>}
          </div>}
          <div className="drawer-section"><h3>当前状态</h3>
            <StateBar label="饥饿" value={selected.state.hunger} reverse />
            <StateBar label="精力" value={selected.state.energy} />
            <StateBar label="心情" value={selected.state.mood} />
            <StateBar label="压力" value={selected.state.stress} reverse />
            <StateBar label="社交需求" value={selected.state.social} reverse />
          </div>
          <div className="drawer-section"><h3>人物底色</h3><p className="persona-copy">{selected.profile.personality}</p><p className="persona-copy muted">{selected.profile.motivation}</p></div>
          <div className="tag-group">{selected.profile.preferences.map((tag) => <span key={tag}>喜欢 · {tag}</span>)}{selected.profile.dislikes.map((tag) => <span className="negative" key={tag}>回避 · {tag}</span>)}</div>
          <MemoryPanel memories={memories.data ?? []} loading={memories.isLoading} />
          <DecisionPanel trace={decisions.data?.[0] ?? null} loading={decisions.isLoading} />
        </aside>
      </div>}
    </main>
  );
}

function DecisionPanel({ trace, loading }: { trace: Awaited<ReturnType<typeof api.aiTraces>>[number] | null; loading: boolean }) {
  const recalled = trace ? recalledMemoriesFromContext(trace.context) : [];
  if (loading) return <div className="decision-note"><b>最近一次决策</b><p>正在读取可解释决策记录…</p></div>;
  if (!trace) return <div className="decision-note"><b>最近一次决策</b><p>当前动作结束后会生成第一条 AI/Mock 决策记录。</p></div>;
  return <div className="decision-note trace-card">
    <div className="trace-heading"><b>最近一次决策</b><span className={trace.source === "ai" ? "trace-source ai" : "trace-source mock"}>{trace.source === "ai" ? "真实 AI" : "Mock 降级"}</span></div>
    <p>{trace.finalReason}</p>
    {trace.memoryBonus && Object.keys(trace.memoryBonus).length > 0 && (
      <div className="memory-bonus">记忆加成 · {Object.entries(trace.memoryBonus).map(([candidate, bonus]) => `${candidate} +${bonus}`).join(" / ")}</div>
    )}
    <dl>
      <div><dt>模型</dt><dd>{trace.model}</dd></div>
      <div><dt>耗时</dt><dd>{trace.latencyMs} ms</dd></div>
      <div><dt>尝试</dt><dd>{trace.attempts} 次</dd></div>
      <div><dt>候选</dt><dd>{trace.candidates.length} 个</dd></div>
    </dl>
    {recalled.length > 0 && (
      <div className="recalled-memories">
        <b>召回进 Prompt 的记忆 · {recalled.length} 条</b>
        {recalled.map((memory, index) => (
          <div key={memory.id ?? index} className="recalled-memory">
            <div className="recalled-head">
              <span className="memory-kind">{memoryKindLabel(memory.kind ?? "event")}</span>
              {typeof memory.importance === "number" && <span>{memory.importance}</span>}
            </div>
            <p>{memory.content}</p>
            <div className="recalled-reason">{memory.reasons.length > 0 ? memory.reasons.join("；") : "检索命中"}</div>
          </div>
        ))}
      </div>
    )}
    {trace.fallbackReason && <div className="fallback-reason">降级原因 · {humanizeFallback(trace.fallbackReason)}</div>}
    <details><summary>查看候选与校验</summary>
      <div className="candidate-list">{[...trace.candidates].sort((a, b) => b.score - a.score).map((candidate) => <div key={candidate.id} className={candidate.id === trace.finalActionId ? "chosen" : ""}><span>{candidate.label}</span><b>{candidate.score.toFixed(1)}</b></div>)}</div>
      {trace.validationErrors.length > 0 && <ul>{trace.validationErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>}
    </details>
  </div>;
}

function humanizeFallback(reason: string) {
  if (reason === "AI_KEY_OR_MODEL_MISSING") return "未配置 Key 或模型，已使用可复现规则决策";
  if (reason === "AI_TICK_BUDGET_EXHAUSTED") return "本轮 AI 调用预算已用完，已轮换到规则决策";
  if (reason.includes("AI_TIMEOUT")) return "模型超时，重试后已使用规则决策";
  if (reason.includes("UNKNOWN_ACTION")) return "模型引用了不存在的行动";
  return "模型输出未通过校验，已使用规则决策";
}

const MEMORY_KIND_LABELS: Record<MemoryEntry["kind"], string> = {
  dialogue: "对话",
  event: "事件",
  action: "行动",
  summary: "摘要",
  insight: "认识",
};

function memoryKindLabel(kind: string): string {
  return MEMORY_KIND_LABELS[kind as MemoryEntry["kind"]] ?? kind;
}

function memoryTime(minute: number): string {
  const day = Math.floor(minute / 1440) + 1;
  return `世界第${day}天 ${formatTime(minute % 1440)}`;
}

/** 从 metadataJson 提取简要召回信息(来源/地点/语气等)。 */
function explainMemory(memory: MemoryEntry): string {
  try {
    const meta = JSON.parse(memory.metadataJson) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof meta.sourceEventId === "string") parts.push(`源头事件 ${meta.sourceEventId.slice(0, 8)}`);
    if (typeof meta.locationId === "string") parts.push(`地点 ${meta.locationId}`);
    if (typeof meta.sessionId === "string") parts.push(`对话 ${meta.sessionId.slice(0, 8)}`);
    if (typeof meta.tone === "string") parts.push(`语气 ${meta.tone}`);
    if (typeof meta.source === "string") parts.push(`来源 ${meta.source}`);
    if (typeof meta.importanceVia === "string") parts.push(`重要度经由 ${meta.importanceVia}`);
    if (parts.length > 0) return `召回理由 · ${parts.join(" · ")}`;
  } catch {
    // metadataJson 可能不是 JSON,按无补充信息处理
  }
  return "";
}

interface RecalledMemoryView {
  id?: string;
  kind?: string;
  content?: string;
  importance?: number;
  reasons: string[];
}

/** 决策 trace 的 context.recalledMemories(记录检索引擎实际召回进 Prompt 的记忆)。 */
function recalledMemoriesFromContext(context: Record<string, unknown>): RecalledMemoryView[] {
  const raw = context.recalledMemories;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.content !== "string") return [];
    return [{
      id: typeof record.id === "string" ? record.id : undefined,
      kind: typeof record.kind === "string" ? record.kind : undefined,
      content: record.content,
      importance: typeof record.importance === "number" ? record.importance : undefined,
      reasons: Array.isArray(record.reasons) ? record.reasons.filter((reason): reason is string => typeof reason === "string") : [],
    }];
  });
}

function MemoryPanel({ memories, loading }: { memories: MemoryEntry[]; loading: boolean }) {
  const sorted = [...memories].sort((a, b) => b.worldMinute - a.worldMinute);
  return (
    <div className="drawer-section memory-panel">
      <h3>记忆 <span className="memory-count">{memories.length}</span></h3>
      {loading && <p className="memory-empty">正在读取记忆…</p>}
      {!loading && sorted.length === 0 && <p className="memory-empty">暂无记忆 · 对话与事件发生后会逐步写入</p>}
      {sorted.map((memory) => (
        <div key={memory.id} className="memory-item">
          <div className="memory-head">
            <span className={`memory-kind kind-${memory.kind}`}>{memoryKindLabel(memory.kind)}</span>
            <span className="memory-time">{memoryTime(memory.worldMinute)}</span>
            <span className={memory.importance >= 70 ? "memory-star hot" : "memory-star"} title={`重要度 ${memory.importance}`}>
              {memory.importance >= 70 ? "★" : "☆"} {memory.importance}
            </span>
          </div>
          <p className="memory-content">{memory.content}</p>
          {memory.subject && <div className="memory-subject">对象 · {memory.subject}</div>}
          {explainMemory(memory) && <div className="memory-explain">{explainMemory(memory)}</div>}
        </div>
      ))}
    </div>
  );
}
