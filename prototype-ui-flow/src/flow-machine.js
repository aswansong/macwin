// THROWAWAY PROTOTYPE ONLY. Pure in-memory state machine; no platform API calls.

export const scenarios = {
  normal: 'normal',
  uacDenied: 'uac',
  permissionDenied: 'permissionDenied',
  offline: 'offline',
  moduleFailure: 'failure',
  toolDeclined: 'tool',
  manual: 'manualScenario',
  recovery: 'recoverScenario',
  corrupt: 'corrupt',
};

export const initialState = (scenario = 'normal') => ({
  screen: 'welcome',
  scenario,
  planConfirmed: false,
  exported: false,
  importError: false,
  selected: {
    keyboard: true,
    external: true,
    pointer: true,
    software: true,
    developer: false,
    homebrew: false,
    wifi: false,
    guide: true,
  },
  planRemoved: [],
  planMode: 'collapsed',
  reduced: false,
  expanded: [],
  results: {},
  restored: [],
  retried: false,
});

export const includesWifiPassword = (state) => (
  state.selected.wifi && state.scenario !== 'uacDenied'
);

export const allModules = (state) => {
  const wifiHasSecret = includesWifiPassword(state);
  const habitChanges = [];
  if (state.selected.keyboard) habitChanges.push('常用 Ctrl 快捷键');
  if (state.selected.external) habitChanges.push('外接 Windows 键盘');
  if (state.selected.pointer) habitChanges.push('鼠标与触控板滚动');

  const items = [];
  if (habitChanges.length) {
    items.push({
      id: 'habits',
      title: '操作习惯',
      change: `调整：${habitChanges.join('、')}`,
      why: '这些是本次在 Windows 上确认保留的高频习惯',
      benefit: '减少复制粘贴、撤销和切换输入设备时的误操作',
      exception: `${state.selected.keyboard || state.selected.external ? '终端、远程桌面和虚拟机仍保留真实 Ctrl' : ''}${state.selected.pointer && (state.selected.keyboard || state.selected.external) ? '；' : ''}${state.selected.pointer ? '分离滚动方向可能需要第三方工具' : ''}`,
      needs: `${state.selected.keyboard || state.selected.external ? '辅助功能权限' : ''}${state.selected.pointer && (state.selected.keyboard || state.selected.external) ? '与' : ''}${state.selected.pointer ? '第三方工具确认' : ''}（均为模拟）`,
      restore: '可自动恢复到迁移前状态',
      recoverable: true,
      verify: '模拟检查普通应用、真实 Ctrl 例外和两类指针设备',
      tags: state.selected.pointer ? ['thirdParty'] : [],
    });
  }

  if (state.selected.software) {
    items.push({
      id: 'software',
      title: '常用软件',
      change: '准备 Chrome、Microsoft 365 和 VS Code 的 Mac 版本',
      why: '这些是在 Windows 上确认继续使用的白名单软件',
      benefit: '到 Mac 后不用重新寻找对应版本',
      exception: '不迁移账号、项目或浏览器资料；无网时稍后重试',
      needs: '下载需要网络，安装前仍会逐项确认（模拟）',
      restore: '已安装应用不可自动恢复',
      recoverable: false,
      verify: '模拟检查应用是否存在及版本',
      tags: ['network', 'irreversible'],
    });
  }

  if (state.selected.developer) {
    items.push({
      id: 'developer',
      title: '轻量开发环境',
      change: state.selected.homebrew
        ? '准备 Git、Node.js、Python 与 Homebrew'
        : '准备 Git、Node.js 与 Python，不安装 Homebrew',
      why: '用户主动选择了轻量开发环境',
      benefit: '减少新 Mac 上的基础开发工具准备工作',
      exception: '不读取项目、Token、SSH 私钥或聊天记录',
      needs: state.selected.homebrew
        ? 'Homebrew 是第三方命令行软件包管理器，需单独确认（模拟）'
        : '需要网络；Homebrew 保持未选择',
      restore: '已安装工具不可自动恢复',
      recoverable: false,
      verify: '模拟检查工具版本与 Apple 芯片架构',
      tags: state.selected.homebrew
        ? ['network', 'thirdParty', 'irreversible']
        : ['network', 'irreversible'],
    });
  }

  items.push({
    id: 'system',
    title: '系统设置',
    change: '准备输入切换、显示与通知等少量安全偏好',
    why: '这些差异最容易让第一次使用 Mac 的用户困惑',
    benefit: '减少刚开机时逐项寻找系统设置的时间',
    exception: '只处理白名单设置，不复制完整个人配置',
    needs: '部分设置可能需要系统确认（模拟）',
    restore: '可自动恢复到迁移前状态',
    recoverable: true,
    verify: '模拟读取目标状态并与计划比较',
    tags: [],
  });

  items.push({
    id: 'wifi',
    title: 'Wi‑Fi',
    change: wifiHasSecret
      ? '迁移个人网络与模拟凭据引用'
      : state.selected.wifi && state.scenario === 'uacDenied'
        ? '管理员授权被拒绝，只迁移网络名称'
        : '只迁移个人网络名称，不含密码',
    why: '用户选择了一个符合条件的个人 WPA2 网络',
    benefit: '在新 Mac 上更容易找到常用网络',
    exception: wifiHasSecret
      ? '迁移包第一版不加密；密码不会在界面显示'
      : state.selected.wifi && state.scenario === 'uacDenied'
        ? '密码读取已跳过，不会进入迁移包'
        : '没有选择迁移密码',
    needs: wifiHasSecret ? 'Windows 管理员权限（模拟）' : '无需权限',
    restore: '可恢复非秘密偏好；快照不保存密码',
    recoverable: true,
    verify: '模拟检查网络记录，不回显密码',
    tags: wifiHasSecret ? ['sensitive', 'admin'] : [],
  });

  if (state.selected.guide) {
    items.push({
      id: 'guide',
      title: 'Mac 使用指南',
      change: '生成只与本次选择和结果有关的简短指南',
      why: '用户保留了个性化指南',
      benefit: '只阅读这次真正会遇到的 Mac 差异',
      exception: '不会生成通用长文',
      needs: '无需权限',
      restore: '不修改系统，无需恢复',
      recoverable: false,
      verify: '模拟检查指南内容与最终结果一致',
      tags: [],
    });
  }

  return items;
};

export const modules = (state) => (
  allModules(state).filter((item) => !state.planRemoved.includes(item.id))
);

export const resultFor = (id, state) => {
  if (state.scenario === 'uacDenied' && id === 'wifi' && state.selected.wifi) {
    return 'skipped_permission';
  }
  if (state.scenario === 'permissionDenied' && id === 'habits') return 'skipped_permission';
  if (state.scenario === 'offline' && ['software', 'developer'].includes(id)) {
    return state.retried ? 'applied_verified' : 'manual_action_required';
  }
  if (state.scenario === 'moduleFailure' && id === 'system') return 'failed_recoverable';
  if (state.scenario === 'toolDeclined' && id === 'habits') return 'manual_action_required';
  if (state.scenario === 'manual' && id === 'software') return 'manual_action_required';
  return 'applied_verified';
};

export const effectiveResult = (state, id) => (
  state.restored.includes(id) ? 'rolled_back_verified' : state.results[id]
);

export const summary = (results) => {
  const values = Object.values(results);
  if (values.some((value) => value === 'failed_recoverable' || value === 'unknown_requires_review')) {
    return 'partial';
  }
  if (values.some((value) => value !== 'applied_verified')) return 'actions';
  return 'all';
};

export const execute = (state) => {
  if (state.screen !== 'permission' || !state.planConfirmed || modules(state).length === 0) return state;
  return {
    ...state,
    screen: 'complete',
    results: Object.fromEntries(modules(state).map((item) => [item.id, resultFor(item.id, state)])),
  };
};

const moveToImport = (state) => ({
  ...state,
  selected: { ...state.selected, homebrew: false },
  screen: 'import',
  importError: false,
  planConfirmed: false,
  planRemoved: [],
  expanded: [],
  results: {},
  restored: [],
  retried: false,
});

export function transition(state, event, payload) {
  if (event === 'START' && state.screen === 'welcome') return { ...state, screen: 'scan' };
  if (event === 'IMPORT_DIRECT' && state.screen === 'welcome') return moveToImport(state);
  if (event === 'QUESTIONS' && state.screen === 'scan') return { ...state, screen: 'questions' };
  if (event === 'TOGGLE' && state.screen === 'questions' && payload in state.selected) {
    const selected = { ...state.selected, [payload]: !state.selected[payload] };
    if (payload === 'developer' && !selected.developer) selected.homebrew = false;
    return { ...state, selected, planRemoved: [], planConfirmed: false, results: {}, restored: [] };
  }
  if (event === 'GO_EXPORT' && state.screen === 'questions') {
    return { ...state, screen: 'export', exported: false };
  }
  if (event === 'EXPORT' && state.screen === 'export') return { ...state, exported: true };
  if (event === 'IMPORT' && ['export', 'plan'].includes(state.screen)) return moveToImport(state);
  if (event === 'CHECK' && state.screen === 'import') {
    return state.scenario === 'corrupt'
      ? { ...state, importError: true, planConfirmed: false }
      : { ...state, screen: 'plan', importError: false, planConfirmed: false };
  }
  if (event === 'PLAN_TOGGLE' && state.screen === 'plan') {
    const planRemoved = state.planRemoved.includes(payload)
      ? state.planRemoved.filter((id) => id !== payload)
      : [...state.planRemoved, payload];
    return { ...state, planRemoved, planConfirmed: false };
  }
  if (event === 'HOMEBREW_TOGGLE' && state.screen === 'plan' && state.selected.developer) {
    return {
      ...state,
      selected: { ...state.selected, homebrew: !state.selected.homebrew },
      planConfirmed: false,
    };
  }
  if (event === 'CONFIRM' && state.screen === 'plan' && modules(state).length > 0) {
    return { ...state, screen: 'permission', planConfirmed: true };
  }
  if (event === 'EXECUTE') return execute(state);
  if (event === 'REPORT' && ['complete', 'guide', 'home', 'recovery'].includes(state.screen)) {
    return { ...state, screen: 'report' };
  }
  if (event === 'GUIDE' && ['complete', 'report', 'home', 'recovery'].includes(state.screen) && modules(state).some((item) => item.id === 'guide')) {
    return { ...state, screen: 'guide' };
  }
  if (event === 'HOME' && ['complete', 'report', 'guide', 'recovery'].includes(state.screen)) {
    return { ...state, screen: 'home' };
  }
  if (event === 'RECOVERY' && ['complete', 'report', 'guide', 'home'].includes(state.screen)) {
    return { ...state, screen: 'recovery' };
  }
  if (event === 'RETRY' && ['complete', 'home'].includes(state.screen) && ['offline', 'manual'].includes(state.scenario)) {
    return {
      ...state,
      screen: 'complete',
      retried: true,
      results: Object.fromEntries(modules(state).map((item) => [
        item.id,
        state.results[item.id] === 'manual_action_required' ? 'applied_verified' : state.results[item.id],
      ])),
    };
  }
  if (event === 'RESTORE' && state.screen === 'recovery') {
    const item = modules(state).find((module) => module.id === payload);
    if (!item?.recoverable || !['applied_verified', 'failed_recoverable'].includes(state.results[payload])) return state;
    return { ...state, restored: [...new Set([...state.restored, payload])] };
  }
  if (event === 'RESTORE_ALL' && state.screen === 'recovery') {
    return {
      ...state,
      restored: modules(state)
        .filter((item) => item.recoverable && ['applied_verified', 'failed_recoverable'].includes(state.results[item.id]))
        .map((item) => item.id),
    };
  }
  if (event === 'EXPAND' && state.screen === 'plan') {
    return {
      ...state,
      expanded: state.expanded.includes(payload)
        ? state.expanded.filter((id) => id !== payload)
        : [...state.expanded, payload],
    };
  }
  if (event === 'SCENARIO') return initialState(payload);
  if (event === 'MODE') return { ...state, planMode: payload };
  if (event === 'REDUCED') return { ...state, reduced: !state.reduced };
  if (event === 'RESET') return initialState(state.scenario);
  return state;
}
