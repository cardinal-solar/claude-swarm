#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';
import { listCommand } from './commands/list';

const program = new Command();
program.name('claude-swarm').description('Claude-Code-as-a-Service CLI').version('0.1.0');
program.addCommand(runCommand());
program.addCommand(statusCommand());
program.addCommand(listCommand());
program.parse();
