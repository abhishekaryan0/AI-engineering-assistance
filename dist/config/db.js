"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const config_1 = require("./config");
const globalForPrisma = global;
exports.prisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({
        log: config_1.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
if (config_1.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
