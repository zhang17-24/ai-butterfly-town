import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { RealtimeMessageSchema } from "@ai-town/shared";
import { api } from "../services/api";
import { useWorldStore } from "../state/world-store";
import { TownCanvas } from "../game/TownCanvas";
import { gameEvents } from "../game/event-bus";

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
  const initial = useQuery({ queryKey: ["world", worldId], queryFn: () => api.worldState(worldId), enabled: !!worldId });
  const pause = useMutation({ mutationFn: (paused: boolean) => api.setPaused(worldId, paused) });

  useEffect(() => {
    if (initial.data) store.applyMessage({ type: "world.snapshot", data: initial.data });
  }, [initial.data]);

  useEffect(() => {
    const listener = (event: Event) => store.setSelectedNpc((event as CustomEvent<string>).detail);
    gameEvents.addEventListener("npc:selected", listener);
    return () => gameEvents.removeEventListener("npc:selected", listener);
  }, []);

  useEffect(() => {
    if (!worldId) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    let retry: number | undefined;
    let socket: WebSocket;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(`${protocol}://${location.host}/ws?worldId=${encodeURIComponent(worldId)}`);
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
  if (initial.isLoading || !store.world) return <div className="loading-page">正在进入栖溪镇…</div>;
  if (initial.isError) return <div className="loading-page error">{initial.error.message}</div>;

  return (
    <main className="world-page">
      <header className="world-topbar">
        <div className="world-title"><Link to="/">←</Link><div><b>{store.world.name}</b><span>周末河岸市集筹备中</span></div></div>
        <div className="world-clock"><span className="clock-label">周六</span><strong>{formatTime(store.world.gameMinute)}</strong><span className={store.connected ? "live on" : "live"}>{store.connected ? "实时" : "重连中"}</span></div>
        <div className="top-actions"><span className="mode-chip">规则 Mock</span><button onClick={() => pause.mutate(!store.world!.paused)}>{store.world.paused ? "▶ 继续" : "Ⅱ 暂停"}</button></div>
      </header>

      <section className="world-layout">
        <div className="map-stage">
          <TownCanvas />
          <div className="map-legend">点击居民查看状态 · 世界每 2 秒前进 1 分钟</div>
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
          <div className="drawer-section"><h3>当前状态</h3>
            <StateBar label="饥饿" value={selected.state.hunger} reverse />
            <StateBar label="精力" value={selected.state.energy} />
            <StateBar label="心情" value={selected.state.mood} />
            <StateBar label="压力" value={selected.state.stress} reverse />
            <StateBar label="社交需求" value={selected.state.social} reverse />
          </div>
          <div className="drawer-section"><h3>人物底色</h3><p className="persona-copy">{selected.profile.personality}</p><p className="persona-copy muted">{selected.profile.motivation}</p></div>
          <div className="tag-group">{selected.profile.preferences.map((tag) => <span key={tag}>喜欢 · {tag}</span>)}{selected.profile.dislikes.map((tag) => <span className="negative" key={tag}>回避 · {tag}</span>)}</div>
          <div className="decision-note"><b>为什么是这个行动？</b><p>Mock 决策器综合需求、时段、性格和少量固定种子扰动选择；事件流保存了本次理由，刷新后仍可恢复。</p></div>
        </aside>
      </div>}
    </main>
  );
}
