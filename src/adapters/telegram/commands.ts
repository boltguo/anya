// adapters/telegram/commands.ts — `bot.command(...)` registrations + menu

import { InlineKeyboard } from 'grammy';
import { agentLogger } from '../../lib/logger.js';
import { loadSkills } from '../../agent/skills/loader.js';
import { newOrReuseEmptySession } from '../../storage/state/sessions.js';
import { handleRestart } from './restartManager.js';
import { getMainMenu } from './skillMenu.js';
import type { TelegramRuntime } from './runtime.js';

export async function registerCommands(rt: TelegramRuntime): Promise<void> {
  const skills = loadSkills();
  const botCommands: Array<{ command: string; description: string }> = [
    { command: 'new', description: '🔄 New practice session' },
  ];

  const skillCommandMap = new Map<string, string>();
  for (const skill of skills) {
    if (!skill.command) continue;
    const cmd = skill.name.replace(/[^a-z0-9_]/g, '_').substring(0, 32);
    const desc = (skill.description || skill.name).substring(0, 256);
    botCommands.push({ command: cmd, description: desc });
    skillCommandMap.set(cmd, skill.name);
  }

  registerStart(rt, skillCommandMap);
  registerNew(rt);
  registerKill(rt);
  registerUsage(rt);
  registerRestartCmd(rt);

  // System commands appended last so they appear at the bottom of the Telegram menu
  botCommands.push(
    { command: 'usage', description: '📊 Check API usage' },
    { command: 'restart', description: '♻️ Restart gateway' },
    { command: 'kill', description: '💀 Force stop & clear' },
  );

  await rt.bot.api.setMyCommands(botCommands);

  registerSkillCommands(rt, skillCommandMap);
}

function registerStart(rt: TelegramRuntime, skillCommandMap: Map<string, string>): void {
  rt.bot.command('start', async (ctx) => {
    const name = 'Anya';
    const cmdList = [...skillCommandMap.keys()].map((cmd) => `/${cmd}`).join('  ');

    await ctx.reply(
      `Hey! I'm ${name} 🌟\n\n` +
      `Just send me a message, or jump right in:\n\n` +
      `${cmdList}\n\n` +
      `/new open menu  ·  /kill force stop`,
    );
  });
}

function registerNew(rt: TelegramRuntime): void {
  rt.bot.command('new', async (ctx) => {
    const sessionKey = `tg:${ctx.chat.id}`;
    rt.cancelPending();
    await newOrReuseEmptySession(sessionKey);

    const { profile_done, placement_done } = rt.config.onboarding;

    // Gate the menu on onboarding completion. Show whichever step isn't done yet.
    if (!profile_done || !placement_done) {
      const kb = new InlineKeyboard();
      if (!profile_done) kb.text('🎯 完成建档', 'profile-manager').row();
      if (!placement_done) kb.text('🔍 快速评测', 'placement-quick').row();

      agentLogger.info({ msg: 'tg_new_onboarding', chatId: ctx.chat.id, profile_done, placement_done });
      await ctx.reply(
        '先完成下面这些再开始练习 👇\n\n' +
        '· 建档：聊几句了解你的目标和兴趣\n' +
        '· 快速评测：8–12 分钟摸清你的英语底子',
        { reply_markup: kb },
      );
      return;
    }

    agentLogger.info({ msg: 'tg_new_menu', chatId: ctx.chat.id });
    const menu = getMainMenu();
    if (!menu) {
      await ctx.reply('Menu unavailable.');
      return;
    }
    await ctx.reply(menu.text, { reply_markup: menu.keyboard });
  });
}

function registerKill(rt: TelegramRuntime): void {
  rt.bot.command('kill', async (ctx) => {
    const sessionKey = `tg:${ctx.chat.id}`;
    const cancelled = rt.cancelPending();
    await newOrReuseEmptySession(sessionKey);
    const extra = cancelled > 0 ? ` Cancelled ${cancelled} pending task(s).` : '';
    await ctx.reply(`💀 Stopped.${extra}\nSession cleared — send a message to start over.`);
    agentLogger.info({ msg: 'tg_kill', chatId: ctx.chat.id, cancelled });
  });
}

function registerUsage(rt: TelegramRuntime): void {
  rt.bot.command('usage', async (ctx) => {
    const { loadUsage } = await import('../../lib/usage.js');
    const usage = loadUsage();
    const today = usage.today;
    const fmtNum = (n: number) => n.toLocaleString();
    const fmtDuration = (sec: number) => {
      if (sec < 60) return `${Math.round(sec)}s`;
      if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
      return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
    };
    // "<month> (T <today>)" — month is the headline, today bracketed.
    const pair = (monthly: string, todayVal: string) => `<code>${monthly}</code> <i>(T ${todayVal})</i>`;

    const AZURE_FREE_CHARS = 500_000;
    const AZURE_FREE_SPEECH_HOURS = 5;

    const text = `📊 <b>Anya Usage — ${usage.month}</b>\n\n` +
      `🧠 <b>LLM (OpenAI)</b>\n` +
      `├ Calls:  ${pair(fmtNum(usage.llm.calls), fmtNum(today.llm.calls))}\n` +
      `├ Input:  ${pair(fmtNum(usage.llm.input_tokens), fmtNum(today.llm.input_tokens))}\n` +
      `├ Output: ${pair(fmtNum(usage.llm.output_tokens), fmtNum(today.llm.output_tokens))}\n` +
      `└ Cached: ${pair(fmtNum(usage.llm.cached_tokens), fmtNum(today.llm.cached_tokens))}\n\n` +
      `📢 <b>TTS (Azure Speech)</b>\n` +
      `├ Calls: ${pair(fmtNum(usage.tts.calls), fmtNum(today.tts.calls))}\n` +
      `├ Chars: ${pair(`${fmtNum(usage.tts.chars)} / ${fmtNum(AZURE_FREE_CHARS)}`, fmtNum(today.tts.chars))}\n` +
      `└ Dur:   ${pair(fmtDuration(usage.tts.duration_sec), fmtDuration(today.tts.duration_sec))}\n\n` +
      `🗣️ <b>Pronunciation (Azure Speech)</b>\n` +
      `├ Calls: ${pair(fmtNum(usage.pron_assess.calls), fmtNum(today.pron_assess.calls))}\n` +
      `└ Dur:   ${pair(`${fmtDuration(usage.pron_assess.duration_sec)} / ${AZURE_FREE_SPEECH_HOURS}h`, fmtDuration(today.pron_assess.duration_sec))}\n\n` +
      `🎤 <b>STT (Groq Whisper)</b>\n` +
      `├ Calls: ${pair(fmtNum(usage.stt.calls), fmtNum(today.stt.calls))}\n` +
      `└ Dur:   ${pair(fmtDuration(usage.stt.duration_sec), fmtDuration(today.stt.duration_sec))}\n\n` +
      `🔍 <b>Web Search (Tavily)</b>\n` +
      `└ Calls: ${pair(fmtNum(usage.web_search.calls), fmtNum(today.web_search.calls))}\n\n` +
      `👀 <b>Vision (Gemini)</b>\n` +
      `└ Calls: ${pair(fmtNum(usage.vision.calls), fmtNum(today.vision.calls))}`;

    await ctx.reply(text, { parse_mode: 'HTML' });
    agentLogger.info({ msg: 'tg_usage_command', chatId: ctx.chat.id });
  });
}

function registerRestartCmd(rt: TelegramRuntime): void {
  rt.bot.command('restart', async (ctx) => {
    const userId = ctx.from?.id;
    const allowedUsers = rt.config.telegram.allowed_user_ids;
    if (allowedUsers.length > 0 && userId && !allowedUsers.includes(userId)) {
      await ctx.reply('⛔ Unauthorized.');
      return;
    }
    await handleRestart(ctx, rt.bot);
  });
}

function registerSkillCommands(rt: TelegramRuntime, skillCommandMap: Map<string, string>): void {
  for (const [cmd, skillName] of skillCommandMap) {
    rt.bot.command(cmd, async (ctx) => {
      agentLogger.info({ msg: 'tg_skill_command', chatId: ctx.chat.id, skill: skillName });
      const sessionKey = `tg:${ctx.chat.id}`;
      await newOrReuseEmptySession(sessionKey);
      const input = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
      const { statusMessageId } = await rt.startTurn(ctx);
      rt.enqueuePerChat(ctx.chat.id, () =>
        rt.handleIncoming(ctx, input, undefined, statusMessageId),
      );
    });
  }
}
