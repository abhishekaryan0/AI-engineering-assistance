import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../../config/db';
import { fileService } from '../../../services/file.service';
import { llmService } from '../../../services/llm/llm.service';
import { agentService } from '../services/core/agent.service';
import { buildEngineeringPrompt } from '../../../services/prompt.service';
import { processAIResponse } from '../../../utils/text.utils';
import { chatService } from '../../../services/chat.service';
import { AgentRequestSchema } from '../../../validators/chat.validator';
import { glossaryService } from '../../glossary';
import { responsePostProcessor } from '../../../services/utils/response.postprocessor';
import { suggestionService, Suggestion } from '../services/quality/suggestion.service';
import { logger } from '../../../utils/logger';
// import OpenAI from 'openai';
import { intentClassifierService } from '../services/core/intent-classifier.service';
import { factualityCheckerService } from '../services/quality/factuality-checker.service';
import { userBehaviorService } from '../services/personalization/user-behavior.service';
import { userPersonalizationService } from '../services/personalization/user-personalization.service';

interface UploadedFile {
  s3Key: string;
  s3Url: string;
  textContent: string;
  // usage?: OpenAI.CompletionUsage | Record<string, number> | undefined;
  filename: string;
  mimeType: string;
}

export const ChatController = {
  async sendMessage(req: Request, res: Response, _next: NextFunction) {
    let body: z.infer<typeof AgentRequestSchema>;
    let promptText: string = '';
    let settingsJSON: string | undefined;
    let sessionId: string | undefined;
    let uploadedFile: UploadedFile | null = null;
    let chartData: unknown = null;
    let orgId: string | undefined;

    try {
      body = AgentRequestSchema.parse(req.body);
      const file = req.file;
      promptText =
        body.promptText || (file ? `Analyze uploaded file: ${file.originalname}` : 'Start chat');

      settingsJSON = body.settings;
      sessionId = body.sessionId;

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const userId = user?.id;
      orgId = user?.organization_id;
      if (!userId || !orgId) {
        throw new Error('User ID and Organization ID are required');
      }
      const settingsObj = settingsJSON ? JSON.parse(settingsJSON) : undefined;

      if (sessionId) {
        const existingSession = await prisma.chat_sessions.findFirst({
          where: { id: sessionId, organization_id: orgId },
        });
        if (!existingSession) {
          sessionId = undefined;
        }
      }
      if (!sessionId) {
        const newSession = await prisma.chat_sessions.create({
          data: {
            title: promptText.slice(0, 30),
            userId: userId,
            organization_id: orgId,
            updatedAt: new Date(),
          },
        });
        sessionId = newSession.id;
      }
      // Ensure sessionId is treated as string for subsequent calls
      const activeSessionId = sessionId as string;

      let fileContext = '';
      if (file) {
        const result = await fileService.processAndUpload(
          file,
          activeSessionId,
          orgId as string,
          userId as string
        );
        fileContext = result.textContent || '';
        if (fileContext.length < 100) logger.debug(`📂 Context Preview: ${fileContext}`);
        uploadedFile = {
          ...result,
          filename: file.originalname,
          mimeType: file.mimetype,
          textContent: fileContext,
        };
      } else {
        const lastFileContent = await chatService.getLastFileContent(activeSessionId);
        if (lastFileContent) {
          fileContext = lastFileContent;
        }
      }

      const prevMessages = await chatService.getChatHistory(activeSessionId, orgId as string);
      const glossaryTerms = glossaryService.findTerms(promptText);
      logger.info(`glossaryTerms: ${glossaryTerms}`);

      // NEW: Background check for multi-intent queries (Fire and forget, to prevent blocking the user response)
      intentClassifierService
        .decomposeQuery(promptText)
        .then((decomposedQuery) => {
          if (decomposedQuery.isComposite) {
            logger.info(`🔀 Multi-intent query detected: ${decomposedQuery.reasoning}`);
          }
        })
        .catch((err) => {
          logger.debug(`ℹ️ Multi-intent check failed in background: ${err}`);
        });

      const agentOutput = await agentService.handleUserMessage({
        promptText,
        sessionId: activeSessionId,
        fileContext,
        researchMode: body.researchMode,
        chatHistory: prevMessages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        glossaryTerms,
        organizationId: orgId,
        userId,
      });

      if (agentOutput.directResponse) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const finalResponse = agentOutput.directResponse;

        res.write(`data: ${JSON.stringify({ token: finalResponse })}\n\n`);

        await chatService.saveTransaction(
          activeSessionId,
          promptText,
          finalResponse as string,
          uploadedFile,
          null,
          orgId
        );

        res.write(
          `data: ${JSON.stringify({
            end: true,
            sessionId,
            chartData: null,
            response: finalResponse,
            suggestions: [],
          })}\n\n`
        );
        res.end();
        return;
      }

      const history = prevMessages.map((m: any) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      let contextWithGlossary = agentOutput.context;
      if (glossaryTerms.length > 0) {
        contextWithGlossary += `\n\n--- GLOSSARY TERMS ---\n${glossaryTerms.join('\n\n')}\n--------------------------\n`;
      }

      const originalSystemPrompt = agentOutput.systemPrompt || 'You are a helpful AI Assistant.';
      const combinedSystemPrompt = originalSystemPrompt;

      const formattedMessages = buildEngineeringPrompt({
        promptText,
        ragContext: contextWithGlossary || '',
        history,
        settings: settingsObj,
        overrideSystemPrompt: combinedSystemPrompt,
      });

      const isWebSearch =
        agentOutput.derivedMode?.isWeb ||
        (body.researchMode && body.researchMode.includes('web_search'));
      const isDeepThinking =
        agentOutput.derivedMode?.isDeep ||
        (body.researchMode && body.researchMode.includes('deep_thinking'));

      let fullAiResponse = '';
      let suggestions: Suggestion[] = [];
      let buffer = '';
      let citations: string[] | undefined;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // We'll run the suggestion engine AFTER the LLM streaming completes so it can use the final response and history.
      if (isWebSearch || isDeepThinking) {
        const response = await llmService.chat(formattedMessages, agentOutput.model);
        const rawContent = response.content;
        citations = response.citations; // Capture citations from Perplexity/Search models

        const processed = processAIResponse(rawContent);
        fullAiResponse = processed.response;
        chartData = processed.chartData;
        res.write(`data: ${JSON.stringify({ token: fullAiResponse })}\n\n`);
      } else {
        const streamIterator = await llmService.chatStream(formattedMessages, agentOutput.model);

        for await (const chunk of streamIterator) {
          const token = chunk.choices[0]?.delta?.content || '';
          if (token) {
            fullAiResponse += token;
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        }
      }

      let finalResponse = fullAiResponse;

      if (!chartData) {
        // Universal Chart support:
        // Always attempt to parse chart data from the response, regardless of intent.
        // This allows 'smart_action', 'research' or even 'chat' to return charts if the model decides to.
        const processed = processAIResponse(fullAiResponse);
        finalResponse = processed.response;
        chartData = processed.chartData;
      } else {
        finalResponse = processAIResponse(fullAiResponse).response;
      }

      // NEW: Check factuality of response against RAG sources
      let factualityCheck = null;
      // NEW: Check factuality of response against RAG sources (Async / Non-blocking)
      // We do NOT await this because it adds significant latency to the user response.
      if (agentOutput.context && agentOutput.context.length > 100) {
        try {
          const ragSources = formattedMessages
            .filter(
              (m: any) =>
                m.role === 'user' &&
                m.content &&
                typeof m.content === 'string' &&
                m.content.includes('RETRIEVED KNOWLEDGE')
            )
            .map((m: any) => ({ content: typeof m.content === 'string' ? m.content : '' }));

          if (ragSources.length > 0) {
            // FIRE AND FORGET - Do not await, do not block response
            factualityCheckerService
              .checkFactuality(finalResponse, ragSources, promptText)
              .then((result) => {
                logger.info(
                  `✅ Factuality check: Score=${(result.factScore * 100).toFixed(0)}%, Hallucinations=${result.hallucinations.length}`
                );

                if (result.hallucinations.length > 0) {
                  logger.warn(
                    `⚠️ Potential hallucinations detected: ${result.hallucinations.map((h: any) => `"${h.claim}" (${h.severity})`).join(', ')}`
                  );
                }
              })
              .catch((err: unknown) => {
                logger.debug(`ℹ️ Factuality check failed in background: ${err}`);
              });
          }
        } catch (error) {
          logger.debug(`ℹ️ Factuality check skipped setup: ${error}`);
        }
      }

      // Fetch personalization string specifically for suggestion tailoring if missing
      const personalizationPrompt = await userPersonalizationService.getPersonalizationPrompt(
        userId as string,
        orgId as string
      );

      // Wait for parallel suggestion generation to complete
      // Generate suggestions AFTER the response is fully generated based on actual response and history
      suggestions = await suggestionService.generateSuggestions(
        promptText,
        agentOutput.context || promptText,
        finalResponse,
        history,
        agentOutput.intent || 'research',
        !!chartData,
        fileContext,
        personalizationPrompt || ''
      );

      // Adjust to chart type if chartData suddenly emerged during string process
      if (chartData && suggestions && suggestions.length > 0) {
        suggestions = suggestions.map((s) => ({
          ...s,
          type:
            s.type === 'text' &&
            (s.text.toLowerCase().includes('compare') || s.text.toLowerCase().includes('trend'))
              ? 'chart'
              : s.type,
        }));
      }

      // Use generated suggestions or fallback (Only for technical questions with valid responses)
      if (
        (!suggestions || suggestions.length === 0) &&
        agentOutput.intent !== 'chat' &&
        agentOutput.intent !== 'chat_only' &&
        !suggestionService.isRefusal(finalResponse)
      ) {
        suggestions = suggestionService.getFallbackSuggestions();
      }

      const processedResponse = await responsePostProcessor.process(
        finalResponse,
        citations,
        !!isWebSearch
      );

      finalResponse = processedResponse;

      await chatService.saveTransaction(
        activeSessionId,
        promptText,
        finalResponse,
        uploadedFile,
        chartData,
        orgId,
        suggestions
      );

      res.write(
        `data: ${JSON.stringify({
          end: true,
          sessionId,
          chartData,
          response: finalResponse,
          suggestions: suggestions.map((s) => (typeof s === 'string' ? s : s.text)),
          richSuggestions: suggestions,
        })}\n\n`
      );

      res.end();

      // ✅ NEW: Industrial User Behavior Tracking (Async / Non-blocking)
      // Extract intent and query to update user profile based on this interaction
      userBehaviorService
        .trackInteraction(
          userId as string,
          orgId as string,
          promptText,
          agentOutput.intent || 'research',
          history, // Passing conversation history for AI analysis
          agentOutput // Pass the whole agent output which contains retrieved 'context'
        )
        .catch((err) => logger.debug(`ℹ️ User behavior tracking failed: ${err}`));
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Chat Error: ${err}`);

      try {
        if (sessionId && promptText) {
          await chatService.saveTransaction(
            sessionId,
            promptText,
            `[SYSTEM ERROR]: ${err.message || 'Unknown Error'}`,
            uploadedFile,
            null,
            orgId
          );
        }
      } catch (saveErr) {
        logger.error('Failed to save error transaction:', saveErr);
      }

      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: err.message || 'An error occurred' })}\n\n`);
        res.end();
      } else {
        _next(err);
      }
    }
  },
};
