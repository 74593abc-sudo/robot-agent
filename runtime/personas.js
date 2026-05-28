// Workspace personas — system prompts injected per agent session.
//
// For Claude: passed as --append-system-prompt
// For Hermes/OpenClaw: prepended to the first user message of a new session.

let _locale = 'zh';

const PROMPTS = {
  coding:
    '你处于「编码模式」。回答以代码和操作为主，少寒暄。' +
    '解释最多两句，剩下都给代码。代码块标注语言。' +
    '默认指出可运行的命令、可编辑的文件路径。',
  research:
    '你处于「调研模式」。回答以信息整理为主：要点、对比、来源、不确定点。' +
    '不给完整代码（除非用户明确要求），重在帮用户建立认知。' +
    '尽量给出多角度、列出取舍。',
  infra:
    '你处于「运维模式」。关注稳定性、可观测性、自动化、回滚预案。' +
    '回答时优先指出潜在风险、依赖关系、副作用。' +
    '操作命令要给完整的安全形态（dry-run、--dry-run 等）。',
};

const LABELS = { default: '默认', coding: '编码', research: '调研', infra: '运维' };

const ORDER = ['default', 'coding', 'research', 'infra'];

// Build once — _locale never changes in production.
const _personas = {
  default:  { id: 'default',  label: LABELS.default,  icon: '◐', systemPrompt: '' },
  coding:   { id: 'coding',   label: LABELS.coding,   icon: '⌨', systemPrompt: PROMPTS.coding },
  research: { id: 'research', label: LABELS.research, icon: '🔎', systemPrompt: PROMPTS.research },
  infra:    { id: 'infra',    label: LABELS.infra,    icon: '⚙', systemPrompt: PROMPTS.infra },
};

function get(id) {
  return _personas[id] || _personas.default;
}

function list() {
  return ORDER.map(id => _personas[id]);
}

module.exports = { get, list, PERSONAS: _personas };
