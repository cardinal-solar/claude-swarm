import { Scheduler } from '../scheduler/scheduler';
import type { SchedulerStatus } from '../shared/types';

export class HealthService {
  constructor(private scheduler: Scheduler) {}

  getHealth(): { status: 'ok'; scheduler: SchedulerStatus; uptime: number } {
    return {
      status: 'ok',
      scheduler: this.scheduler.getStatus(),
      uptime: process.uptime(),
    };
  }
}
