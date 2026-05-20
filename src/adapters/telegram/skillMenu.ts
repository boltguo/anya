// adapters/telegram/skillMenu.ts — hardcoded training-hub menu

import { InlineKeyboard } from 'grammy';

// Menu is fixed UX, not skill-defined behaviour. Loading it through the agent
// would burn ~planner SKILL.md tokens on every /new.
const MENU: Record<string, { text: string; buttons: string[][] }> = {
  main: {
    text: '🌟 你的英语小教练\n\n今天想从哪里开始？',
    buttons: [
      ['✨ 今日推荐|planner'],
      ['🗣️ 口语实战|nav:speaking', '🎧 听力磨耳|nav:listening'],
      ['📖 阅读理解|nav:reading', '✍️ 写作输出|nav:writing'],
      ['📚 词汇网络|nav:vocab'],
      ['📊 能力评估|learner-state', '🔍 错题答疑|error-clinic'],
    ],
  },
  speaking: {
    text: '🗣️ 口语训练\n\n开口说出来，慢慢练成自然对话。',
    buttons: [
      ['🎙️ 发音矫正|speaking-shadowing', '🔁 听后复述|speaking-repeat'],
      ['💬 闲聊 / 情景对话|speaking-freetalk'],
      ['← 返回|nav:main'],
    ],
  },
  listening: {
    text: '🎧 听力训练\n\n抓得到细节，跟得上意群。',
    buttons: [
      ['✏️ 句子精听|listening-dictation', '🎙️ 意群跟读|listening-shadowing'],
      ['🔢 数字捕捉|listening-numberdrill', '📻 播客泛听|listening-podcast'],
      ['← 返回|nav:main'],
    ],
  },
  reading: {
    text: '📖 阅读训练\n\n读得快，也读得透。',
    buttons: [
      ['🌅 今日阅读|daily-article', '🐢 外刊精读|reading-deepdive'],
      ['⚡ 快速略读|reading-skim-drill'],
      ['← 返回|nav:main'],
    ],
  },
  writing: {
    text: '✍️ 写作训练\n\n从句子打磨到成篇，把英文写得地道。',
    buttons: [
      ['🏋️ 句型搭建|writing-builder', '🔁 升级改写|writing-rewrite'],
      ['📝 综合长文|writing-essay'],
      ['← 返回|nav:main'],
    ],
  },
  vocab: {
    text: '📚 词汇网络\n\n在语境里学，靠重复内化。',
    buttons: [
      ['🔄 到期复习|vocab-review', '🎯 话题词汇|vocab-topic'],
      ['← 返回|nav:main'],
    ],
  },
};

function buildKeyboard(buttons: string[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of buttons) {
    for (const item of row) {
      const pipeIdx = item.lastIndexOf('|');
      kb.text(item.substring(0, pipeIdx).trim(), item.substring(pipeIdx + 1).trim());
    }
    kb.row();
  }
  return kb;
}

function getMenuPage(pageName: string): { text: string; keyboard: InlineKeyboard } | null {
  const page = MENU[pageName];
  if (!page) return null;
  return { text: page.text, keyboard: buildKeyboard(page.buttons) };
}

export function isNavCallback(data: string): boolean {
  return data.startsWith('nav:');
}

export function getMainMenu(): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage('main');
}

export function getNavPage(data: string): { text: string; keyboard: InlineKeyboard } | null {
  return getMenuPage(data.replace('nav:', ''));
}
