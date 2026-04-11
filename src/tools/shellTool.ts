import { execSync } from 'node:child_process';
import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

/**
 * Check if a command matches the approval allowlist.
 * Matches by prefix: if "git" is in the allowlist, "git status" is allowed.
 */
function isInAllowlist(command: string, allowlist: string[]): boolean {
  const trimmed = command.trim();
  return allowlist.some(pattern => {
    if (trimmed === pattern) return true;
    if (trimmed.startsWith(pattern + ' ')) return true;
    return false;
  });
}

// --- shell ---
register({
  name: 'shell',
  description: 'Execute a shell command and return its stdout/stderr. Commands outside the allowlist require user approval.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      working_directory: {
        type: 'string',
        description: 'Working directory for the command (default: ~ or config value)',
      },
    },
    required: ['command'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const command = String(args.command).trim();
    const shellConfig = context.config.tools.shell;

    if (!command) {
      return 'Error: Empty command.';
    }

    // Check if approval is needed
    if (shellConfig.require_approval) {
      const allowed = isInAllowlist(command, shellConfig.approval_allowlist);

      if (!allowed) {
        const result = await context.adapter.requestApproval(
          `Agent wants to execute shell command:\n  $ ${command}`
        );

        if (result === 'deny') {
          return 'Command denied by user.';
        }

        if (result === 'always') {
          // Add the command prefix to the allowlist
          const prefix = command.split(' ')[0];
          if (!shellConfig.approval_allowlist.includes(prefix)) {
            shellConfig.approval_allowlist.push(prefix);
          }
        }
      }
    }

    // Resolve working directory
    let cwd = String(args.working_directory || shellConfig.working_directory || '~');
    cwd = cwd.replace(/^~/, process.env.HOME || '');

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout: 30_000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const trimmed = output.trim();
      if (!trimmed) {
        return '(command completed with no output)';
      }

      // Truncate very long output
      if (trimmed.length > 10_000) {
        return trimmed.substring(0, 10_000) + '\n\n... (output truncated, total ' + trimmed.length + ' chars)';
      }

      return trimmed;
    } catch (err: unknown) {
      const error = err as { status?: number; stdout?: string; stderr?: string; message?: string };
      const parts: string[] = [];

      if (error.status !== undefined) {
        parts.push(`Exit code: ${error.status}`);
      }
      if (error.stderr) {
        parts.push(`stderr: ${error.stderr.trim()}`);
      }
      if (error.stdout) {
        parts.push(`stdout: ${error.stdout.trim()}`);
      }
      if (parts.length === 0) {
        parts.push(`Error: ${error.message || 'Unknown error'}`);
      }

      return parts.join('\n');
    }
  },
});
