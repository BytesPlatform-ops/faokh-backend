import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES } from '../../common/access/crm-access';
import { Roles } from '../../common/decorators/auth.decorators';
import { InventoryService } from './inventory.service';
import { ListUnitsDto } from './inventory.dto';

@ApiTags('inventory')
@Controller('inventory')
@Roles(...CRM_ROLES)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List units with building, floor, type, class, status and requirement filters',
  })
  list(@Query() query: ListUnitsDto) {
    return this.inventory.list(query);
  }

  /** Static routes are declared before `:unitId` so they are not swallowed by it. */
  @Get('product-master')
  @ApiOperation({ summary: 'Apartment types, classes and project configuration' })
  productMaster() {
    return this.inventory.productMaster();
  }

  @Get('buildings')
  @ApiOperation({ summary: 'Buildings in the project' })
  buildings() {
    return this.inventory.buildings();
  }

  @Get('floors/:buildingCode')
  @ApiOperation({ summary: 'Floors with live available-unit counts' })
  @ApiQuery({
    name: 'unitTypeCode',
    required: false,
    description:
      'Scopes the counts to one layout. A floor whose only free unit is a Type D is not a ' +
      'floor with availability when the client is buying a Type A.',
  })
  floors(
    @Param('buildingCode') buildingCode: string,
    @Query('unitTypeCode') unitTypeCode?: string,
  ) {
    return this.inventory.floorAvailability(buildingCode, unitTypeCode);
  }

  @Get('pricing/:unitTypeCode')
  @ApiOperation({ summary: 'The price matrix for one apartment type, across all classes' })
  pricing(@Param('unitTypeCode') unitTypeCode: string) {
    return this.inventory.pricesForType(unitTypeCode);
  }

  @Get(':unitId')
  @ApiOperation({ summary: 'One unit' })
  get(@Param('unitId') unitId: string) {
    return this.inventory.getById(unitId);
  }
}
