import type { Executor, ExecuteParams } from '../executors/executor.interface';
import type { ExecutorResult, SchedulerStatus } from '../shared/types';

interface QueuedTask {
  taskId: string;
  params: ExecuteParams;
  executor: Executor;
  onComplete: (taskId: string, result: ExecutorResult) => void;
}

export class Scheduler {
  private queue: QueuedTask[] = [];
  private running = new Map<string, { executor: Executor }>();
  private maxConcurrency: number;

  constructor(opts: { maxConcurrency: number }) {
    this.maxConcurrency = opts.maxConcurrency;
  }

  enqueue(task: QueuedTask): void {
    if (this.running.size < this.maxConcurrency) {
      this.run(task);
    } else {
      this.queue.push(task);
    }
  }

  async cancel(taskId: string): Promise<boolean> {
    const queueIdx = this.queue.findIndex((t) => t.taskId === taskId);
    if (queueIdx !== -1) {
      this.queue.splice(queueIdx, 1);
      return true;
    }
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      await runningTask.executor.cancel(taskId);
      this.running.delete(taskId);
      this.drainQueue();
      return true;
    }
    return false;
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.running.size,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
    };
  }

  private run(task: QueuedTask): void {
    this.running.set(task.taskId, { executor: task.executor });
    task.executor.execute(task.params).then(
      (result) => {
        this.running.delete(task.taskId);
        task.onComplete(task.taskId, result);
        this.drainQueue();
      },
      (err) => {
        this.running.delete(task.taskId);
        task.onComplete(task.taskId, {
          success: false,
          logs: (err as Error).message,
          artifacts: [],
          duration: 0,
          error: { code: 'SCHEDULER_ERROR', message: (err as Error).message },
        });
        this.drainQueue();
      },
    );
  }

  private drainQueue(): void {
    while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.run(next);
    }
  }
}
