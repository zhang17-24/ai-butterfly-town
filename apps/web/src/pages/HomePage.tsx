import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../services/api";

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.worlds, enabled: me.isSuccess });

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }
  if (me.isLoading || worlds.isLoading) return <div className="loading-page">正在恢复世界…</div>;

  return (
    <main className="home-page">
      <header className="home-header">
        <div><div className="brand-mark dark">AI BUTTERFLY TOWN</div><h1>你的世界</h1></div>
        <div className="user-area"><span>{me.data?.username}</span><Link to="/dev/ai">AI 工作台</Link><button onClick={async () => { await api.logout(); navigate("/login"); }}>退出</button></div>
      </header>
      <section className="world-grid">
        {worlds.data?.map((world) => (
          <Link className="world-card" key={world.id} to={`/world/${world.id}`}>
            <div className="world-art">
              <span className="sun" /><span className="river" /><span className="house h1" /><span className="house h2" />
              <div className="world-mode">自主运行中</div>
            </div>
            <div className="world-card-body">
              <div><h2>{world.name}</h2><p>{world.description}</p></div>
              <div className="world-stats"><span>{formatTime(world.gameMinute)}</span><span>{world.npcCount} 位居民</span><span>v{world.version}</span></div>
            </div>
          </Link>
        ))}
        <Link className="create-placeholder" to="/worlds/new"><span>＋</span><h3>一句话创建世界</h3><p>描述你的镇子，AI 帮你生成结构与居民。</p></Link>
      </section>
    </main>
  );
}
