// Checks this server can write and read the private media bucket. Prints only OK/FAIL.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
const bucket = process.env.MEDIA_BUCKET || 'soundbeats-ethglobal-media-20261106';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const Key = 'artist_uploads/_selftest.txt';
try {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body: 'ok', ServerSideEncryption: 'AES256' }));
  await s3.send(new GetObjectCommand({ Bucket: bucket, Key }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })).catch(() => {});
  console.log('S3-OK');
} catch (error) {
  console.log('S3-FAIL:', error.name, '-', error.message);
  process.exit(1);
}
