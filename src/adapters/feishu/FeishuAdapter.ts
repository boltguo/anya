/**
 * @module adapters/feishu/FeishuAdapter
 * @description Top-level Feishu bot manager.
 */

import * as lark from '@larksuiteoapi/node-sdk';
import { Agent, type RunResult } from '../../agent/Agent.js';
import { registerAllTools } from '../../tools/registry.js';
import { agentLogger } from '../../lib/logger.js';
import { createSession } from '../../storage/sessionStore.js';
import type { AnyaConfig } from '../../config/defaults.js';
import { FeishuSessionAdapter } from './SessionAdapter.js';
import type { PendingApproval, PendingChoice } from './types.js';

export class FeishuAdapter {
  private config: AnyaConfig;
  private client: lark.Client;
  private wsClient?: lark.WSClient;
  
  private pendingApprovals = new Map<string, PendingApproval>();
  private pendingChoices = new Map<string, PendingChoice>();
  private chatQueue = new Map<string, Promise<void>>();

  constructor(config: AnyaConfig) {
    if (!config.feishu.app_id || !config.feishu.app_secret) {
      throw new Error('Feishu app_id or app_secret not configured. Run "anya config edit".');
    }
    this.config = config;
    this.client = new lark.Client({
      appId: config.feishu.app_id,
      appSecret: config.feishu.app_secret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });
  }

  private enqueuePerChat(chatId: string, task: () => Promise<void>): void {
    const prev = this.chatQueue.get(chatId) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      agentLogger.error({ msg: 'feishu_queue_task_error', chatId, error: (err as Error).message });
    });
    this.chatQueue.set(chatId, next);
    next.then(() => {
      if (this.chatQueue.get(chatId) === next) {
        this.chatQueue.delete(chatId);
      }
    });
  }

  private async handleIncomingText(
    chatId: string,
    messageId: string,
    openId: string,
    text: string
  ): Promise<void> {
    const allowedUsers = this.config.feishu.allowed_user_ids || [];
    if (allowedUsers.length > 0 && !allowedUsers.includes(openId)) {
      agentLogger.warn({ msg: 'unauthorized_feishu_user', openId, chatId });
      return;
    }

    const sessionKey = `feishu:${chatId}`;
    agentLogger.info({ msg: 'feishu_incoming', chatId, openId, input: text.substring(0, 200) });

    const sessionAdapter = new FeishuSessionAdapter(
      this.client,
      chatId,
      messageId,
      this.pendingApprovals,
      this.pendingChoices
    );
    const agent = new Agent(this.config, sessionAdapter);

    try {
      await sessionAdapter.sendThinking();
      const result: RunResult = await agent.run(text, { sessionKey });
      if (!result.tgSent && result.content) {
        await sessionAdapter.reply(result.content);
      }
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'feishu_error', chatId, error: error.message });
      await sessionAdapter.reply(`❌ Error: ${error.message}`);
    } finally {
      await sessionAdapter.cleanupStatus();
    }
  }

  async start(): Promise<void> {
    await registerAllTools();
    
    const { loadSkills } = await import('../../skills/loader.js');
    const skills = loadSkills();
    const skillCommandMap = new Map<string, string>();
    for (const skill of skills) {
      if (!skill.command) continue;
      const cmd = skill.name.replace(/[^a-z0-9_]/g, '_').substring(0, 32);
      skillCommandMap.set(`/${cmd}`, skill.name);
    }
    const commandAliases = [
      { cmd: '/practice', skill: 'ielts-router' },
      { cmd: '/init', skill: 'profile-manager' },
    ];
    for (const alias of commandAliases) {
      for (const [existingCmd, existingSkill] of skillCommandMap) {
        if (existingSkill === alias.skill) skillCommandMap.delete(existingCmd);
      }
      skillCommandMap.set(alias.cmd, alias.skill);
    }

    const eventDispatcher = new lark.EventDispatcher({})
      .register({
        'im.message.receive_v1': async (data: any) => {
          const msg = data.message;
          const chatId = msg.chat_id;
          const messageId = msg.message_id;
          const senderId = data.sender.sender_id.open_id;
          const msgType = msg.message_type;

          if (msgType === 'text') {
            const content = JSON.parse(msg.content);
            let text = content.text.trim();
            
            if (text === '/new' || text === '/kill' || text === '/restart' || text === '/start') {
              const sessionKey = `feishu:${chatId}`;
              if (text === '/kill') {
                 this.pendingApprovals.clear();
                 this.pendingChoices.clear();
              }
              await createSession(sessionKey);
              
              const replyText = text === '/kill' ? '💀 Stopped. Session cleared.' : 
                                text === '/restart' ? '🔄 Restarting gateway...' : 
                                '🔄 Fresh start! What\'s on your mind?';
                                
              await this.client.im.message.reply({
                path: { message_id: messageId },
                data: { content: JSON.stringify({ text: replyText }), msg_type: 'text' }
              });

              if (text === '/restart') {
                  const { spawn } = await import('node:child_process');
                  const { openSync } = await import('node:fs');
                  const { LOGS_DIR } = await import('../../lib/paths.js');
                  const path = await import('node:path');
                  const logFd = openSync(path.join(LOGS_DIR, 'gateway.log'), 'a');
                  const anyaBin = process.argv[1];
                  const child = spawn(process.execPath, [anyaBin, 'gateway', 'start', '--foreground'], { detached: true, stdio: ['ignore', logFd, logFd], env: process.env });
                  child.unref();
                  setTimeout(() => process.exit(0), 500);
              }
              return;
            }

            if (skillCommandMap.has(text)) {
              const skillName = skillCommandMap.get(text);
              const sessionKey = `feishu:${chatId}`;
              await createSession(sessionKey);
              text = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
            }

            this.enqueuePerChat(chatId, () => this.handleIncomingText(chatId, messageId, senderId, text));
          } else if (msgType === 'audio') {
            const audioContent = JSON.parse(msg.content);
            const fileKey = audioContent.file_key;
            
            this.enqueuePerChat(chatId, async () => {
              agentLogger.info({ msg: 'feishu_audio', chatId, openId: senderId, fileKey });
              try {
                const tokenRes = await this.client.auth.tenantAccessToken.internal({
                  data: { app_id: this.config.feishu.app_id, app_secret: this.config.feishu.app_secret }
                });
                const token = tokenRes.tenant_access_token;

                const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=file`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buffer = Buffer.from(await res.arrayBuffer());

                const fs = await import('node:fs');
                const path = await import('node:path');
                const { VOICE_DIR } = await import('../../lib/paths.js');
                const { transcribeAudio } = await import('../../lib/stt.js');
                
                const audioPath = path.join(VOICE_DIR, `voice_${Date.now()}.ogg`);
                fs.mkdirSync(VOICE_DIR, { recursive: true });
                fs.writeFileSync(audioPath, buffer);

                const sttResult = await transcribeAudio(audioPath, this.config);

                if (!sttResult.success || !sttResult.transcript) {
                  const errMsg = sttResult.error || 'Could not recognize speech';
                  await this.client.im.message.reply({
                    path: { message_id: messageId },
                    data: { content: JSON.stringify({ text: `🎤 ${errMsg}` }), msg_type: 'text' }
                  });
                  return;
                }

                const input = `[Voice message | audio_path: ${audioPath}]\n"${sttResult.transcript}"`;
                await this.handleIncomingText(chatId, messageId, senderId, input);
              } catch (e) {
                agentLogger.error({ msg: 'feishu_audio_err', err: (e as Error).message });
              }
            });
          }
        }
      })
      .register({
        'card.action.trigger': async (data: any) => {
          const actionData = data.action?.value?.data || data.event?.action?.value?.data;
          const openId = data.operator?.open_id || data.event?.operator?.open_id || data.open_id;
          const openMessageId = data.context?.open_message_id || data.event?.context?.open_message_id || data.open_message_id;
          const chatId = data.context?.open_chat_id || data.event?.context?.open_chat_id || data.open_chat_id;
          
          if (!actionData) {
            agentLogger.warn({ msg: 'feishu_card_action_no_data', data });
            return;
          }

          if (actionData.startsWith('choice_')) {
            const sepIdx = actionData.indexOf(':');
            const choiceId = actionData.substring(0, sepIdx);
            const pending = this.pendingChoices.get(choiceId);
            if (pending) {
              this.pendingChoices.delete(choiceId);
              // We could extract the label here, but for simplicity we return the full actionData
              pending.resolve(actionData.substring(sepIdx + 1));
            }
          } else if (actionData.startsWith('approval_')) {
            const parts = actionData.split(':');
            const approvalId = parts[0];
            const action = parts[1] as 'allow' | 'deny' | 'always';
            const pending = this.pendingApprovals.get(approvalId);
            if (pending) {
              this.pendingApprovals.delete(approvalId);
              pending.resolve(action);
            }
          } else {
            // Treat as standard callback input
            this.enqueuePerChat(chatId, () => this.handleIncomingText(chatId, openMessageId, openId, `[callback] ${actionData}`));
          }
        }
      });

    this.wsClient = new lark.WSClient({
      appId: this.config.feishu.app_id,
      appSecret: this.config.feishu.app_secret,
      logger: {
        debug: (m: any) => agentLogger.debug({ msg: 'lark_ws_debug', info: m }),
        info: (m: any) => agentLogger.info({ msg: 'lark_ws_info', info: m }),
        warn: (m: any) => agentLogger.warn({ msg: 'lark_ws_warn', info: m }),
        error: (m: any) => agentLogger.error({ msg: 'lark_ws_error', info: m }),
        trace: (m: any) => agentLogger.debug({ msg: 'lark_ws_trace', info: m }),
      }
    });

    this.wsClient.start({ eventDispatcher });
    console.log('[gateway] Feishu WebSocket bot starting...');
  }

  stop(): void {
    // Note: lark WSClient currently doesn't expose a public stop method natively, but we can clear handlers or exit.
  }
}
