import { AgentActionHandler, ActionContext, ActionResult } from './action.interface';
import { AgentPrompts } from '../core/agent.prompts';

export class ChatOnlyAction implements AgentActionHandler {
  async handle(ctx: ActionContext): Promise<ActionResult> {
    const { currentContext, hasFile, fileContext } = ctx;

    let chatContext = currentContext;
    if (hasFile && fileContext) {
      chatContext += `\n### USER UPLOADED FILE CONTENT:\n${fileContext}\n`;
    }

    return {
      systemInstruction: AgentPrompts.CHAT,
      context: chatContext,
    };
  }
}
