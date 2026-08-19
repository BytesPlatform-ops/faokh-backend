/** Single import surface for the CRM data layer. */
export * from './types';
export { DATA_MODE, IS_MOCK, API_BASE_URL, ApiError } from './config';
export { sessionService, canViewCommission, isSalesAgent } from './session.service';
export { brokersService } from './brokers.service';
export { clientsService } from './clients.service';
export { inventoryService } from './inventory.service';
export { bookingsService, type BookingPreview } from './bookings.service';
export { paymentsService } from './payments.service';
export { commissionsService } from './commissions.service';
export { invoicesService, type InvoiceCopy, type InvoiceDocumentData } from './invoices.service';
export { dashboardService } from './dashboard.service';
