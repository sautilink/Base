import { Body, Controller, Header, HttpCode, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { verifyMiniAppInitData } from './miniapp-init-data';

@Controller('telegram/miniapp')
export class MiniAppController {
  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  verify(@Body() body: unknown) {
    if (process.env.MASTER_BOT_ENABLED !== 'true') throw new NotFoundException();
    const raw = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { initData?: unknown }).initData : undefined;
    if (!verifyMiniAppInitData(raw, process.env.BOT_TOKEN)) throw new UnauthorizedException();
    // Telegram identity alone never grants access to Base account data.
    return { verified: true };
  }
}
