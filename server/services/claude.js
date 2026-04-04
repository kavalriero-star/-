const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { getToolDefinitions, executeTool } = require('../tools');

let client = null;
if (config.anthropicApiKey) {
  client = new Anthropic({ apiKey: config.anthropicApiKey });
}

function buildSystemPrompt(agentContext) {
  const { agent, otherAgents, locationList } = agentContext;

  return `You are ${agent.name}, a ${agent.role} working in a virtual pixel art office.
You are an AI agent character in a collaborative virtual workspace.

## Your Identity
- Name: ${agent.name}
- Role: ${agent.role}
- Current Position: (${agent.x}, ${agent.y})
- Current State: ${agent.state}${agent.currentTask ? `\n- Current Task: ${agent.currentTask}` : ''}

## Other Agents in the Office
${otherAgents || 'No other agents currently.'}

## Available Locations
${locationList}

## Behavior Guidelines
- Stay in character as a ${agent.role} working in an office
- Use tools to move around, speak, and work on tasks
- Keep speech bubble messages short (under 80 characters)
- Be collaborative and interact with other agents when relevant
- When asked to do something, use the appropriate tool rather than just describing what you would do
- You can move to locations, speak to show your thoughts, work on tasks, spawn new agents, or interact with colleagues`;
}

function getMockResponse(agent, message) {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('move') || lowerMsg.includes('go to') || lowerMsg.includes('이동')) {
    return {
      response: `I'll head over there now!`,
      toolCalls: [{ name: 'move_to', input: { location: 'meeting_room' }, result: { success: true } }],
    };
  }
  if (lowerMsg.includes('spawn') || lowerMsg.includes('불러') || lowerMsg.includes('새로운')) {
    return {
      response: `I'll bring in a new team member!`,
      toolCalls: [{ name: 'spawn_agent', input: { name: 'Echo', role: 'QA Tester' }, result: { success: true } }],
    };
  }
  if (lowerMsg.includes('work') || lowerMsg.includes('task') || lowerMsg.includes('작업')) {
    return {
      response: `On it! I'll start working on that right away.`,
      toolCalls: [{ name: 'work_on_task', input: { task_description: 'Processing request', duration_seconds: 10 }, result: { success: true } }],
    };
  }

  return {
    response: `Hi! I'm ${agent.name}, the ${agent.role}. I'm here in the office ready to help. You can ask me to move around, work on tasks, talk to colleagues, or spawn new agents!`,
    toolCalls: [],
  };
}

async function sendAgentMessage(agent, userMessage, agentManager) {
  const agentContext = agentManager.getAgentContext(agent.id);
  if (!agentContext) throw new Error('Agent not found');

  // Mock mode if no API key
  if (!client) {
    console.log(`[Mock] ${agent.name} received: ${userMessage}`);

    // Execute mock tools for visual effect
    const mock = getMockResponse(agent, userMessage);
    for (const tc of mock.toolCalls) {
      const result = executeTool(tc.name, tc.input, agent, agentManager);
      tc.result = result;
    }

    return mock;
  }

  // Build messages
  agent.conversationHistory.push({ role: 'user', content: userMessage });

  // Trim history if too long
  if (agent.conversationHistory.length > config.maxConversationHistory) {
    agent.conversationHistory = agent.conversationHistory.slice(-config.maxConversationHistory);
  }

  const systemPrompt = buildSystemPrompt(agentContext);
  const toolCalls = [];

  let messages = [...agent.conversationHistory];

  // Tool use loop
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: getToolDefinitions(),
      messages,
    });

    // Collect text and tool_use blocks
    let textResponse = '';
    const toolUseBlocks = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textResponse += block.text;
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    // If no tool use, we're done
    if (toolUseBlocks.length === 0) {
      agent.conversationHistory.push({ role: 'assistant', content: response.content });
      return { response: textResponse, toolCalls };
    }

    // Execute tools and build tool results
    const assistantContent = response.content;
    const toolResults = [];

    for (const toolBlock of toolUseBlocks) {
      const result = executeTool(toolBlock.name, toolBlock.input, agent, agentManager);
      toolCalls.push({
        name: toolBlock.name,
        input: toolBlock.input,
        result,
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: JSON.stringify(result),
      });
    }

    // Add assistant message and tool results to continue the loop
    messages.push({ role: 'assistant', content: assistantContent });
    messages.push({ role: 'user', content: toolResults });

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, config.apiCallDelayMs));
  }

  // If we hit max iterations, return what we have
  agent.conversationHistory.push({
    role: 'assistant',
    content: [{ type: 'text', text: 'I completed several actions.' }],
  });

  return {
    response: 'I completed several actions for you!',
    toolCalls,
  };
}

module.exports = { sendAgentMessage };
