// Workspace personas — system prompts injected per agent session.
//
// For Claude: passed as --append-system-prompt
// For Hermes/OpenClaw: prepended to the first user message of a new session,
//   since their CLIs don't expose a documented system-prompt flag here.

const PERSONAS = {
  default: {
    id: 'default',
    label: '默认',
    icon: '◐',
    systemPrompt: ''
  },
  coding: {
    id: 'coding',
    label: '编码',
    icon: '⌨',
    systemPrompt:
      '你处于「编码模式」。回答以代码和操作为主，少寒暄。' +
      '解释最多两句，剩下都给代码。代码块标注语言。' +
      '默认指出可运行的命令、可编辑的文件路径。'
  },
  research: {
    id: 'research',
    label: '调研',
    icon: '🔎',
    systemPrompt:
      '你处于「调研模式」。回答以信息整理为主：要点、对比、来源、不确定点。' +
      '不给完整代码（除非用户明确要求），重在帮用户建立认知。' +
      '尽量给出多角度、列出取舍。'
  },
  infra: {
    id: 'infra',
    label: '运维',
    icon: '⚙',
    systemPrompt:
      '你处于「运维模式」。关注稳定性、可观测性、自动化、回滚预案。' +
      '回答时优先指出潜在风险、依赖关系、副作用。' +
      '操作命令要给完整的安全形态（dry-run、--dry-run 等）。'
  }
};

const ORDER = ['default', 'coding', 'research', 'infra'];

function get(id) {
  return PERSONAS[id] || PERSONAS.default;
}

function list() {
  return ORDER.map(id => PERSONAS[id]);
}

module.exports = { get, list, PERSONAS };
