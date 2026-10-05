import type { ByoCheckError, ByoProvider, R2Jurisdiction, StorageConnection } from '@nothingleft/types';

/** What the credentials form holds; the secret is never prefilled, since the API never returns it. */
export interface ConnectionDraft {
  provider: ByoProvider;
  account_id: string;
  jurisdiction: R2Jurisdiction;
  region: string;
  bucket: string;
  access_key_id: string;
  secret_access_key: string;
  /** Development only: a bucket the server reaches at a typed address. */
  endpoint: string;
}

export const emptyDraft = (provider: ByoProvider = 'r2'): ConnectionDraft => ({
  provider,
  account_id: '',
  jurisdiction: 'default',
  region: '',
  bucket: '',
  access_key_id: '',
  secret_access_key: '',
  endpoint: '',
});

const R2_ENDPOINT = /^https:\/\/([a-f0-9]{32})(?:\.(eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/;
const S3_ENDPOINT = /^https:\/\/s3\.([a-z0-9-]+)\.amazonaws\.com\/?$/;

/** The saved connection as the form's fields: the account ID and jurisdiction are read back out of the endpoint the server built. */
export function draftFrom(connection: StorageConnection): ConnectionDraft {
  const draft = {
    ...emptyDraft(connection.provider),
    bucket: connection.bucket,
    access_key_id: connection.access_key_id,
  };
  const r2 = R2_ENDPOINT.exec(connection.endpoint);
  if (connection.provider === 'r2' && r2) {
    return { ...draft, account_id: r2[1]!, jurisdiction: (r2[2] as R2Jurisdiction | undefined) ?? 'default' };
  }
  if (connection.provider === 's3' && S3_ENDPOINT.test(connection.endpoint))
    return { ...draft, region: connection.region };
  return { ...draft, region: connection.region === 'auto' ? '' : connection.region, endpoint: connection.endpoint };
}

/** Only the fields that apply to the provider, so a switch from R2 to S3 never sends a stale account ID. */
export function connectBody(draft: ConnectionDraft, allowEndpoint: boolean) {
  const common = {
    provider: draft.provider,
    bucket: draft.bucket.trim(),
    access_key_id: draft.access_key_id.trim(),
    secret_access_key: draft.secret_access_key,
  };
  if (allowEndpoint && draft.endpoint.trim() !== '') {
    return { ...common, endpoint: draft.endpoint.trim(), ...(draft.region ? { region: draft.region } : {}) };
  }
  return draft.provider === 'r2'
    ? {
        ...common,
        account_id: draft.account_id.trim().toLowerCase(),
        ...(draft.jurisdiction === 'default' ? {} : { jurisdiction: draft.jurisdiction }),
      }
    : { ...common, region: draft.region };
}

type Field = 'account_id' | 'region' | 'bucket' | 'access_key_id' | 'secret_access_key';

/**
 * A saved failure's input and sentence. The live 422 carries both; a connection read back later has
 * only `step.reason`, so the same words are rebuilt here from it.
 */
export function describeCheckError(
  error: ByoCheckError,
  connection: Pick<StorageConnection, 'provider' | 'bucket' | 'access_key_id' | 'region' | 'endpoint'>,
): { field: Field | null; message: string } {
  const { bucket, access_key_id: key } = connection;
  const permissions = 'write, read and delete objects in this bucket, and list it';
  switch (error.reason) {
    case 'invalid_key':
      return {
        field: 'access_key_id',
        message: `The storage provider does not recognise the access key ${key}. Copy the key ID of the key you just created.`,
      };
    case 'wrong_secret':
      return {
        field: 'secret_access_key',
        message: `The secret does not match the access key ${key}. Paste the secret again; the provider shows it only once, when the key is created.`,
      };
    case 'no_bucket':
      return {
        field: 'bucket',
        message: `There is no bucket called ${bucket} in this account. Check the bucket name, and the account ID or region.`,
      };
    case 'access_denied': {
      const what =
        error.step === 'put'
          ? `may not write files to ${bucket}`
          : error.step === 'get'
            ? `may write to ${bucket} but not read from it`
            : error.step === 'delete'
              ? `may write to and read from ${bucket} but not delete from it`
              : `may not reach ${bucket}`;
      return {
        field: 'access_key_id',
        message: `The access key ${what}. Give it exactly the permissions shown in the setup step: ${permissions}.`,
      };
    }
    case 'wrong_region':
      return {
        field: 'region',
        message: `${bucket} is not in ${connection.region}. Choose the region the bucket was created in.`,
      };
    case 'unreachable':
      return {
        field: connection.provider === 'r2' ? 'account_id' : 'region',
        message: `The storage provider did not answer at ${connection.endpoint}. Check the account ID or region, then try again.`,
      };
    case 'mismatch':
      return {
        field: null,
        message:
          'The test file read back differently from what was written. Try again; if it keeps happening, check the bucket has no rule that changes objects.',
      };
    case 'unknown':
      return {
        field: null,
        message:
          'The storage provider refused the check. Try again, or check the bucket’s settings with your provider.',
      };
  }
}
