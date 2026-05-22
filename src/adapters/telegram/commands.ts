// adapters/telegram/commands.ts — `bot.command(...)` registrations + menu

import { InlineKeyboard } from 'grammy';
import { agentLogger } from '../../lib/logger.js';
import { loadSkills } from '../../skills/loader.js';
import { createSession } from '../../storage/state/sessions.js';
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
    await createSession(sessionKey);

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
    await createSession(sessionKey);
    const extra = cancelled > 0 ? ` Cancelled ${cancelled} pending task(s).` : '';
    await ctx.reply(`💀 Stopped.${extra}\nSession cleared — send a message to start over.`);
    agentLogger.info({ msg: 'tg_kill', chatId: ctx.chat.id, cancelled });
  });
}

function registerUsage(rt: TelegramRuntime): void {
  rt.bot.command('usage', async (ctx) => {
    const { loadUsage } = await import('../../lib/usage.js');
    const usage = loadUsage();
    const fmtNum = (n: number) => n.toLocaleString();
    const fmtDuration = (sec: number) => {
      if (sec < 60) return `${Math.round(sec)}s`;
      if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
      return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
    };

    const AZURE_FREE_CHARS = 500_000;
    const AZURE_FREE_SPEECH_HOURS = 5;

    const cacheHitPct = usage.llm.input_tokens > 0
      ? Math.round((usage.llm.cached_tokens / usage.llm.input_tokens) * 100)
      : 0;
    let llmSection = `🧠 <b>LLM</b> (codex)\n` +
      `├ Calls: <code>${fmtNum(usage.llm.calls)}</code>\n` +
      `├ Input: <code>${fmtNum(usage.llm.input_tokens)}</code>\n` +
      `├ Output: <code>${fmtNum(usage.llm.output_tokens)}</code>\n` +
      `└ Cached: <code>${fmtNum(usage.llm.cached_tokens)}</code> (${cacheHitPct}% hit)`;

    const providers = Object.entries(usage.llm_by_provider);
    if (providers.length > 1) {
      llmSection += '\n';
      for (const [name, stats] of providers) {
        llmSection += `\n  📌 <i>${name}</i>: ${fmtNum(stats.calls)} calls, ${fmtNum(stats.input_tokens)}/${fmtNum(stats.output_tokens)} tok`;
      }
    }

    const text = `📊 <b>Anya Usage — ${usage.month}</b>\n\n` +
      llmSection + `\n\n` +
      `📢 <b>TTS (Azure)</b>\n` +
      `├ Calls: <code>${fmtNum(usage.tts.calls)}</code>\n` +
      `├ Chars: <code>${fmtNum(usage.tts.chars)}</code> / ${fmtNum(AZURE_FREE_CHARS)}\n` +
      `└ Dur: <code>${fmtDuration(usage.tts.duration_sec)}</code>\n\n` +
      `🗣️ <b>Pronunciation (Azure)</b>\n` +
      `├ Calls: <code>${fmtNum(usage.pron_assess.calls)}</code>\n` +
      `└ Dur: <code>${fmtDuration(usage.pron_assess.duration_sec)}</code> / ${AZURE_FREE_SPEECH_HOURS}h\n\n` +
      `🎤 <b>STT (Groq Whisper)</b>\n` +
      `├ Calls: <code>${fmtNum(usage.stt.calls)}</code>\n` +
      `└ Dur: <code>${fmtDuration(usage.stt.duration_sec)}</code>\n\n` +
      `🔍 <b>Web Search</b>\n` +
      `└ Calls: <code>${fmtNum(usage.web_search.calls)}</code>\n\n` +
      `👀 <b>Vision</b>\n` +
      `└ Calls: <code>${fmtNum(usage.vision.calls)}</code>`;

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
      await createSession(sessionKey);
      const input = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
      const { statusMessageId } = await rt.startTurn(ctx);
      rt.enqueuePerChat(ctx.chat.id, () =>
        rt.handleIncoming(ctx, input, undefined, statusMessageId),
      );
    });
  }
}
