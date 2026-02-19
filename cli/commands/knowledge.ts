import { Command } from 'commander';

export function knowledgeCommand(program: Command) {
  const knowledge = program
    .command('knowledge')
    .description('Manage knowledge entries');

  knowledge
    .command('list')
    .description('List knowledge entries')
    .option('--server <url>', 'Server URL', 'http://localhost:3000')
    .option('--status <status>', 'Filter by status')
    .option('--sort <sort>', 'Sort by (rating, date, title)', 'rating')
    .action(async (opts) => {
      const res = await fetch(`${opts.server}/api/knowledge?${new URLSearchParams({
        ...(opts.status ? { status: opts.status } : {}),
        sort: opts.sort,
      })}`);
      if (!res.ok) {
        console.error(`Error: ${res.statusText}`);
        process.exit(1);
      }
      const body = await res.json() as { data: Array<{ id: string; avgRating: number; tags: string[]; description: string; status: string; source: string }> };
      if (body.data.length === 0) {
        console.log('No knowledge entries found.');
        return;
      }
      console.log(`Found ${body.data.length} entries:\n`);
      for (const entry of body.data) {
        const rating = entry.avgRating > 0 ? ` ★${entry.avgRating.toFixed(1)}` : '';
        const tags = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
        console.log(`  ${entry.id}${rating}${tags}`);
        console.log(`    ${entry.description}`);
        console.log(`    Status: ${entry.status} | Source: ${entry.source}`);
        console.log('');
      }
    });

  knowledge
    .command('show <id>')
    .description('Show knowledge entry details')
    .option('--server <url>', 'Server URL', 'http://localhost:3000')
    .action(async (id, opts) => {
      const res = await fetch(`${opts.server}/api/knowledge/${encodeURIComponent(id)}`);
      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Knowledge entry not found: ${id}`);
        } else {
          console.error(`Error: ${res.statusText}`);
        }
        process.exit(1);
      }
      const entry = await res.json() as {
        id: string; title: string; description: string; category?: string;
        tags: string[]; status: string; source: string; avgRating: number;
        voteCount: number; createdAt: string; originTaskId?: string;
      };
      console.log(`ID:          ${entry.id}`);
      console.log(`Title:       ${entry.title}`);
      console.log(`Description: ${entry.description}`);
      console.log(`Category:    ${entry.category || '-'}`);
      console.log(`Tags:        ${entry.tags.join(', ') || '-'}`);
      console.log(`Status:      ${entry.status}`);
      console.log(`Source:      ${entry.source}`);
      console.log(`Rating:      ${entry.avgRating > 0 ? `★${entry.avgRating.toFixed(1)} (${entry.voteCount} votes)` : 'No ratings'}`);
      console.log(`Created:     ${entry.createdAt}`);
      if (entry.originTaskId) {
        console.log(`Origin Task: ${entry.originTaskId}`);
      }
    });
}
