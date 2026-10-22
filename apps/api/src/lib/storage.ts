import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ByoCheckReason, StorageTarget } from '@nothingleft/types';
import type { Env } from '@config/env';
import { BYO_CONNECT_TIMEOUT_MS, BYO_REQUEST_TIMEOUT_MS } from '@config/constants';
import { AppError } from '@lib/errors';

export interface StoredObject {
  size: number;
  content_type: string | undefined;
  /** Base64 SHA-256, when the store kept the checksum the upload was signed with. */
  sha256?: string | undefined;
}

export interface PresignedPut {
  url: string;
  /** Signed into the URL: the client must send every one of them unchanged. */
  headers: Record<string, string>;
}

export interface PutSpec {
  contentType: string;
  size: number;
  sha256: string;
}

export type PublicPutSpec = Pick<PutSpec, 'contentType' | 'size'>;

export interface GetSpec {
  contentType: string;
  disposition: string;
}

/** An attachment row is one: the columns name the location and key its object lives at. */
export interface ObjectAddress {
  storage_target: StorageTarget | (string & {});
  storage_location_id: number | null;
  object_key: string;
}

export interface ObjectBody {
  body: ReadableStream<Uint8Array>;
  size: number;
}

/** One private bucket: the platform's (attachments, exports, imports) or an organisation's own. Never publicly readable. */
export interface PrivateStore {
  readonly bucket: string;
  presignPut(key: string, spec: PutSpec, expiresIn: number): Promise<PresignedPut>;
  head(key: string): Promise<StoredObject | null>;
  presignGet(key: string, spec: GetSpec, expiresIn: number): Promise<string>;
  delete(key: string): Promise<void>;
  /** A server-side write of a small body the API holds itself (a connection check). */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  /** The object as a stream, for a copy into another bucket; null when it is gone. */
  open(key: string): Promise<ObjectBody | null>;
  /** Writes a stream of exactly `spec.size` bytes; the store refuses it unless it hashes to `spec.sha256`. */
  putStream(key: string, body: ReadableStream<Uint8Array>, spec: PutSpec): Promise<void>;
  probe(): Promise<void>;
}

/** Everything needed to reach a customer's bucket. The secret is already unsealed. */
export interface BucketConnection {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Virtual-hosted addressing on AWS; path addressing on R2 and other S3-compatible stores. */
  pathStyle: boolean;
}

export interface Storage {
  readonly configured: boolean;
  presignPublicPut(key: string, spec: PublicPutSpec, expiresIn: number): Promise<string>;
  /** A server-side write, for a photo the API fetched itself (avatar.mirror). */
  putPublic(key: string, body: Uint8Array, contentType: string): Promise<void>;
  headPublic(key: string): Promise<StoredObject | null>;
  deletePublic(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** The platform's private bucket; null until S3_PRIVATE_BUCKET is set. */
  readonly private: PrivateStore | null;
  /** A customer's bucket, reached with their own credentials. */
  connect(connection: BucketConnection): PrivateStore;
}

const unconfigured = (): never => {
  throw new AppError('storage.not_configured', 503);
};

const isMissing = (error: unknown) =>
  error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey');

const statusOf = (error: unknown): number | undefined =>
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

/** What a failed call to a customer's bucket means, in terms a person can act on. */
export function classifyStorageError(error: unknown): ByoCheckReason {
  const name = error instanceof Error ? error.name : '';
  const code = (error as { code?: string })?.code ?? '';
  switch (name) {
    case 'InvalidAccessKeyId':
      return 'invalid_key';
    case 'SignatureDoesNotMatch':
      return 'wrong_secret';
    case 'NoSuchBucket':
      return 'no_bucket';
    case 'AccessDenied':
    case 'Forbidden':
      return 'access_denied';
    case 'AuthorizationHeaderMalformed':
    case 'PermanentRedirect':
    case 'IllegalLocationConstraintException':
      return 'wrong_region';
    case 'TimeoutError':
    case 'AbortError':
      return 'unreachable';
    case 'BadDigest':
    case 'InvalidDigest':
    case 'XAmzContentChecksumMismatch':
      return 'mismatch';
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ConnectionRefused'].includes(code)) {
    return 'unreachable';
  }
  if (/unable to connect|fetch failed|getaddrinfo|socket/i.test(error instanceof Error ? error.message : '')) {
    return 'unreachable';
  }
  const status = statusOf(error);
  if (status === 403 || status === 401) return 'access_denied';
  if (status === 301) return 'wrong_region';
  return 'unknown';
}

function s3Client(options: {
  endpoint: string;
  region: string;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  pathStyle: boolean;
  customer: boolean;
}): S3Client {
  const { accessKeyId, secretAccessKey } = options;
  return new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    // Without a key pair the SDK's default chain applies: a container or instance role.
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    forcePathStyle: options.pathStyle,
    // Otherwise the SDK signs a CRC32 of an empty body into every presigned PUT.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // A customer's bucket is outside our control: fail fast rather than hold a request open.
    ...(options.customer
      ? {
          maxAttempts: 2,
          requestHandler: { connectionTimeout: BYO_CONNECT_TIMEOUT_MS, requestTimeout: BYO_REQUEST_TIMEOUT_MS },
        }
      : {}),
  });
}

export function createStorage(env: Env): Storage {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BUCKET, S3_PUBLIC_BUCKET_BASE_URL } = env;
  const platformClient = (endpoint: string) =>
    s3Client({
      endpoint,
      region: env.S3_REGION,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      pathStyle: true, // MinIO, RustFS and R2 all address buckets by path, not by subdomain
      customer: false,
    });
  const client = S3_ENDPOINT ? platformClient(S3_ENDPOINT) : null;
  // A presigned URL is signed for its host, so it names the address the browser reaches.
  const signer = client && env.S3_BROWSER_ENDPOINT ? platformClient(env.S3_BROWSER_ENDPOINT) : client;

  const privateStore =
    client && signer && env.S3_PRIVATE_BUCKET ? s3Private(client, env.S3_PRIVATE_BUCKET, signer) : null;
  const connect = (c: BucketConnection) => s3Private(s3Client({ ...c, customer: true }), c.bucket);

  if (!client || !signer || !S3_PUBLIC_BUCKET || !S3_PUBLIC_BUCKET_BASE_URL) {
    return {
      configured: false,
      presignPublicPut: unconfigured,
      putPublic: unconfigured,
      headPublic: unconfigured,
      deletePublic: unconfigured,
      publicUrl: unconfigured,
      private: privateStore,
      connect,
    };
  }

  return {
    configured: true,

    presignPublicPut: (key, spec, expiresIn) =>
      getSignedUrl(
        signer,
        new PutObjectCommand({
          Bucket: S3_PUBLIC_BUCKET,
          Key: key,
          ContentType: spec.contentType,
          ContentLength: spec.size,
        }),
        // The presigner leaves content-type unsigned unless it is named here.
        { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
      ),

    async putPublic(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: S3_PUBLIC_BUCKET, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async headPublic(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: S3_PUBLIC_BUCKET, Key: key }));
        return { size: head.ContentLength ?? 0, content_type: head.ContentType };
      } catch {
        return null;
      }
    },

    async deletePublic(key) {
      await client.send(new DeleteObjectCommand({ Bucket: S3_PUBLIC_BUCKET, Key: key }));
    },

    publicUrl: key => `${S3_PUBLIC_BUCKET_BASE_URL.replace(/\/$/, '')}/${key}`,

    private: privateStore,
    connect,
  };
}

function s3Private(client: S3Client, bucket: string, signer = client): PrivateStore {
  return {
    bucket,

    async presignPut(key, spec, expiresIn) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: spec.contentType,
        ContentLength: spec.size,
        ChecksumSHA256: spec.sha256,
      });
      // Headers, not query parameters: storage then refuses a body whose length or hash differs.
      const url = await getSignedUrl(signer, command, {
        expiresIn,
        signableHeaders: new Set(['content-type', 'x-amz-checksum-sha256']),
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      });
      return { url, headers: { 'Content-Type': spec.contentType, 'x-amz-checksum-sha256': spec.sha256 } };
    },

    async head(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }));
        return { size: head.ContentLength ?? 0, content_type: head.ContentType, sha256: head.ChecksumSHA256 };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async presignGet(key, spec, expiresIn) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: spec.contentType,
        ResponseContentDisposition: spec.disposition,
      });
      return getSignedUrl(signer, command, { expiresIn });
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },

    async read(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async open(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!object.Body) return null;
        return { body: object.Body.transformToWebStream(), size: object.ContentLength ?? 0 };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async putStream(key, body, spec) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          // The SDK's HTTP handler takes a Node stream; the length lets it send without buffering.
          Body: Readable.fromWeb(body as unknown as NodeReadableStream),
          ContentType: spec.contentType,
          ContentLength: spec.size,
          ChecksumSHA256: spec.sha256,
        }),
      );
    },

    async probe() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
