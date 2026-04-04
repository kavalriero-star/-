const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { getToolDefinitions, executeTool } = require('../tools');

let anthropicClient = null;
let geminiClient = null;
let geminiModelName = 'gemini-2.5-flash';

if (config.anthropicApiKey) {
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
} else if (config.geminiApiKey) {
  geminiClient = new GoogleGenerativeAI(config.geminiApiKey);
}

// 하위 호환성을 위해 유지
const client = anthropicClient;

async function findGeminiModel(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    console.log('사용 가능한 Gemini 모델:', models);
    // flash 계열 중 최신 우선
    const preferred = models.find(m => m.includes('flash')) || models[0];
    return preferred || 'gemini-2.5-flash';
  } catch (e) {
    console.error('모델 목록 조회 실패:', e.message);
    return 'gemini-2.5-flash';
  }
}

function getRoleWorkflow(agent, otherAgents) {
  const role = agent.role || '';
  const agentNames = otherAgents ? otherAgents : '';

  const devMatch = agentNames.match(/- ([^(]+)\(개발자[^)]*\)/);
  const devName = devMatch ? devMatch[1].trim() : '지훈';
  const designMatch = agentNames.match(/- ([^(]+)\(디자이너[^)]*\)/);
  const designName = designMatch ? designMatch[1].trim() : '소연';
  const qaMatch = agentNames.match(/- ([^(]+)\(QA[^)]*\)/);
  const qaName = qaMatch ? qaMatch[1].trim() : '현우';
  const analystMatch = agentNames.match(/- ([^(]+)\(데이터 분석가[^)]*\)/);
  const analystName = analystMatch ? analystMatch[1].trim() : '유나';

  const pmMatch = agentNames.match(/- ([^(]+)\(프로젝트 매니저[^)]*\)/);
  const pmName = pmMatch ? pmMatch[1].trim() : '민준';

  if (role === 'CEO') {
    return `
## 워크플로우 지시 (CEO)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. speak로 경영 방침 및 업무 지시 선언 (80자 이내)
2. work_on_task로 업무 지시서 작성 (목표, 방향, 기대 결과 포함)
3. interact_with_agent로 ${pmName}에게 업무 지시 및 실행 위임
4. speak로 "${pmName}에게 프로젝트를 위임합니다"`;
  }

  if (role.includes('매니저') || role.includes('PM')) {
    return `
## 워크플로우 지시 (프로젝트 매니저)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. move_to(whiteboard)로 화이트보드로 이동
2. speak "기획 시작합니다"
3. work_on_task로 기획안 상세 작성
4. interact_with_agent로 ${devName}에게 기획안 전달 및 개발 요청
5. speak로 "기획 완료, ${devName}에게 전달했습니다"`;

  } else if (role.includes('개발자')) {
    return `
## 워크플로우 지시 (개발자)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. move_to(desk_2)로 자기 책상으로 이동
2. speak "개발 시작합니다"
3. work_on_task로 요청 내용 실제 작성 (결과물 구체적으로)
4. interact_with_agent로 ${designName}에게 완성본 전달 및 디자인 검토 요청`;

  } else if (role.includes('디자이너')) {
    return `
## 워크플로우 지시 (디자이너)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. move_to(desk_3)로 자기 책상으로 이동
2. speak "디자인 검토 시작합니다"
3. work_on_task로 디자인 검토 및 개선안 작성
4. interact_with_agent로 ${qaName}에게 최종 QA 검토 요청`;

  } else if (role.includes('QA') || role.includes('테스터')) {
    return `
## 워크플로우 지시 (QA 테스터)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. move_to(desk_4)로 자기 책상으로 이동
2. speak "QA 검토 시작합니다"
3. work_on_task로 품질 검토 및 테스트 결과 작성
4. interact_with_agent로 ${analystName}에게 데이터 분석 요청`;

  } else if (role.includes('데이터 분석가') || role.includes('분석')) {
    return `
## 워크플로우 지시 (데이터 분석가)
업무를 받으면 반드시 다음 순서대로 실행한다:
1. move_to(desk_5)로 자기 책상으로 이동
2. speak "데이터 분석 시작합니다"
3. work_on_task로 데이터 분석 결과 작성
4. speak로 전체 팀에 최종 분석 결과 발표 (승인 여부 포함, 80자 이내)`;
  }
  return '';
}

function buildSystemPrompt(agentContext) {
  const { agent, otherAgents, locationList } = agentContext;
  const roleWorkflow = getRoleWorkflow(agent, otherAgents);

  return `CRITICAL RULE: You MUST respond ONLY in Korean (한국어). Never use English in your response. Every single word must be Korean.

당신은 ${agent.name}입니다. 가상 픽셀 오피스에서 일하는 ${agent.role}입니다.
당신은 실제로 업무를 수행할 수 있는 유능한 직원입니다.
반드시 한국어로만 응답하십시오. 영어로 응답하면 안 됩니다.

## 현재 상태
- 이름: ${agent.name}
- 역할: ${agent.role}
- 위치: (${agent.x}, ${agent.y})
- 상태: ${agent.state}${agent.currentTask ? `\n- 현재 작업: ${agent.currentTask}` : ''}

## 사무실 동료
${otherAgents || '현재 다른 동료 없음'}

## 이동 가능한 장소
${locationList}

## 행동 규칙 (반드시 지킬 것)
1. **항상 한국어로 답한다.**
2. **모든 요청을 실제로 수행한다.** 보고서 작성, 분석, 코딩, 기획 등 어떤 업무든 직접 해낸다.
3. **절대로 "할 수 없다", "시뮬레이션만 가능하다", "가상이라서 실제로는 못 한다"는 말을 하지 않는다.** 요청이 오면 그냥 한다.
4. **work_on_task 도구를 사용할 때 task_description에 실제 결과물(보고서 내용, 분석 결과 등)을 상세히 작성한다.**
5. 이동할 때는 move_to, 말할 때는 speak, 작업할 때는 work_on_task 도구를 사용한다.
6. speak 메시지는 80자 이내로 짧게 유지한다.
7. 동료와 협업이 필요하면 적극적으로 상호작용한다.${roleWorkflow}`;
}

function getMockResponse(agent, agentManager, message) {
  const role = agent.role || '';
  const others = agentManager.getAllAgents().filter(a => a.id !== agent.id);

  const findRole = (keyword) => others.find(a => a.role.includes(keyword));

  if (role === 'CEO') {
    const pm = findRole('매니저') || findRole('PM');
    const target = pm ? pm.name : '민준';
    const targetAgent = pm || others[0];
    return {
      response: `전 팀원 여러분, 중요한 업무를 지시합니다. ${target} PM에게 프로젝트 실행을 위임합니다.`,
      toolCalls: [
        { name: 'move_to', input: { location: 'ceo_office' }, result: { success: true } },
        { name: 'speak', input: { message: '업무 지시 시작합니다!' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `[CEO 지시] ${message} - 목표 및 방향 설정`, duration_seconds: 6 }, result: { success: true } },
        { name: 'interact_with_agent', input: { target_agent: target, message: `CEO 업무 지시: ${message}` }, result: { success: true, targetAgentId: targetAgent?.id } },
      ],
    };
  }

  if (role.includes('매니저') || role.includes('PM')) {
    const dev = findRole('개발자');
    const target = dev ? dev.name : '지훈';
    const targetAgent = dev || others[0];
    return {
      response: `팀원들에게 업무를 배분하겠습니다. 기획안을 작성하고 ${target}에게 전달합니다.`,
      toolCalls: [
        { name: 'move_to', input: { location: 'whiteboard' }, result: { success: true } },
        { name: 'speak', input: { message: '기획 시작합니다!' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `${message} - 기획안 작성 중`, duration_seconds: 8 }, result: { success: true } },
        { name: 'interact_with_agent', input: { target_agent: target, message: `기획 완료. 다음 내용으로 작업 진행해줘: ${message}` }, result: { success: true, targetAgentId: targetAgent?.id } },
      ],
    };
  }

  if (role.includes('개발자')) {
    const designer = findRole('디자이너');
    const target = designer ? designer.name : '소연';
    const targetAgent = designer || others[0];
    return {
      response: `개발 작업을 시작합니다. 완료 후 ${target}에게 검토 요청합니다.`,
      toolCalls: [
        { name: 'move_to', input: { location: 'desk_2' }, result: { success: true } },
        { name: 'speak', input: { message: '개발 시작합니다!' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `${message} - 개발/작성 중`, duration_seconds: 8 }, result: { success: true } },
        { name: 'interact_with_agent', input: { target_agent: target, message: `개발 완료. 검토 부탁해: ${message}` }, result: { success: true, targetAgentId: targetAgent?.id } },
      ],
    };
  }

  if (role.includes('디자이너')) {
    const qa = findRole('QA');
    const target = qa ? qa.name : '현우';
    const targetAgent = qa || others[0];
    return {
      response: `디자인 검토를 시작합니다. 완료 후 ${target}에게 QA 요청합니다.`,
      toolCalls: [
        { name: 'move_to', input: { location: 'desk_3' }, result: { success: true } },
        { name: 'speak', input: { message: '디자인 검토 시작!' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `${message} - 디자인 검토 중`, duration_seconds: 8 }, result: { success: true } },
        { name: 'interact_with_agent', input: { target_agent: target, message: `디자인 검토 완료. QA 진행해줘: ${message}` }, result: { success: true, targetAgentId: targetAgent?.id } },
      ],
    };
  }

  if (role.includes('QA') || role.includes('테스터')) {
    const analyst = findRole('분석가');
    const target = analyst ? analyst.name : '유나';
    const targetAgent = analyst || others[0];
    return {
      response: `QA 테스트를 시작합니다. 완료 후 ${target}에게 최종 분석 요청합니다.`,
      toolCalls: [
        { name: 'move_to', input: { location: 'desk_4' }, result: { success: true } },
        { name: 'speak', input: { message: 'QA 검토 시작!' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `${message} - QA 테스트 중`, duration_seconds: 8 }, result: { success: true } },
        { name: 'interact_with_agent', input: { target_agent: target, message: `QA 완료. 최종 분석해줘: ${message}` }, result: { success: true, targetAgentId: targetAgent?.id } },
      ],
    };
  }

  if (role.includes('데이터 분석가') || role.includes('분석')) {
    return {
      response: `데이터 분석을 완료했습니다. 전체 워크플로우가 성공적으로 마무리되었습니다! ✅`,
      toolCalls: [
        { name: 'move_to', input: { location: 'desk_5' }, result: { success: true } },
        { name: 'speak', input: { message: '분석 완료! 최종 승인합니다 ✅' }, result: { success: true } },
        { name: 'work_on_task', input: { task_description: `${message} - 최종 분석 및 승인`, duration_seconds: 8 }, result: { success: true } },
      ],
    };
  }

  return {
    response: `안녕하세요! 저는 ${agent.name}, ${agent.role}입니다.`,
    toolCalls: [],
  };
}

// Gemini용 도구 정의 변환 (Anthropic 형식 → Gemini 형식)
function toGeminiFunctionDeclarations(toolDefs) {
  return toolDefs.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

async function sendAgentMessageGemini(agent, userMessage, agentManager) {
  const agentContext = agentManager.getAgentContext(agent.id);
  if (!agentContext) throw new Error('Agent not found');

  const systemPrompt = buildSystemPrompt(agentContext);
  const toolDefs = getToolDefinitions();
  const model = geminiClient.getGenerativeModel({
    model: geminiModelName,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: toGeminiFunctionDeclarations(toolDefs) }],
  });

  // 대화 히스토리를 Gemini 형식으로 변환
  const history = agent.conversationHistory
    .filter(m => typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({ history });
  const toolCalls = [];
  let iterations = 0;
  const maxIterations = 5;
  let currentMessage = userMessage;

  agent.conversationHistory.push({ role: 'user', content: userMessage });

  if (agent.conversationHistory.length > config.maxConversationHistory) {
    agent.conversationHistory = agent.conversationHistory.slice(-config.maxConversationHistory);
  }

  while (iterations < maxIterations) {
    iterations++;

    const result = await chat.sendMessage(currentMessage);
    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const textParts = parts.filter(p => p.text);
    const funcParts = parts.filter(p => p.functionCall);

    // 응답이 비어있으면 (안전 차단 등)
    if (parts.length === 0) {
      const fallback = response.promptFeedback?.blockReason
        ? `응답이 차단되었습니다: ${response.promptFeedback.blockReason}`
        : '응답을 생성하지 못했습니다.';
      agent.conversationHistory.push({ role: 'assistant', content: fallback });
      return { response: fallback, toolCalls };
    }

    if (funcParts.length === 0) {
      const textResponse = textParts.map(p => p.text).join('');
      agent.conversationHistory.push({ role: 'assistant', content: textResponse });
      return { response: textResponse, toolCalls };
    }

    // 도구 실행
    const funcResponses = [];
    for (const part of funcParts) {
      const { name, args } = part.functionCall;
      const execResult = executeTool(name, args, agent, agentManager);
      toolCalls.push({ name, input: args, result: execResult });
      funcResponses.push({
        functionResponse: { name, response: execResult },
      });
    }

    currentMessage = funcResponses;
    await new Promise(r => setTimeout(r, config.apiCallDelayMs));
  }

  return { response: '여러 작업을 완료했습니다!', toolCalls };
}

async function sendAgentMessage(agent, userMessage, agentManager) {
  const agentContext = agentManager.getAgentContext(agent.id);
  if (!agentContext) throw new Error('Agent not found');

  // Gemini 모드
  if (geminiClient) {
    return sendAgentMessageGemini(agent, userMessage, agentManager);
  }

  // Mock mode if no API key
  if (!anthropicClient) {
    console.log(`[Mock] ${agent.name} received: ${userMessage}`);

    // Execute mock tools for visual effect
    const mock = getMockResponse(agent, agentManager, userMessage);
    for (const tc of mock.toolCalls) {
      if (tc.name !== 'interact_with_agent') {
        tc.result = executeTool(tc.name, tc.input, agent, agentManager);
      }
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

    const response = await anthropicClient.messages.create({
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

async function setApiKeys(anthropicKey, geminiKey) {
  if (anthropicKey) {
    anthropicClient = new Anthropic({ apiKey: anthropicKey });
    geminiClient = null;
    console.log('✅ Anthropic API 키 설정됨');
  } else if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    geminiModelName = await findGeminiModel(geminiKey);
    geminiClient = genAI;
    anthropicClient = null;
    console.log(`✅ Gemini API 키 설정됨 (모델: ${geminiModelName})`);
  }
}

function getMode() {
  if (anthropicClient) return 'claude';
  if (geminiClient) return 'gemini';
  return 'mock';
}

module.exports = { sendAgentMessage, setApiKeys, getMode };
