/**
 * @module commands/chat
 * @description One-shot chat: send a single message, print response, exit.
 */

import { Agent } from '../agent/Agent.js';
import { loadConfig } from '../config/loader.js';
import { registerAllTools } from '../tools/registry.js';
import type { Adapter, Message } from '../agent/types.js';

/** Minimal adapter that just collects output */
class TestAdapter implements Adapter {
  name = 'test' as const;
  async sendText(text: string): Promise<void> {
    console.log('\n🤖', text);
  }
}

export async function runChat(message: string): Promise<void> {
  const config = await loadConfig();
  await registerAllTools();

  const adapter = new TestAdapter();
  const agent = new Agent(config);

  console.log(`📤 Sending: "${message}"`);

  const result = await agent.run({
    messages: [{ role: 'user', content: message } as Message],
    adapter,
    sessionId: `test-${Date.now()}`,
  });

  if (!result.response) {
    console.log('❌ No response');
    process.exit(1);
  }

  console.log('\n✅ Test passed');
  process.exit(0);
}
