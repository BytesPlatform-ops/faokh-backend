import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Route params are user input. Validating their shape keeps malformed values
 *  out of database queries and out of log lines. */

export class UuidParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}

export class SlugParamDto {
  @ApiProperty({ example: 'duplex-penthouses' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase words separated by single hyphens.',
  })
  slug!: string;
}

export class ReferenceParamDto {
  @ApiProperty({ example: 'FWCE-260819-A7K2' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z]{2,8}-\d{6}-[A-Z0-9]{4,8}$/, {
    message: 'That does not look like a Foakh booking reference.',
  })
  reference!: string;
}

export class TokenParamDto {
  @ApiProperty({ description: 'Opaque base64url token.' })
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Malformed token.' })
  token!: string;
}
