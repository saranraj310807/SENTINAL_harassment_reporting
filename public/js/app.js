import { auth } from './services/auth.js';
import { Router } from './router.js';
import { icon } from './components/icons.js';
import { showToast } from './components/toast.js';

class App {
  constructor() {
    this.appEl = document.getElementById('app');
    this.router = null;
  }

  async init() {
    // 1. Check existing session
    await auth.checkSession();

    // 2. Render application shell
    this.renderShell();

    // 3. Setup router
    this.router = new Router(this.appEl);
    this.router.handleRoute();

    // 4. Setup demo switcher event
    const demoSelect = document.getElementById('demo-account-select');
    if (demoSelect) {
      demoSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (!val) return;
        try {
          const user = await auth.quickLogin(val);
          showToast(`Switched to demo role: ${user.fullName} (${user.role.toUpperCase()})`, 'success');
          this.renderShell();
          this.router.navigate('/dashboard');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          demoSelect.value = '';
        }
      });
    }

    // 5. Subscribe to auth changes
    auth.onChange(() => {
      this.renderShell();
      this.router.handleRoute();
    });
  }

  renderShell() {
    const user = auth.user;
    const isAuth = Boolean(user);
    const isStudent = user?.role === 'student';
    const isAuthority = ['hod', 'dean', 'higher'].includes(user?.role);

    this.appEl.innerHTML = `
      <!-- Desktop Sidebar / Mobile Drawer -->
      <aside class="app-sidebar" id="app-sidebar">
        <div class="sidebar-header">
          <a href="#/" class="brand-logo">
            ${icon('shield', 'brand-icon', 32)}
            <div>
              <div class="brand-title">SENTINEL</div>
              <div class="brand-tagline">Your Safety. Your Identity.</div>
            </div>
          </a>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Navigation</div>
          <a href="#/" class="nav-link">
            ${icon('shield', '', 18)} <span>Home</span>
          </a>

          ${isAuth ? `
            <a href="#/dashboard" class="nav-link">
              ${icon('chart', '', 18)} <span>Dashboard</span>
            </a>
          ` : `
            <a href="#/login" class="nav-link">
              ${icon('lock', '', 18)} <span>Sign In</span>
            </a>
            <a href="#/register" class="nav-link">
              ${icon('user', '', 18)} <span>Student Registration</span>
            </a>
          `}

          ${isStudent ? `
            <div class="nav-section-title">Safety Actions</div>
            <a href="#/complaint/new" class="nav-link">
              ${icon('file', '', 18)} <span>File Written Complaint</span>
            </a>
            <a href="#/complaint/new?mode=audio" class="nav-link">
              ${icon('mic', '', 18)} <span>Direct Audio Complaint</span>
            </a>
            <a href="#/cctv" class="nav-link">
              ${icon('camera', '', 18)} <span>CCTV Camera Locator</span>
            </a>
          ` : ''}

          ${isAuthority ? `
            <div class="nav-section-title">Authority Management</div>
            <a href="#/review" class="nav-link">
              ${icon('link', '', 18)} <span>Related-Incident Review</span>
            </a>
            <a href="#/analytics" class="nav-link">
              ${icon('chart', '', 18)} <span>Campus Analytics</span>
            </a>
            <a href="#/cctv" class="nav-link">
              ${icon('camera', '', 18)} <span>CCTV Registry</span>
            </a>
            <a href="#/policy" class="nav-link">
              ${icon('settings', '', 18)} <span>Escalation Policy & Audit</span>
            </a>
          ` : ''}

          ${isAuth ? `
            <div class="nav-section-title">Account</div>
            <a href="#/notifications" class="nav-link">
              ${icon('bell', '', 18)} <span>Notifications</span>
            </a>
          ` : ''}
        </nav>

        ${isAuth ? `
          <div class="sidebar-footer">
            <div class="user-badge">
              <div class="user-avatar">${user.fullName.charAt(0)}</div>
              <div class="user-info">
                <div class="user-name">${user.fullName}</div>
                <div class="user-role-label">${user.role.toUpperCase()} ${user.departmentName ? `• ${user.departmentName}` : ''}</div>
              </div>
              <button type="button" id="btn-logout" class="btn btn-ghost btn-sm" title="Sign out" style="color: #94A3B8; padding: 6px;">
                ${icon('x', '', 16)}
              </button>
            </div>
          </div>
        ` : ''}
      </aside>

      <!-- Backdrop for mobile drawer -->
      <div id="drawer-backdrop" class="mobile-drawer-backdrop" style="display: none;"></div>

      <!-- Main Viewport -->
      <main class="app-main" id="main-content" role="main">
        <header class="top-bar">
          <div class="top-bar-left">
            <button type="button" class="mobile-menu-btn" id="mobile-menu-toggle" aria-label="Toggle navigation drawer">
              ${icon('menu', '', 22)}
            </button>
            <div class="view-title" id="page-heading">SENTINEL Safety Portal</div>
          </div>
          <div class="top-bar-right">
            ${isAuth ? `
              <a href="#/notifications" class="btn btn-ghost btn-sm" aria-label="Notifications" style="position: relative;">
                ${icon('bell', '', 18)}
              </a>
              <span class="badge badge-${user.role === 'student' ? 'info' : (user.role === 'hod' ? 'hod' : (user.role === 'dean' ? 'dean' : 'higher'))}">
                ${user.role.toUpperCase()}
              </span>
            ` : `
              <a href="#/login" class="btn btn-primary btn-sm">Sign In</a>
            `}
          </div>
        </header>

        <!-- View Content Mount -->
        <div id="main-viewport-content"></div>
      </main>
    `;

    // Bind Mobile Menu
    const menuBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('drawer-backdrop');

    if (menuBtn && sidebar && backdrop) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
      });
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.style.display = 'none';
      });
    }

    // Bind Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await auth.logout();
        showToast('Signed out of SENTINEL', 'info');
        this.router.navigate('/');
      });
    }
  }
}

// Instantiate and start
const app = new App();
window.addEventListener('DOMContentLoaded', () => app.init());
