import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * Server-side invoice rendering.
 *
 * Two documents come out of the same booking, and the difference between them
 * is the whole point:
 *
 *   - The **client copy** shows the property, the price and the full payment
 *     schedule. It contains no commission figure of any kind. A client seeing
 *     what their broker earns on the sale is a commercial problem, and hiding
 *     it with CSS on a page the client can "view source" on is not hiding it.
 *     So the commission is never written into the client document at all.
 *
 *   - The **broker copy** repeats all of that and adds the 4% schedule.
 *
 * Rendered A4 landscape, because the payment schedule is 48 rows and a portrait
 * page forces either a second sheet or type nobody can read.
 */

const PAGE = { size: 'A4' as const, layout: 'landscape' as const, margin: 36 };

/** Foakh's palette, matched to the marketing site. */
const INK = '#2b2320';
const MUTED = '#8a7a70';
const RULE = '#e0d5cb';
const WASH = '#faf6f0';
const TERRACOTTA = '#a4562f';

export interface InvoiceInstallment {
  sequence: number;
  label: string;
  amountRupees: number;
  percentageOfTotal: string;
  dueDate: Date | null;
  status: string;
  paidRupees: number;
}

export interface InvoiceCommissionMilestone {
  label: string;
  percentageOfSale: string;
  amountRupees: number;
  expectedDate: Date | null;
  status: string;
}

export interface InvoiceData {
  invoiceCode: string;
  bookingCode: string;
  bookingDate: Date;
  issuedAt: Date;

  clientCode: string;
  clientName: string;
  clientCnic: string;
  clientMobile: string;

  /** The internal Foakh employee who processed the sale. Always present. */
  salesAgentCode: string;
  salesAgentName: string;

  /** The external referral partner, when there was one. Null on a direct sale. */
  brokerCode: string | null;
  brokerName: string | null;
  leadSource: string;

  project: { name: string; addressLine: string; city: string; country: string };

  buildingName: string;
  floorLabel: string;
  unitNumber: string;
  residenceCategoryName: string;
  unitTypeName: string;
  className: string;
  areaSqFt: number;
  bedrooms: number;
  attachedBathrooms: number;
  hasBalcony: boolean;
  parkingSpaces: number;

  pricePerSqFt: number;
  totalRupees: number;
  paidRupees: number;
  outstandingRupees: number;
  expectedHandoverDate: Date | null;

  installments: InvoiceInstallment[];

  /** Present only when rendering the broker copy. */
  commission?: {
    ratePct: number;
    totalRupees: number;
    milestones: InvoiceCommissionMilestone[];
  };
}

export type InvoiceAudience = 'CLIENT' | 'BROKER';

@Injectable()
export class InvoicePdfService {
  async render(data: InvoiceData, audience: InvoiceAudience): Promise<Buffer> {
    const doc = new PDFDocument({ ...PAGE, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.header(doc, data, audience);
    this.parties(doc, data, audience);
    this.property(doc, data);
    this.schedule(doc, data);

    if (audience === 'BROKER' && data.commission !== undefined) {
      this.commission(doc, data.commission);
    }

    this.signatures(doc, audience);
    this.footers(doc, data, audience);

    doc.end();
    return finished;
  }

  // ------------------------------------------------------------------ header

  private header(doc: PDFKit.PDFDocument, data: InvoiceData, audience: InvoiceAudience): void {
    const { width, margin } = this.geometry(doc);

    doc.fillColor(INK).fontSize(17).font('Helvetica-Bold').text(data.project.name, margin, margin);

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(`${data.project.addressLine}, ${data.project.city}, ${data.project.country}`);

    // The audience is stated on the document itself, so a broker copy left on a
    // desk is never mistaken for the client's.
    const label = audience === 'CLIENT' ? 'CLIENT COPY' : 'BROKER COPY';
    doc
      .fillColor(TERRACOTTA)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(label, margin, margin, { width: width - margin * 2, align: 'right' });

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(`Invoice ${data.invoiceCode}`, { width: width - margin * 2, align: 'right' })
      .text(`Issued ${this.date(data.issuedAt)}`, { width: width - margin * 2, align: 'right' });

    doc.moveDown(0.6);
    this.rule(doc);
  }

  // ----------------------------------------------------------------- parties

  private parties(doc: PDFKit.PDFDocument, data: InvoiceData, audience: InvoiceAudience): void {
    const { margin, width } = this.geometry(doc);
    const top = doc.y + 10;
    const column = (width - margin * 2) / 3;

    this.heading(doc, 'CLIENT', margin, top);
    this.line(doc, data.clientName, margin, true);
    this.line(doc, `Client ID  ${data.clientCode}`, margin);
    this.line(doc, `CNIC  ${data.clientCnic}`, margin);
    this.line(doc, `Mobile  ${data.clientMobile}`, margin);

    this.heading(doc, 'BOOKING', margin + column, top);
    this.line(doc, data.bookingCode, margin + column, true);
    this.line(doc, `Booking date  ${this.date(data.bookingDate)}`, margin + column);
    this.line(
      doc,
      `Expected handover  ${
        data.expectedHandoverDate === null
          ? 'To be confirmed'
          : this.date(data.expectedHandoverDate)
      }`,
      margin + column,
    );

    // The Sales Agent appears on both copies — a client is entitled to know
    // which Foakh employee handled their purchase. The referring broker is
    // shown too where there was one, but only the commission is withheld.
    this.heading(doc, 'HANDLED BY', margin + column * 2, top);
    this.line(doc, data.salesAgentName, margin + column * 2, true);
    this.line(doc, `Sales Agent  ${data.salesAgentCode}`, margin + column * 2);

    if (data.brokerCode !== null) {
      this.line(doc, `Introduced by  ${data.brokerName ?? ''}`, margin + column * 2);
      this.line(doc, `Broker ID  ${data.brokerCode}`, margin + column * 2);
    } else {
      this.line(doc, 'Introduced by  Direct', margin + column * 2);
    }

    if (audience === 'BROKER' && data.commission !== undefined) {
      this.line(doc, `Commission  ${data.commission.ratePct}% of sale`, margin + column * 2);
    }

    doc.y = top + 74;
    this.rule(doc);
  }

  // ---------------------------------------------------------------- property

  private property(doc: PDFKit.PDFDocument, data: InvoiceData): void {
    const { margin, width } = this.geometry(doc);
    const top = doc.y + 10;
    const usable = width - margin * 2;

    this.heading(doc, 'PROPERTY', margin, top);

    doc
      .fillColor(INK)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(
        `Unit ${data.unitNumber} · ${data.buildingName} Block · ${data.floorLabel}`,
        margin,
        top + 12,
      );

    // Specifications are read back from the frozen snapshot, never recomputed:
    // the document must say what it said on the day it was signed. Anything
    // Foakh has not confirmed is omitted rather than printed as zero.
    const specs = [
      data.residenceCategoryName,
      data.unitTypeName,
      data.className,
      `${this.number(data.areaSqFt)} sq ft`,
      data.bedrooms > 0 ? `${data.bedrooms} bedrooms` : null,
      data.attachedBathrooms > 0 ? `${data.attachedBathrooms} attached bathrooms` : null,
      data.hasBalcony ? 'Balcony' : 'No balcony',
      data.parkingSpaces > 0 ? `${data.parkingSpaces} parking` : 'Parking not included',
    ].filter((part): part is string => part !== null);

    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(specs.join('  ·  '), margin);

    // Price band.
    const bandTop = doc.y + 8;
    doc.rect(margin, bandTop, usable, 30).fillColor(WASH).fill();

    const cell = usable / 4;
    const money = [
      ['Rate', `PKR ${this.number(data.pricePerSqFt, 4)} / sq ft`],
      ['Total sale price', `PKR ${this.number(data.totalRupees, 2)}`],
      ['Paid to date', `PKR ${this.number(data.paidRupees, 2)}`],
      ['Outstanding', `PKR ${this.number(data.outstandingRupees, 2)}`],
    ];

    money.forEach(([label, value], index) => {
      const x = margin + cell * index + 10;
      doc
        .fillColor(MUTED)
        .fontSize(6.5)
        .font('Helvetica')
        .text(label!.toUpperCase(), x, bandTop + 6);
      doc
        .fillColor(INK)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(value!, x, bandTop + 15);
    });

    doc.y = bandTop + 38;
  }

  // ---------------------------------------------------------------- schedule

  private schedule(doc: PDFKit.PDFDocument, data: InvoiceData): void {
    const { margin, width } = this.geometry(doc);
    const usable = width - margin * 2;

    this.heading(doc, 'PAYMENT SCHEDULE', margin, doc.y + 6);
    doc.moveDown(0.3);

    const columns = [
      { label: '#', width: 22, align: 'left' as const },
      { label: 'Instalment', width: usable * 0.3, align: 'left' as const },
      { label: '%', width: usable * 0.09, align: 'right' as const },
      { label: 'Amount (PKR)', width: usable * 0.17, align: 'right' as const },
      { label: 'Due', width: usable * 0.15, align: 'left' as const },
      { label: 'Paid (PKR)', width: usable * 0.15, align: 'right' as const },
      { label: 'Status', width: usable * 0.12, align: 'left' as const },
    ];

    this.tableHeader(doc, columns, margin);

    for (const entry of data.installments) {
      // 48 rows will not fit one landscape page; break cleanly and repeat the
      // header rather than letting rows run off the bottom.
      if (doc.y > doc.page.height - 70) {
        doc.addPage(PAGE);
        this.tableHeader(doc, columns, margin);
      }

      this.tableRow(
        doc,
        columns,
        [
          String(entry.sequence),
          entry.label,
          `${entry.percentageOfTotal}%`,
          this.number(entry.amountRupees, 2),
          entry.dueDate === null ? 'To be confirmed' : this.date(entry.dueDate),
          entry.paidRupees > 0 ? this.number(entry.paidRupees, 2) : '—',
          this.humanise(entry.status),
        ],
        margin,
      );
    }

    // The total is printed because a schedule that does not visibly reconcile
    // to the sale price is the single thing a client is most right to query.
    const total = data.installments.reduce((sum, entry) => sum + entry.amountRupees, 0);
    doc.moveDown(0.2);
    this.rule(doc);
    doc
      .fillColor(INK)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(
        `Schedule total  PKR ${this.number(total, 2)}   ·   Sale price  PKR ${this.number(
          data.totalRupees,
          2,
        )}`,
        margin,
        doc.y + 4,
        { width: usable, align: 'right' },
      );
  }

  // -------------------------------------------------------------- commission

  private commission(
    doc: PDFKit.PDFDocument,
    commission: NonNullable<InvoiceData['commission']>,
  ): void {
    const { margin, width } = this.geometry(doc);
    const usable = width - margin * 2;

    if (doc.y > doc.page.height - 170) doc.addPage(PAGE);

    doc.moveDown(0.8);
    this.heading(doc, `BROKER COMMISSION — ${commission.ratePct}% OF SALE`, margin, doc.y);
    doc.moveDown(0.3);

    const columns = [
      { label: 'Milestone', width: usable * 0.34, align: 'left' as const },
      { label: '%', width: usable * 0.1, align: 'right' as const },
      { label: 'Amount (PKR)', width: usable * 0.2, align: 'right' as const },
      { label: 'Expected', width: usable * 0.18, align: 'left' as const },
      { label: 'Status', width: usable * 0.18, align: 'left' as const },
    ];

    this.tableHeader(doc, columns, margin);

    for (const milestone of commission.milestones) {
      this.tableRow(
        doc,
        columns,
        [
          milestone.label,
          `${milestone.percentageOfSale}%`,
          this.number(milestone.amountRupees, 2),
          milestone.expectedDate === null ? '—' : this.date(milestone.expectedDate),
          this.humanise(milestone.status),
        ],
        margin,
      );
    }

    doc
      .fillColor(INK)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(`Total commission  PKR ${this.number(commission.totalRupees, 2)}`, margin, doc.y + 4, {
        width: usable,
        align: 'right',
      });

    // Stated on the document because the date arriving is the exact moment a
    // broker is most likely to assume the money is theirs.
    doc
      .fillColor(MUTED)
      .fontSize(7)
      .font('Helvetica-Oblique')
      .text(
        'A milestone reaching its expected date does not make it payable. Every payout is ' +
          'released only after Finance approval.',
        margin,
        doc.y + 3,
        { width: usable },
      );
  }

  // -------------------------------------------------------------- signatures

  private signatures(doc: PDFKit.PDFDocument, audience: InvoiceAudience): void {
    const { margin, width } = this.geometry(doc);
    const usable = width - margin * 2;

    if (doc.y > doc.page.height - 110) doc.addPage(PAGE);
    doc.moveDown(1.4);

    const boxes =
      audience === 'CLIENT'
        ? ['Client signature', 'Broker signature', 'For Foakh']
        : ['Broker signature', 'Sales manager', 'For Foakh'];

    const cell = usable / boxes.length;
    const top = doc.y;

    boxes.forEach((label, index) => {
      const x = margin + cell * index;
      doc
        .strokeColor(RULE)
        .lineWidth(0.75)
        .moveTo(x, top + 26)
        .lineTo(x + cell - 24, top + 26)
        .stroke();
      doc
        .fillColor(MUTED)
        .fontSize(7)
        .font('Helvetica')
        .text(label, x, top + 30, { width: cell - 24 });
    });

    doc.y = top + 44;
  }

  // ----------------------------------------------------------------- footers

  private footers(doc: PDFKit.PDFDocument, data: InvoiceData, audience: InvoiceAudience): void {
    const range = doc.bufferedPageRange();

    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);

      // The footer sits below the text-flow area on purpose. pdfkit treats
      // anything past the bottom margin as an overflow and helpfully starts a
      // new page — which would append one blank page per footer — so the margin
      // is dropped for the write and restored immediately after.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const y = doc.page.height - 26;
      const usable = doc.page.width - PAGE.margin * 2;

      doc
        .fillColor(MUTED)
        .fontSize(6.5)
        .font('Helvetica')
        .text(`${data.project.name} · ${data.bookingCode} · ${data.invoiceCode}`, PAGE.margin, y, {
          width: usable,
          align: 'left',
          lineBreak: false,
        });

      doc.text(
        `${audience === 'CLIENT' ? 'Client copy' : 'Broker copy'} · Page ${index + 1} of ${range.count}`,
        PAGE.margin,
        y,
        { width: usable, align: 'right', lineBreak: false },
      );

      doc.page.margins.bottom = bottomMargin;
    }
  }

  // ------------------------------------------------------------------ pieces

  private tableHeader(
    doc: PDFKit.PDFDocument,
    columns: { label: string; width: number; align: 'left' | 'right' }[],
    margin: number,
  ): void {
    const top = doc.y;
    let x = margin;

    doc.fillColor(MUTED).fontSize(6.5).font('Helvetica-Bold');
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), x, top, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }

    doc.y = top + 10;
    this.rule(doc);
    doc.y += 2;
  }

  private tableRow(
    doc: PDFKit.PDFDocument,
    columns: { label: string; width: number; align: 'left' | 'right' }[],
    values: string[],
    margin: number,
  ): void {
    const top = doc.y;
    let x = margin;

    doc.fillColor(INK).fontSize(7.5).font('Helvetica');
    columns.forEach((column, index) => {
      doc.text(values[index] ?? '', x, top, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    });

    doc.y = top + 11;
  }

  private heading(doc: PDFKit.PDFDocument, text: string, x: number, y: number): void {
    doc
      .fillColor(MUTED)
      .fontSize(6.5)
      .font('Helvetica-Bold')
      .text(text, x, y, { lineBreak: false });
    doc.y = y + 10;
  }

  private line(doc: PDFKit.PDFDocument, text: string, x: number, bold = false): void {
    doc
      .fillColor(bold ? INK : MUTED)
      .fontSize(bold ? 9.5 : 7.5)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(text, x, doc.y, { lineBreak: false });
    doc.y += bold ? 12 : 9.5;
  }

  private rule(doc: PDFKit.PDFDocument): void {
    const { margin, width } = this.geometry(doc);
    doc
      .strokeColor(RULE)
      .lineWidth(0.5)
      .moveTo(margin, doc.y)
      .lineTo(width - margin, doc.y)
      .stroke();
    doc.y += 2;
  }

  private geometry(doc: PDFKit.PDFDocument) {
    return { margin: PAGE.margin, width: doc.page.width, height: doc.page.height };
  }

  private number(value: number, decimals = 0): string {
    return value.toLocaleString('en-PK', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  private date(value: Date): string {
    return value.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Karachi',
    });
  }

  private humanise(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}
