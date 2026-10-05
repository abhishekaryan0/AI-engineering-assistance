export class TextHandler {
  static process(buffer: Buffer, mimeType: string): string {
    if (mimeType.includes('json')) {
      try {
        const jsonData = JSON.parse(buffer.toString('utf-8'));
        return JSON.stringify(jsonData, null, 2);
      } catch (_e) {
        return buffer.toString('utf-8'); // Fallback if invalid JSON
      }
    }
    return buffer.toString('utf-8');
  }
}
