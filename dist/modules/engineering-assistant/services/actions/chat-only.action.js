"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatOnlyAction = void 0;
const agent_prompts_1 = require("../core/agent.prompts");
class ChatOnlyAction {
    async handle(ctx) {
        const { currentContext, hasFile, fileContext } = ctx;
        let chatContext = currentContext;
        if (hasFile && fileContext) {
            chatContext += `\n### USER UPLOADED FILE CONTENT:\n${fileContext}\n`;
        }
        return {
            systemInstruction: agent_prompts_1.AgentPrompts.CHAT,
            context: chatContext,
        };
    }
}
exports.ChatOnlyAction = ChatOnlyAction;
