import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RecordPaymentDto {
  @ApiProperty() @IsUUID() bookingId!: string;

  @ApiPropertyOptional({ description: 'The instalment this settles. Omit for an ad-hoc receipt.' })
  @IsOptional()
  @IsUUID()
  installmentId?: string;

  /**
   * Rupees, not paisa. The API speaks the unit a person types on a receipt;
   * the database stores NUMERIC and the money engine works in paisa.
   */
  @ApiProperty({ example: 1880000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountRupees!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Cheque number, transfer reference, or similar.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiProperty({ example: '2026-08-18T00:00:00.000Z' })
  @IsISO8601()
  receivedAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
