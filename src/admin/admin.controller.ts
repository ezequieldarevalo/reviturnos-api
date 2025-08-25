import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JobsService } from '../jobs/jobs.service';

@Controller('admin')
export class AdminController {
  constructor(
    private s: AdminService,
    private jobs: JobsService,
  ) {}

  @Get('day')
  getDay(@Query('date') date: string) {
    return this.s.getDay(date);
  }

  @Patch('lines/:id/duration')
  updateLineDuration(
    @Param('id') id: string,
    @Body()
    body: {
      durationMinutes: number;
      effectiveFrom: string;
      maxShiftMinutes?: number;
    },
  ) {
    return this.s.updateLineDuration(id, body);
  }

  @Get('generate-slots-now')
  async generateSlotsNow() {
    return this.jobs.generateSlotsNow();
  }
}
