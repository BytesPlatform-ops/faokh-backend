import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  unitId!: string;

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
