// Workspace personas — system prompts injected per agent session.
//
// For Claude: passed as --append-system-prompt
// For Hermes/OpenClaw: prepended to the first user message of a new session,
//   since neither CLI exposes a documented system-prompt flag.
//
// LIMITATION
// ----------
// The Hermes/OpenClaw approach relies on the model "respecting" the
// "[系统指令]" / "[System]" prefix as instructions. It's a soft contract;
// model behavior is not guaranteed. If those CLIs grow a real --system-prompt
// flag in the future, replace the prefix injection in agents.js with the
// real flag — there's no automatic detection.
//
// Localization
// ------------
// We pick the prompt language based on app.getLocale() at module load. This
// keeps Chinese-locale users on Chinese instructions (the original product
// behavior) and switches anyone else to English so the model doesn't
// inadvertently reply in Chinese to an English user.
//
// We deliberately keep the persona IDs and labels stable across locales
// — only the systemPrompt body changes. UI labels translate via the icon
// + translated label table.

let _locale = 'zh';
try {
  const { app } = require('electron');
  if (app && typeof app.getLocale === 'function') {
    const raw = (app.getLocale() || '').toLowerCase();
    // Always use Chinese labels — 灵珑 is a Chinese product
    _locale = 'zh';
  }
} catch (_) {
  _locale = 'zh';
}

function setLocale(loc) {
  _locale = (loc && loc.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}

const PROMPTS = {
  zh: {
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
  },
  en: {
    coding:
      'You are in "Coding Mode". Lead with code and concrete actions; minimize pleasantries. ' +
      'At most two sentences of prose; the rest should be code. Tag code blocks with their language. ' +
      'Point out runnable commands and the file paths they apply to.',
    research:
      'You are in "Research Mode". Lead with information synthesis: bullet points, comparisons, ' +
      'sources, and unknowns. Avoid full implementations unless explicitly asked. Help the user ' +
      'build understanding; offer multiple angles and tradeoffs.',
    infra:
      'You are in "Operations Mode". Focus on stability, observability, automation, and rollback. ' +
      'Surface risks, dependencies, and side effects up front. When giving commands, prefer the ' +
      'safe form (dry-run, --dry-run, etc.) by default.',
  },
};

const LABELS = {
  zh: { default: '默认', coding: '编码', research: '调研', infra: '运维' },
  en: { default: 'Default', coding: 'Code', research: 'Research', infra: 'Ops' },
};

function _build() {
  const lang = PROMPTS[_locale] ? _locale : 'en';
  const lbl = LABELS[lang];
  return {
    default:  { id: 'default',  label: lbl.default,  icon: '◐',  systemPrompt: '' },
    coding:   { id: 'coding',   label: lbl.coding,   icon: '⌨', systemPrompt: PROMPTS[lang].coding },
    research: { id: 'research', label: lbl.research, icon: '🔎', systemPrompt: PROMPTS[lang].research },
    infra:    { id: 'infra',    label: lbl.infra,    icon: '⚙',  systemPrompt: PROMPTS[lang].infra },
  };
}

const ORDER = ['default', 'coding', 'research', 'infra'];

function get(id) {
  const personas = _build();
  return personas[id] || personas.default;
}

function list() {
  const personas = _build();
  return ORDER.map(id => personas[id]);
}

// `PERSONAS` getter — keeps the public-facing shape stable while letting
// callers see the latest locale without manually re-importing.
const PERSONAS = new Proxy({}, {
  get(_, key) {
    const personas = _build();
    return personas[key];
  },
  has(_, key) {
    return ORDER.includes(key);
  },
  ownKeys() { return ORDER; },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});

module.exports = { get, list, PERSONAS, setLocale };
