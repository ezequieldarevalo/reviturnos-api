import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
