import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
