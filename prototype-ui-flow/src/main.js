// THROWAWAY PROTOTYPE ONLY — fictional browser state, no network or system access.

import './style.css';
import { m } from './messages.js';
import { scenarios, initialState, modules, summary, transition } from './flow-machine.js';

const app = document.querySelector('#app');
const query = new URLSearchParams(location.search);
let state = initialState(scenarios[query.get('scenario')] ? query.get('scenario') : 'normal');

const statusKey = {
  applied_verified: 'verified',
  skipped_permission: 'skipped',
  skipped_user: 'skipped',
  manual_action_required: 'manual',
  failed_recoverable: 'failed',
  unknown_requires_review: 'unknown',
};

const questions = [
  {
    id: 'keyboard',
    title: '常用 Ctrl 快捷键',
    description: '在普通应用继续用 Ctrl+C / V / Z；终端和远程工具仍保留真实 Ctrl。',
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
    description: '鼠标保持 Windows 式方向，触控板保持自然滚动。',
    tags: ['thirdParty'],
  },
  {
    id: 'wifi',
    title: '带上个人 Wi‑Fi 密码',
    description: '迁移包第一版不加密，需要 Windows 管理员授权，默认不勾选。',
    tags: ['sensitive', 'admin'],
  },
  {
    id: 'guide',
    title: '生成简短的 Mac 使用指南',
    description: '只解释这次实际迁移的内容，不给你一份通用长文。',
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
    items: ['1 个个人网络', '密码需单独确认'],
  },
];

const tag = (name) => `<span class="tag tag-${name}">${m[name]}</span>`;
const button = (label, event, payload = '', style = 'primary') => (
  `<button class="${style}" data-event="${event}"${payload ? ` data-payload="${payload}"` : ''}>${label}</button>`
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
        `<span class="${index < active ? 'done' : ''} ${index === active ? 'current' : ''}">
          <i>${index < active ? '✓' : index + 1}</i>${label}
        </span>`
      )).join('')}</div>
    </nav>`;
}

function page(title, intro, body, actions, kicker) {
  return `
    <main>
      <span class="eyebrow">${kicker || (platform() === 'windows' ? 'Windows 端 · 演示流程' : 'Mac 端 · 演示流程')}</span>
      <h1>${title}</h1>
      <p class="intro">${intro}</p>
      ${body}
      <footer>${actions}</footer>
    </main>`;
}

function welcome() {
  return page(
    '从现在这台电脑开始',
    '旧 Windows 负责检测并生成迁移包；新 Mac 直接导入已经准备好的迁移包。',
    `<div class="entry-grid">
      <section class="entry entry-windows">
        <span>▣ Windows</span>
        <h2>检测这台 Windows</h2>
        <p>自动找出能带到 Mac 的操作习惯、软件环境和少量系统设置。</p>
        ${button('开始兼容检测', 'START')}
      </section>
      <section class="entry entry-mac">
        <span>● Mac</span>
        <h2>导入迁移包</h2>
        <p>已经从旧电脑拿到 <code>.habitpack</code>？从这里直接检查并预览计划。</p>
        ${button('在 Mac 导入配置', 'IMPORT_DIRECT', '', 'secondary')}
      </section>
    </div>
    <p class="quiet-note">只迁移习惯与环境，不搬个人文件、账号、浏览器记录或项目文件。</p>`,
    '',
    'Windows → Mac · 两种入口',
  );
}

function scan() {
  return page(
    '检测完成，找到了这些内容',
    '这里只列出可以继续处理的项目。不能迁移的内容不会占用你的注意力。',
    `<div class="scan-list">
      ${scanGroups.map((group) => `
        <section class="scan-group">
          <div><b>${group.title}</b><small>${group.items.length} 项</small></div>
          <p>${group.items.map((item) => `<span>${item}</span>`).join('')}</p>
        </section>`).join('')}
    </div>`,
    button('继续选择要带走的内容', 'QUESTIONS'),
  );
}

function questionPage() {
  return page(
    '只确认这 5 项',
    '常用选项已经替你勾好。不想要的取消即可，不需要展开说明。',
    `<div class="choice-list">
      ${questions.map((item) => `
        <label class="choice-row">
          <input type="checkbox" data-event="TOGGLE" data-payload="${item.id}" ${state.selected[item.id] ? 'checked' : ''}/>
          <strong>${item.title}</strong>
          <span>${item.description}</span>
          <em>${item.tags.map(tag).join('')}</em>
        </label>`).join('')}
    </div>`,
    button('继续生成迁移包', 'GO_EXPORT'),
  );
}

function exportPage() {
  const declined = state.scenario === 'uacDenied';
  const containsSecret = state.selected.wifi && !declined;
  const includedModules = modules(state).map((item) => item.title).join('、');
  const wifiSummary = declined
    ? '管理员授权已拒绝：只带走网络名称'
    : containsSecret
      ? '包含 Wi‑Fi 密码（不会在界面显示）'
      : '只带走网络名称，不含密码';

  return page(
    '生成迁移包',
    '最后看一眼将带走的内容，然后把迁移包交给你的 Mac。',
    `<div class="package-summary">
      <div><span>Windows</span><b>macwin-demo.habitpack</b><span>Mac</span></div>
      <p><b>包含：</b>${includedModules}；${wifiSummary}</p>
      <p><b>不包含：</b>个人文件、账号、浏览器资料、真实设备信息</p>
      <aside>${containsSecret ? `${tag('sensitive')}${tag('admin')} 迁移包第一版不加密` : declined ? '已安全降级，不包含密码' : '不包含敏感信息'}</aside>
    </div>
    ${state.exported ? `
      <div class="inline-success">
        <span><b>模拟迁移包已准备好</b><small>原型不会写入磁盘或传输文件。</small></span>
        ${button('在 Mac 端继续导入', 'IMPORT')}
      </div>` : ''}`,
    state.exported ? button(m.reset, 'RESET', '', 'secondary') : button('生成模拟迁移包', 'EXPORT'),
  );
}

function importPage() {
  const body = state.importError
    ? `<aside class="error"><b>这份迁移包不能使用</b><p>文件损坏或版本不兼容。请回到 Windows 重新生成。</p></aside>`
    : `<div class="file-row">
        <b>⌁</b>
        <span><strong>macwin-demo.habitpack</strong><small>Windows 11 x64 · 5 个迁移模块 · 演示文件</small></span>
        <em>等待检查</em>
      </div>`;
  const actions = state.importError
    ? button('回到首页', 'RESET', '', 'secondary')
    : button(m.inspect, 'CHECK');

  return page(
    '导入 Windows 迁移包',
    '先检查文件，再让你确认会改什么。检查通过前不会发生任何模拟更改。',
    body,
    actions,
  );
}

function moduleRow(item) {
  const open = state.planMode === 'expanded' || state.expanded.includes(item.id);
  return `
    <article class="module">
      <div class="module-head">
        <span><strong>${item.title}</strong><small>${item.change}</small></span>
        <em>${item.tags.map(tag).join('')}</em>
        <button class="text" data-event="EXPAND" data-payload="${item.id}">${open ? '收起' : '更多'}</button>
      </div>
      ${open ? `<dl>
        <dt>为什么</dt><dd>${item.why}</dd>
        <dt>好处</dt><dd>${item.benefit}</dd>
        <dt>例外</dt><dd>${item.exception}</dd>
        <dt>需要你做什么</dt><dd>${item.needs}</dd>
        <dt>恢复</dt><dd>${item.restore}</dd>
        <dt>验证</dt><dd>${item.verify}</dd>
      </dl>` : ''}
    </article>`;
}

function planPage() {
  const items = modules(state);
  const permissionCount = (state.selected.keyboard || state.selected.external ? 1 : 0) + (state.selected.wifi ? 1 : 0);
  const thirdPartyCount = items.some((item) => item.tags.includes('thirdParty')) ? 1 : 0;
  return page(
    '确认 Mac 会做什么',
    '这是不能跳过的一页。默认只给结论，需要时再展开。',
    `<div class="modules">${items.map(moduleRow).join('')}</div>
    <aside class="confirm-strip">
      <span><b>${items.length} 个模块 · ${thirdPartyCount} 个第三方候选 · ${permissionCount} 项权限说明</b><small>确认后才会创建模拟迁移前快照。</small></span>
      ${button(m.confirm, 'CONFIRM')}
    </aside>`,
    button('返回导入', 'IMPORT', '', 'secondary'),
  );
}

function permissionPage() {
  const toolDeclined = state.scenario === 'toolDeclined';
  const permissionDenied = state.scenario === 'permissionDenied';
  return page(
    '接下来可能出现两类确认',
    '这里只提前说清原因。原型不会弹出真实系统权限框，也不会下载第三方工具。',
    `<div class="permission-list">
      ${state.selected.keyboard || state.selected.external ? `<section><span>${tag('admin')}</span><div><b>辅助功能权限</b><p>用于选择性 Ctrl 兼容；拒绝后只跳过操作习惯模块。</p></div></section>` : ''}
      ${state.selected.pointer ? `<section><span>${tag('thirdParty')}</span><div><b>LinearMouse 候选</b><p>用于分开鼠标和触控板滚动方向；拒绝后保留原生可行部分。</p></div></section>` : ''}
    </div>`,
    button(
      toolDeclined ? '模拟拒绝第三方工具' : permissionDenied ? '模拟拒绝 Mac 权限' : '模拟允许并执行',
      'EXECUTE',
    ),
  );
}

function resultList() {
  return `<div class="results">${modules(state).map((item) => {
    const code = state.results[item.id] || 'unknown_requires_review';
    return `<div><span><b>${item.title}</b><small>${item.change}</small></span><strong class="status ${code}">${m[statusKey[code]]}</strong></div>`;
  }).join('')}</div>`;
}

function completionPage() {
  const resultSummary = summary(state.results);
  const title = resultSummary === 'all'
    ? m.conclusionAll
    : resultSummary === 'actions'
      ? m.conclusionActions
      : m.conclusionPartial;
  return page(
    title,
    '下面是模拟结果，不代表设备已经发生变化。',
    resultList(),
    `${button(m.report, 'REPORT')}${state.selected.guide ? button(m.guide, 'GUIDE', '', 'secondary') : ''}${button(m.recovery, 'RECOVERY', '', 'secondary')}`,
  );
}

function reportPage() {
  return page(
    '这次迁移改了什么',
    '报告只保留非敏感摘要，不包含 Wi‑Fi 名称或密码、用户名、路径和账号。',
    `<div class="report">
      ${modules(state).map((item) => `
        <p><b>${item.title}</b><span>${m[statusKey[state.results[item.id]]] || m.unknown}</span><small>${item.change}；${item.restore}</small></p>`).join('')}
      <p class="report-note">导出格式仍由 OD-010 决定，本原型不会生成文件。</p>
    </div>`,
    button(m.home, 'HOME'),
  );
}

function guidePage() {
  const habitsApplied = state.results.habits === 'applied_verified';
  return page(
    '你的 Mac 快速指南',
    '只保留与你这次迁移结果有关的三件事。',
    `<div class="guide-list">
      <section><b>${habitsApplied ? '普通应用继续用 Ctrl' : '操作习惯尚未应用'}</b><p>${habitsApplied ? '复制、粘贴和撤销可以继续用 Ctrl；终端、远程桌面和虚拟机仍使用真实 Ctrl。' : '可以回到主页重试权限，其他模块不受影响。'}</p></section>
      <section><b>Command、Option 和 Fn</b><p>Command 是 Mac 的主要快捷键；Option 提供替代操作；Fn 控制功能键和地球仪键。</p></section>
      <section><b>关闭窗口不等于退出应用</b><p>红色按钮只关闭窗口；真正退出应用使用 Command+Q。</p></section>
    </div>`,
    button(m.home, 'HOME'),
  );
}

function homePage() {
  const resultSummary = summary(state.results);
  const title = resultSummary === 'all'
    ? m.conclusionAll
    : resultSummary === 'actions'
      ? m.conclusionActions
      : m.conclusionPartial;
  return page(
    '迁移主页',
    '只留下结果、指南、报告和恢复入口。MacWin 不常驻，也不自启动。',
    `<div class="home-summary"><b>${title}</b><span>刚刚 · 演示结果 · 不会持久化</span></div>
    <div class="home-actions">
      ${state.selected.guide ? button(m.guide, 'GUIDE', '', 'secondary') : ''}
      ${button(m.report, 'REPORT', '', 'secondary')}
      ${button(m.recovery, 'RECOVERY', '', 'secondary')}
      <button disabled>检查更新（演示离线）</button>
    </div>`,
    button(m.reset, 'RESET'),
  );
}

function recoveryPage() {
  return page(
    '恢复到迁移前状态',
    '恢复的是本次迁移前的相关设置，不是恢复出厂，也不会碰其他设置。',
    `<div class="restore-list">${modules(state).map((item) => {
      const recoverable = ['applied_verified', 'failed_recoverable'].includes(state.results[item.id]);
      const done = state.restored.includes(item.id);
      return `<div><span><b>${item.title}</b><small>${recoverable ? (done ? '已模拟恢复并验证' : '可以恢复到迁移前状态') : '本次没有可自动恢复的设置'}</small></span>${recoverable ? button(done ? '已恢复' : m.restore, 'RESTORE', item.id, 'secondary') : ''}</div>`;
    }).join('')}</div>`,
    `${button(m.restoreAll, 'RESTORE_ALL')}${button(m.home, 'HOME', '', 'secondary')}`,
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
        <details class="state"><summary>${m.state}</summary><code>${JSON.stringify({ screen: state.screen, scenario: state.scenario, planConfirmed: state.planConfirmed, results: state.results, restored: state.restored }, null, 2)}</code></details>
      </div>
    </details>`;
}

function render() {
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
}

function go(event, payload) {
  state = transition(state, event, payload);
  const url = new URL(location.href);
  url.searchParams.set('scenario', state.scenario);
  history.replaceState({}, '', url);
  render();
  window.scrollTo({ top: 0, behavior: state.reduced ? 'auto' : 'smooth' });
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
