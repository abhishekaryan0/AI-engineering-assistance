"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (typeof global !== 'undefined' && !global.DOMMatrix) {
    global.DOMMatrix = class DOMMatrix {
        constructor(init) {
            // Minimal implementation for xlsx compatibility
            this.a = 1;
            this.b = 0;
            this.c = 0;
            this.d = 1;
            this.e = 0;
            this.f = 0;
        }
    };
}
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const index_1 = __importDefault(require("./routes/index"));
const config_1 = require("./config/config");
const cors_1 = __importDefault(require("cors"));
const glossary_1 = require("./modules/glossary");
const error_middleware_1 = require("./middleware/error.middleware");
const logger_1 = require("./utils/logger");
const athena_query_1 = require("./modules/industrial-data/utils/athena-query");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
        },
    },
})); // Security Headers
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// app.use('/test-ui', express.static(path.join(__dirname, '../public')));
app.use((req, res, next) => {
    logger_1.logger.debug(`${req.method} ${req.url}`);
    next();
});
app.use('/api', index_1.default);
app.get('/', (req, res) => {
    res.send('AI Agent Backend is Running 🚀');
});
app.use(error_middleware_1.errorMiddleware);
const server = app.listen(config_1.env.PORT, () => {
    logger_1.logger.debug(`🚀 Server running on port ${config_1.env.PORT}`);
    logger_1.logger.debug(`🧠 AI Model: ${config_1.env.AI_MODEL_NAME}`);
    glossary_1.glossaryService.initialize();
    // Pre-initialize Athena schema to speed up industrial-data APIs (Forcing refresh for new columns)
    (0, athena_query_1.ensureAthenaSchema)(true).catch((err) => logger_1.logger.warn('Background Athena init warning:', err));
});
server.setTimeout(600000);
