import { Module } from '@nestjs/common';

import { IdService } from '../../common/ids/id.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, IdService],
  exports: [ClientsService],
})
export class ClientsModule {}
