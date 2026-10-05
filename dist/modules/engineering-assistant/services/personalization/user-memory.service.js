"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userMemoryService = exports.UserMemoryService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../../../../config/config");
const logger_1 = require("../../../../utils/logger");
const lodash_1 = require("lodash");
const s3Client = new client_s3_1.S3Client({
    region: config_1.env.AWS_REGION,
    credentials: {
        accessKeyId: config_1.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: config_1.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = config_1.env.AWS_BUCKET_NAME;
class UserMemoryService {
    /**
     * 1. Get Memory From S3 (Jab naya Session start ho)
     */
    async getLongTermMemory(userId, orgId) {
        const key = `ea-module/orgs/${orgId}/users/${userId}/memory.json`;
        try {
            const response = await s3Client.send(new client_s3_1.GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
            const memoryString = await response.Body?.transformToString();
            return memoryString || '{}';
        }
        catch (err) {
            if (err.name === 'NoSuchKey' ||
                err.Code === 'NoSuchKey' ||
                err.$metadata?.httpStatusCode === 404) {
                // No memory yet for this specific path
                return '{}';
            }
            logger_1.logger.error(`Error fetching S3 memory for org ${orgId} / user ${userId}`, err);
            return '{}';
        }
    }
    /**
     * 2. Save/Update Memory to S3 (Jab AI ko kuch naya Fact pata chale)
     */
    async updateLongTermMemory(userId, orgId, newFacts) {
        const key = `ea-module/orgs/${orgId}/users/${userId}/memory.json`;
        // Pehle purani memory fetch karo
        let currentMemory = {};
        try {
            const existingData = await this.getLongTermMemory(userId, orgId);
            currentMemory = JSON.parse(existingData);
        }
        catch (e) {
            currentMemory = {};
        }
        // Nayi memory combine karo (Deep Merge)
        const updatedMemory = (0, lodash_1.merge)({}, currentMemory, newFacts);
        // S3 me Wapas Upload (Overwrite) kar do
        try {
            await s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: JSON.stringify(updatedMemory),
                ContentType: 'application/json',
            }));
            logger_1.logger.debug(`🧠 S3 Memory updated for org ${orgId} user ${userId}`);
        }
        catch (error) {
            logger_1.logger.error(`Error updating S3 Memory for org ${orgId} user ${userId}`, error);
        }
    }
}
exports.UserMemoryService = UserMemoryService;
exports.userMemoryService = new UserMemoryService();
