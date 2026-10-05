// Creates the two buckets on a local S3-compatible store (docker compose `storage`), with the
// public one readable by anyone and both accepting browser PUTs from APP_BASE_URL.
import { CreateBucketCommand, PutBucketCorsCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '@config/env';

const env = loadEnv();
const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET, S3_PUBLIC_BUCKET } = env;
if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  throw new Error('Set S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY first.');
}

const client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

async function ensure(bucket: string) {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`created ${bucket}`);
  } catch (error) {
    const name = (error as Error).name;
    if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    console.log(`${bucket} exists`);
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env.APP_BASE_URL],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

for (const bucket of [S3_PRIVATE_BUCKET, S3_PUBLIC_BUCKET].filter((b): b is string => Boolean(b))) await ensure(bucket);

if (S3_PUBLIC_BUCKET) {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${S3_PUBLIC_BUCKET}/*`] },
    ],
  };
  await client.send(new PutBucketPolicyCommand({ Bucket: S3_PUBLIC_BUCKET, Policy: JSON.stringify(policy) }));
  console.log(`${S3_PUBLIC_BUCKET} is publicly readable`);
}
