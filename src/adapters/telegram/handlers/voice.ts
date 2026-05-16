// adapters/telegram/handlers/voice.ts — voice messages (download + STT)

import fs from 'node:fs';
import path from 'node:path';
import { agentLogger } from '../../../lib/logger.js';
import { trackStt } from '../../../lib/usage.js';
import { transcribeAudio } from '../../../media/stt.js';
import { VOICE_DIR } from '../../../lib/paths.js';
import { fetchWithRetry } from '../fetchRetry.js';
import type { TelegramRuntime } from '../runtime.js';

export function registerVoiceHandler(rt: TelegramRuntime): void {
  rt.bot.on('message:voice', async (ctx) => {
    agentLogger.info({ msg: 'tg_voice', chatId: ctx.chat.id, userId: ctx.from?.id, duration: ctx.message.voice.duration });

    // Status message FIRST — before download/STT (which can take 1–5s).
    const { statusMessageId } = await rt.startTurn(ctx, '🎤 Transcribing voice...');

    rt.enqueuePerChat(ctx.chat.id, async () => {
      let audioPath: string;
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${rt.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetchWithRetry(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        audioPath = path.join(VOICE_DIR, `voice_${Date.now()}.ogg`);
        fs.mkdirSync(VOICE_DIR, { recursive: true });
        fs.writeFileSync(audioPath, buffer);
        agentLogger.info({ msg: 'tg_voice_cached', path: audioPath, bytes: buffer.length });
      } catch (err) {
        agentLogger.error({ msg: 'tg_voice_download_error', error: (err as Error).message });
        await ctx.reply('❌ Voice download failed, please try again.');
        if (statusMessageId) await rt.bot.api.deleteMessage(ctx.chat.id, statusMessageId).catch(() => {});
        return;
      }

      const sttResult = await transcribeAudio(audioPath, rt.config);

      if (!sttResult.success || !sttResult.transcript) {
        const errMsg = sttResult.error || 'Could not recognize speech';
        agentLogger.warn({ msg: 'tg_stt_failed', error: errMsg });
        await ctx.reply(`🎤 ${errMsg}`);
        if (statusMessageId) await rt.bot.api.deleteMessage(ctx.chat.id, statusMessageId).catch(() => {});
        fs.unlink(audioPath, () => {});
        return;
      }

      const input = `[Voice message | audio_path: ${audioPath}]\n"${sttResult.transcript}"`;
      agentLogger.info({ msg: 'tg_voice_transcribed', chatId: ctx.chat.id, text: sttResult.transcript.substring(0, 100) });
      trackStt(ctx.message.voice.duration || 0);

      await rt.handleIncoming(ctx, input, undefined, statusMessageId);
    });
  });
}
