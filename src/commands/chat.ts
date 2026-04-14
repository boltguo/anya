import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { Agent } from '../agent/Agent.js';
import { CliAdapter } from '../adapters/cli.js';
import { loadConfig } from '../config/loader.js';
import { isInitialized } from '../lib/paths.js';
import { setLogLevel } from '../lib/logger.js';
import { closeDb } from '../storage/db.js';
import { runInit } from './init.js';
import { createSession } from '../storage/sessionStore.js';

interface ChatOptions {
  query?: string;
  new?: boolean;
}

/**
 * `anya chat` -- Interactive REPL or single-query mode.
 */
export async function runChat(options: ChatOptions): Promise<void> {
  // Auto-init if not yet initialized
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Running setup...\n'));
    await runInit();
    console.log();
  }

  // Load config
  const config = loadConfig();
  setLogLevel(config.advanced.log_level);

  // Check API key
  if (!config.provider.api_key) {
    console.log(chalk.red('Error: Gemini API key not configured.'));
    console.log(chalk.dim('  Run "anya init" or "anya config edit" to set it.'));
    process.exit(1);
  }

  // Create adapter and agent
  const adapter = new CliAdapter();
  const agent = new Agent(config, adapter);

  const sessionKey = 'cli:local';

  // --- Single query mode ---
  if (options.query) {
    try {
      const result = await agent.run(options.query, {
        sessionKey,
        newSession: options.new,
      });
      await adapter.reply(result.content);
    } catch (err) {
      console.error(chalk.red(`\nError: ${(err as Error).message}`));
      process.exit(1);
    } finally {
      closeDb();
    }
    return;
  }

  // --- REPL mode ---
  console.log(chalk.bold.cyan('\nAnya Chat'));
  console.log(chalk.dim('  Type a message to start. Ctrl+C to exit.\n'));

  // Create new session if --new flag
  let sessionId: string | undefined;
  if (options.new) {
    sessionId = createSession(sessionKey);
    console.log(chalk.dim('  (new session)\n'));
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => {
    rl.question(chalk.bold.blue('You: '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Special commands
      if (trimmed === '/quit' || trimmed === '/exit' || trimmed === '/q') {
        console.log(chalk.dim('\nBye.\n'));
        rl.close();
        closeDb();
        return;
      }

      if (trimmed === '/new') {
        sessionId = createSession(sessionKey);
        console.log(chalk.dim('\n  New session created.\n'));
        prompt();
        return;
      }

      if (trimmed === '/help') {
        console.log(chalk.dim(`
  Commands:
    /new    -- start a new session
    /quit   -- exit (/exit, /q)
    /help   -- show this help
`));
        prompt();
        return;
      }

      try {
        const result = await agent.run(trimmed, {
          sessionKey,
          sessionId,
        });

        // Remember session ID for subsequent messages
        sessionId = result.sessionId;

        await adapter.reply(result.content);
      } catch (err) {
        console.error(chalk.red(`\nError: ${(err as Error).message}\n`));
      }

      prompt();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    console.log(chalk.dim('\nBye.\n'));
    closeDb();
    process.exit(0);
  });

  prompt();
}
