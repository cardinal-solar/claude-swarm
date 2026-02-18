import { Command } from 'commander';

export function statusCommand() {
  return new Command('status')
    .description('Get task status')
    .argument('<id>', 'Task ID')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .action(async (id, opts) => {
      const res = await fetch(`${opts.server}/tasks/${id}`);
      if (!res.ok) { console.error('Task not found'); process.exit(1); }
      console.log(JSON.stringify(await res.json(), null, 2));
    });
}
