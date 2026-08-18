import { Module } from '@nestjs/common';

import { IdService } from '../../common/ids/id.service';
import { StorageService } from '../../common/storage/storage.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, StorageService, IdService],
  exports: [StorageService],
})
export class InvoicesModule {}
