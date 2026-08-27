import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./NewWorldPage.css";

/**
 * NewWorldApi 契约 —— 由主线 A 接线时替换为 services/api 中的真实方法
 * (POST /worlds 或 POST /generation/jobs、GET /generation/jobs/:id)。
 * 本组件只依赖注入的 api 实例,自身不发起任何运行时请求。
 */
export interface CreateWorldRequest {
  prompt: string;
  population: number;
  style: string;
}

/** 六个阶段与技术方案 §6.4 生成作业保持一致(道路由 WorldGenerator 提供)。 */
export const GENERATION_STAGES = [
  "STRUCTURE",
  "VALIDATE_STRUCTURE",
  "GENERATE_ART",
  "VISION_REVIEW",
  "PATH_TEST",
  "ASSEMBLE",
] as const;

export type GenerationStage = (typeof GENERATION_STAGES)[number];

export interface GenerationJob {
  id: string;
  worldId: string | null;
  status: "queued" | "running" | "success" | "failed";
  /** 当前阶段下标(0..5);成功后等于 GENERATION_STAGES.length,进度=100% */
  stageIndex: number;
  error: string | null;
  createdAt: string;
}

export interface NewWorldApi {
  createWorld(request: CreateWorldRequest): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
}

export interface NewWorldPageProps {
  api?: NewWorldApi;
}

export const STYLE_OPTIONS = [
  { value: "qixi_pixel", label: "栖溪像素 · 默认" },
  { value: "ink_wash", label: "水墨淡彩" },
  { value: "handdrawn", label: "手绘暖调" },
] as const;

/** 本地预览用模拟实现:createWorld 返回排队中,getJob 每轮推进一个阶段。*/
export const mockApi: NewWorldApi = {
  async createWorld(request: CreateWorldRequest): Promise<GenerationJob> {
    return {
      id: `job_mock_${Date.now().toString(36)}`,
      worldId: null,
      status: "queued",
      stageIndex: 0,
      error: null,
      createdAt: new Date().toISOString(),
    };
  },
  async getJob(jobId: string): Promise<GenerationJob> {
    const step = Math.floor(performance.now() / 1200);
    const stageIndex = step % (GENERATION_STAGES.length + 1);
    const done = stageIndex >= GENERATION_STAGES.length;
    return {
      id: jobId,
      worldId: done ? "world_mock_qixi" : null,
      status: done ? "success" : stageIndex === 2 ? "running" : "queued",
      stageIndex: Math.min(stageIndex, GENERATION_STAGES.length),
      error: null,
      createdAt: new Date().toISOString(),
    };
  },
};

const POPULATION_PRESETS = [3, 5, 8, 12, 20] as const;

export function NewWorldPage(props: NewWorldPageProps) {
  const api: NewWorldApi = props.api ?? mockApi;

  const [prompt, setPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [population, setPopulation] = useState(5);
  const [style, setStyle] = useState<string>(STYLE_OPTIONS[0].value);

  const [job, setJob] = useState<GenerationJob | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCreate = async () => {
    if (!prompt.trim()) return;
    const request: CreateWorldRequest = { prompt: prompt.trim(), population, style };
    setCreating(true);
    setError(null);
    setJob(null);
    try {
      setJob(await api.createWorld(request));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.getJob(job.id);
        setJob(next);
        if (next.status === "success" || next.status === "failed") {
          setCreating(false);
          clearInterval(timer);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setCreating(false);
        clearInterval(timer);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [job, api]);

  const progress = job === null
    ? 0
    : job.status === "success"
      ? 100
      : Math.round((job.stageIndex / GENERATION_STAGES.length) * 100);

  const canSubmit = prompt.trim().length > 0 && !creating;

  return (
    <main className="new-world">
      <header className="new-world-header">
        <div className="brand-mark dark">AI BUTTERFLY TOWN</div>
        <h1>一句话创建世界</h1>
        <p className="new-world-sub">M7 组件 · 未接线预览(演示数据来自内置 mockApi)</p>
      </header>

      <section className="new-world-form">
        <label className="new-world-label" htmlFor="new-world-prompt">描述你想要的镇子</label>
        <textarea
          id="new-world-prompt"
          className="new-world-prompt"
          placeholder="示例:河边的客家小镇,有咖啡馆和市集,居民爱下棋……"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
        />
        <div className="new-world-count">{prompt.length}/240 字</div>

        <button className="new-world-toggle" onClick={() => setAdvancedOpen((open) => !open)}>
          {advancedOpen ? "收起高级设置 ▴" : "高级设置 ▾"}
        </button>

        {advancedOpen && (
          <div className="new-world-advanced">
            <label className="new-world-label">人口规模</label>
            <div className="new-world-population">
              {POPULATION_PRESETS.map((count) => (
                <button
                  key={count}
                  className={population === count ? "active" : ""}
                  onClick={() => setPopulation(count)}
                >
                  {count} 人{count === 5 ? "(默认)" : ""}
                </button>
              ))}
            </div>
            <label className="new-world-label">美术风格</label>
            <div className="new-world-styles">
              {STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={style === option.value ? "active" : ""}
                  onClick={() => setStyle(option.value)}
                  title={option.label}
                >
                  {option.label.split(" · ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="new-world-error">创建失败:{error}</p>}

        <button
          className="new-world-create"
          disabled={!canSubmit}
          onClick={() => { void startCreate(); }}
        >
          {creating ? "正在生成结构…" : "开始创建"}
        </button>
      </section>

      {job && (
        <section className="new-world-progress">
          <div className="new-world-progress-head">
            <span>作业 {job.id}</span>
            <span>{job.status === "success" ? "完成" : job.status === "failed" ? "失败" : `${progress}%`}</span>
          </div>
          <div className="new-world-bar">
            <div className="new-world-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <ol className="new-world-stages">
            {GENERATION_STAGES.map((stage, index) => {
              const done = job.status === "success" || job.stageIndex > index;
              const active = job.status !== "success" && job.stageIndex === index;
              return (
                <li key={stage} className={done ? "done" : active ? "active" : ""}>
                  <span className="new-world-stage-dot" />
                  {stage.replace(/_/g, " ")}
                </li>
              );
            })}
          </ol>

          {job.status === "failed" && (
            <p className="new-world-error">失败原因:{job.error ?? "未知错误"}(依技术方案 §6.4,视觉失败会自动降级,不阻塞结构世界)</p>
          )}
          {job.status === "failed" && (
            <button className="new-world-create" onClick={() => { void startCreate(); }}>
              重试
            </button>
          )}

          {job.status === "success" && job.worldId && (
            <div className="new-world-success">
              <p>世界已就绪({job.worldId})</p>
              <Link className="new-world-enter" to={`/world/${job.worldId}`}>进入世界 →</Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default NewWorldPage;
