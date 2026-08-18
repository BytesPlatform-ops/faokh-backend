import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResidenceCategory, UnitStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListUnitsDto {
  @ApiPropertyOptional({ example: 'ABD' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  buildingCode?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  floorLevel?: number;

  @ApiPropertyOptional({ enum: ResidenceCategory })
  @IsOptional()
  @IsEnum(ResidenceCategory)
  residenceCategory?: ResidenceCategory;

  @ApiPropertyOptional({ example: 'A', description: 'Layout type. Never a bedroom count.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  unitTypeCode?: string;

  @ApiPropertyOptional({ example: 'ELEGANT' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  classCode?: string;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) search?: string;

  @ApiPropertyOptional({ description: '3 means three or more.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasBalcony?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  minParking?: number;

  @ApiPropertyOptional({ description: 'PKR.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional({ description: 'PKR.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBudget?: number;
}
