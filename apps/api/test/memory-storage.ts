import type { BucketConnection, PrivateStore, Storage, StoredObject } from '@lib/storage';

interface MemoryObject extends StoredObject {
  body: Uint8Array;
}

type Operation = 'put' | 'get' | 'delete';

/** One bucket as a map. A customer bucket also has credentials, and can be told to refuse. */
export interface MemoryBucket {
  name: string;
  objects: Map<string, MemoryObject>;
  deleted: string[];
  credentials: { accessKeyId: string; secret: string } | null;
  /** Operations the key has lost permission for: they answer AccessDenied. */
  denied: Set<Operation>;
  /** The next this-many writes fail as if the network dropped. */
  failPuts: number;
}

const storageError = (name: string) => Object.assign(new Error(name), { name });

export const BYO_TEST_ENDPOINT = 'http://byo.test.local';

/** Two accounts may each own a bucket of one name; the default endpoint keeps the bare name. */
const bucketId = (endpoint: string, name: string) =>
  endpoint === BYO_TEST_ENDPOINT ? name : `${new URL(endpoint).host}~${name}`;

/** Object storage as maps: the platform's private bucket, plus any customer bucket a test creates. `upload` plays the browser's PUT. */
export function memoryStorage() {
  const buckets = new Map<string, MemoryBucket>();
  const makeBucket = (id: string, name: string, credentials: MemoryBucket['credentials']): MemoryBucket => {
    const bucket: MemoryBucket = { name, objects: new Map(), deleted: [], credentials, denied: new Set(), failPuts: 0 };
    buckets.set(id, bucket);
    return bucket;
  };
  const platform = makeBucket('nl-private-test', 'nl-private-test', null);

  function store(
    id: string,
    name: string,
    auth: { accessKeyId: string; secretAccessKey: string } | null,
  ): PrivateStore {
    const reach = (op: Operation | null): MemoryBucket => {
      const bucket = buckets.get(id);
      if (auth) {
        if (!bucket?.credentials) throw storageError('NoSuchBucket');
        if (bucket.credentials.accessKeyId !== auth.accessKeyId) throw storageError('InvalidAccessKeyId');
        if (bucket.credentials.secret !== auth.secretAccessKey) throw storageError('SignatureDoesNotMatch');
        if (op && bucket.denied.has(op)) throw storageError('AccessDenied');
      }
      if (!bucket) throw storageError('NoSuchBucket');
      return bucket;
    };
    const write = (key: string, object: MemoryObject) => {
      const bucket = reach('put');
      if (bucket.failPuts > 0) {
        bucket.failPuts--;
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      }
      bucket.objects.set(key, object);
    };
    return {
      bucket: name,
      async presignPut(key, spec) {
        return {
          url: `https://s3.test.local/${id}/${key}?X-Amz-Signature=put`,
          headers: { 'Content-Type': spec.contentType, 'x-amz-checksum-sha256': spec.sha256 },
        };
      },
      async head(key) {
        const object = reach('get').objects.get(key);
        return object ? { size: object.size, content_type: object.content_type, sha256: object.sha256 } : null;
      },
      async presignGet(key, spec) {
        const query = new URLSearchParams({
          'response-content-type': spec.contentType,
          'response-content-disposition': spec.disposition,
          'X-Amz-Expires': '300',
          'X-Amz-Signature': 'get',
        });
        return `https://s3.test.local/${id}/${key}?${query}`;
      },
      async delete(key) {
        const bucket = reach('delete');
        bucket.objects.delete(key);
        bucket.deleted.push(key);
      },
      async put(key, body, contentType) {
        write(key, { size: body.length, content_type: contentType, body });
      },
      async read(key) {
        return reach('get').objects.get(key)?.body ?? null;
      },
      async open(key) {
        const object = reach('get').objects.get(key);
        if (!object) return null;
        return { body: new Blob([Buffer.from(object.body)]).stream(), size: object.size };
      },
      async putStream(key, body, spec) {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        write(key, { size: bytes.length, content_type: spec.contentType, sha256: spec.sha256, body: bytes });
      },
      async probe() {
        reach(null);
      },
    };
  }

  const publicObjects = new Map<string, { body: Uint8Array; content_type: string }>();
  const storage: Storage = {
    configured: false,
    presignPublicPut: async () => '',
    async putPublic(key, body, contentType) {
      publicObjects.set(key, { body, content_type: contentType });
    },
    headPublic: async () => null,
    deletePublic: async () => {},
    publicUrl: key => key,
    private: store(platform.name, platform.name, null),
    connect: (c: BucketConnection) => store(bucketId(c.endpoint, c.bucket), c.bucket, c),
  };

  const put = (bucket: MemoryBucket, key: string, size: number, sha256?: string) =>
    bucket.objects.set(key, { size, content_type: 'application/octet-stream', sha256, body: new Uint8Array(size) });

  return {
    storage,
    /** The platform bucket's objects and deletes. */
    objects: platform.objects,
    deleted: platform.deleted,
    publicObjects,
    buckets,
    objectKeyOf(publicId: string): string {
      for (const bucket of buckets.values()) {
        const key = [...bucket.objects.keys(), ...bucket.deleted].find(k => k.endsWith(publicId));
        if (key) return key;
      }
      return '';
    },
    /** The browser's PUT to the URL presign handed out, into whichever bucket it names. */
    upload(key: string, size: number, sha256?: string, bucket = platform.name) {
      put(buckets.get(bucket)!, key, size, sha256);
    },
    uploadUrl(url: string, size: number, sha256?: string) {
      const [, bucket, ...key] = new URL(url).pathname.split('/');
      put(buckets.get(bucket!)!, key.join('/'), size, sha256);
    },
    /** A PUT of real bytes, for a file the API reads back (an import). */
    uploadBytes(url: string, body: Uint8Array, sha256?: string, contentType = 'text/csv') {
      const [, bucket, ...key] = new URL(url).pathname.split('/');
      buckets.get(bucket!)!.objects.set(key.join('/'), { size: body.length, content_type: contentType, sha256, body });
    },
    /** A customer's bucket, reachable with exactly these credentials at this endpoint. */
    createBucket(name: string, accessKeyId: string, secret: string, endpoint = BYO_TEST_ENDPOINT): MemoryBucket {
      return makeBucket(bucketId(endpoint, name), name, { accessKeyId, secret });
    },
  };
}
