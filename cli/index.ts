#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './commands/start';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';
import { listCommand } from './commands/list';
import { knowledgeCommand } from './commands/knowledge';

const program = new Command();
program.name('claude-ops').description('Claude-Code-as-a-Service CLI').version('0.1.0');
program.addCommand(startCommand());
program.addCommand(runCommand());
program.addCommand(statusCommand());
program.addCommand(listCommand());
knowledgeCommand(program);
program.parse();
