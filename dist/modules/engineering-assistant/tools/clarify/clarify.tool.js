"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarifyIntentTool = void 0;
class ClarifyIntentTool {
    constructor() {
        this.name = 'ask_clarifying_question';
        this.description = 'Use THIS tool EXCLUSIVELY when the user query lacks enough information to run ANY tools, or explicitly requires a parameter that is missing (like a SINGLE Well ID). DO NOT use this tool if the user is asking a broad/global question (e.g. "[GENERAL_QUERY]") that can simply be executed via `sql_analytics_db` without a specific filter. Provide the exact question you want to ask the user. DO NOT GUESS DATA.';
        this.parameters = [
            {
                name: 'question_to_user',
                type: 'string',
                description: 'The natural language question asking the user for the missing parameter. Example: "[CLARIFYING_QUESTION]"',
                required: true,
            },
        ];
    }
    async execute(params) {
        const question = params.question_to_user;
        // We prefix with a special flag so the agent knows this is a HARD STOP
        return `CLARIFICATION_REQUIRED: ${question}`;
    }
    validate(data) {
        return { isValid: true };
    }
    getFallbackMessage(error) {
        return `Could you please clarify your request with more detail?`;
    }
}
exports.ClarifyIntentTool = ClarifyIntentTool;
