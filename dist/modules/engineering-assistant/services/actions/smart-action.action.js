"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartActionAction = void 0;
const action_interface_1 = require("./action.interface");
const query_cache_service_1 = require("../data/query-cache.service");
const ToolRegistry_1 = require("../../tools/ToolRegistry");
const tool_execution_service_1 = require("../execution/tool-execution.service");
const agent_prompts_1 = require("../core/agent.prompts");
const logger_1 = require("../../../../utils/logger");
const llm_service_1 = require("../../../../services/llm/llm.service");
const config_1 = require("../../../../config/config");
class SmartActionAction {
    async handle(ctx) {
        const { promptText, searchResult, currentContext, hasFile, fileContext } = ctx;
        logger_1.logger.debug(`🧠 Executing Smart Action (ReAct) for query: "${promptText.substring(0, 50)}..."`);
        let finalToolResult = '';
        // Check cache first
        const cachedResult = query_cache_service_1.queryCacheService.get(promptText, { type: 'smart_action' });
        if (cachedResult) {
            logger_1.logger.info('✅ Using cached smart action result');
            finalToolResult = cachedResult;
        }
        else {
            // --- ReAct Loop ---
            const toolsDocs = ToolRegistry_1.toolRegistry.getToolSignatures(ctx.organizationId);
            const systemPrompt = `You are an advanced Engineering Assistant for the Oil, Gas, and Water industry capable of reasoning and using tools to fetch internal database records.

YOU HAVE REAL-TIME ACCESS TO THE DATABASE THROUGH THE TOOLS BELOW. DO NOT SAY YOU "CANNOT DIRECTLY CONNECT". YOU MUST OUTPUT EXACTLY THE "Action" AND "Action Input" FORMAT TO RETRIEVE DATA!

Available Tools:
${toolsDocs}

Format your response EXACTLY as follows:
Thought: <reasoning about what to do>
Action: <tool_name>
Action Input: <JSON parameters>
Observation: <result of the action>
... (repeat Thought/Action/Observation N times)
Thought: I have enough information.
Final Answer: <the final answer to the user's request>

Rules:
1. YOU MUST ACTUALLY CALL A TOOL to satisfy data requests. Use "Action Input" with valid JSON only. Do not just describe what query *would* be run. Run the query!
2. CRITICAL DOMAIN RULE: You are an industrial assistant. Do NOT answer with general knowledge. If the user asks about "anomalies", "reviews", "data", they are ALWAYS referring to internal industrial data.
3. If no tool is needed at all, just provide the "Final Answer", but you MUST NOT hallucinate data.
4. Try to map vague queries (like "anomales reviews") to the closest matching tool (e.g., get_anomaly_report).
5. Always base your "Final Answer" strictly on the generic "Context" provided or the "Observation" from tools.
6. CRITICAL PRIVACY RULE: NEVER reveal ANY internal technical details to the user. This includes:
   - Database system names (e.g., [DB_ENGINE])
   - Exact table names (e.g., [INTERNAL_TABLE_NAME])
   - Internal schema or column names from the DB schema
   - Raw SQL queries you executed
   When presenting data, say "from our internal records" or "based on available data" — never mention where it technically comes from.
7. DYNAMIC TOOL SELECTION: The user can ask any type of question. You must intelligently decide WHICH tool and database is appropriate by analyzing the QUERY SCOPE:
   - If the query targets a SINGLE, EXPLICITLY NAMED entity (e.g. one specific well like 'WELL-XXXX'), prefer the specialized single-entity tool (e.g., \`get_production_data\`).
   - If the query targets MULTIPLE items, AGGREGATIONS, or UNNAMED general groups (e.g., "10 wells", "top performing pumps", "all sensors"), you MUST select a direct database query tool like \`sql_analytics_db\` to fetch it dynamically.
   - Evaluate the tool description carefully to match the required dataset.
8. EFFICIENCY RULE: Always aim to retrieve ALL required information in a SINGLE tool call. Do NOT make a first call to get one column and then a second call to get another column. Write a single comprehensive SQL SELECT with all needed columns (e.g., \`SELECT SENSOR_NAME, FIELD_NAME, UNIT, MIN_VALUE, MAX_VALUE FROM SENSOR_DEFINITIONS\`) in one shot.
`;
            let contextText = currentContext;
            // Include file context if present
            if (hasFile && fileContext) {
                contextText += `\n### USER UPLOADED FILE CONTENT:\n${fileContext}\n`;
            }
            const formattedResults = await (0, action_interface_1.formatRAGResults)(searchResult.results);
            if (formattedResults) {
                contextText += `\n### KNOWLEDGE BASE:\n${formattedResults}\n`;
            }
            const formattedHistory = (ctx.chatHistory || []).slice(-15).map((m) => ({
                role: m.role,
                content: m.content,
            }));
            const messages = [
                { role: 'system', content: systemPrompt },
                ...formattedHistory,
                { role: 'user', content: `User Query: ${promptText}\n\nContext:\n${contextText}` },
            ];
            let loopCount = 0;
            const MAX_LOOPS = 12;
            let finalAnswerFound = false;
            while (loopCount < MAX_LOOPS && !finalAnswerFound) {
                loopCount++;
                logger_1.logger.debug(`🔄 ReAct Loop Step ${loopCount}`);
                try {
                    // Use a capable instruction-following model for ReAct (e.g., GPT-4o)
                    // Reasoning models (like Perplexity or O1) ignore the strict Action/Thought formatting required here.
                    const model = config_1.env.AI_MODEL_NAME;
                    const response = await llm_service_1.llmService.chat(messages, model, 0.1);
                    const text = response.content;
                    messages.push({ role: 'assistant', content: text });
                    logger_1.logger.debug(`🤖 Agent Thought: ${text.split('\n')[0]}`); // Log just the thought/start
                    // Check for Final Answer
                    if (text.includes('Final Answer:')) {
                        finalToolResult = text.split('Final Answer:')[1].trim();
                        finalAnswerFound = true;
                        break;
                    }
                    // Check for Action
                    const actionRegex = /Action:\s*(.+)/;
                    const inputIndex = text.indexOf('Action Input:');
                    const actionMatch = text.match(actionRegex);
                    if (actionMatch && inputIndex !== -1) {
                        const toolName = actionMatch[1].trim().replace(/['"]/g, ''); // Clean quotes
                        // Extract potential JSON part
                        const potentialJson = text.substring(inputIndex + 'Action Input:'.length).trim();
                        logger_1.logger.debug(`🛠️ Attempting Action: ${toolName}`);
                        let observation = '';
                        try {
                            // Find the JSON object bounds
                            const start = potentialJson.indexOf('{');
                            const end = potentialJson.lastIndexOf('}');
                            if (start === -1 || end === -1 || start > end) {
                                throw new Error('No valid JSON object found in Action Input.');
                            }
                            const jsonStr = potentialJson.substring(start, end + 1);
                            const params = JSON.parse(jsonStr);
                            if (ctx.organizationId) {
                                params.organization_id = ctx.organizationId;
                            }
                            // Execute Tool with safety and retries
                            const execResult = await tool_execution_service_1.toolExecutionService.executeToolSafely(toolName, params);
                            if (execResult.success) {
                                if (typeof execResult.data === 'string' &&
                                    execResult.data.startsWith('CLARIFICATION_REQUIRED:')) {
                                    logger_1.logger.info('⚠️ Tool requested user clarification. Breaking ReAct loop.');
                                    finalToolResult = execResult.data.replace('CLARIFICATION_REQUIRED:', '').trim();
                                    finalAnswerFound = true;
                                    break;
                                }
                                observation = `Observation: ${execResult.data}`;
                            }
                            else {
                                observation = `Observation: Tool execution failed. Error: ${execResult.error}`;
                            }
                        }
                        catch (e) {
                            observation = `Observation: Error parsing parameters or executing tool. ${e.message}`;
                        }
                        if (!finalAnswerFound) {
                            messages.push({ role: 'user', content: observation });
                            logger_1.logger.debug(`📝 Observation added (${observation.length} chars)`);
                        }
                    }
                    else {
                        if (!text.includes('Thought:')) {
                            // If model just chats without following format, treat as final answer
                            finalToolResult = text;
                            finalAnswerFound = true;
                        }
                        else {
                            // It thought but didn't act or finish?
                            messages.push({
                                role: 'user',
                                content: 'Observation: You did not provide a valid Action or Final Answer. Please continue.',
                            });
                        }
                    }
                }
                catch (error) {
                    logger_1.logger.error(`❌ ReAct Loop Error: ${error}`);
                    finalToolResult = 'Error during reasoning process.';
                    break;
                }
            }
            if (!finalToolResult) {
                finalToolResult = 'I could not complete the request within the reasoning limit.';
            }
            // Cache the result
            if (finalAnswerFound) {
                query_cache_service_1.queryCacheService.set(promptText, finalToolResult, 'smart_action', { type: 'smart_action' }, 1800);
            }
        }
        // --- Final Response Construction ---
        // We treat the ReAct "Final Answer" as the "Tool Output" for the final formatting prompt.
        // This allows the consistent persona to be applied.
        let finalContext = currentContext;
        if (hasFile && fileContext) {
            finalContext += `\n### USER UPLOADED FILE CONTENT:\n${fileContext}\n`;
        }
        const formattedResults = await (0, action_interface_1.formatRAGResults)(searchResult.results);
        if (formattedResults) {
            finalContext += `\n### ADDITIONAL KNOWLEDGE BASE:\n${formattedResults}\n`;
        }
        const systemInstruction = agent_prompts_1.AgentPrompts.SMART_ACTION.replace('{{user_prompt}}', promptText).replace('{{tool_output}}', finalToolResult);
        return { systemInstruction, context: finalContext };
    }
}
exports.SmartActionAction = SmartActionAction;
