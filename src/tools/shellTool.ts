/**
 * @module tools/shellTool
 * @description Shell command execution tool with approval flow.
 *
 * Commands are checked against the config allowlist before execution.
 * Commands not in the allowlist require interactive user approval;
 * the "always" option adds the command prefix to the permanent allowlist.
 *
 * Uses `execFile` (not `exec`) to avoid shell injection vulnerabilities.
 */

import { execFile } from 'node:child_process';
import { register } from './registry.js';
import { isCommandAllowed } from '../lib/approval.js';
import { persistConfig } from '../config/loader.js';
import type { ToolContext } from '../agent/types.js';

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
      const allowed = isCommandAllowed(command, context.config);

      if (!allowed) {
        const result = await context.adapter.requestApproval(
          `Agent wants to execute shell command:\n  $ ${command}`
        );

        if (result === 'deny') {
          return 'Command denied by user.';
        }

        if (result === 'always') {
          // Add the command prefix to the allowlist and persist across restarts.
          const prefix = command.split(' ')[0];
          if (!shellConfig.approval_allowlist.includes(prefix)) {
            shellConfig.approval_allowlist.push(prefix);
            persistConfig(context.config);
          }
        }
      }
    }

    // Resolve working directory
    let cwd = String(args.working_directory || shellConfig.working_directory || '~');
    cwd = cwd.replace(/^~/, process.env.HOME || '');

    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile('/bin/sh', ['-c', command], {
          cwd,
          encoding: 'utf-8',
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        }, (err, stdout, stderr) => {
          if (err) {
            reject(Object.assign(err, { stdout, stderr }));
          } else {
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
          }
        });
      });

      const output = (stdout + (stderr ? '\n' + stderr : '')).trim();
      if (!output) {
        return '(command completed with no output)';
      }

      if (output.length > 10_000) {
        return output.substring(0, 10_000) + '\n\n... (output truncated, total ' + output.length + ' chars)';
      }

      return output;
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      const parts: string[] = [];

      if (error.code !== undefined) {
        parts.push(`Exit code: ${error.code}`);
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
