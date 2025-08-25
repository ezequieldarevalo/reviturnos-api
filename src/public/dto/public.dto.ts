import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsEmail,
  IsIn,
  IsInt,
  Min,
  IsDateString,
  Matches,
} from 'class-validator';

export class AvailableDaysQueryDto {
  @IsString()
  @IsNotEmpty()
  plantSlug!: string; // from route
  @IsString()
  @IsNotEmpty()
  month!: string; // YYYY-MM
  @IsUUID()
  vehicleTypeId!: string;
}

export class AvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  plantSlug!: string;
  @IsISO8601()
  date!: string; // YYYY-MM-DD
  @IsUUID()
  vehicleTypeId!: string;
}

export class CreateAppointmentBodyDto {
  @IsUUID() vehicleTypeId!: string;

  /** "none" | "mp_online" | "mp_cash" (cash solo si > 3 días) */
  @IsIn(['none', 'mp_online', 'mp_cash'])
  paymentMode!: 'none' | 'mp_online' | 'mp_cash';

  /** HH:mm seleccionado (horario agregado, no línea específica) */
  @IsString() hour!: string;

  // datos vehículo/persona (snapshot)
  @IsEmail() email!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() telefono?: string;
  @IsString() dominio!: string;
  @IsString() marca!: string;
  @IsString() modelo!: string;
  @IsInt() @Min(1900) anio!: number;
  @IsIn(['NAFTA', 'DIESEL', 'GNC', 'HIBRIDO', 'ELECTRICO', 'OTRO'])
  combustible!: 'NAFTA' | 'DIESEL' | 'GNC' | 'HIBRIDO' | 'ELECTRICO' | 'OTRO';
}

export class CreateAppointmentParamsDto {
  @IsString() plantSlug!: string;
  @IsISO8601() date!: string; // YYYY-MM-DD
}

export class VerifyEmailParamsDto {
  @IsUUID() id!: string;
}
export class VerifyEmailQueryDto {
  @IsString() token!: string;
}

export class TokenActionParamsDto {
  @IsUUID() id!: string;
}
export class TokenActionQueryDto {
  @IsString() token!: string;
}

export class RescheduleDto {
  @IsDateString() date!: string; // YYYY-MM-DD
  @IsString() @Matches(/^\d{2}:\d{2}$/) hour!: string; // HH:mm
}

export class CancelDto {} // placeholder por si luego pedimos motivo opcional
