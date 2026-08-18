import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FilerStatus, LeadSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListClientsDto {
  @ApiPropertyOptional({ description: 'Client ID, name, CNIC or phone.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateClientDto {
  @ApiProperty({ example: 'Ahmed Khan' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  fullLegalName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fatherOrHusbandName?: string;

  @ApiProperty({ example: '35202-1234567-1', description: 'Dashes optional; stored digits-only.' })
  @IsString()
  @Matches(/^\d{5}-?\d{7}-?\d$/, { message: 'A CNIC has 13 digits, e.g. 35202-1234567-1.' })
  cnic!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  cnicExpiry?: Date;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiPropertyOptional({ default: 'Pakistani' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationality?: string;

  @ApiProperty({ example: '03001234567' })
  @IsString()
  @Matches(/^(\+92\d{10}|0\d{10})$/, {
    message: 'Enter a Pakistani mobile number, e.g. 03001234567.',
  })
  mobile!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) currentAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) permanentAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) province?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) occupation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ntn?: string;

  @ApiPropertyOptional({ enum: FilerStatus })
  @IsOptional()
  @IsEnum(FilerStatus)
  filerStatus?: FilerStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) coApplicantName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) coApplicantCnic?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nomineeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) nomineeCnic?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  /**
   * Lead qualification only. Never filters inventory and never limits what the
   * client may book.
   */
  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  interestedTypeCode?: string;

  /** How the client reached Foakh. */
  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.DIRECT })
  @IsOptional()
  @IsEnum(LeadSource)
  leadSource?: LeadSource;

  /**
   * The external broker who introduced them, when there was one.
   *
   * Supplied by the agent — unlike the Sales Agent, which comes from the
   * session. Required when `leadSource` is BROKER, and null everywhere else.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  brokerId?: string;
}
