import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { BaseAdapter } from './base.js';
import type { ApprovalResult } from '../lib/approval.js';

/**
 * CLI adapter for terminal REPL interaction.
 * Handles colorized output and interactive approval prompts.
 */
export class CliAdapter extends BaseAdapter {
  /**
   * Display the agent's response to the user.
   */
  async reply(content: string): Promise<void> {
    console.log();
    console.log(chalk.green(content));
    console.log();
  }

  /**
   * Show a tool call in progress.
   */
  showToolCall(toolName: string, args: Record<string, unknown>): void {
    const argsStr = Object.entries(args)
      .map(([k, v]) => {
        const vStr = typeof v === 'string' && v.length > 80
          ? v.substring(0, 80) + '...'
          : JSON.stringify(v);
        return `${k}=${vStr}`;
      })
      .join(', ');

    console.log(chalk.yellow(`  [tool] ${toolName}(${argsStr})`));
  }

  /**
   * Show a tool's result.
   */
  showToolResult(toolName: string, result: string, isError: boolean): void {
    if (isError) {
      console.log(chalk.red(`  [fail] ${toolName}: ${truncate(result, 200)}`));
    } else {
      const preview = truncate(result, 200);
      console.log(chalk.dim(`  [done] ${toolName}: ${preview}`));
    }
  }

  /**
   * Request user approval for a sensitive operation.
   */
  async requestApproval(description: string): Promise<ApprovalResult> {
    console.log();
    console.log(chalk.yellow.bold('Approval Required'));
    console.log(chalk.yellow(description));
    console.log();

    try {
      const answer = await select({
        message: 'Allow this action?',
        choices: [
          { name: 'Allow', value: 'allow' as const },
          { name: 'Deny', value: 'deny' as const },
          { name: 'Always allow (add to allowlist)', value: 'always' as const },
        ],
        default: 'deny',
      });

      return answer;
    } catch {
      // User pressed Ctrl+C during approval
      return 'deny';
    }
  }
}

/**
 * Truncate a string with ellipsis.
 */
function truncate(str: string, maxLen: number): string {
  // Replace newlines with spaces for single-line display
  const oneLine = str.replace(/\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.substring(0, maxLen) + '...';
}
