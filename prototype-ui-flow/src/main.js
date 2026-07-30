// THROWAWAY PROTOTYPE ONLY — fictional browser state, no network or system access.
// One accepted compact flow, with scenarios switchable through ?scenario= and the prototype control.

import './style.css';
import { m } from './messages.js';
import {
  scenarios,
  initialState,
  allModules,
  modules,
  habitActions,
  includesWifiPassword,
  effectiveActionResult,
  effectiveResult,
  summary,
  transition,
} from './flow-machine.js';
import {
  linearMouseCompletionIntro,
  linearMousePermissionCopy,
  pointerGuideSection,
  pointerOutcomeCopy,
  renderLinearMouseDisclosure,
  renderLinearMousePermission,
  renderPointerOutcome,
  renderPointerReport,
} from './linear-mouse-view.js';

const app = document.querySelector('#app');
const query = new URLSearchParams(location.search);
document.documentElement.classList.toggle('text-200', query.get('text') === '200');
let state = initialState(scenarios[query.get('scenario')] ? query.get('scenario') : 'normal');

const statusKey = {
  applied_verified: 'verified',
  skipped_permission: 'skipped',
  skipped_user: 'skipped',
  manual_action_required: 'manual',
  failed_recoverable: 'failed',
  unknown_requires_review: 'unknown',
  rolled_back_verified: 'rolledBack',
  partially_completed: 'partialComplete',
  partially_restored: 'partialRestored',
};

const statusLabel = (item, code) => (
  item.id === 'wifi' && code === 'skipped_permission' && state.scenario === 'uacDenied'
    ? '名称已验证，密码已跳过'
    : m[statusKey[code]] || m.unknown
);

const questions = [
  {
    id: 'keyboard',
    title: '常用 Ctrl 快捷键',
    description: '普通应用继续用 Ctrl+C / V / Z；终端和远程工具保留真实 Ctrl。',
    tags: [],
  },
  {
    id: 'external',
    title: '外接 Windows 键盘',
    description: '只对检测到的外接键盘启用兼容，不影响其他键盘。',
    tags: [],
  },
  {
    id: 'pointer',
    title: '鼠标与触控板滚动',
    description: '鼠标用 Windows 式方向，触控板保留自然滚动。',
    tags: ['thirdParty'],
  },
  {
    id: 'developer',
    title: '准备轻量开发环境',
    description: '可选 Git、Node.js 与 Python；默认不安装 Homebrew。',
    tags: ['network', 'irreversible'],
  },
  {
    id: 'wifi',
    title: '带上个人 Wi‑Fi 密码',
    description: '迁移包第一版不加密，需要 Windows 管理员授权。',
    tags: ['sensitive', 'admin'],
  },
  {
    id: 'guide',
    title: '生成简短的 Mac 使用指南',
    description: '只解释这次实际选择和完成的内容。',
    tags: [],
  },
];

const scanGroups = [
  {
    title: '操作习惯',
    items: ['Ctrl+C / V / Z', '外接 Windows 键盘', '鼠标与触控板滚动'],
  },
  {
    title: '软件与开发',
    items: ['Chrome', 'Microsoft 365', 'VS Code', 'Git', 'Node.js 22'],
  },
  {
    title: '系统设置',
    items: ['中英文输入切换', 'Caps Lock', '显示与通知建议'],
  },
  {
    title: 'Wi‑Fi',
    items: ['一个个人网络', '密码可单独选择'],
  },
];

const tag = (name) => `<span class="tag tag-${name}">${m[name]}</span>`;
const button = (label, event, payload = '', style = 'primary', disabled = false) => (
  `<button class="${style}" data-event="${event}"${payload ? ` data-payload="${payload}"` : ''}${disabled ? ' disabled' : ''}>${label}</button>`
);

const platform = () => {
  if (['scan', 'questions', 'export'].includes(state.screen)) return 'windows';
  if (state.screen === 'welcome') return 'neutral';
  return 'mac';
};

function header() {
  const current = platform();
  return `
    <header>
      <div class="logo"><b>↗ MacWin</b><small>${m.proto}</small></div>
      <strong class="demo">${m.demo}</strong>
      <div class="platforms" aria-label="当前平台">
        <span class="${current === 'windows' ? 'active' : ''}">▣ ${m.windows}</span>
        <i>交给</i>
        <span class="${current === 'mac' ? 'active' : ''}">● ${m.mac}</span>
      </div>
    </header>`;
}

function progress() {
  const current = platform();
  if (current === 'neutral') return '';

  const definitions = current === 'windows'
    ? { labels: ['检测', '选择', '导出'], screens: { scan: 0, questions: 1, export: 2 } }
    : {
        labels: ['导入', '确认', '完成'],
        screens: {
          import: 0,
          plan: 1,
          permission: 1,
          complete: 2,
          report: 2,
          guide: 2,
          home: 2,
          recovery: 2,
        },
      };
  const active = definitions.screens[state.screen] ?? 0;

  return `
    <nav class="progress" aria-label="${current === 'windows' ? 'Windows' : 'Mac'} 端进度">
      <b>${current === 'windows' ? 'Windows 准备迁移包' : 'Mac 应用迁移包'}</b>
      <div>${definitions.labels.map((label, index) => (
        `<span class="${index < active ? 'done' : ''} ${index === active ? 'current' : ''}"${index === active ? ' aria-current="step"' : ''}>
          <i aria-hidden="true">${index < active ? '✓' : index + 1}</i>${label}
        </span>`
      )).join('')}</div>
    </nav>`;
}

function page(title, intro, body, actions, kicker) {
  return `
    <main tabindex="-1">
      <span class="eyebrow">${kicker || (platform() === 'windows' ? 'Windows 端 · 演示流程' : 'Mac 端 · 演示流程')}</span>
      <h1 tabindex="-1">${title}</h1>
      <p class="intro">${intro}</p>
      ${body}
      <footer>${actions}</footer>
    </main>`;
}

function welcome() {
  return page(
    '把 Windows 习惯带到 Mac',
    '在旧 Windows 上检测并导出；已有迁移包时，直接在新 Mac 导入。',
    `<div class="entry-grid">
      <section class="entry entry-windows">
        <span>▣ Windows</span>
        <h2>从旧电脑开始</h2>
        <p>检测操作习惯、常用软件、少量系统设置和个人 Wi‑Fi。</p>
        ${button('开始兼容检测', 'START')}
      </section>
      <section class="entry entry-mac">
        <span>● Mac</span>
        <h2>已有迁移包</h2>
        <p>选择 <code>.habitpack</code>，先检查文件，再确认迁移计划。</p>
        ${button('在 Mac 导入配置', 'IMPORT_DIRECT', '', 'secondary')}
      </section>
    </div>
    <p class="quiet-note"><b>只在本机处理。</b>迁移习惯与环境，不搬个人文件、账号、浏览器资料或项目。</p>`,
    '',
    'Windows → Mac · 两个入口',
  );
}

function scan() {
  return page(
    '可以带走这些内容',
    '检测只读取已知项目，未请求管理员权限。',
    `<div class="scan-list">
      ${scanGroups.map((group) => `
        <section class="scan-group">
          <b>${group.title}</b>
          <p>${group.items.map((item) => `<span>${item}</span>`).join('')}</p>
        </section>`).join('')}
    </div>`,
    button('继续选择', 'QUESTIONS'),
  );
}

function questionPage() {
  return page(
    '选择要带走的内容',
    '常用且安全的项目已勾选；敏感或额外开发环境保持未选。',
    `<div class="choice-list">
      ${questions.map((item) => `
        <label class="choice-row">
          <input type="checkbox" data-event="TOGGLE" data-payload="${item.id}" ${state.selected[item.id] ? 'checked' : ''}/>
          <strong>${item.title}</strong>
          <span>${item.description}</span>
          <em>${item.tags.map(tag).join('')}</em>
        </label>`).join('')}
    </div>`,
    button('继续导出', 'GO_EXPORT'),
  );
}

function exportPage() {
  const uacDeclined = state.scenario === 'uacDenied' && state.selected.wifi;
  const containsSecret = includesWifiPassword(state);
  const includedModules = allModules(state).map((item) => item.title).join('、');
  const wifiSummary = uacDeclined
    ? '管理员授权已拒绝，只带走网络名称'
    : containsSecret
      ? '包含 Wi‑Fi 密码（不会在界面显示）'
      : '只带走网络名称，不含密码';

  return page(
    '导出迁移包',
    uacDeclined
      ? '密码读取已安全跳过，其他内容仍可导出。'
      : '确认内容后生成模拟迁移包，再由你交给 Mac。',
    `<div class="package-summary">
      <div><span>Windows</span><b>macwin-demo.habitpack</b><span>Mac</span></div>
      <p><b>包含：</b>${includedModules}；${wifiSummary}</p>
      <p><b>不包含：</b>个人文件、账号、浏览器资料、真实设备信息</p>
      <aside>${containsSecret ? `${tag('sensitive')}${tag('admin')} 迁移包未加密，请勿公开分享` : uacDeclined ? '权限被拒绝 · 已安全降级 · 不包含密码' : '不包含敏感信息'}</aside>
    </div>
    ${state.exported ? `
      <div class="inline-success" role="status" tabindex="-1">
        <span><b>模拟迁移包已准备好</b><small>已模拟重新检查结构与内容；没有写入磁盘或传输文件。</small></span>
        ${button('在 Mac 端继续', 'IMPORT')}
      </div>` : ''}`,
    state.exported ? button(m.reset, 'RESET', '', 'secondary') : button('生成模拟迁移包', 'EXPORT'),
  );
}

function importPage() {
  const itemCount = allModules(state).length;
  const body = state.importError
    ? `<aside class="error" role="alert"><b>已阻止导入</b><p>迁移包损坏或不符合安全规则，没有生成计划，也没有更改任何设置。请回到 Windows 重新生成。</p></aside>`
    : `<div class="file-row">
        <b aria-hidden="true">⌁</b>
        <span><strong>macwin-demo.habitpack</strong><small>Windows 11 x64 · ${itemCount} 个迁移模块 · 演示文件</small></span>
        <em>等待检查</em>
      </div>`;
  const actions = state.importError
    ? button('回到首页', 'RESET', '', 'secondary')
    : button(m.inspect, 'CHECK');

  return page(
    '导入 Windows 迁移包',
    '先检查文件。检查通过后仍必须确认迁移计划，导入不会直接改设置。',
    body,
    actions,
  );
}

function moduleRow(item) {
  const open = state.planMode === 'expanded' || state.expanded.includes(item.id);
  const included = !state.planRemoved.includes(item.id);
  const homebrewControl = item.id === 'developer' && open && included
    ? `<label class="subchoice">
        <input type="checkbox" data-event="HOMEBREW_TOGGLE" ${state.selected.homebrew ? 'checked' : ''}/>
        <span><b>同时安装 Homebrew</b><small>macOS 常用命令行软件包管理器；第三方、需联网、不可自动恢复。</small></span>
        <em>${tag('thirdParty')}${tag('irreversible')}</em>
      </label>`
    : '';
  return `
    <article class="module ${included ? '' : 'module-removed'}">
      <div class="module-head">
        <label class="plan-check">
          <input type="checkbox" data-event="PLAN_TOGGLE" data-payload="${item.id}" ${included ? 'checked' : ''}/>
          <span><strong>${item.title}</strong><small>${item.change}</small></span>
        </label>
        <em>${item.tags.map(tag).join('')}</em>
        <button class="text" data-event="EXPAND" data-payload="${item.id}" aria-expanded="${open}" aria-label="${open ? '收起' : '展开'}${item.title}说明">${open ? '收起' : '说明'}</button>
      </div>
      ${open ? `<dl>
        <dt>为什么</dt><dd>${item.why}</dd>
        <dt>好处</dt><dd>${item.benefit}</dd>
        <dt>例外</dt><dd>${item.exception}</dd>
        <dt>需要你做什么</dt><dd>${item.needs}</dd>
        <dt>恢复</dt><dd>${item.restore}</dd>
        <dt>怎么确认</dt><dd>${item.verify}</dd>
      </dl>${homebrewControl}` : ''}
    </article>`;
}

function planPage() {
  const candidates = allModules(state);
  const items = modules(state);
  const permissionCount = items.some((item) => item.id === 'habits' && (state.selected.keyboard || state.selected.external)) ? 1 : 0;
  const hasPointer = items.some((item) => item.id === 'habits') && state.selected.pointer;
  const hasHomebrew = items.some((item) => item.id === 'developer') && state.selected.homebrew;
  const thirdPartyCount = Number(hasPointer) + Number(hasHomebrew);
  const thirdPartyConfirmed = Number(hasPointer && state.linearMouseDecision === 'confirmed') + Number(hasHomebrew);
  const containsSecret = includesWifiPassword(state) && items.some((item) => item.id === 'wifi');
  return page(
    '确认 Mac 会做什么',
    '逐项保留或取消。确认后先创建迁移前快照，再模拟应用。',
    `<div class="modules">${candidates.map(moduleRow).join('')}</div>
    ${hasPointer ? renderLinearMouseDisclosure(state, tag('thirdParty')) : ''}
    <aside class="confirm-strip">
      <span><b>${items.length} 个模块 · ${thirdPartyCount} 个第三方工具（已确认 ${thirdPartyConfirmed} 个）· ${permissionCount} 项 Mac 权限</b><small>${containsSecret ? '含敏感信息的迁移包；密码不会显示或进入快照。' : '不含 Wi‑Fi 密码。'} ${hasPointer && state.linearMouseDecision !== 'confirmed' ? 'LinearMouse 未确认，指针动作将稍后处理。' : ''} 未选模块不会进入报告或指南。</small></span>
      ${button(`确认 ${items.length} 个模块并继续`, 'CONFIRM', '', 'primary', items.length === 0)}
    </aside>`,
    button('返回导入', 'IMPORT', '', 'secondary'),
  );
}

function permissionPage() {
  const items = modules(state);
  const hasHabits = items.some((item) => item.id === 'habits');
  const hasPointer = hasHabits && state.selected.pointer;
  const hasKeyboard = hasHabits && (state.selected.keyboard || state.selected.external);
  const hasDeveloper = items.some((item) => item.id === 'developer');
  const permissionDenied = state.scenario === 'permissionDenied';
  const toolPermission = linearMousePermissionCopy(state);
  return page(
    '准备应用已确认的计划',
    '迁移前快照已模拟创建并验证。拒绝权限或第三方工具只影响对应模块。',
    `<div class="snapshot-ok" role="status"><b>✓ 迁移前快照已验证</b><span>只覆盖已确认、可恢复的设置；不含 Wi‑Fi 密码。</span></div>
    <div class="permission-list">
      ${hasKeyboard ? `<section><span>${tag('permission')}</span><div><b>辅助功能权限</b><p>两个 Ctrl 子动作需要；拒绝后只跳过依赖权限的 Ctrl 动作，指针按自己的第三方确认状态处理。</p></div></section>` : ''}
      ${hasPointer ? `<section><span>${tag('thirdParty')}</span>${renderLinearMousePermission(state)}</section>` : ''}
      ${hasDeveloper && state.selected.homebrew ? `<section><span>${tag('thirdParty')}${tag('irreversible')}</span><div><b>Homebrew</b><p>第三方命令行软件包管理器；拒绝后开发工具改为稍后处理。</p></div></section>` : ''}
    </div>`,
    button(
      permissionDenied ? '模拟拒绝 Mac 权限并继续' : hasPointer ? toolPermission.button : '开始模拟应用',
      'EXECUTE',
    ),
  );
}

function resultList() {
  return `<div class="results">${modules(state).map((item) => {
    const code = effectiveResult(state, item.id) || 'unknown_requires_review';
    const actions = item.id === 'habits' ? `<ul class="action-results">${habitActions(state).map((action) => {
      const actionCode = effectiveActionResult(state, action.id) || 'unknown_requires_review';
      const outcome = action.id === 'pointerScroll' && actionCode === 'manual_action_required'
        ? renderPointerOutcome(state)
        : `<strong class="status ${actionCode}">${statusLabel(action, actionCode)}</strong>`;
      return `<li><span>${action.title}<small>${action.change}</small></span>${outcome}</li>`;
    }).join('')}</ul>` : '';
    return `<section class="result-module"><div><span><b>${item.title}</b><small>${item.change}</small></span><strong class="status ${code}">${statusLabel(item, code)}</strong></div>${actions}</section>`;
  }).join('')}</div>`;
}

function completionPage() {
  const resultSummary = summary(state.results);
  const pointerIntro = linearMouseCompletionIntro(state);
  const title = resultSummary === 'all'
    ? m.conclusionAll
    : resultSummary === 'actions'
      ? m.conclusionActions
      : m.conclusionPartial;
  const hasRetry = ['offline', 'manual'].includes(state.scenario)
    && Object.values(state.results).includes('manual_action_required');
  const hasGuide = modules(state).some((item) => item.id === 'guide');
  const intro = resultSummary === 'all'
    ? '每个模拟动作都经过结果检查。下面仍然只是演示结果。'
    : resultSummary === 'partial'
      ? '失败被隔离，其他模块保留结果；可恢复模块仍可回到迁移前状态。'
      : hasRetry
        ? '本地模块已完成；待处理项可在条件恢复后重试。'
      : pointerIntro || '未完成项只影响对应模块，其他已确认模块保留结果。';
  return page(
    title,
    intro,
    resultList(),
    `${hasRetry ? button('重试待处理项', 'RETRY') : button(m.report, 'REPORT')}${hasRetry ? button(m.report, 'REPORT', '', 'secondary') : ''}${hasGuide ? button(m.guide, 'GUIDE', '', 'secondary') : ''}${button(m.recovery, 'RECOVERY', '', 'secondary')}`,
  );
}

function reportPage() {
  return page(
    '这次迁移的报告',
    '只显示已确认模块的非敏感摘要，不含 Wi‑Fi 名称或密码、用户名、路径和账号。',
    `<div class="report">
      ${modules(state).map((item) => {
        const code = effectiveResult(state, item.id) || 'unknown_requires_review';
        const actionRows = item.id === 'habits' ? `<div class="report-actions"><b>动作结果</b><ul>${habitActions(state).map((action) => {
          const actionCode = effectiveActionResult(state, action.id) || 'unknown_requires_review';
          return action.id === 'pointerScroll' && actionCode === 'manual_action_required'
            ? `<li>${renderPointerReport(state)}</li>`
            : `<li><span>${action.title}</span><strong class="status ${actionCode}">${statusLabel(action, actionCode)}</strong></li>`;
        }).join('')}</ul></div>` : '';
        return `<section>
          <header><b>${item.title}</b><span class="status ${code}">${statusLabel(item, code)}</span></header>
          ${actionRows}<dl><dt>计划</dt><dd>${item.change}</dd><dt>原因与收益</dt><dd>${item.why}；${item.benefit}</dd><dt>验证</dt><dd>${item.verify}</dd><dt>恢复</dt><dd>${item.restore}</dd></dl>
        </section>`;
      }).join('')}
      <p class="report-note">导出格式仍由 OD-010 决定，本原型不会生成文件。</p>
    </div>`,
    `${button(m.home, 'HOME')}${modules(state).some((item) => item.id === 'guide') ? button(m.guide, 'GUIDE', '', 'secondary') : ''}`,
  );
}

function guideSections() {
  const sections = [];
  const byId = Object.fromEntries(modules(state).map((item) => [item.id, item]));
  const result = (id) => effectiveResult(state, id);

  if (byId.habits) {
    const ctrlActions = habitActions(state).filter((action) => ['builtInCtrl', 'externalCtrl'].includes(action.id));
    const ctrlResults = ctrlActions.map((action) => effectiveActionResult(state, action.id));
    const pointerResult = state.selected.pointer ? effectiveActionResult(state, 'pointerScroll') : undefined;
    if (ctrlResults.some((code) => code === 'applied_verified')) {
      sections.push(['Ctrl 兼容已完成', '已验证的内置或外接键盘可在普通应用继续使用 Ctrl；终端、远程桌面和虚拟机仍使用真实 Ctrl。']);
    } else if (ctrlResults.some((code) => code === 'rolled_back_verified')) {
      sections.push(['Ctrl 兼容已恢复', '只恢复了本次已应用的键盘动作；跳过的动作没有被标成已恢复。']);
    } else if (ctrlResults.length) {
      sections.push(['Ctrl 兼容已跳过', '辅助功能权限未允许，相关键盘动作没有应用。']);
    }
    if (pointerResult === 'applied_verified') {
      sections.push(['鼠标和触控板已分开', '鼠标使用 Windows 式滚动方向，触控板保留自然滚动。']);
    } else if (pointerResult === 'rolled_back_verified') {
      sections.push(['指针滚动已恢复', '已应用的指针动作回到迁移前状态。']);
    } else if (pointerResult === 'manual_action_required') {
      sections.push(pointerGuideSection(state));
    }
  }

  if (byId.software) {
    sections.push(result('software') === 'applied_verified'
      ? ['常用软件已核对', '只准备了 Mac 版本；账号、浏览器资料和项目没有迁移。']
      : ['常用软件稍后处理', '网络恢复后重试，或使用计划中的官方入口。']);
  }

  if (byId.developer) {
    sections.push(result('developer') === 'applied_verified'
      ? ['开发工具已核对', `Git、Node.js 与 Python 已验证${state.selected.homebrew ? '；Homebrew 也在本次计划中' : '；本次没有安装 Homebrew'}。`]
      : ['开发工具稍后处理', '项目、Token 和 SSH 私钥从未被读取，可在网络恢复后重试工具安装。']);
  }

  if (byId.system) {
    sections.push(result('system') === 'rolled_back_verified'
      ? ['系统设置已恢复', '输入、显示和通知偏好已回到迁移前状态。']
      : result('system') === 'failed_recoverable'
        ? ['系统设置没有完成', '失败被隔离，可进入恢复页回到迁移前状态。']
        : ['关闭窗口不等于退出应用', '红色按钮只关闭窗口；真正退出应用使用 Command+Q。']);
  }

  if (byId.wifi && state.selected.wifi) {
    sections.push(result('wifi') === 'skipped_permission'
      ? ['Wi‑Fi 只迁移了网络名称', 'Windows 管理员授权被拒绝，密码没有进入迁移包。']
      : ['含密码的迁移包不加密', '导入完成后，请删除不再需要的迁移包副本，不要公开分享。']);
  }

  return sections;
}

function guidePage() {
  const sections = guideSections();
  return page(
    '你的 Mac 使用指南',
    `只显示与这次选择和结果有关的 ${sections.length} 条说明。`,
    `<div class="guide-list">${sections.map(([title, copy]) => `<section><b>${title}</b><p>${copy}</p></section>`).join('')}</div>`,
    `${button(m.home, 'HOME')}${button(m.report, 'REPORT', '', 'secondary')}`,
  );
}

function homePage() {
  const resultSummary = summary(state.results);
  const title = resultSummary === 'all'
    ? m.conclusionAll
    : resultSummary === 'actions'
      ? m.conclusionActions
      : m.conclusionPartial;
  const visibleTitle = state.restored.length ? '部分设置已恢复' : title;
  const hasRetry = ['offline', 'manual'].includes(state.scenario)
    && Object.values(state.results).includes('manual_action_required');
  const hasGuide = modules(state).some((item) => item.id === 'guide');
  return page(
    '迁移主页',
    'MacWin 不常驻，也不自启动。这里只保留结果和后续操作。',
    `<div class="home-summary"><b>${visibleTitle}</b><span>刚刚 · 演示结果 · 不会持久化</span></div>
    <div class="home-actions">
      ${hasRetry ? button('重试待处理项', 'RETRY') : ''}
      ${hasGuide ? button(m.guide, 'GUIDE', '', 'secondary') : ''}
      ${button(m.report, 'REPORT', '', 'secondary')}
      ${button(m.recovery, 'RECOVERY', '', 'secondary')}
      <button disabled>检查更新（演示离线）</button>
    </div>`,
    button(m.reset, 'RESET'),
  );
}

function recoveryPage() {
  const recoverable = modules(state).filter((item) => (
    item.recoverable && (item.id === 'habits'
      ? habitActions(state).some((action) => state.actionResults[action.id] === 'applied_verified')
      : ['applied_verified', 'failed_recoverable'].includes(state.results[item.id]))
  ));
  const remaining = recoverable.filter((item) => !state.restored.includes(item.id));
  return page(
    '恢复到迁移前状态',
    '只恢复本次迁移改过的相关设置，不是恢复出厂，也不影响未参与迁移的设置。',
    `<div class="restore-list">${modules(state).map((item) => {
      const canRestore = recoverable.some((candidate) => candidate.id === item.id);
      const done = state.restored.includes(item.id);
      const actionDetails = item.id === 'habits' ? `<ul class="restore-actions">${habitActions(state).map((action) => {
        const code = effectiveActionResult(state, action.id) || 'unknown_requires_review';
        const wasApplied = state.actionResults[action.id] === 'applied_verified';
        const pointerCopy = action.id === 'pointerScroll' && code === 'manual_action_required'
          ? pointerOutcomeCopy(state)
          : null;
        const copy = code === 'rolled_back_verified'
          ? '已恢复'
          : wasApplied
            ? '可恢复'
            : pointerCopy
              ? pointerCopy.label
              : statusLabel(action, code);
        return `<li><span>${action.title}${pointerCopy ? `<small>原因：${pointerCopy.reason}</small>` : ''}</span><strong class="status ${code}">${copy}</strong></li>`;
      }).join('')}</ul>` : '';
      return `<section class="restore-module"><div><span><b>${item.title}</b><small>${canRestore ? (done ? (item.id === 'habits' ? '只恢复了已应用且可恢复的动作' : '已模拟恢复并验证') : item.restore) : '本次没有可自动恢复的设置'}</small></span>${canRestore ? button(done ? '已恢复' : m.restore, 'RESTORE', item.id, 'secondary', done) : ''}</div>${actionDetails}</section>`;
    }).join('')}</div>`,
    `${button(remaining.length ? `全部恢复（${remaining.length} 项）` : '全部可恢复项已恢复', 'RESTORE_ALL', '', 'primary', remaining.length === 0)}${button(m.home, 'HOME', '', 'secondary')}`,
  );
}

function prototypeControls() {
  return `
    <details class="prototype-controls">
      <summary>原型控制</summary>
      <div>
        <label>${m.scenario}<select data-event="SCENARIO">${Object.entries(scenarios).map(([key, value]) => `<option value="${key}" ${state.scenario === key ? 'selected' : ''}>${m[value]}</option>`).join('')}</select></label>
        <label>${m.planMode}<select data-event="MODE"><option value="collapsed">${m.collapsed}</option><option value="expanded" ${state.planMode === 'expanded' ? 'selected' : ''}>${m.expanded}</option></select></label>
        ${button(`${state.reduced ? '✓ ' : ''}${m.reduced}`, 'REDUCED', '', 'toolbutton')}
        ${button(m.reset, 'RESET', '', 'toolbutton')}
        <details class="state"><summary>${m.state}</summary><code>${JSON.stringify({ screen: state.screen, scenario: state.scenario, selected: state.selected, linearMouseDecision: state.linearMouseDecision, planRemoved: state.planRemoved, planConfirmed: state.planConfirmed, results: state.results, actionResults: state.actionResults, actionReasons: state.actionReasons, restored: state.restored, restoredActions: state.restoredActions }, null, 2)}</code></details>
      </div>
    </details>`;
}

function render(focus = {}) {
  document.documentElement.classList.toggle('reduced', state.reduced);
  const screen = {
    welcome,
    scan,
    questions: questionPage,
    export: exportPage,
    import: importPage,
    plan: planPage,
    permission: permissionPage,
    complete: completionPage,
    report: reportPage,
    guide: guidePage,
    home: homePage,
    recovery: recoveryPage,
  }[state.screen];

  app.innerHTML = `<div class="shell" data-prototype-state="${state.screen}">${header()}${progress()}${screen()}${prototypeControls()}</div>`;
  if (focus.event === 'TOGGLE' || focus.event === 'PLAN_TOGGLE') {
    app.querySelector(`input[data-payload="${focus.payload}"]`)?.focus();
  } else if (focus.event === 'HOMEBREW_TOGGLE') {
    app.querySelector('input[data-event="HOMEBREW_TOGGLE"]')?.focus();
  } else if (focus.event === 'LINEAR_MOUSE_TOGGLE') {
    app.querySelector('input[data-event="LINEAR_MOUSE_TOGGLE"]')?.focus();
  } else if (focus.event === 'EXPAND') {
    app.querySelector(`button[data-event="EXPAND"][data-payload="${focus.payload}"]`)?.focus();
  } else if (focus.event === 'MODE' || focus.event === 'SCENARIO') {
    app.querySelector(`select[data-event="${focus.event}"]`)?.focus();
  } else if (focus.event === 'REDUCED') {
    app.querySelector('button[data-event="REDUCED"]')?.focus();
  } else if (focus.event === 'EXPORT') {
    app.querySelector('.inline-success')?.focus();
  } else if (['RETRY', 'RESTORE', 'RESTORE_ALL'].includes(focus.event)) {
    app.querySelector('h1')?.focus({ preventScroll: true });
  } else if (focus.screenChanged) {
    app.querySelector('h1')?.focus({ preventScroll: true });
  }
}

function go(event, payload) {
  const previousScreen = state.screen;
  state = transition(state, event, payload);
  const url = new URL(location.href);
  url.searchParams.set('scenario', state.scenario);
  history.replaceState({}, '', url);
  render({ event, payload, screenChanged: previousScreen !== state.screen });
  if (previousScreen !== state.screen) window.scrollTo({ top: 0, behavior: state.reduced ? 'auto' : 'smooth' });
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-event]');
  if (target && target.tagName !== 'SELECT' && target.type !== 'checkbox') {
    go(target.dataset.event, target.dataset.payload);
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.event) {
    go(target.dataset.event, target.type === 'checkbox' ? target.dataset.payload : target.value);
  }
});

render();
