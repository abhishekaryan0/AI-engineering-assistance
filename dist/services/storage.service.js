"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const config_1 = require("../config/config");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
const s3 = new client_s3_1.S3Client({
    region: config_1.env.AWS_REGION,
    credentials: {
        accessKeyId: config_1.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: config_1.env.AWS_SECRET_ACCESS_KEY,
    },
});
exports.storageService = {
    async upload(file, folder = 'uploads', orgId, userId) {
        const fileHash = crypto_1.default.randomBytes(8).toString('hex');
        const ext = file.originalname.split('.').pop();
        let key;
        if (orgId && userId) {
            key = `ea-module/orgs/${orgId}/users/${userId}/${folder}/${fileHash}.${ext}`;
        }
        else {
            key = `${folder}/${fileHash}.${ext}`;
        }
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: config_1.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));
        return { key };
    },
    async getFileUrl(key) {
        if (!key)
            return null;
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: config_1.env.AWS_BUCKET_NAME,
                Key: key,
            });
            return await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
        }
        catch (error) {
            logger_1.logger.error('Error generating signed URL:', error);
            return null;
        }
    },
};
