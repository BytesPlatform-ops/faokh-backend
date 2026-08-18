import { Module } from '@nestjs/common';

import { IdService } from '../../common/ids/id.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, IdService],
  exports: [BookingsService],
})
export class BookingsModule {}
