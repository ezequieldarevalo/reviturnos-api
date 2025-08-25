import { Body, Controller, Headers, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private s: WebhooksService) {}

  @Post('mercadopago')
  mp(@Headers() headers: Record<string, string>, @Body() payload: any) {
    return this.s.handleMP(headers, payload);
  }
}
