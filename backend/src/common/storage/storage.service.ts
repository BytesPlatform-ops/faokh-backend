import { Injectable, Logger } from '@nestjs/common';

import { AppException } from '../errors/app.exception';

/**
 * Private document storage, backed by Supabase Storage.
 *
 * Everything this service writes goes to a bucket that is **not** public. A
 * CNIC scan, a payment proof and a signed booking invoice are all documents
 * that identify a real person and their finances; a permanent public URL for
 * any of them is a data breach waiting to be indexed, and "the URL is hard to
 * guess" is not access control.
 *
 * Reads therefore always go through `signedUrl()`, which mints a short-lived,
 * single-object URL. The service-role key used here bypasses Row Level
 * Security entirely and must never leave the server — it is read from the
 * environment and never returned, logged, or embedded in a response.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly url = process.env.SUPABASE_URL?.trim() ?? '';
  private readonly serviceKey =
    (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim() ?? '';
  private readonly bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() ?? 'foakh-documents';

  /** Whether storage is usable. Checked before upload so the failure is clear. */
  get configured(): boolean {
    return this.url !== '' && this.serviceKey !== '';
  }

  /**
   * Creates the bucket if it is missing, and asserts that it is private.
   *
   * Called once at boot. An existing bucket that is public is a hard failure
   * rather than something to quietly fix: flipping it would break whatever is
   * already serving from it, and the operator needs to know either way.
   */
  async ensureBucket(): Promise<void> {
    if (!this.configured) {
      this.logger.warn(
        'Supabase Storage is not configured — document upload is disabled. ' +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable it.',
      );
      return;
    }

    const existing = await this.request(`/storage/v1/bucket/${this.bucket}`, { method: 'GET' })
      .then((response) => (response.ok ? (response.json() as Promise<{ public: boolean }>) : null))
      .catch(() => null);

    if (existing !== null) {
      if (existing.public) {
        throw new Error(
          `Supabase Storage bucket "${this.bucket}" is PUBLIC. It holds CNIC scans and ` +
            'invoices and must be private. Change it in the Supabase dashboard before starting.',
        );
      }
      return;
    }

    const created = await this.request('/storage/v1/bucket', {
      method: 'POST',
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
    });

    if (!created.ok) {
      this.logger.error(`Could not create storage bucket "${this.bucket}": ${created.status}`);
      return;
    }

    this.logger.log(`Created private storage bucket "${this.bucket}"`);
  }

  /**
   * Stores an object and returns its path.
   *
   * The path — not a URL — is what gets written to the database. URLs expire;
   * a path is stable, and every read re-derives a fresh signed URL from it.
   */
  async upload(
    path: string,
    body: Buffer,
    contentType: string,
    options: { upsert?: boolean } = {},
  ): Promise<string> {
    this.assertConfigured();

    const response = await this.request(`/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'x-upsert': options.upsert === true ? 'true' : 'false',
      },
      body: new Uint8Array(body),
    });

    if (!response.ok) {
      throw AppException.internal(`Could not store the document (${response.status}).`);
    }

    return path;
  }

  /**
   * A short-lived URL for one object.
   *
   * Ten minutes by default: long enough to open or download a document, short
   * enough that a URL pasted into a chat or left in a browser history is not a
   * lasting way in.
   */
  async signedUrl(path: string, expiresInSeconds = 600): Promise<string> {
    this.assertConfigured();

    const response = await this.request(`/storage/v1/object/sign/${this.bucket}/${path}`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });

    if (!response.ok) {
      throw AppException.notFound('That document could not be found.');
    }

    const body = (await response.json()) as { signedURL: string };
    return `${this.url}/storage/v1${body.signedURL}`;
  }

  /** Reads an object back, for streaming a PDF through the API. */
  async download(path: string): Promise<Buffer> {
    this.assertConfigured();

    const response = await this.request(`/storage/v1/object/${this.bucket}/${path}`, {
      method: 'GET',
    });

    if (!response.ok) throw AppException.notFound('That document could not be found.');
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(path: string): Promise<void> {
    this.assertConfigured();
    await this.request(`/storage/v1/object/${this.bucket}/${path}`, { method: 'DELETE' });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw AppException.internal(
        'Document storage is not configured on this server. Set SUPABASE_URL and ' +
          'SUPABASE_SECRET_KEY.',
      );
    }
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        ...(init.body !== undefined && init.headers === undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
      },
    });
  }
}
