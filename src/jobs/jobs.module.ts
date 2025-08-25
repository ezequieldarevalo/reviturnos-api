import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { SlotGeneratorService } from './slot-generator.service';

@Module({
  providers: [JobsService, SlotGeneratorService],
  exports: [JobsService, SlotGeneratorService], // <-- exportar para otros módulos
})
export class JobsModule {}
