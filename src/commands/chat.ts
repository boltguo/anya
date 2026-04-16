/**
 * @module commands/chat
 * @description One-shot chat: send a single message, print response, exit.
 */

import { Agent } from '../agent/Agent.js';
import { loadConfig } from '../config/loader.js';
import { registerAllTools } from '../tools/registry.js';
import type { Adapter } from '../agent/types.js';

/** Minimal adapter that just prints output to console. */
class CliAdapter implements Adapter {
  readonly platform = 'cli' as const;

  async reply(content: string): Promise<void> {
    console.log('\n🤖', content);
  }

  async requestApproval(_description: string): Promise<'allow' | 'deny' | 'always'> {
    return 'allow';
  }
}

export async function runChat(message: string): Promise<void> {
  const config = loadConfig();
  registerAllTools();

  const adapter = new CliAdapter();
  const agent = new Agent(config, adapter);

  console.log(`📤 Sending: "${message}"`);

  const result = await agent.run(message, {
    sessionKey: `cli:${Date.now()}`,
    newSession: true,
  });

  if (!result.content) {
    console.log('❌ No response');
    process.exit(1);
  }

  console.log('\n✅ Done');
  process.exit(0);
}
