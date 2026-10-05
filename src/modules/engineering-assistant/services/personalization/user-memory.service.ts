import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../../../config/config';
import { logger } from '../../../../utils/logger';
import { merge } from 'lodash';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = env.AWS_BUCKET_NAME;

export class UserMemoryService {
  /**
   * 1. Get Memory From S3 (Jab naya Session start ho)
   */
  async getLongTermMemory(userId: string, orgId: string): Promise<string> {
    const key = `ea-module/orgs/${orgId}/users/${userId}/memory.json`;
    try {
      const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
      const memoryString = await response.Body?.transformToString();
      return memoryString || '{}';
    } catch (err: any) {
      if (
        err.name === 'NoSuchKey' ||
        err.Code === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404
      ) {
        // No memory yet for this specific path
        return '{}';
      }
      logger.error(`Error fetching S3 memory for org ${orgId} / user ${userId}`, err);
      return '{}';
    }
  }

  /**
   * 2. Save/Update Memory to S3 (Jab AI ko kuch naya Fact pata chale)
   */
  async updateLongTermMemory(userId: string, orgId: string, newFacts: Record<string, string>) {
    const key = `ea-module/orgs/${orgId}/users/${userId}/memory.json`;

    // Pehle purani memory fetch karo
    let currentMemory = {};
    try {
      const existingData = await this.getLongTermMemory(userId, orgId);
      currentMemory = JSON.parse(existingData);
    } catch (e) {
      currentMemory = {};
    }

    // Nayi memory combine karo (Deep Merge)
    const updatedMemory = merge({}, currentMemory, newFacts);

    // S3 me Wapas Upload (Overwrite) kar do
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: JSON.stringify(updatedMemory),
          ContentType: 'application/json',
        })
      );
      logger.debug(`🧠 S3 Memory updated for org ${orgId} user ${userId}`);
    } catch (error) {
      logger.error(`Error updating S3 Memory for org ${orgId} user ${userId}`, error);
    }
  }
}

export const userMemoryService = new UserMemoryService();
