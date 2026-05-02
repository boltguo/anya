/**
 * @module adapters/feishu/SessionAdapter
 * @description Per-request Feishu adapter implementing the {@link Adapter} interface.
 */

import * as lark from '@larksuiteoapi/node-sdk';
import PQueue from 'p-queue';
import type { Adapter } from '../../agent/types.js';
import { agentLogger } from '../../lib/logger.js';
import type { PendingApproval, PendingChoice } from './types.js';

export class FeishuSessionAdapter implements Adapter {
  readonly platform = 'telegram' as const; // Keep 'telegram' as platform for backwards compatibility with Agent logic for now, or change if needed. Actually we should make it 'feishu' and update agent types if it strictly checks 'telegram'. But agent might not care. Let's use 'telegram' for now to avoid breaking existing skills.

  private client: lark.Client;
  private chatId: string; // Feishu open_chat_id or open_id
  private messageId?: string; // Reply-to message ID

  private pendingApprovals: Map<string, PendingApproval>;
  private pendingChoices: Map<string, PendingChoice>;

  // ALL API calls go through this single queue.
  private outboundQueue = new PQueue({ concurrency: 1 });

  private hasSentContent = false;
  private statusMessageId?: string;
  private statusText = '🤔 Thinking...';

  constructor(
    client: lark.Client,
    chatId: string,
    messageId: string | undefined,
    pendingApprovals: Map<string, PendingApproval>,
    pendingChoices: Map<string, PendingChoice>,
  ) {
    this.client = client;
    this.chatId = chatId;
    this.messageId = messageId;
    this.pendingApprovals = pendingApprovals;
    this.pendingChoices = pendingChoices;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.outboundQueue.add(fn, { priority: 0 }) as Promise<T>;
  }

  private buildFeishuCard(content: string, replyMarkup?: Record<string, string>) {
    const elements: any[] = [];
    const spoilerRegex = /<tg-spoiler>([\s\S]*?)<\/tg-spoiler>/g;
    let lastIndex = 0;
    let match;

    while ((match = spoilerRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const text = content.substring(lastIndex, match.index).trim();
        if (text) elements.push({ tag: 'markdown', content: text });
      }
      elements.push({
        tag: 'markdown',
        content: `> **[Hidden Content / 隐藏内容]**\n> \n> ${match[1].trim().split('\\n').join('\\n> ')}`
      });
      lastIndex = spoilerRegex.lastIndex;
    }

    const remaining = content.substring(lastIndex).trim();
    if (remaining) elements.push({ tag: 'markdown', content: remaining });

    if (replyMarkup && Object.keys(replyMarkup).length > 0) {
      const actions = Object.entries(replyMarkup).map(([label, data]) => ({
        tag: 'button',
        text: { tag: 'plain_text', content: label },
        type: 'default',
        value: { data }
      }));
      elements.push({ tag: 'action', actions });
    }

    return { 
      config: { wide_screen_mode: true },
      elements
    };
  }

  async reply(content: string): Promise<void> {
    await this.outboundQueue.onIdle();

    if (!this.hasSentContent && content) {
      let parsedContent = content;
      const replyMarkup: Record<string, string> = {};

      // Extract inline buttons formatted as [label|data] anywhere in the text
      const extractedButtons = [...parsedContent.matchAll(/\[([^\]]+)\|([^\]]+)\]/g)];
      if (extractedButtons.length > 0) {
        for (const match of extractedButtons) {
          replyMarkup[match[1].trim()] = match[2].trim();
        }
        parsedContent = parsedContent
          .replace(/\[([^\]]+)\|([^\]]+)\]/g, '')
          .replace(/^[\s*-]+$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      if (!parsedContent && Object.keys(replyMarkup).length > 0) {
        parsedContent = '👇';
      }

      const card = this.buildFeishuCard(parsedContent, replyMarkup);

      if (this.statusMessageId) {
        // Reuse the status message by patching it with the final card
        await this.client.im.message.patch({
          path: { message_id: this.statusMessageId },
          data: { content: JSON.stringify(card) }
        }).catch(err => {
          agentLogger.error({ msg: 'feishu_reply_patch_error', error: err?.message || err });
        });
        // Consume the status message
        this.statusMessageId = undefined;
      } else {
        await this.client.im.message.reply({
          path: { message_id: this.messageId || '' },
          data: {
            content: JSON.stringify(card),
            msg_type: 'interactive'
          }
        }).catch(err => {
          agentLogger.error({ msg: 'feishu_reply_create_error', error: err?.message || err });
        });
      }
      this.hasSentContent = true;
    }
  }

  async sendThinking(): Promise<void> {
    this.statusText = '🤔 Thinking...';
    const card = {
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content: this.statusText }]
    };
    const res = await this.client.im.message.reply({
      path: { message_id: this.messageId || '' },
      data: {
        content: JSON.stringify(card),
        msg_type: 'interactive'
      }
    }).catch(() => null);
    
    const msgId = (res as any)?.message_id || res?.data?.message_id;
    if (msgId) {
      this.statusMessageId = msgId;
    }
  }

  showToolCall(toolName: string, _args: Record<string, unknown>): void {
    this.statusText = `⚙️ ${toolName}...`;
    this.enqueue(() => this.flushStatus());
  }

  showToolResult(_toolName: string, _result: string, _isError: boolean): void {
    this.statusText = '🤔 Thinking...';
    this.enqueue(() => this.flushStatus());
  }

  private async flushStatus(): Promise<void> {
    if (!this.statusMessageId) return;
    const card = {
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content: this.statusText }]
    };
    await this.client.im.message.patch({
      path: { message_id: this.statusMessageId },
      data: {
        content: JSON.stringify(card)
      }
    }).catch(() => {});
  }

  async cleanupStatus(): Promise<void> {
    // If the status message wasn't consumed by reply(), we just leave it as is 
    // or update it to "Done" to avoid Feishu's annoying "recalled message" tombstones.
    if (this.statusMessageId && !this.hasSentContent) {
      const card = {
        config: { wide_screen_mode: true },
        elements: [{ tag: 'markdown', content: '✨ Done' }]
      };
      await this.client.im.message.patch({
        path: { message_id: this.statusMessageId },
        data: { content: JSON.stringify(card) }
      }).catch(() => {});
    }
    this.statusMessageId = undefined;
  }

  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    const approvalId = `approval_${Date.now()}`;
    
    const card = {
      config: { wide_screen_mode: true },
      header: { template: 'orange', title: { tag: 'plain_text', content: 'Approval Required' } },
      elements: [
        { tag: 'markdown', content: `🔐 **Approval Required**\n\n${description}` },
        {
          tag: 'action',
          actions: [
            { tag: 'button', text: { tag: 'plain_text', content: '✅ Allow' }, type: 'primary', value: { data: `${approvalId}:allow` } },
            { tag: 'button', text: { tag: 'plain_text', content: '❌ Deny' }, type: 'danger', value: { data: `${approvalId}:deny` } },
            { tag: 'button', text: { tag: 'plain_text', content: '🔓 Always' }, type: 'default', value: { data: `${approvalId}:always` } }
          ]
        }
      ]
    };

    await this.enqueue(async () => {
      await this.client.im.message.reply({
        path: { message_id: this.messageId || '' },
        data: { content: JSON.stringify(card), msg_type: 'interactive' }
      });
    });

    return new Promise<'allow' | 'deny' | 'always'>((resolve) => {
      this.pendingApprovals.set(approvalId, { resolve });
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve('deny');
        }
      }, 5 * 60 * 1000);
    });
  }

  async requestChoice(description: string, choices: string[]): Promise<string> {
    const choiceKey = `choice_${Date.now()}`;
    const actions = choices.map((choice, index) => ({
      tag: 'button',
      text: { tag: 'plain_text', content: choice },
      type: 'default',
      value: { data: `${choiceKey}:${index}` }
    }));

    const card = {
      config: { wide_screen_mode: true },
      elements: [
        { tag: 'markdown', content: description },
        { tag: 'action', actions }
      ]
    };

    const res = await this.client.im.message.reply({
      path: { message_id: this.messageId || '' },
      data: { content: JSON.stringify(card), msg_type: 'interactive' }
    });

    return new Promise<string>((resolve) => {
      this.pendingChoices.set(choiceKey, { resolve });
      setTimeout(() => {
        if (this.pendingChoices.has(choiceKey)) {
          this.pendingChoices.delete(choiceKey);
          const msgId = (res as any)?.message_id || res?.data?.message_id;
          if (msgId) {
             this.client.im.message.patch({
               path: { message_id: msgId },
               data: { content: JSON.stringify({
                 elements: [{ tag: 'markdown', content: `${description}\n\n⏱ Timed out` }]
               }) }
             }).catch(() => {});
          }
          resolve('');
        }
      }, 10 * 60 * 1000);
    });
  }

  // ── Native Telegram Capabilities (Stubbed/Implemented for tg tool) ──────

  getUserMessageId(): string | undefined {
    return this.messageId;
  }

  async sendMessage(text: string, opts?: any): Promise<string> {
    await this.reply(text);
    return 'fake-msg-id';
  }

  async sendAudio(audio: string, caption?: string, opts?: any): Promise<string> {
    // Treat audio as voice for now
    return this.sendVoice(audio, opts);
  }

  async sendVoice(voicePath: string, opts?: any): Promise<string> {
    return this.enqueue(async () => {
      try {
        const fs = await import('node:fs');
        const fileStat = fs.statSync(voicePath);
        
        const uploadRes = await this.client.im.file.create({
          data: {
            file_type: 'opus',
            file_name: 'voice.opus',
            file: fs.createReadStream(voicePath) as any,
          }
        });
        
        const fileKey = (uploadRes as any).file_key || uploadRes.data?.file_key;
        if (!fileKey) throw new Error('Upload to Feishu failed: ' + JSON.stringify(uploadRes));

        // 2. Send audio message
        const replyTo = opts?.replyTo || this.messageId;
        const msgRes = await this.client.im.message.reply({
          path: { message_id: replyTo || '' },
          data: {
            msg_type: 'audio',
            content: JSON.stringify({ file_key: fileKey })
          }
        });
        
        const msgId = (msgRes as any).message_id || msgRes.data?.message_id;
        agentLogger.info({ msg: 'feishu_voice_sent', path: voicePath, msgId });
        return msgId || 'sent';
      } catch (err: any) {
        agentLogger.error({ msg: 'feishu_sendVoice_error', error: err.message || err });
        return 'error';
      }
    });
  }

  async sendKeyboard(text: string, buttons: string[][], opts?: any): Promise<string> {
    return this.enqueue(async () => {
      const actions = buttons.flatMap(row => row.map(btn => {
        const parts = btn.split('|', 2);
        return {
          tag: 'button',
          text: { tag: 'plain_text', content: parts[0] },
          type: 'default',
          value: { data: parts.length > 1 ? parts[1] : parts[0] }
        };
      }));

      const card = {
        config: { wide_screen_mode: true },
        elements: [
          { tag: 'markdown', content: text },
          { tag: 'action', actions }
        ]
      };

      const res = await this.client.im.message.reply({
        path: { message_id: this.messageId || '' },
        data: { content: JSON.stringify(card), msg_type: 'interactive' }
      });
      return res.data?.message_id || 'sent';
    });
  }

  async sendQuiz(question: string, options: string[], correctIndex: number, explanation?: string): Promise<any> {
    // Stub quiz as simple text
    await this.reply(`Quiz: ${question}\n${options.map((o,i) => `${i+1}. ${o}`).join('\n')}`);
    return { messageId: 'quiz', pollId: 'poll' };
  }

  async sendForceReply(text: string, opts?: any): Promise<string> {
    await this.reply(text);
    return 'fake-msg-id';
  }

  async editMessage(messageId: string, text: string, buttons?: string[][]): Promise<void> {
    // Stub
  }

  async sendChatAction(action: string = 'typing'): Promise<void> {
    // Not supported by open Feishu easily
  }

  async sendDocument(fileUrl: string, opts: any = {}): Promise<string | null> {
    await this.reply(`[Document] ${fileUrl}`);
    return 'doc';
  }

  async deleteMsg(messageId: string): Promise<boolean> {
    return true;
  }

  async react(messageId: string, emoji: string): Promise<void> {
    // Stub
  }
}
