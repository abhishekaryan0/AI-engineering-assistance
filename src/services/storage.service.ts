import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/config';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export const storageService = {
  async upload(file: Express.Multer.File, folder = 'uploads', orgId?: string, userId?: string) {
    const fileHash = crypto.randomBytes(8).toString('hex');
    const ext = file.originalname.split('.').pop();

    let key: string;
    if (orgId && userId) {
      key = `ea-module/orgs/${orgId}/users/${userId}/${folder}/${fileHash}.${ext}`;
    } else {
      key = `${folder}/${fileHash}.${ext}`;
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return { key };
  },

  async getFileUrl(key: string) {
    if (!key) return null;

    try {
      const command = new GetObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
      });
      return await getSignedUrl(s3, command, { expiresIn: 3600 });
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      return null;
    }
  },
};
