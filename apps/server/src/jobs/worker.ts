/**
 * 进程内后台作业 Worker(D63):
 * 轮询 claim(带租约,过期可重试)→ 按 kind 分发执行 → 进度热更新 → 成功/失败落库。
 * 配合快照/世界创建(M6 跳时 / M7 生成)复用;进程重启后可继续领取未完成作业。
 */
import type { Job, Job as JobType } from "@ai-town/shared";
import type { TownRepository } from "../db/repository.js";

export interface JobProgressReporter {
  (stageIndex: number, stageLabel: string, progressPercent: number, note?: string): void;
}

export type JobHandler = (job: JobType, report: JobProgressReporter) => Promise<Record<string, unknown>>;

export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: TownRepository,
    private readonly handlers: Record<string, JobHandler>,
    private readonly pollMs = 400,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref?.();
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const job = this.repository.claimJob();
      if (!job) return;
      const handler = this.handlers[job.kind];
      if (!handler) {
        this.repository.failJob(job.id, `UNKNOWN_JOB_KIND:${job.kind}`);
        return;
      }
      const heartbeat = setInterval(() => this.touchLease(job.id), 20_000);
      try {
        const result = await handler(job, (stageIndex, stageLabel, progressPercent, note) => {
          this.repository.updateJobProgress(job.id, { stageIndex, stageLabel, progressPercent, note });
        });
        this.repository.completeJob(job.id, result);
      } catch (error) {
        this.repository.failJob(job.id, error instanceof Error ? error.message : String(error));
      } finally {
        clearInterval(heartbeat);
      }
    } finally {
      this.running = false;
    }
  }

  private touchLease(jobId: string): void {
    const job = this.repository.getJob(jobId);
    if (job?.status !== "running") return;
    this.repository.renewLease(jobId);
  }
}
