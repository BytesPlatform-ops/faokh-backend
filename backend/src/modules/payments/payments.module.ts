import { Module } from '@nestjs/common';

import { IdService } from '../../common/ids/id.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, IdService],
})
export class PaymentsModule {}
