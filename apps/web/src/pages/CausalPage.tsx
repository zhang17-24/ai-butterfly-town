import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { TownEvent } from "@ai-town/shared";
import { api } from "../services/api";

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const typeLabels: Record<string, string> = {
  "factory.event": "事件注入",
  "dialogue.started": "对话开始",
  "dialogue.message": "对话",
  "dialogue.ended": "对话结束",
  "npc.action_started": "居民行动",
  "player.moved": "移动",
  "world.paused": "暂停",
};

function actorLabel(id: string | null | undefined, names: Record<string, string>): string {
  if (!id) return "世界";
  if (id.startsWith("player")) return "玩家";
  return names[id] ?? id.replace(/^npc_/, "");
}

export function CausalPage() {
  const { worldId = "" } = useParams();
  const [typeFilter, setTypeFilter] = useState("all");
  const [npcFilter, setNpcFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useQuery({ queryKey: ["causal-graph", worldId], queryFn: () => api.causalGraph(worldId), enabled: Boolean(worldId) });
  const npcNames = useQuery({
    queryKey: ["world-npc-names", worldId],
    queryFn: async () => {
      const state = await api.worldState(worldId);
      return Object.fromEntries(state.npcs.map((npc) => [npc.profile.id, npc.profile.name]));
    },
    enabled: Boolean(worldId),
  });
  const nameMap = npcNames.data ?? {};

  const npcIds = useMemo(() => new Set(graph.data?.events.map((event) => event.actorId).filter(Boolean) ?? []), [graph.data]);
  const filtered = useMemo(() => (graph.data?.events ?? []).filter((event) =>
    (typeFilter === "all" || event.type === typeFilter) && (npcFilter === "all" || event.actorId === npcFilter),
  ), [graph.data, typeFilter, npcFilter]);
  const selected: TownEvent | null = filtered.find((event) => event.id === selectedId) ?? null;
  const selectedEdges = useMemo(() => (graph.data?.edges ?? []).filter((edge) => edge.to === selectedId), [graph.data, selectedId]);
  const selectedChildren = useMemo(() => (graph.data?.events ?? []).filter((event) => event.causeIds.includes(selectedId ?? "____")), [graph.data, selectedId]);
  const parents = useMemo(() => (selected?.causeIds ?? []).map((id) => graph.data?.events.find((event) => event.id === id)).filter(Boolean) as TownEvent[], [selected, graph.data]);

  return (
    <main className="causal-page">
      <header className="causal-topbar">
        <div><Link to={`/world/${worldId}`}>← 返回小镇</Link><b>时间线 / 因果</b></div>
        <div className="causal-filters">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">全部类型</option>
            {["factory.event", "dialogue.started", "dialogue.message", "dialogue.ended", "npc.action_started", "player.moved"].map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}
          </select>
          <select value={npcFilter} onChange={(event) => setNpcFilter(event.target.value)}>
            <option value="all">全部居民</option>
            {[...npcIds].map((id) => <option key={id} value={id ?? ""}>{actorLabel(id, nameMap)}</option>)}
          </select>
        </div>
      </header>
      {graph.isLoading && <div className="loading-page">正在加载时间线…</div>}
      {graph.isError && <div className="loading-page error">{graph.error.message}</div>}
      {graph.data && (
        <section className="causal-layout">
          <div className="event-list">
            {filtered.length === 0 && <p className="causal-empty">还没有事件。回到小镇，从右上角「＋ 注入事件」写入第一件事实。</p>}
            {[...filtered].reverse().map((event) => (
              <button key={event.id} className={selectedId === event.id ? "event-card selected" : "event-card"} onClick={() => setSelectedId(event.id)}>
                <span className={`type-badge type-${event.type}`}>{typeLabels[event.type] ?? event.type}</span>
                <div><b>{formatTime(event.gameMinute)} · {actorLabel(event.actorId, nameMap)}</b><p>{event.summary}</p></div>
                {event.causeIds.length > 0 && <span className="cause-chip">↳ {event.causeIds.length} 个起因</span>}
              </button>
            ))}
          </div>
          <aside className="causal-detail">
            {!selected && <p className="causal-empty">选择左侧事件查看两级因果链。</p>}
            {selected && <>
              <div className="detail-head"><span className={`type-badge type-${selected.type}`}>{typeLabels[selected.type] ?? selected.type}</span><b>{formatTime(selected.gameMinute)}</b><span>{selected.source}</span></div>
              <p className="detail-summary">{selected.summary}</p>
              <div className="chain">
                {parents.length === 0 && <div className="chain-node root"><b>根事件</b><p>没有起因引用</p></div>}
                {parents.map((parent) => (
                  <div key={parent.id} className="chain-node">
                    <b>{actorLabel(parent.actorId, nameMap)} · {typeLabels[parent.type] ?? parent.type}</b>
                    <p>{parent.summary}</p>
                  </div>
                ))}
                <div className="chain-arrow">↓ 影响 / 引用</div>
                <div className="chain-node current"><b>{formatTime(selected.gameMinute)} · 此事件</b><p>{selected.summary}</p></div>
                {selectedChildren.length > 0 && <>
                  <div className="chain-arrow">↓ 引起的后续</div>
                  {selectedChildren.map((child) => <div key={child.id} className="chain-node"><b>{actorLabel(child.actorId, nameMap)} · {typeLabels[child.type] ?? child.type}</b><p>{child.summary}</p></div>)}
                </>}
              </div>
              {selectedEdges.length > 0 && <p className="detail-meta">因果边：{selectedEdges.length} 条</p>}
            </>}
          </aside>
        </section>
      )}
    </main>
  );
}
