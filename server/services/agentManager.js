const EventEmitter = require('events');

const AGENTS_ROSTER = [
  { id:'a01', name:'태호', role:'CEO',              dept:'경영', spriteIndex:2,  homeDesk:14 },
  { id:'a02', name:'민준', role:'프로젝트 매니저',    dept:'기획', spriteIndex:0,  homeDesk:0  },
  { id:'a03', name:'지훈', role:'시니어 개발자',      dept:'개발', spriteIndex:1,  homeDesk:1  },
  { id:'a04', name:'성민', role:'백엔드 개발자',      dept:'개발', spriteIndex:13, homeDesk:2  },
  { id:'a05', name:'재현', role:'프론트 개발자',      dept:'개발', spriteIndex:11, homeDesk:3  },
  { id:'a06', name:'소연', role:'프로덕트 디자이너',   dept:'기획', spriteIndex:3,  homeDesk:4  },
  { id:'a07', name:'유나', role:'데이터 분석가',      dept:'개발', spriteIndex:5,  homeDesk:5  },
  { id:'a08', name:'현우', role:'QA 테스터',         dept:'품질', spriteIndex:4,  homeDesk:6  },
  { id:'a09', name:'다은', role:'DevOps',            dept:'개발', spriteIndex:8,  homeDesk:7  },
  { id:'a10', name:'서윤', role:'영업 팀장',         dept:'영업', spriteIndex:10, homeDesk:8  },
  { id:'a11', name:'준호', role:'영업 매니저',       dept:'영업', spriteIndex:6,  homeDesk:9  },
  { id:'a12', name:'예린', role:'구매 담당',         dept:'구매', spriteIndex:9,  homeDesk:10 },
  { id:'a13', name:'태민', role:'제조 매니저',       dept:'제조', spriteIndex:7,  homeDesk:11 },
  { id:'a14', name:'하늘', role:'인사 담당',         dept:'인사', spriteIndex:12, homeDesk:12 },
  { id:'a15', name:'시우', role:'재무 담당',         dept:'재무', spriteIndex:14, homeDesk:13 },
  { id:'a16', name:'아린', role:'리셉션',            dept:'경영', spriteIndex:15, homeDesk:15 },
];

const CHAIN_BY_DEPT = {
  '기획': ['CEO','프로젝트 매니저','프로덕트 디자이너','시니어 개발자','QA 테스터','데이터 분석가'],
  '개발': ['CEO','프로젝트 매니저','시니어 개발자','백엔드 개발자','프론트 개발자','QA 테스터'],
  '영업': ['CEO','영업 팀장','영업 매니저','데이터 분석가','프로젝트 매니저','QA 테스터'],
  '구매': ['CEO','구매 담당','재무 담당','프로젝트 매니저','QA 테스터','데이터 분석가'],
  '제조': ['CEO','제조 매니저','구매 담당','QA 테스터','데이터 분석가','프로젝트 매니저'],
  '품질': ['CEO','QA 테스터','시니어 개발자','프로덕트 디자이너','데이터 분석가','프로젝트 매니저'],
  '인사': ['CEO','인사 담당','프로젝트 매니저','재무 담당','QA 테스터','데이터 분석가'],
  '재무': ['CEO','재무 담당','데이터 분석가','프로젝트 매니저','QA 테스터','시니어 개발자'],
};

class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
  }

  initAgents() {
    for (const data of AGENTS_ROSTER) {
      this.agents.set(data.id, {
        ...data,
        state: 'idle',
        currentTask: null,
        conversationHistory: [],
      });
    }
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAgentByRole(role) {
    for (const agent of this.agents.values()) {
      if (agent.role === role) return agent;
    }
    return null;
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      dept: a.dept,
      spriteIndex: a.spriteIndex,
      homeDesk: a.homeDesk,
      state: a.state,
      currentTask: a.currentTask,
    }));
  }

  getChainRoles(department) {
    return CHAIN_BY_DEPT[department] || CHAIN_BY_DEPT['기획'];
  }

  getAgentContext(id) {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const otherAgents = Array.from(this.agents.values())
      .filter(a => a.id !== id)
      .map(a => `- ${a.name} (${a.role}, ${a.dept}부서): ${a.state}${a.currentTask ? `, 작업: ${a.currentTask}` : ''}`);

    return {
      agent,
      otherAgents: otherAgents.join('\n'),
    };
  }
}

const agentManager = new AgentManager();
module.exports = { agentManager, AgentManager, CHAIN_BY_DEPT };
