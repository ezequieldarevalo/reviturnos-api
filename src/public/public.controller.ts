import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  Patch,
} from '@nestjs/common';
import { PublicService } from './public.service';
import {
  AvailableDaysQueryDto,
  AvailabilityQueryDto,
  CreateAppointmentBodyDto,
  CreateAppointmentParamsDto,
  VerifyEmailParamsDto,
  VerifyEmailQueryDto,
  TokenActionParamsDto,
  TokenActionQueryDto,
  RescheduleDto,
  CancelDto,
} from './dto/public.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get(':plantSlug/available-days')
  getAvailableDays(
    @Param('plantSlug') plantSlug: string,
    @Query('month') month: string,
    @Query('vehicleTypeId') vehicleTypeId: string,
  ) {
    const q: AvailableDaysQueryDto = { plantSlug, month, vehicleTypeId };
    return this.service.getAvailableDays(q);
  }

  @Get(':plantSlug/availability')
  getAvailability(
    @Param('plantSlug') plantSlug: string,
    @Query('date') date: string,
    @Query('vehicleTypeId') vehicleTypeId: string,
  ) {
    const q: AvailabilityQueryDto = { plantSlug, date, vehicleTypeId };
    return this.service.getAvailability(q);
  }

  @Post(':plantSlug/appointments')
  createAppointment(
    @Param() p: CreateAppointmentParamsDto,
    @Query('date') date: string,
    @Body() body: CreateAppointmentBodyDto,
  ) {
    return this.service.createAppointment(
      { plantSlug: p.plantSlug, date },
      body,
    );
  }

  @Post('appointments/:id/verify-email')
  verifyEmail(
    @Param() p: VerifyEmailParamsDto,
    @Query() q: VerifyEmailQueryDto,
  ) {
    return this.service.verifyEmail(p.id, q.token);
  }

  @Patch('appointments/:id/reschedule')
  reschedule(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() body: RescheduleDto,
  ) {
    return this.service.rescheduleByToken(id, token, body);
  }

  @Post('appointments/:id/cancel')
  cancel(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() _body: CancelDto,
  ) {
    return this.service.cancelByToken(id, token);
  }
}
