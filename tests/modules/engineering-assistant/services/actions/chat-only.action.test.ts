import { ChatOnlyAction } from '../../../../../src/modules/engineering-assistant/services/actions/chat-only.action';
import { AgentPrompts } from '../../../../../src/modules/engineering-assistant/services/core/agent.prompts';

describe('ChatOnlyAction', () => {
  let action: ChatOnlyAction;
  const mockContext: any = {
    currentContext: 'Base Context',
    hasFile: false,
    fileContext: '',
  };

  beforeEach(() => {
    action = new ChatOnlyAction();
  });

  it('should handle standard chat request', async () => {
    const result = await action.handle(mockContext);

    expect(result.systemInstruction).toBe(AgentPrompts.CHAT);
    expect(result.context).toBe('Base Context');
  });

  it('should include file context if file is present', async () => {
    const fileContext = {
      ...mockContext,
      hasFile: true,
      fileContext: 'File Content',
    };

    const result = await action.handle(fileContext);

    expect(result.context).toContain('### USER UPLOADED FILE CONTENT:');
    expect(result.context).toContain('File Content');
  });
});
