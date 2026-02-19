#!/usr/bin/env tsx
/**
 * Script di prova per eseguire un task su claude-ops.
 *
 * Uso:
 *   1. Avvia il server:  npm run dev
 *   2. In un altro terminale:  tsx scripts/test-task.ts
 *
 * Variabili d'ambiente:
 *   BASE_URL        - URL del server (default: http://localhost:3000)
 *   ANTHROPIC_API_KEY - API key Anthropic (obbligatoria)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Errore: ANTHROPIC_API_KEY non impostata.');
  console.error('Uso: ANTHROPIC_API_KEY=sk-... tsx scripts/test-task.ts');
  process.exit(1);
}

async function main() {
  // 1. Health check
  console.log(`\n→ Health check su ${BASE_URL}/api/health ...`);
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
  console.log('  OK:', health);

  // 2. Crea un task di prova
  const promptArg = process.argv[2];
  const payload = {
    prompt: promptArg || 'Rispondi con una sola frase: qual è il senso della vita?',
    apiKey: API_KEY,
    mode: 'process' as const,
    tags: { source: 'test-script' },
  };

  console.log('\n→ Creazione task ...');
  const createRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    console.error('Errore nella creazione:', err);
    process.exit(1);
  }

  const task = await createRes.json();
  console.log(`  Task creato: ${task.id}  (status: ${task.status})`);

  // 3. Polling fino a completamento
  console.log('\n→ Attendo completamento ...');
  const POLL_INTERVAL = 2000;
  const MAX_WAIT = 15 * 60 * 1000; // 15 minuti
  const start = Date.now();

  let current = task;
  while (current.status === 'queued' || current.status === 'running') {
    if (Date.now() - start > MAX_WAIT) {
      console.error('Timeout: il task non si è completato in 5 minuti.');
      process.exit(1);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stdout.write(`\r  [${elapsed}s] status: ${current.status} ...`);

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    current = await fetch(`${BASE_URL}/api/tasks/${task.id}`).then((r) => r.json());
  }

  // 4. Risultato
  console.log(`\n\n→ Task completato!`);
  console.log(`  Status:   ${current.status}`);
  console.log(`  Durata:   ${current.duration ? `${(current.duration / 1000).toFixed(1)}s` : 'n/a'}`);

  if (current.result) {
    console.log('  Risultato:', JSON.stringify(current.result, null, 2));
  }
  if (current.error) {
    console.error('  Errore:', current.error);
  }

  // 5. Controlla artifacts
  console.log('\n→ Controllo artifacts ...');
  const artifacts = await fetch(`${BASE_URL}/api/tasks/${task.id}/artifacts`).then((r) => r.json());
  if (artifacts.length > 0) {
    console.log(`  Trovati ${artifacts.length} artifact(s):`);
    for (const a of artifacts) {
      console.log(`    - ${a.name} (${a.size} bytes)`);
      console.log(`      Download: ${BASE_URL}/api/tasks/${task.id}/artifacts/${a.path}`);
    }
  } else {
    console.log('  Nessun artifact trovato nel workspace.');
  }

  // 6. Lista task con tag 'test-script'
  console.log('\n→ Lista task recenti ...');
  const tasks = await fetch(`${BASE_URL}/api/tasks`).then((r) => r.json());
  const testTasks = tasks.filter((t: any) => t.tags?.source === 'test-script');
  console.log(`  Trovati ${testTasks.length} task di test su ${tasks.length} totali.\n`);
}

main().catch((err) => {
  console.error('Errore fatale:', err.message);
  process.exit(1);
});
