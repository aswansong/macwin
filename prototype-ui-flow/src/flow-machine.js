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
    wifi: scenario === 'uacDenied',
    guide: true,
  },
  planMode: 'collapsed',
  reduced: false,
  expanded: [],
  results: {},
  restored: [],
});

export const modules = (state) => {
  const wifiHasSecret = state.selected.wifi;
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
      why: '检测到高频编辑操作、Windows 布局键盘和外接鼠标',
      benefit: '减少复制粘贴、撤销和切换输入设备时的误操作',
      exception: `${state.selected.keyboard || state.selected.external ? '终端、远程桌面和虚拟机仍保留真实 Ctrl' : ''}${state.selected.pointer && (state.selected.keyboard || state.selected.external) ? '；' : ''}${state.selected.pointer ? '分离滚动方向可能需要第三方工具' : ''}`,
      needs: `${state.selected.keyboard || state.selected.external ? '辅助功能权限' : ''}${state.selected.pointer && (state.selected.keyboard || state.selected.external) ? '与' : ''}${state.selected.pointer ? '第三方工具确认' : ''}（均为模拟）`,
      restore: '可自动恢复',
      verify: '模拟检查普通应用、真实 Ctrl 例外和两类指针设备',
      tags: state.selected.pointer ? ['thirdParty'] : [],
    });
  }

  items.push(
    {
      id: 'software',
      title: '软件与开发',
      change: '准备浏览器、办公软件和轻量开发工具的 Mac 版本',
      why: '检测到 Chrome、Microsoft 365、VS Code、Git 和 Node.js',
      benefit: '到 Mac 后不用重新研究常用软件和开发环境',
      exception: '不迁移账号、项目和浏览器资料；无网时稍后重试',
      needs: '安装前逐项确认；下载需要网络（模拟）',
      restore: '应用安装不可自动恢复',
      verify: '模拟检查应用和命令行工具版本',
      tags: ['network', 'irreversible'],
    },
    {
      id: 'system',
      title: '系统设置',
      change: '准备输入切换、显示与通知等少量安全偏好',
      why: '这些差异最容易让第一次使用 Mac 的用户困惑',
      benefit: '减少刚开机时逐项寻找系统设置的时间',
      exception: '只处理白名单设置，不复制完整个人配置',
      needs: '部分设置可能需要系统确认（模拟）',
      restore: '可自动恢复',
      verify: '模拟读取目标状态并与计划比较',
      tags: [],
    },
    {
      id: 'wifi',
      title: 'Wi‑Fi',
      change: wifiHasSecret ? '迁移个人网络与模拟凭据引用' : '只带走个人网络名称，不含密码',
      why: '检测到一个符合条件的个人 WPA2 网络',
      benefit: '在新 Mac 上更容易找到常用网络',
      exception: wifiHasSecret ? '迁移包第一版不加密；密码不会在界面显示' : '密码未选择',
      needs: wifiHasSecret ? 'Windows 管理员权限（模拟）' : '无需权限',
      restore: '仅恢复非秘密偏好',
      verify: '模拟检查网络记录，不回显密码',
      tags: wifiHasSecret ? ['sensitive', 'admin'] : [],
    },
  );

  if (state.selected.guide) {
    items.push({
      id: 'guide',
      title: 'Mac 使用指南',
      change: '生成只与本次结果有关的简短使用指南',
      why: '已预选个性化指导',
      benefit: '快速理解 Command、Option、Fn、DMG 和退出应用',
      exception: '只解释实际选择和结果，不提供通用长文',
      needs: '无需权限',
      restore: '无需恢复',
      verify: '模拟检查指南内容与结果一致',
      tags: [],
    });
  }

  return items;
};

export const resultFor = (id, scenario) => {
  if (scenario === 'permissionDenied' && id === 'habits') return 'skipped_permission';
  if (scenario === 'offline' && id === 'software') return 'manual_action_required';
  if (scenario === 'moduleFailure' && id === 'system') return 'failed_recoverable';
  if (scenario === 'toolDeclined' && id === 'habits') return 'manual_action_required';
  if (scenario === 'manual' && id === 'software') return 'manual_action_required';
  return 'applied_verified';
};

export const summary = (results) => {
  const values = Object.values(results);
  if (values.some((value) => value === 'failed_recoverable' || value === 'unknown_requires_review')) {
    return 'partial';
  }
  if (values.some((value) => value !== 'applied_verified')) return 'actions';
  return 'all';
};

export const execute = (state) => {
  if (state.screen !== 'permission' || !state.planConfirmed) return state;
  return {
    ...state,
    screen: 'complete',
    results: Object.fromEntries(modules(state).map((item) => [item.id, resultFor(item.id, state.scenario)])),
  };
};

export function transition(state, event, payload) {
  if (event === 'START') return { ...state, screen: 'scan' };
  if (event === 'IMPORT_DIRECT') return { ...state, screen: 'import' };
  if (event === 'QUESTIONS') return { ...state, screen: 'questions' };
  if (event === 'TOGGLE') {
    return { ...state, selected: { ...state.selected, [payload]: !state.selected[payload] } };
  }
  if (event === 'GO_EXPORT') return { ...state, screen: 'export', exported: false };
  if (event === 'EXPORT') return { ...state, exported: true };
  if (event === 'IMPORT') return { ...state, screen: 'import' };
  if (event === 'CHECK') {
    return state.scenario === 'corrupt'
      ? { ...state, importError: true }
      : { ...state, screen: 'plan' };
  }
  if (event === 'CONFIRM') return { ...state, screen: 'permission', planConfirmed: true };
  if (event === 'EXECUTE') return execute(state);
  if (event === 'REPORT') return { ...state, screen: 'report' };
  if (event === 'GUIDE') return { ...state, screen: 'guide' };
  if (event === 'HOME') return { ...state, screen: 'home' };
  if (event === 'RECOVERY') return { ...state, screen: 'recovery' };
  if (event === 'RESTORE') {
    return { ...state, restored: [...new Set([...state.restored, payload])] };
  }
  if (event === 'RESTORE_ALL') {
    return {
      ...state,
      restored: modules(state)
        .filter((item) => ['applied_verified', 'failed_recoverable'].includes(state.results[item.id]))
        .map((item) => item.id),
    };
  }
  if (event === 'EXPAND') {
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
