import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login(username, password);
      navigate("/");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand-mark">AI TOWN / 01</div>
        <h1>让一座小镇<br />自己生活。</h1>
        <p>观察五位性格不同的居民如何规划、行动、相遇，并在玩家介入后改变彼此的世界。</p>
        <div className="story-status"><span />栖溪镇正在运行 · 随时可玩</div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="eyebrow">WELCOME BACK</div>
          <h2>进入观察站</h2>
          <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "正在进入…" : "进入观察站"}</button>
        </form>
      </section>
    </main>
  );
}

