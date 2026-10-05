"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextHandler = void 0;
class TextHandler {
    static process(buffer, mimeType) {
        if (mimeType.includes('json')) {
            try {
                const jsonData = JSON.parse(buffer.toString('utf-8'));
                return JSON.stringify(jsonData, null, 2);
            }
            catch (_e) {
                return buffer.toString('utf-8'); // Fallback if invalid JSON
            }
        }
        return buffer.toString('utf-8');
    }
}
exports.TextHandler = TextHandler;
