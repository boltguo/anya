// adapters/telegram/handlers/photo.ts — photo messages (download + Gemini vision)

import fs from 'node:fs';
import path from 'node:path';
import { agentLogger } from '../../../lib/logger.js';
import { IMAGE_RECEIVED_DIR } from '../../../lib/paths.js';
import { fetchWithRetry } from '../fetchRetry.js';
import type { TelegramRuntime } from '../runtime.js';

export function registerPhotoHandler(rt: TelegramRuntime): void {
  rt.bot.on('message:photo', async (ctx) => {
    const caption = ctx.message.caption || '';
    agentLogger.info({ msg: 'tg_photo', chatId: ctx.chat.id, userId: ctx.from?.id, caption: caption.substring(0, 100) });

    // Status message FIRST — before download/vision (which can take 1–5s).
    const { statusMessageId } = await rt.startTurn(ctx, '🖼️ Analyzing image...');

    // Always pick the largest photo (last element in the photo array)
    const photo = ctx.message.photo[ctx.message.photo.length - 1];

    rt.enqueuePerChat(ctx.chat.id, async () => {
      let imagePath = '';
      try {
        const file = await ctx.api.getFile(photo.file_id);
        if (!file.file_path) {
          await ctx.reply('❌ Failed to download image.');
          if (statusMessageId) await rt.bot.api.deleteMessage(ctx.chat.id, statusMessageId).catch(() => {});
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${rt.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetchWithRetry(fileUrl);

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.extname(file.file_path) || '.jpg';
        imagePath = path.join(IMAGE_RECEIVED_DIR, `photo_${Date.now()}${ext}`);
        fs.writeFileSync(imagePath, buffer);
        agentLogger.info({ msg: 'tg_photo_cached', path: imagePath, bytes: buffer.length });
      } catch (err) {
        agentLogger.error({ msg: 'tg_photo_download_error', error: (err as Error).message });
        await ctx.reply('❌ Image download failed, please try again.');
        if (statusMessageId) await rt.bot.api.deleteMessage(ctx.chat.id, statusMessageId).catch(() => {});
        return;
      }

      // Dual-model: analyze via Gemini Vision, then pass description text to the main LLM
      const { analyzeImage } = await import('../../../media/vision.js');
      const visionResult = await analyzeImage(imagePath, rt.config, caption || undefined);

      if (!visionResult.success || !visionResult.description) {
        const errMsg = visionResult.error || 'Could not analyze image';
        agentLogger.warn({ msg: 'tg_vision_failed', error: errMsg });
        await ctx.reply(`🖼️ ${errMsg}`);
        if (statusMessageId) await rt.bot.api.deleteMessage(ctx.chat.id, statusMessageId).catch(() => {});
        return;
      }

      agentLogger.info({ msg: 'tg_vision_done', chatId: ctx.chat.id, descLength: visionResult.description.length });

      await rt.handleIncoming(ctx, caption, undefined, statusMessageId, {
        trigger: 'photo',
        details: {
          image_path: imagePath,
          vision_description: visionResult.description,
        },
      });
    });
  });
}
