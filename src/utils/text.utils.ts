/**
 * Utility to clean response text from AI models.
 * Ensures clean output while retaining important Markdown structure.
 *
 * CRITICAL: Preserves valid Markdown links [text](url) while removing numeric citations
 */
export const cleanResponseText = (text: string): string => {
  if (!text) return '';

  const markdownLinkRegex = /\[([^[\]]+)\]\(([^)]+)\)/g;
  const protectedLinks: Array<{ pattern: string; original: string }> = [];
  let protectedText = text;
  let linkIndex = 0;

  protectedText = protectedText.replace(markdownLinkRegex, (match) => {
    const placeholder = `__MARKDOWN_LINK_${linkIndex}__`;
    protectedLinks.push({ pattern: placeholder, original: match });
    linkIndex++;
    return placeholder;
  });

  let cleaned = protectedText
    .replace(/\[\d+\](?!\s*\()/g, '')
    .replace(/\[GLOSSARY\s+TERMS\]/gi, '')
    .replace(/\[Source\s+\d+\]/gi, '')
    .replace(/\[\d+:\s*[^\]]*\]/g, '') // Removes [1: text], [2: text] patterns
    .replace(/\\n/g, '\n');

  for (const { pattern, original } of protectedLinks) {
    cleaned = cleaned.replace(new RegExp(pattern, 'g'), original);
  }

  return cleaned
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines to max 2
    .trim();
};

import { extractChartConfig, removeChartConfig } from './extractChart';

/**
 * Processes the raw AI output:
 * 1. Extracts chart configuration (if any).
 * 2. Removes the chart config from the text.
 * 3. Cleans up the remaining text.
 */
export const processAIResponse = (fullAiResponse: string) => {
  let chartData = null;
  let finalResponse = fullAiResponse;

  const chartConfig = extractChartConfig(fullAiResponse);
  if (chartConfig) {
    chartData = chartConfig;
    finalResponse = removeChartConfig(fullAiResponse);
  }

  return {
    response: cleanResponseText(finalResponse),
    chartData,
  };
};
