import type { Command } from 'commander';

export function registerSessions(program: Command): void {
  const sessionsCmd = program
    .command('sessions')
    .description('Manage chat sessions');

  sessionsCmd
    .command('list')
    .description('List recent sessions')
    .option('-n, --limit <n>', 'Number of sessions to show', '20')
    .action(async (opts: { limit: string }) => {
      const chalk = (await import('chalk')).default;
      const { listSessions } = await import('../../src/storage/sessionStore.js');
      const sessions = listSessions(parseInt(opts.limit, 10));

      if (sessions.length === 0) {
        console.log('\n  No sessions found.\n');
        return;
      }

      console.log(`\n  ${chalk.bold('Recent Sessions')}\n`);
      for (const s of sessions) {
        const title = s.title || chalk.dim('(untitled)');
        const date = chalk.dim(s.updatedAt);
        const msgs = chalk.dim(`${s.messageCount} msgs`);
        console.log(`  ${chalk.cyan(s.id.substring(0, 8))} ${title} ${msgs} ${date}`);
      }
      console.log('');
    });

  sessionsCmd
    .command('search <query>')
    .description('Search messages')
    .action(async (query: string) => {
      const chalk = (await import('chalk')).default;
      const { searchMessages } = await import('../../src/storage/sessionStore.js');
      const results = searchMessages(query);

      if (results.length === 0) {
        console.log(`\n  No results found for "${query}".\n`);
        return;
      }

      console.log(`\n  ${chalk.bold('Search Results')} (${results.length})\n`);
      for (const r of results) {
        const preview = r.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(`  ${chalk.cyan(r.sessionId.substring(0, 8))} ${preview}`);
      }
      console.log('');
    });
}
