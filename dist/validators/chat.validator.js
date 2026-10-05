"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRequestSchema = void 0;
const zod_1 = require("zod");
exports.AgentRequestSchema = zod_1.z.object({
    promptText: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    researchMode: zod_1.z.string().optional(),
    settings: zod_1.z.string().optional(), // JSON string of settings
});
