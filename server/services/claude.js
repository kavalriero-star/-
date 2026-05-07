const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

let client = null;
if (config.anthropicApiKey) {
  client = new Anthropic({ apiKey: config.anthropicApiKey });
}

function buildSystemPrompt(agent, department, taskMessage) {
  return `당신은 ${agent.name}입니다. 역할: ${agent.role}, 소속: ${agent.dept}부서.
가상 픽셀 아트 사무실에서 근무하는 AI 에이전트입니다.

## 현재 업무 요청
부서: ${department}
업무 내용: ${taskMessage}

## 행동 지침
- ${agent.role}의 전문성을 살려 구체적이고 실무적인 결과물을 작성하세요
- 마크다운 형식으로 깔끔하게 정리하세요 (##, ###, -, **, 표 등)
- 한국어로 작성하세요
- 실제 업무 보고서처럼 구체적인 수치와 일정을 포함하세요
- 응답은 간결하되 실질적인 내용으로 채우세요 (200-400자 정도)`;
}

async function getAIResponse(agent, message, department) {
  if (!client) {
    return null; // Signal to use mock
  }

  try {
    agent.conversationHistory = agent.conversationHistory || [];
    agent.conversationHistory.push({ role: 'user', content: message });

    if (agent.conversationHistory.length > config.maxConversationHistory) {
      agent.conversationHistory = agent.conversationHistory.slice(-config.maxConversationHistory);
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(agent, department, message),
      messages: agent.conversationHistory,
    });

    let textResponse = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        textResponse += block.text;
      }
    }

    agent.conversationHistory.push({
      role: 'assistant',
      content: response.content,
    });

    return { response: textResponse, toolCalls: [] };
  } catch (err) {
    console.error(`AI error for ${agent.name}:`, err.message);
    return null; // Fallback to mock
  }
}

module.exports = { getAIResponse };
