import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RealtimeMessageSchema, type DialogueSession, type EventPreviewResult, type EventPreviewSpec } from "@ai-town/shared";
import { api } from "../services/api";
import { gameEvents } from "../game/event-bus";
import { useWorldStore } from "../state/world-store";
import { TownCanvas } from "../game/TownCanvas";

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function StateBar({ label, value, reverse = false }: { label: string; value: number; reverse?: boolean }) {
  const display = reverse ? 100 - value : value;
  return <div className="state-row"><span>{label}</span><div><i style={{ width: `${display}%` }} /></div><b>{Math.round(value)}</b></div>;
}

export function WorldPage() {
  const { worldId = "" } = useParams();
  const store = useWorldStore();
  const [dialogue, setDialogue] = useState<DialogueSession | null>(null);
  const [dialogueDraft, setDialogueDraft] = useState("");
  const [approachingNpcId, setApproachingNpcId] = useState<string | null>(null);
  const [walkableHigh, setWalkableHigh] = useState(false);
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState("");
  const [eventPreview, setEventPreview] = useState<EventPreviewResult | null>(null);
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
        setDialogue(result.session);
        setApproachingNpcId(null);
      }, travelMs);
    },
    onError: () => setApproachingNpcId(null),
  });
  const sendDialogue = useMutation({
    mutationFn: (content: string) => api.sendDialogueMessage(dialogue!.id, content),
    onSuccess: (result) => setDialogue(result.session),
  });
  const endDialogue = useMutation({
    mutationFn: () => api.endDialogue(dialogue!.id),
    onSuccess: (result) => {
      useWorldStore.getState().applyDialogueEnd(result);
      setDialogue(null);
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
    setDialogue(activeDialogue.data ?? null);
    if (activeDialogue.data) store.setSelectedNpc(activeDialogue.data.npcId);
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
        if (parsed.success) store.applyMessage(parsed.data);
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
        <div className="world-title"><Link to="/">←</Link><div><b>{store.world.name}</b><span>周末河岸市集筹备中</span></div></div>
        <div className="world-clock"><span className="clock-label">周六</span><strong>{formatTime(store.world.gameMinute)}</strong><span className={store.connected ? "live on" : "live"}>{store.connected ? "实时" : "重连中"}</span></div>
        <div className="top-actions"><span className="mode-chip">AI / Mock 自动</span><button className={walkableHigh ? "walkable-toggle on" : "walkable-toggle"} onClick={() => { setWalkableHigh((value) => !value); gameEvents.dispatchEvent(new CustomEvent("walkable:visible", { detail: !walkableHigh })); }}>行走区域</button><button onClick={() => pause.mutate(!store.world!.paused)}>{store.world.paused ? "▶ 继续" : "Ⅱ 暂停"}</button></div>
      </header>

      <section className="world-layout">
        <div className="map-stage">
          <TownCanvas />
          <div className={move.isError ? "map-legend error" : "map-legend"}>
            {move.isPending ? "正在规划路线…" : move.isError ? move.error.message : "点击道路移动 · 点击居民查看状态"}
          </div>
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
          <DecisionPanel trace={decisions.data?.[0] ?? null} loading={decisions.isLoading} />
        </aside>
      </div>}
    </main>
  );
}

function DecisionPanel({ trace, loading }: { trace: Awaited<ReturnType<typeof api.aiTraces>>[number] | null; loading: boolean }) {
  if (loading) return <div className="decision-note"><b>最近一次决策</b><p>正在读取可解释决策记录…</p></div>;
  if (!trace) return <div className="decision-note"><b>最近一次决策</b><p>当前动作结束后会生成第一条 AI/Mock 决策记录。</p></div>;
  return <div className="decision-note trace-card">
    <div className="trace-heading"><b>最近一次决策</b><span className={trace.source === "ai" ? "trace-source ai" : "trace-source mock"}>{trace.source === "ai" ? "真实 AI" : "Mock 降级"}</span></div>
    <p>{trace.finalReason}</p>
    <dl>
      <div><dt>模型</dt><dd>{trace.model}</dd></div>
      <div><dt>耗时</dt><dd>{trace.latencyMs} ms</dd></div>
      <div><dt>尝试</dt><dd>{trace.attempts} 次</dd></div>
      <div><dt>候选</dt><dd>{trace.candidates.length} 个</dd></div>
    </dl>
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
