import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';

export function header() {
  if (!state.user) {
    return `
      <header class="topbar shell guest-topbar">
        <button type="button" class="brand" data-action="go" data-view="guest-chat">
          <div class="brand-mark">渝</div>
          <div>
            <div class="brand-name"><span>渝游智策</span><span class="guest-role-badge">游客体验</span></div>
            <div class="brand-note">山城旅行，按你的节奏</div>
          </div>
        </button>
        <nav aria-label="主导航" class="nav guest-nav">
          <button class="nav-item ${state.view === 'guest-chat' ? 'active' : ''}" data-action="go" data-view="guest-chat">游客体验</button>
          <button class="auth-link-button" data-action="open-auth-page" data-mode="login">登录</button>
          <button class="primary guest-register-button" data-action="open-auth-page" data-mode="register">注册账号</button>
        </nav>
      </header>
    `;
  }
  const isAdmin = state.user?.role === 'admin';
  const nav = [
    ['home', '首页'],
    ['planning', '方案定制'],
    ['explore', '探索地标'],
    ['trips', '我的行程'],
    ['history', '历史会话'],
    ['profile', '旅行档案']
  ];
  if (isAdmin) {
    nav.push(['admin', '管理中心']);
  }

  const adminBadge = isAdmin ? `<span class="admin-role-badge">管理员</span>` : '';

  return `
    <header class="topbar shell">
      <button type="button" class="brand" data-action="go" data-view="home">
        <div class="brand-mark">渝</div>
        <div>
          <div class="brand-name">
            <span>渝游智策</span>
            ${adminBadge}
          </div>
          <div class="brand-note">山城旅行，按你的节奏</div>
        </div>
      </button>
      <nav aria-label="主导航" class="nav">
        ${nav.map(([id, label]) => `<button class="nav-item ${state.view === id ? 'active' : ''}" data-action="go" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}
        ${isAdmin && state.view === 'admin' ? `<button class="perspective-btn" data-action="switch-perspective">切换视角</button>` : ''}
        <button class="user-button" data-action="logout" aria-label="退出当前账号">
          <span class="user-dot">${state.user ? (isAdmin ? '管' : '游') : '未'}</span>
          <span>${state.user ? `退出 (${escapeHtml(state.user.name || '用户')})` : '登录 / 注册'}</span>
        </button>
      </nav>
    </header>
  `;
}

export function renderHeader() {
  const mount = document.getElementById('topbar-mount');
  if (!mount) return;
  mount.innerHTML = header();
}
