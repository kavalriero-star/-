const movement = require('./movement');
const speech = require('./speech');
const work = require('./work');
const spawn = require('./spawn');
const interact = require('./interact');

const tools = [movement, speech, work, spawn, interact];

const toolMap = {};
for (const tool of tools) {
  toolMap[tool.definition.name] = tool;
}

function getToolDefinitions() {
  return tools.map(t => t.definition);
}

function executeTool(name, input, agent, agentManager) {
  const tool = toolMap[name];
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  return tool.execute(input, agent, agentManager);
}

module.exports = { getToolDefinitions, executeTool };
