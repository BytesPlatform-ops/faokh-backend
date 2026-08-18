/**
 * The API contract.
 *
 * These interfaces are the boundary between the CRM's screens and its data.
 * Pages import from here and never from the mock data files, so switching
 * `NEXT_PUBLIC_DATA_MODE` from `mock` to `api` swaps one adapter and touches no
 * page. Where the NestJS backend already has a shape (the Prisma models), these
 * mirror it deliberately — including the human-readable code formats — so the
 * eventual swap is a rename at most.
 */

/**
 * The top of the Foakh property hierarchy.
 *
 *   Residence Category → Apartment Layout Type → Class → Building → Floor → Unit
 *
 * A duplex penthouse is a *category*, not a fifth layout type: it does not
 * share the A/B/C/D specification model, and listing it alongside them invites
 * a broker to read it as "Type E".
 */
export type ResidenceCategory = 'APARTMENT' | 'DUPLEX_PENTHOUSE';

/**
 * Apartment layout. Only meaningful when the category is APARTMENT.
 *
 * `PH` identifies the duplex penthouse's master record; it is deliberately not
 * offered in any layout picker.
 */
export type UnitTypeCode = 'A' | 'B' | 'C' | 'D' | 'PH';

/** The four layouts a broker may actually choose between. */
export const APARTMENT_LAYOUTS: UnitTypeCode[] = ['A', 'B', 'C', 'D'];
export type ClassCode = 'CLASSIC' | 'ELEGANT' | 'SONDER';
export type UnitStatus = 'AVAILABLE' | 'ON_HOLD' | 'BOOKED' | 'SOLD' | 'BLOCKED';
export type BuildingCode = 'ABD' | 'UMR';

export type BookingStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type InstallmentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED';
export type CommissionStatus =
  | 'UPCOMING'
  | 'ELIGIBLE'
  | 'APPROVED'
  | 'PAID'
  | 'HELD'
  | 'CANCELLED';
export type FurnishingLevel = 'UNFURNISHED' | 'FURNISHED' | 'FURNISHED_SERVICED';
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FINANCE' | 'SALES_AGENT';

// ------------------------------------------------------------- product master

/**
 * The layout master record — the single source of every physical
 * specification.
 *
 * A broker chooses Type A and the bedrooms, bathrooms, balcony, parking and
 * area follow from it. Nothing here is ever entered by hand on a booking:
 * re-typed specifications drift from the master data and end up on a printed
 * contract that disagrees with the building.
 */
export interface ApartmentType {
  code: UnitTypeCode;
  residenceCategory: ResidenceCategory;
  name: string;
  areaSqFt: number;
  bedrooms: number;
  bathrooms: number;
  /** Type A's three bathrooms are all en-suite; this is a selling point. */
  attachedBathrooms: number;
  hasBalcony: boolean;
  includedParkingSpaces: number;
  /** True when parking is not included but may be bought separately. */
  parkingPurchasableSeparately: boolean;
  spansFloors: number;
  /** Human label for the floors a duplex occupies, e.g. "11th + 12th". */
  floorSpanLabel?: string;
  description: string;
  /** Foakh imagery, served from /public. */
  images: string[];
}

export interface ApartmentClassInfo {
  code: ClassCode;
  name: string;
  furnishingLevel: FurnishingLevel;
  isServiced: boolean;
  description: string;
}

export interface PriceEntry {
  unitTypeCode: UnitTypeCode;
  classCode: ClassCode;
  /** Rupees. Null when Foakh has supplied no figure at all. */
  price: number | null;
  pricePerSqFt: number | null;
  /**
   * True for figures Foakh has not ratified — currently Type D Elegant and
   * Sonder. The UI must never present these as final, and booking is blocked.
   */
  needsConfirmation: boolean;
  confirmationNote?: string;
}

// ----------------------------------------------------------------- inventory

export interface Unit {
  id: string;
  unitNumber: string;
  buildingCode: BuildingCode;
  buildingName: string;
  floorLevel: number;
  unitTypeCode: UnitTypeCode;
  residenceCategory: ResidenceCategory;
  classCode: ClassCode;
  status: UnitStatus;
  parkingSpaces: number;
  /** Resolved from the type × class matrix. Null when unpriced. */
  priceRupees: number | null;
  pricePerSqFt: number | null;
  needsPriceConfirmation: boolean;
  notes?: string;
}

export interface UnitFilters {
  residenceCategory?: ResidenceCategory;
  buildingCode?: BuildingCode;
  floorLevel?: number;
  unitTypeCode?: UnitTypeCode;
  classCode?: ClassCode;
  status?: UnitStatus;
  search?: string;
}

// -------------------------------------------------------------------- clients

export interface Client {
  id: string;
  /** CLI-2026-000001 */
  clientCode: string;
  fullLegalName: string;
  fatherOrHusbandName?: string;
  /** Digits only, 13 characters. Formatted for display, never stored masked. */
  cnic: string;
  cnicExpiry?: string;
  dateOfBirth?: string;
  nationality: string;

  mobile: string;
  whatsapp?: string;
  email?: string;

  currentAddress?: string;
  permanentAddress?: string;
  city?: string;
  province?: string;

  occupation?: string;
  companyName?: string;
  ntn?: string;
  filerStatus?: 'UNKNOWN' | 'FILER' | 'NON_FILER';

  coApplicantName?: string;
  coApplicantCnic?: string;
  nomineeName?: string;
  nomineeCnic?: string;
  notes?: string;

  /** The internal Foakh employee who owns this record. */
  salesAgentId: string;
  salesAgentCode: string;
  salesAgentName: string;

  /** How the client reached Foakh. */
  leadSource: LeadSource;

  /**
   * The external partner who introduced them. Empty on a direct client, which
   * is the ordinary case — not a missing value.
   */
  brokerId: string;
  brokerCode: string;
  brokerName: string;

  interestedTypeCode?: UnitTypeCode;
  bookingStatus: 'NONE' | 'BOOKED' | 'MULTIPLE';
  lastActivityAt: string;
  createdAt: string;

  documents: ClientDocument[];
}

export interface ClientDocument {
  id: string;
  kind: 'CNIC_FRONT' | 'CNIC_BACK' | 'CLIENT_PHOTO' | 'OTHER';
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  /**
   * Object URL in mock mode. Non-persistent by design — the UI says so rather
   * than implying a file was stored on a server that does not exist yet.
   */
  previewUrl?: string;
}

export type CreateClientInput = Omit<
  Client,
  | 'id'
  | 'clientCode'
  // Server-assigned: the Sales Agent comes from the session, and the broker's
  // display fields are derived from whichever broker id is supplied.
  | 'salesAgentId'
  | 'salesAgentCode'
  | 'salesAgentName'
  | 'brokerId'
  | 'brokerCode'
  | 'brokerName'
  | 'leadSource'
  | 'bookingStatus'
  | 'lastActivityAt'
  | 'createdAt'
  | 'documents'
> & {
  documents?: File[];
  /** Defaults to DIRECT. Required to be BROKER when a broker is attached. */
  leadSource?: LeadSource;
  /** The external partner who introduced them, when there was one. */
  brokerId?: string;
};

// ----------------------------------------------------------- lead source

export type LeadSource =
  | 'DIRECT'
  | 'BROKER'
  | 'WEBSITE'
  | 'PHONE'
  | 'WHATSAPP'
  | 'REFERRAL'
  | 'OTHER';

export const LEAD_SOURCES: { value: LeadSource; label: string; hint?: string }[] = [
  { value: 'DIRECT', label: 'Direct / walk-in' },
  { value: 'BROKER', label: 'External broker', hint: 'Introduced by a channel partner' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'OTHER', label: 'Other' },
];

// ------------------------------------------------------------- sales agents

/**
 * An internal Foakh sales employee — the authenticated user.
 *
 * Not a broker. This person sells on Foakh's behalf and is salaried; they are
 * never paid the 4% referral commission, which belongs to an external partner.
 */
export interface SalesAgent {
  id: string;
  /** SAG-2026-000001 */
  salesAgentCode: string;
  name: string;
  email: string;
  mobile?: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

// ------------------------------------------------------- external brokers

/**
 * An external referral / channel partner.
 *
 * Does not log in. A Sales Agent records one when a client was introduced by
 * them, and only then does a 4% commission schedule come into existence.
 */
export interface Broker {
  id: string;
  /** BRK-2026-000001 */
  brokerCode: string;
  fullName: string;
  agencyName?: string;
  cnic?: string;
  mobile: string;
  whatsapp?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  ntn?: string;
  notes?: string;
  commissionRatePct: number;
  status: 'ACTIVE' | 'INACTIVE';
  isActive: boolean;

  createdBySalesAgentCode?: string;
  createdBySalesAgentName?: string;
  createdAt: string;
  updatedAt: string;

  referredClientCount: number;
  referredBookingCount: number;
  salesValuePaisa: number;
  commissionTotalPaisa: number;
  commissionPaidPaisa: number;
  commissionOutstandingPaisa: number;
}

/** Only a name and a mobile are required — an agent is often reading a card. */
export interface CreateBrokerInput {
  fullName: string;
  mobile: string;
  agencyName?: string;
  cnic?: string;
  whatsapp?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  ntn?: string;
  notes?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  /** Present only for Sales Agents — the internal Foakh employee. */
  salesAgent?: SalesAgent;
}

// ------------------------------------------------------------------ bookings

export interface Installment {
  id: string;
  sequence: number;
  kind: 'DOWN_PAYMENT' | 'MILESTONE_60D' | 'MILESTONE_120D' | 'MONTHLY' | 'COMPLETION';
  label: string;
  percentageOfTotal: number;
  amountPaisa: number;
  paidPaisa: number;
  /** Null for the completion instalment until a handover date is configured. */
  dueDate: string | null;
  status: InstallmentStatus;
}

export interface CommissionMilestone {
  id: string;
  sequence: number;
  label: string;
  percentageOfSale: number;
  amountPaisa: number;
  expectedDate: string;
  status: CommissionStatus;
}

/**
 * Everything below `snapshot` is frozen at confirmation. A price change next
 * quarter must not reach back and alter a schedule the client has signed.
 */
export interface BookingSnapshot {
  unitNumber: string;
  buildingName: string;
  floorLevel: number;
  residenceCategory: ResidenceCategory;
  residenceCategoryName: string;
  unitTypeCode: UnitTypeCode;
  unitTypeName: string;
  classCode: ClassCode;
  className: string;
  bedrooms: number;
  bathrooms: number;
  attachedBathrooms: number;
  hasBalcony: boolean;
  parkingSpaces: number;
  areaSqFt: number;
  pricePerSqFt: number;
  totalPricePaisa: number;
}

export interface Booking {
  id: string;
  /** BKG-2026-000001 */
  bookingCode: string;
  status: BookingStatus;
  bookingDate: string;
  currency: 'PKR';

  clientId: string;
  clientCode: string;
  clientName: string;
  clientCnic: string;
  clientMobile: string;

  /**
   * Three distinct parties. The Sales Agent sold it for Foakh; the broker, when
   * present, introduced the buyer and is the only one earning the 4%.
   */
  salesAgentId: string;
  salesAgentCode: string;
  salesAgentName: string;

  leadSource: LeadSource;

  /** Null on a direct sale — and null is what means no commission exists. */
  brokerId: string | null;
  brokerCode: string | null;
  brokerName: string | null;

  unitId: string;
  snapshot: BookingSnapshot;

  expectedHandoverDate: string | null;

  installments: Installment[];
  commissionMilestones: CommissionMilestone[];
  commissionRatePct: number;
  commissionTotalPaisa: number;

  paidPaisa: number;
  outstandingPaisa: number;

  /** INV-2026-000001 */
  invoiceCode: string;
  createdAt: string;
  notes?: string;
}

export interface CreateBookingInput {
  /**
   * The source, established after the client was created. Sent with the booking
   * so the referral cannot be lost between the two steps — the server writes it
   * to both the booking and the client.
   */
  leadSource?: LeadSource;
  brokerId?: string;
  clientId: string;
  unitId: string;
  classCode: ClassCode;
  bookingDate: string;
  notes?: string;
}

// ------------------------------------------------------------------ payments

export interface Payment {
  id: string;
  /** PAY-2026-000001 */
  paymentCode: string;
  bookingId: string;
  bookingCode: string;
  installmentId?: string;
  installmentLabel?: string;
  clientName: string;
  amountPaisa: number;
  method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE' | 'OTHER';
  reference?: string;
  status: 'RECORDED' | 'CLEARED' | 'BOUNCED' | 'REVERSED';
  receivedAt: string;
}

// ----------------------------------------------------------------- dashboard

export interface DashboardMetrics {
  availableUnits: number;
  bookedUnits: number;
  totalUnits: number;
  totalSalesValuePaisa: number;
  collectedPaisa: number;
  outstandingPaisa: number;
  paymentsDueSoon: { count: number; amountPaisa: number };
  overduePayments: { count: number; amountPaisa: number };
  commissionEarnedPaisa: number;
  commissionPaidPaisa: number;
  commissionOutstandingPaisa: number;
  recentClients: Client[];
  recentBookings: Booking[];
  upcomingInstallments: {
    bookingCode: string;
    clientName: string;
    label: string;
    dueDate: string | null;
    amountPaisa: number;
    status: InstallmentStatus;
  }[];
}

export interface CommissionSummaryRow {
  bookingId: string;
  bookingCode: string;
  clientName: string;
  unitNumber: string;
  salePricePaisa: number;
  totalCommissionPaisa: number;
  earnedPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
  nextDate: string | null;
  nextStatus: CommissionStatus | null;
  milestones: CommissionMilestone[];
}

/** Cursor-free pagination — the CRM's lists are page-numbered with a total. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// -------------------------------------------------------- booking selection

/**
 * Optional lead-qualification data held on the client's CRM profile.
 *
 * Deliberately NOT part of the booking wizard. A broker mid-conversation with a
 * client who has already decided on Type A + Elegant should not be made to
 * answer a budget questionnaire before they are allowed to see inventory — and
 * none of this may filter inventory, because a filter that hides units costs
 * sales.
 */
export type PurchasePurpose = 'OWN_RESIDENCE' | 'INVESTMENT' | 'OTHER';

export interface ClientQualification {
  purpose: PurchasePurpose | null;
  budgetMinRupees: number | null;
  budgetMaxRupees: number | null;
  notes?: string;
}

/**
 * What the broker has chosen so far.
 *
 * Strictly transaction data — the decisions a person actually makes. Everything
 * that follows from those decisions (bedrooms, bathrooms, area, balcony,
 * parking, rate, price) is property master data, derived and displayed
 * read-only, never re-entered.
 *
 * The order mirrors the product hierarchy and the wizard:
 *
 *   category -> layout type -> class -> building -> floor -> unit
 *
 * Each choice invalidates the ones below it, which is why they live in one
 * object: clearing downstream state is a single, obvious operation rather than
 * six scattered `setState` calls that can fall out of step.
 */
export interface BookingSelection {
  residenceCategory: ResidenceCategory | null;
  unitTypeCode: UnitTypeCode | null;
  classCode: ClassCode | null;
  buildingCode: BuildingCode | null;
  floorLevel: number | null;
  unitId: string | null;
}

export const EMPTY_SELECTION: BookingSelection = {
  residenceCategory: null,
  unitTypeCode: null,
  classCode: null,
  buildingCode: null,
  floorLevel: null,
  unitId: null,
};

/** A floor, with how much of it is actually sellable right now. */
export interface FloorAvailability {
  level: number;
  availableCount: number;
  /** True when the floor also satisfies the client's stated preferences. */
  matchesRequirements: boolean;
}

export interface ProjectInfo {
  name: string;
  addressLine: string;
  city: string;
  country: string;
  totalFloors: number;
  currency: string;
  expectedHandoverDate: string | null;
}
