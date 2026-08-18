import { Module } from '@nestjs/common';

import { IdService } from '../../common/ids/id.service';
import { BrokersController } from './brokers.controller';
import { BrokersService } from './brokers.service';

@Module({ controllers: [BrokersController], providers: [BrokersService, IdService] })
export class BrokersModule {}
