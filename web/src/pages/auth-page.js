import { state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';

export function authView() {
  const registering = state.authMode === 'register';
  return `
    <main class="page shell auth-page">
      <section class="auth-page-card">
        <div class="auth-form-card">
          <div class="auth-page-tabs">
            <button class="auth-page-tab ${!registering ? 'active' : ''}" data-action="set-auth-mode" data-mode="login">账号登录</button>
            <button class="auth-page-tab ${registering ? 'active' : ''}" data-action="set-auth-mode" data-mode="register">注册账号</button>
          </div>
          <h1>${registering ? '创建你的账号' : '登录你的账号'}</h1>
          <p class="auth-form-hint">${registering ? '使用邮箱和密码注册，昵称可选。' : '请使用注册时的邮箱和密码。'}</p>
          <form data-action="auth-form">
            <div class="form-row">
              <label for="login-email">邮箱地址</label>
              <input id="login-email" name="email" type="email" placeholder="name@example.com" autocomplete="email" required />
            </div>
            ${registering ? `
              <div class="form-row">
                <label for="login-name">称呼 / 昵称</label>
                <input id="login-name" name="name" type="text" placeholder="如：重庆旅行者" autocomplete="nickname" />
              </div>
            ` : ''}
            <div class="form-row">
              <label for="login-password">密码</label>
              <input id="login-password" name="password" type="password" minlength="6" autocomplete="${registering ? 'new-password' : 'current-password'}" required />
            </div>
            ${state.loginError ? `<div class="notice notice-error">${escapeHtml(state.loginError)}</div>` : ''}
            <button type="submit" class="primary auth-submit-button">${registering ? '立即注册' : '登录并进入规划'}</button>
          </form>
          <button class="auth-back-link" data-action="go" data-view="guest-chat">← 返回游客体验</button>
        </div>
      </section>
    </main>
  `;
}
