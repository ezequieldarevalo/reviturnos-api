import { Controller, Headers, Post, Req } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post('mercadopago')
  async mercadoPago(
    @Req() req: any,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody: Buffer = req.rawBody; // viene del body-parser verify
    const payload = req.body; // JSON parseado (si vino con application/json)
    await this.svc.handleMercadoPago({ headers, rawBody, payload });
    return { ok: true };
  }
}
