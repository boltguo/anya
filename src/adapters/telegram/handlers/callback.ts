// adapters/telegram/handlers/callback.ts — inline button (callback_query) dispatch

import { Agent, type RunResult } from '../../../agent/Agent.js';
import { agentLogger } from '../../../lib/logger.js';
import { newOrReuseEmptySession } from '../../../storage/state/sessions.js';
import { getSkill } from '../../../agent/skills/loader.js';
import { TelegramSessionAdapter } from '../SessionAdapter.js';
import { formatTgError } from '../errors.js';
import { isNavCallback, getNavPage, getMainMenu } from '../skillMenu.js';
import type { TelegramRuntime } from '../runtime.js';

export function registerCallbackHandler(rt: TelegramRuntime): void {
  rt.bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // ACK callback FIRST to dismiss Telegram loading spinner
    await ctx.answerCallbackQuery().catch(() => {});

    if (data.startsWith('choice_')) {
      handleChoice(rt, ctx, data);
      return;
    }

    // Client-side pagination — `page:<messageId>:<pageIndex>` edits in-place, no agent call
    if (data.startsWith('page:')) {
      await handlePage(rt, data);
      return;
    }

    // If source is a menu page, edit-in-place (drill-down feel); otherwise send NEW so the original report stays in history
    if (isNavCallback(data)) {
      await handleNav(rt, ctx, data);
      return;
    }

    if (data === 'menu') {
      const menu = getMainMenu();
      if (menu) {
        await ctx.editMessageText(menu.text, {
          reply_markup: menu.keyboard,
        }).catch(() => {});
      }
      return;
    }

    // Unmatched button clicks route back into the Agent as a new user input
    await handleAgentCallback(rt, ctx, data);
  });
}

async function handleChoice(rt: TelegramRuntime, ctx: any, data: string): Promise<void> {
  const sepIdx = data.indexOf(':');
  const choiceId = data.substring(0, sepIdx);
  const pending = rt.pendingChoices.get(choiceId);
  if (!pending) return;

  rt.pendingChoices.delete(choiceId);

  const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
  let selectedText = '';
  if (inlineKeyboard) {
    for (const row of inlineKeyboard) {
      for (const btn of row) {
        if ('callback_data' in btn && btn.callback_data === data) {
          selectedText = btn.text;
        }
      }
    }
  }

  pending.resolve(selectedText);
  await ctx.editMessageText(
    ctx.callbackQuery.message?.text + `\n\n-> ${selectedText || 'Selected'}`
  ).catch(() => {});
}

async function handlePage(rt: TelegramRuntime, data: string): Promise<void> {
  const parts = data.split(':');
  const msgId = Number(parts[1]);
  const pageIdx = Number(parts[2]);
  const entry = rt.paginatedMessages.get(msgId);

  if (!entry || pageIdx < 0 || pageIdx >= entry.pages.length) {
    agentLogger.warn({ msg: 'page_unknown', data, hasMsgId: !!entry });
    return;
  }

  const pageCount = entry.pages.length;
  const navRow: Array<{ text: string; cb: string }> = [];
  if (pageIdx > 0) navRow.push({ text: `⬅️ ${pageIdx}/${pageCount}`, cb: `page:${msgId}:${pageIdx - 1}` });
  if (pageIdx < pageCount - 1) navRow.push({ text: `➡️ ${pageIdx + 2}/${pageCount}`, cb: `page:${msgId}:${pageIdx + 1}` });

  let trailingRows: Array<Array<{ text: string; callback_data: string }>> = [];
  try {
    const parsed = JSON.parse(entry.buttons) as string[][];
    trailingRows = parsed.map((row) =>
      row.map((cell) => {
        const [label, cb] = cell.split('|');
        return { text: label, callback_data: cb || label };
      }),
    );
  } catch { /* ignore bad JSON */ }

  const keyboard = {
    inline_keyboard: [
      ...(navRow.length ? [navRow.map((b) => ({ text: b.text, callback_data: b.cb }))] : []),
      ...trailingRows,
    ],
  };

  try {
    await rt.bot.api.editMessageText(entry.chatId, msgId, entry.pages[pageIdx], {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (err) {
    agentLogger.error({ msg: 'page_flip_failed', msgId, pageIdx, error: (err as Error).message });
  }
}

async function handleNav(rt: TelegramRuntime, ctx: any, data: string): Promise<void> {
  const page = getNavPage(data);
  if (!page) {
    agentLogger.warn({ msg: 'tg_nav_unknown_page', data });
    return;
  }

  const chatId = ctx.callbackQuery.message?.chat?.id;
  if (!chatId) return;

  // `nav:main` returns to the training hub — usually after a skill finishes ("练习其他").
  // Treat it like /new: cancel pending approvals + open a fresh session so the next
  // skill click starts clean (no stale tool-call expectations from the prior skill).
  if (data === 'nav:main') {
    rt.cancelPending();
    await newOrReuseEmptySession(`tg:${chatId}`);
  }

  const sourceKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
  const sourceIsMenu = !!sourceKeyboard && sourceKeyboard.every((row: any[]) =>
    row.every((btn: any) => {
      if (!('callback_data' in btn) || !btn.callback_data) return false;
      const cd = btn.callback_data;
      if (cd === 'menu' || cd.startsWith('nav:')) return true;
      if (!/[_:]/.test(cd) && getSkill(cd)) return true;
      return false;
    }),
  );
  agentLogger.info({ msg: 'tg_nav', chatId, data, mode: sourceIsMenu ? 'edit' : 'new' });
  try {
    if (sourceIsMenu) {
      await ctx.editMessageText(page.text, { reply_markup: page.keyboard });
    } else {
      await rt.bot.api.sendMessage(chatId, page.text, { reply_markup: page.keyboard });
    }
  } catch (err) {
    agentLogger.error({ msg: 'tg_nav_render_failed', chatId, data, error: (err as Error).message });
  }
}

async function handleAgentCallback(rt: TelegramRuntime, ctx: any, data: string): Promise<void> {
  const userId = ctx.from?.id;
  const allowedUsers = rt.config.telegram.allowed_user_ids;
  if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
    await ctx.answerCallbackQuery();
    return;
  }

  const inlineKeyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
  let selectedLabel = data;
  if (inlineKeyboard) {
    for (const row of inlineKeyboard) {
      for (const btn of row) {
        if ('callback_data' in btn && btn.callback_data === data) {
          selectedLabel = btn.text;
        }
      }
    }
  }

  const matchedSkill = getSkill(data);
  const isSkillSwitch = !!matchedSkill;

  // Skill-switch must not edit the original message — it may hold menu/evaluation content that needs preserving
  if (!isSkillSwitch) {
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n→ ${selectedLabel}`
    ).catch(() => {});
  }

  const chatId = ctx.callbackQuery.message?.chat?.id;
  if (!chatId) return;

  const sessionKey = `tg:${chatId}`;
  const agentInput = selectedLabel || data;

  agentLogger.info({ msg: 'tg_callback', chatId, userId, data, label: selectedLabel, skillSwitch: isSkillSwitch });
  console.log(`[gateway] callback: ${selectedLabel} (${data})${isSkillSwitch ? ' [skill-switch]' : ''}`);

  // Post thinking status immediately so the click feels responsive
  const statusMsg = await rt.bot.api.sendMessage(chatId, '🧠 Thinking...').catch(() => null);
  if (statusMsg) rt.trackStatus(chatId, statusMsg.message_id);

  rt.enqueuePerChat(chatId, async () => {
    const sessionAdapter = new TelegramSessionAdapter(
      ctx, rt.bot, rt.config, rt.pendingChoices, rt.activePolls, rt.paginatedMessages,
    );
    if (statusMsg) sessionAdapter.attachStatusMessage(statusMsg.message_id);
    const agent = new Agent(rt.config, sessionAdapter);

    try {
      await sessionAdapter.sendThinking();
      const runOpts: Record<string, unknown> = {
        sessionKey,
        turnMeta: {
          trigger: 'callback',
          details: {
            callback_data: data,
            button_label: selectedLabel,
            ...(isSkillSwitch ? { skill: data } : {}),
          },
        },
      };

      // Skill switch → fresh session so old history is truly shed (reuses an empty
      // row from a prior /new tap to avoid leaking yet another empty session).
      if (isSkillSwitch) {
        const newSid = await newOrReuseEmptySession(sessionKey);
        runOpts.sessionId = newSid;
      }

      const result: RunResult = await agent.run(agentInput, runOpts as any);
      if (!result.tgSent && result.content) {
        await sessionAdapter.reply(result.content);
      }
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'tg_callback_error', chatId, error: error.message });
      await rt.bot.api.sendMessage(chatId, formatTgError(error), { link_preview_options: { is_disabled: true } }).catch(() => {});
    } finally {
      await sessionAdapter.cleanupStatus();
    }
  });
}
