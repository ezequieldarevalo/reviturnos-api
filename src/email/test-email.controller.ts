import { Controller, Get } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('test-email')
export class TestEmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('send')
  async sendTestEmail(): Promise<string> {
    try {
      await this.emailService.sendMail(
        'ezequiel.d.arevalo@gmail.com', // Cambia esto por un correo válido
        'Correo de prueba',
        '<h1>¡Este es un correo de prueba!</h1><p>Enviado desde ReviTurnos.</p>',
      );
      return 'Correo enviado exitosamente';
    } catch (error) {
      console.error('Error al enviar el correo:', error);
      return 'Error al enviar el correo';
    }
  }
}
