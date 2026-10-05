import vm from 'vm';
import { logger } from './logger';

/**
 * Safely parses JSON-like strings (JavaScript Objects).
 * Falls back to strict JSON.parse if the robust parse fails or for speed.
 * Uses Node's 'vm' module to sandboxed execution of the object string.
 */

function safeLooseParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      const trimmed = text.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        const script = `(${text})`;
        return vm.runInNewContext(script, {});
      }
    } catch (_e2) {
      /* ignored */
    }
    throw e;
  }
}

/**
 * Strips non-JSON-serializable values (like functions) from the object.
 * This prevents database errors when saving strict JSON columns.
 */

function sanitizeChartData(data: unknown): unknown {
  if (!data) return null;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (_e) {
    return null;
  }
}

/**
 * Helper: Find all potential JSON object ranges { ... } in text.
 * Handles nested braces and strings correctly.
 */
function findJsonRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const stack: number[] = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        stack.push(i);
      } else if (char === '}') {
        if (stack.length > 0) {
          const start = stack.pop()!;
          if (stack.length === 0) {
            ranges.push({ start, end: i });
          }
        }
      }
    }
  }
  return ranges;
}

/**
 * Helper: Find valid JSON objects in text using brace counting.
 * Returns the object if it contains chart keys.
 */
function extractJsonWithBraces(text: string): unknown | null {
  const ranges = findJsonRanges(text);

  for (const { start, end } of ranges) {
    const candidate = text.substring(start, end + 1);
    try {
      const json = safeLooseParse(candidate) as {
        chartConfig?: unknown;
        type?: string;
        data?: unknown;
      };
      if (json.chartConfig) return json.chartConfig;
      if (
        json.type &&
        json.data &&
        typeof json.type === 'string' &&
        typeof json.data === 'object'
      ) {
        return json;
      }
    } catch (_e) {
      continue;
    }
  }
  return null;
}

export function extractChartConfig(text: string): unknown | null {
  try {
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
    const matches = [...text.matchAll(codeBlockRegex)];

    for (const match of matches) {
      if (match && match[1]) {
        try {
          const json = safeLooseParse(match[1]) as {
            chartConfig?: unknown;
            type?: string;
            data?: unknown;
          };
          if (json.chartConfig) return sanitizeChartData(json.chartConfig);
          if (json.type && json.data) return sanitizeChartData(json);
        } catch (_e) {
          continue;
        }
      }
    }

    const extracted = extractJsonWithBraces(text);
    if (extracted) return sanitizeChartData(extracted);

    return null;
  } catch (err) {
    logger.warn('Failed to extract chart config from AI response:', err);
    return null;
  }
}

export function removeChartConfig(text: string): string {
  let cleanText = text;

  try {
    // Less aggressive regex that only targets the code block itself
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;

    cleanText = cleanText.replace(codeBlockRegex, (match, group1) => {
      try {
        const json = safeLooseParse(group1) as {
          chartConfig?: unknown;
          type?: string;
          data?: unknown;
        };
        if (json.chartConfig || (json.type && json.data)) {
          return '';
        }
        return match;
      } catch (_e) {
        return match;
      }
    });

    const ranges = findJsonRanges(cleanText);

    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end } = ranges[i];
      const candidate = cleanText.substring(start, end + 1);
      try {
        const json = safeLooseParse(candidate) as {
          chartConfig?: unknown;
          type?: string;
          data?: unknown;
        };

        if (json.chartConfig || (json.type && json.data && typeof json.type === 'string')) {
          const before = cleanText.substring(0, start);
          const after = cleanText.substring(end + 1);
          cleanText = before.trimEnd() + '\n' + after.trimStart();
        }
      } catch (_e) {
        /* ignore invalid json candidate */
      }
    }

    return cleanText.replace(/\n\s*\n/g, '\n\n').trim();
  } catch (err) {
    logger.warn('Failed to remove chart config:', err);
    return text;
  }
}
