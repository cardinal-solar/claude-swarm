import { Command } from 'commander';

export function runCommand() {
  return new Command('run')
    .description('Submit a task to claude-swarm')
    .requiredOption('-p, --prompt <prompt>', 'The prompt for Claude')
    .requiredOption('-k, --api-key <key>', 'Anthropic API key')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .option('-m, --mode <mode>', 'Execution mode (process|container)', 'process')
    .option('--schema <json>', 'JSON Schema for structured output')
    .option('--timeout <ms>', 'Timeout in milliseconds')
    .option('--wait', 'Wait for task completion and print result', false)
    .action(async (opts) => {
      const body: Record<string, unknown> = { prompt: opts.prompt, apiKey: opts.apiKey, mode: opts.mode };
      if (opts.schema) body.schema = JSON.parse(opts.schema);
      if (opts.timeout) body.timeout = parseInt(opts.timeout, 10);

      const res = await fetch(`${opts.server}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) { const err = await res.json() as Record<string, unknown>; console.error('Error:', err); process.exit(1); }

      interface TaskResponse { id: string; status: string; result?: { data: unknown }; error?: unknown; }
      const task = await res.json() as TaskResponse;
      console.log(`Task created: ${task.id}`);
      console.log(`Status: ${task.status}`);

      if (opts.wait) {
        console.log('Waiting for completion...');
        let current: TaskResponse = task;
        while (current.status === 'queued' || current.status === 'running') {
          await new Promise((r) => setTimeout(r, 2000));
          const pollRes = await fetch(`${opts.server}/tasks/${task.id}`);
          current = await pollRes.json() as TaskResponse;
        }
        console.log(`\nFinal status: ${current.status}`);
        if (current.result) console.log('Result:', JSON.stringify(current.result.data, null, 2));
        if (current.error) console.error('Error:', current.error);
      }
    });
}
