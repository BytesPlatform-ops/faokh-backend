import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { UuidParamDto } from '../../common/dto/param.dto';
import { BrokersService } from './brokers.service';
import { CreateBrokerDto, ListBrokersDto, UpdateBrokerDto } from './brokers.dto';

@ApiTags('brokers')
@Controller('brokers')
@Roles(...CRM_ROLES)
export class BrokersController {
  constructor(private readonly brokers: BrokersService) {}

  @Get()
  @ApiOperation({ summary: 'External referral brokers, with their referral totals' })
  list(@Query() query: ListBrokersDto) {
    return this.brokers.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One broker, with clients, bookings and commission totals' })
  getById(@Param() params: UuidParamDto) {
    return this.brokers.getById(params.id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a new external broker' })
  create(@Body() body: CreateBrokerDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.brokers.create(body, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a broker' })
  update(@Param() params: UuidParamDto, @Body() body: UpdateBrokerDto) {
    return this.brokers.update(params.id, body);
  }
}
