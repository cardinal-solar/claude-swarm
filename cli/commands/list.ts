import { Command } from 'commander';

export function listCommand() {
  return new Command('list')
    .description('List tasks')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .option('--status <status>', 'Filter by status')
    .action(async (opts) => {
      const url = new URL(`${opts.server}/tasks`);
      if (opts.status) url.searchParams.set('status', opts.status);
      const res = await fetch(url.toString());
      const tasks = await res.json() as Array<{ id: string; status: string; prompt: string; duration?: number }>;
      if (tasks.length === 0) { console.log('No tasks found.'); return; }
      for (const task of tasks) {
        const dur = task.duration ? ` (${task.duration}ms)` : '';
        console.log(`${task.id}  ${task.status.padEnd(10)}  ${task.prompt.slice(0, 50)}${dur}`);
      }
    });
}
