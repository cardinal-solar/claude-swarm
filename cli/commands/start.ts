import { Command } from 'commander';

export function startCommand() {
  return new Command('start')
    .description('Start the claude-swarm server')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .option('-H, --host <string>', 'Host to bind to', '0.0.0.0')
    .option('--max-concurrency <number>', 'Max concurrent tasks', '5')
    .option('--data-dir <path>', 'Data directory', './data')
    .action((opts) => {
      process.env.PORT = opts.port;
      process.env.HOST = opts.host;
      process.env.MAX_CONCURRENCY = opts.maxConcurrency;
      process.env.DATA_DIR = opts.dataDir;
      require('../../src/index');
    });
}
