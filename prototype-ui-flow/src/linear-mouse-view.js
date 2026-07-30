// THROWAWAY PROTOTYPE ONLY. Pure presentation helpers shared by the UI and tests.

import { linearMouseDecision, linearMouseExecutionMode } from './flow-machine.js';

export const renderLinearMouseDisclosure = (state, thirdPartyTag = '') => `
  <section class="tool-consent" aria-labelledby="linearmouse-title">
    <header>
      <span>${thirdPartyTag}</span>
      <div><b id="linearmouse-title">LinearMouse · 独立知情确认</b><small>指针习惯在 Windows 端被选中，不代表同意使用或安装此工具。</small></div>
    </header>
    <dl>
      <dt>名称与用途</dt><dd>LinearMouse 候选；用于尝试让鼠标采用 Windows 式滚动、触控板保留自然滚动。</dd>
      <dt>候选来源</dt><dd>候选为 LinearMouse 官方项目发布页；具体地址与来源真实性待 M2 / OD-007 验证。</dd>
      <dt>版本策略</dt><dd>待 M2 / OD-007 验证；未确定版本号、版本锁定方式或更新策略。</dd>
      <dt>许可证入口</dt><dd>待 M2 / OD-007 验证；未确定入口网址或许可证结论。</dd>
      <dt>所需权限</dt><dd>候选方案可能需要 macOS 辅助功能权限，实际最小权限待 M2 / OD-007 验证。</dd>
      <dt>是否常驻</dt><dd>为持续区分两类设备，候选工具可能需要在登录后运行；启动方式与资源影响待 M2 / OD-007 验证。</dd>
      <dt>已知冲突或兼容性影响</dt><dd>待 M2 / OD-007 验证；未确定与其他输入工具、系统版本或设备类型的冲突结论。</dd>
      <dt>停用或卸载影响</dt><dd>分离滚动方向将停止；准确恢复行为及对当时系统滚动设置的影响待 M2 / OD-007 验证。Ctrl 子动作不受影响。</dd>
    </dl>
    <p class="prototype-boundary"><b>候选事实，尚未批准。</b>以上技术值均未确定；本原型不下载、不安装、不请求真实权限，也不执行任何系统操作。</p>
    <label class="tool-consent-check">
      <input type="checkbox" data-event="LINEAR_MOUSE_TOGGLE" ${state.linearMouseDecision === 'confirmed' ? 'checked' : ''}/>
      <span><b>我单独确认在本次演示计划中使用 LinearMouse 候选</b><small>保持未选也能继续；只有鼠标与触控板滚动进入“稍后处理”，两个 Ctrl 动作继续。</small></span>
    </label>
  </section>`;

export const linearMousePermissionCopy = (state) => {
  const mode = linearMouseExecutionMode(state);
  if (mode === 'decline_after_confirm') {
    return {
      status: '已单独确认 · 本步将模拟确认后拒绝',
      detail: '点击继续会把本次候选工具决定记录为“已确认后拒绝”；只有指针动作留待处理，Ctrl 子动作继续。',
      button: '模拟已确认后拒绝并继续',
    };
  }
  if (mode === 'confirmed') {
    return {
      status: '已单独确认',
      detail: '仅模拟使用候选工具，仍不会下载、安装或请求真实权限。',
      button: '开始模拟应用',
    };
  }
  if (mode === 'declined') {
    return {
      status: '已确认后拒绝',
      detail: '候选工具没有应用；只有指针动作留待处理，Ctrl 子动作继续。',
      button: '继续查看结果',
    };
  }
  return {
    status: '未确认',
    detail: '没有同意使用候选工具；只有指针动作留待处理，Ctrl 子动作继续。',
    button: '按未确认继续模拟应用',
  };
};

export const pointerOutcomeCopy = (state) => {
  const reason = state.actionReasons.pointerScroll;
  if (reason === 'linear_mouse_declined_after_confirm') {
    return {
      label: '已确认后拒绝，稍后处理',
      reason: '已在计划中单独确认 LinearMouse 候选，随后在执行前拒绝；候选工具没有应用。',
    };
  }
  if (reason === 'linear_mouse_unconfirmed') {
    return {
      label: '未确认，稍后处理',
      reason: '没有单独确认 LinearMouse 候选，因此没有应用指针动作。',
    };
  }
  if (linearMouseDecision(state) === 'confirmed') {
    return { label: '已验证', reason: '已单独确认候选工具并完成本次模拟检查。' };
  }
  return { label: '稍后处理', reason: '本原型没有记录可进一步说明的原因。' };
};

export const pointerGuideSection = (state) => {
  const reason = state.actionReasons.pointerScroll;
  if (reason === 'linear_mouse_declined_after_confirm') {
    return ['指针工具已确认后拒绝', '你先单独确认了 LinearMouse 候选，随后在执行前拒绝；候选工具没有应用，Ctrl 动作结果不受影响。'];
  }
  if (reason === 'linear_mouse_unconfirmed') {
    return ['指针工具未确认', '你没有单独确认 LinearMouse 候选，因此指针动作留待处理；Ctrl 动作结果不受影响。'];
  }
  return null;
};

export const linearMouseCompletionIntro = (state) => {
  if (state.actionReasons.pointerScroll === 'linear_mouse_declined_after_confirm') {
    return 'LinearMouse 候选已确认后拒绝；只有指针动作留待处理，其他已确认动作保留结果。';
  }
  if (state.actionReasons.pointerScroll === 'linear_mouse_unconfirmed') {
    return 'LinearMouse 候选未确认；只有指针动作留待处理，其他已确认动作保留结果。';
  }
  return null;
};

export const renderLinearMousePermission = (state) => {
  const copy = linearMousePermissionCopy(state);
  return `<div><b>LinearMouse 候选 · ${copy.status}</b><p>${copy.detail}</p></div>`;
};

export const renderPointerOutcome = (state) => {
  const copy = pointerOutcomeCopy(state);
  return `<span class="action-outcome"><strong class="status manual_action_required">${copy.label}</strong><small>原因：${copy.reason}</small></span>`;
};

export const renderPointerReport = (state) => {
  const copy = pointerOutcomeCopy(state);
  return `<span>鼠标与触控板滚动<small>原因：${copy.reason}</small></span><strong class="status manual_action_required">${copy.label}</strong>`;
};

export const renderPointerGuide = (state) => {
  const section = pointerGuideSection(state);
  return section ? `<section><b>${section[0]}</b><p>${section[1]}</p></section>` : '';
};
