// THROWAWAY PROTOTYPE ONLY. Pure presentation helpers shared by the UI and tests.

import { linearMouseDecision, linearMouseExecutionMode } from './flow-machine.js';

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
