import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { JobsModule } from './jobs/jobs.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { EmailModule } from './email/email.module';
import { TestEmailController } from './email/test-email.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    PublicModule,
    JobsModule,
    WebhooksModule,
    AdminModule,
    EmailModule,
  ],
  controllers: [TestEmailController],
})
export class AppModule {}
