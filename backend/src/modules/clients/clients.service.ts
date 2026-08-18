import { Injectable } from '@nestjs/common';
import { LeadSource, Prisma } from '@prisma/client';

import { assertOwns, visibilityScope } from '../../common/access/crm-access';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IdService } from '../../common/ids/id.service';
import { toIso } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';
import type { CreateClientDto, ListClientsDto } from './clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(query: ListClientsDto, user: AuthenticatedPrincipal) {
    const scope = visibilityScope(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.ClientWhereInput = {
      ...(scope !== undefined ? { brokerId: scope } : {}),
      ...buildSearch(query.search),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: clientInclude,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: rows.map(presentClient),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string, user: AuthenticatedPrincipal) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: clientInclude });
    if (client === null) {
      throw AppException.notFound('That client could not be found.', ErrorCode.CLIENT_NOT_FOUND);
    }
    assertOwns(user, client);
    return presentClient(client);
  }

  /**
   * Creates a client and allocates its `CLI-YYYY-######`.
   *
   * The Sales Agent is taken from the authenticated principal, never from the
   * request body — ownership drives visibility, so a caller-supplied agent id
   * would be a way to write into someone else's book.
   *
   * The external broker is the opposite case: it IS supplied by the request,
   * because the agent is recording who introduced the client. It is optional,
   * and it is what later decides whether a commission schedule exists at all.
   */
  async create(dto: CreateClientDto, user: AuthenticatedPrincipal) {
    const salesAgentId = user.salesAgent?.id ?? null;
    if (salesAgentId === null) {
      throw AppException.unprocessable(
        ErrorCode.BROKER_REQUIRED,
        'Only a Sales Agent account can create a client.',
      );
    }

    // A broker-sourced client without a broker would silently lose the referral
    // and, with it, the commission — so it is rejected rather than defaulted.
    if (dto.leadSource === LeadSource.BROKER && dto.brokerId === undefined) {
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_FAILED,
        'Select the broker who introduced this client, or change the lead source.',
      );
    }

    if (dto.brokerId !== undefined) {
      const broker = await this.prisma.broker.findUnique({ where: { id: dto.brokerId } });
      if (broker === null) throw AppException.notFound('That broker could not be found.');
    }

    const cnic = dto.cnic.replace(/\D/g, '');

    // Checked before the insert so the caller gets a usable message rather than
    // a raw unique-constraint violation.
    const existing = await this.prisma.client.findUnique({ where: { cnic } });
    if (existing !== null) {
      throw AppException.conflict(
        ErrorCode.DUPLICATE_CNIC,
        `A client already exists with that CNIC (${existing.clientCode}).`,
      );
    }

    const created = await this.prisma.transactionWithRetry(async (tx) => {
      // Allocated inside the transaction so a rolled-back insert never consumes
      // a number and leaves a visible gap in the sequence.
      const clientCode = await this.ids.next(tx, 'CLI');

      return tx.client.create({
        data: {
          clientCode,
          fullLegalName: dto.fullLegalName.trim(),
          fatherOrHusbandName: dto.fatherOrHusbandName ?? null,
          cnic,
          cnicExpiry: dto.cnicExpiry ?? null,
          dateOfBirth: dto.dateOfBirth ?? null,
          nationality: dto.nationality ?? 'Pakistani',
          mobile: normalisePhone(dto.mobile),
          whatsapp: dto.whatsapp ? normalisePhone(dto.whatsapp) : null,
          email: dto.email ?? null,
          currentAddress: dto.currentAddress ?? null,
          permanentAddress: dto.permanentAddress ?? null,
          city: dto.city ?? null,
          province: dto.province ?? null,
          occupation: dto.occupation ?? null,
          companyName: dto.companyName ?? null,
          ntn: dto.ntn ?? null,
          ...(dto.filerStatus ? { filerStatus: dto.filerStatus } : {}),
          coApplicantName: dto.coApplicantName ?? null,
          coApplicantCnic: dto.coApplicantCnic?.replace(/\D/g, '') ?? null,
          nomineeName: dto.nomineeName ?? null,
          nomineeCnic: dto.nomineeCnic?.replace(/\D/g, '') ?? null,
          notes: dto.notes ?? null,
          interestedTypeCode: dto.interestedTypeCode ?? null,
          salesAgentId,
          leadSource: dto.leadSource ?? LeadSource.DIRECT,
          brokerId: dto.brokerId ?? null,
          createdByUserId: user.id,
        },
        include: clientInclude,
      });
    });

    return presentClient(created);
  }
}

const clientInclude = {
  salesAgent: {
    select: { id: true, salesAgentCode: true, user: { select: { displayName: true } } },
  },
  broker: { select: { id: true, brokerCode: true, fullName: true, agencyName: true } },
  documents: true,
  bookings: { select: { id: true } },
} satisfies Prisma.ClientInclude;

type ClientWithRelations = Prisma.ClientGetPayload<{ include: typeof clientInclude }>;

/** Shapes a row into the frontend's `Client` contract exactly. */
function presentClient(client: ClientWithRelations) {
  return {
    id: client.id,
    clientCode: client.clientCode,
    fullLegalName: client.fullLegalName,
    fatherOrHusbandName: client.fatherOrHusbandName ?? undefined,
    cnic: client.cnic,
    cnicExpiry: toIso(client.cnicExpiry) ?? undefined,
    dateOfBirth: toIso(client.dateOfBirth) ?? undefined,
    nationality: client.nationality,
    mobile: client.mobile,
    whatsapp: client.whatsapp ?? undefined,
    email: client.email ?? undefined,
    currentAddress: client.currentAddress ?? undefined,
    permanentAddress: client.permanentAddress ?? undefined,
    city: client.city ?? undefined,
    province: client.province ?? undefined,
    occupation: client.occupation ?? undefined,
    companyName: client.companyName ?? undefined,
    ntn: client.ntn ?? undefined,
    filerStatus: client.filerStatus,
    coApplicantName: client.coApplicantName ?? undefined,
    coApplicantCnic: client.coApplicantCnic ?? undefined,
    nomineeName: client.nomineeName ?? undefined,
    nomineeCnic: client.nomineeCnic ?? undefined,
    notes: client.notes ?? undefined,
    interestedTypeCode: client.interestedTypeCode ?? undefined,
    // The internal owner of the record.
    salesAgentId: client.salesAgentId ?? '',
    salesAgentCode: client.salesAgent?.salesAgentCode ?? '',
    salesAgentName: client.salesAgent?.user.displayName ?? '',

    // How they arrived, and the external partner who introduced them. Empty
    // for a direct client — which is the normal case, not a missing value.
    leadSource: client.leadSource,
    brokerId: client.brokerId ?? '',
    brokerCode: client.broker?.brokerCode ?? '',
    brokerName: client.broker?.agencyName ?? client.broker?.fullName ?? '',
    bookingStatus:
      client.bookings.length === 0 ? 'NONE' : client.bookings.length === 1 ? 'BOOKED' : 'MULTIPLE',
    lastActivityAt: client.lastActivityAt.toISOString(),
    createdAt: client.createdAt.toISOString(),
    documents: client.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      fileName: document.fileName,
      mimeType: document.mimeType,
      byteSize: document.byteSize,
      uploadedAt: document.createdAt.toISOString(),
    })),
  };
}

/**
 * Search across name, client code, CNIC and phone.
 *
 * The digit branch strips formatting from the query so "0300 123 4567" and
 * "35202-1234567-1" find records stored as `+923001234567` and `3520212345671`.
 */
function buildSearch(search: string | undefined): Prisma.ClientWhereInput {
  const term = search?.trim();
  if (term === undefined || term.length === 0) return {};

  const digits = term.replace(/\D/g, '');
  const clauses: Prisma.ClientWhereInput[] = [
    { fullLegalName: { contains: term, mode: 'insensitive' } },
    { clientCode: { contains: term, mode: 'insensitive' } },
  ];

  if (digits.length >= 4) {
    clauses.push({ cnic: { contains: digits } }, { mobile: { contains: digits } });
  }

  return { OR: clauses };
}

/** Pakistani local input (03001234567) is stored as E.164. */
function normalisePhone(value: string): string {
  const clean = value.replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('03')) return `+92${clean.slice(1)}`;
  return clean;
}
