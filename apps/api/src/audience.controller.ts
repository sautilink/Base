import { BadRequestException, Controller, Get, Header, Headers, NotFoundException, Param } from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { validUuid } from './bot-config';
import { loadAudienceAnalytics } from './audience-analytics';

@Controller('bots/:botId/analytics')
export class AudienceController {
  @Get()
  @Header('Cache-Control', 'no-store')
  async summary(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string) {
    const ownerId = await verifiedUserId(auth);
    if (!validUuid(botId)) throw new BadRequestException('Invalid bot ID');
    const data = await loadAudienceAnalytics(pool(), botId, ownerId);
    if (!data) throw new NotFoundException('Bot not found');
    return data;
  }
}
