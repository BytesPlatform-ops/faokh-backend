import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  unitId!: string;

  /**
   * How the client reached Foakh, and the broker who introduced them.
   *
   * Carried on the booking because the wizard establishes the source *after*
   * the client has been created — a client is often created before anyone has
   * asked where they came from. Supplying it here records it on the booking and
   * back-fills the client, so the referral cannot be silently lost between the
   * two steps. Omit both for a direct sale.
   */
  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  leadSource?: LeadSource;

  @ApiPropertyOptional({ format: 'uuid', description: 'The referring external broker.' })
  @IsOptional()
  @IsUUID('4')
  brokerId?: string;

  @ApiProperty({
    example: 'ELEGANT',
    description: 'Class code, not id — the frontend speaks codes.',
  })
  @IsString()
  @MaxLength(20)
  classCode!: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to today.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  bookingDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Manager/admin only, and only with a reason. A broker sending this is
   * rejected: attribution drives commission, so allowing a self-declared
   * broker id would be a way to take a colleague's fee.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  overrideBrokerId?: string;

  @ApiPropertyOptional({ minLength: 5 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}

export class ListBookingsDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
