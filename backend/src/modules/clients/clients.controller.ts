import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { UuidParamDto } from '../../common/dto/param.dto';
import { ClientsService } from './clients.service';
import { CreateClientDto, ListClientsDto } from './clients.dto';

@ApiTags('clients')
@Controller('clients')
@Roles(...CRM_ROLES)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({
    summary: 'List clients',
    description:
      'Brokers see their own book; managers, finance and admins see all. The scope is ' +
      'applied server-side and cannot be widened by a query parameter.',
  })
  list(@Query() query: ListClientsDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.clients.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One client' })
  get(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.clients.getById(params.id, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a client',
    description:
      'Allocates a CLI-YYYY-###### code and attributes the client to the authenticated ' +
      'broker. Used by the inline create-client drawer inside the booking wizard.',
  })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.clients.create(dto, user);
  }
}
