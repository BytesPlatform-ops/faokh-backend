import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrokerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ListBrokersDto {
  @ApiPropertyOptional({ description: 'Matches name, agency, code or mobile.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @ApiPropertyOptional({ enum: BrokerStatus })
  @IsOptional()
  @IsEnum(BrokerStatus)
  status?: BrokerStatus;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

/**
 * Creating an external broker.
 *
 * Only a name and a mobile are required. A Sales Agent is recording this
 * mid-conversation, often from a business card — demanding a CNIC, an NTN and a
 * full address at first contact is how a referral goes unrecorded.
 */
export class CreateBrokerDto {
  @ApiProperty({ example: 'Bilal Ahmed' })
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ example: '03001234567' })
  @Matches(/^(\+92|0)?3\d{9}$/, {
    message: 'Enter a Pakistani mobile number, e.g. 03001234567.',
  })
  mobile!: string;

  @ApiPropertyOptional({ example: 'XYZ Properties' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  agencyName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) cnic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^(\+92|0)?3\d{9}$/, { message: 'Enter a Pakistani mobile number.' })
  whatsapp?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) addressLine?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ntn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBrokerDto extends CreateBrokerDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ enum: BrokerStatus })
  @IsOptional()
  @IsEnum(BrokerStatus)
  status?: BrokerStatus;
}
