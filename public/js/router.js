import { auth } from './services/auth.js';
import { renderLandingView } from './views/landing.js';
import { renderLoginView, bindLoginEvents } from './views/login.js';
import { renderRegisterView, bindRegisterEvents } from './views/register.js';
import { renderStudentDashboardView, bindStudentDashboardEvents } from './views/studentDashboard.js';
import { renderAuthorityDashboardView, bindAuthorityDashboardEvents } from './views/authorityDashboard.js';
import { renderComplaintWizardView, bindComplaintWizardEvents } from './views/complaintWizard.js';
import { renderCaseDetailView, bindCaseDetailEvents } from './views/caseDetail.js';
import { renderLinkReviewView, bindLinkReviewEvents } from './views/linkReview.js';
import { renderAnalyticsView, bindAnalyticsEvents } from './views/analyticsView.js';
import { renderPolicyAuditView, bindPolicyAuditEvents } from './views/policyAuditView.js';
import { renderCctvView, bindCctvEvents } from './views/cctvView.js';
import { renderNotificationsView, bindNotificationsEvents } from './views/notificationsView.js';

export class Router {
  constructor(appEl) {
    this.appEl = appEl;
    this.currentRoute = null;
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  navigate(path) {
    window.location.hash = path.startsWith('#') ? path : `#${path}`;
  }

  parseRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [pathPart, queryPart] = hash.split('?');
    const query = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => { query[k] = v; });
    }
    return { path: pathPart, query };
  }

  async handleRoute() {
    const { path, query } = this.parseRoute();
    const user = auth.user;
    const isAuth = Boolean(user);

    // Dynamic pattern matching for /cases/:ref
    const caseMatch = path.match(/^\/cases\/([A-Za-z0-9\-]+)$/);

    let viewHtml = '';
    let bindFn = null;

    if (path === '/' || path === '') {
      viewHtml = renderLandingView();
    } else if (path === '/login') {
      if (isAuth) return this.navigate('/dashboard');
      viewHtml = renderLoginView();
      bindFn = (el) => bindLoginEvents(el, this);
    } else if (path === '/register') {
      if (isAuth) return this.navigate('/dashboard');
      viewHtml = renderRegisterView();
      bindFn = (el) => bindRegisterEvents(el, this);
    } else if (path === '/dashboard') {
      if (!isAuth) return this.navigate('/login');
      if (user.role === 'student') {
        viewHtml = renderStudentDashboardView();
        bindFn = (el) => bindStudentDashboardEvents(el, this);
      } else {
        viewHtml = renderAuthorityDashboardView();
        bindFn = (el) => bindAuthorityDashboardEvents(el, this);
      }
    } else if (path === '/complaint/new') {
      if (!isAuth) return this.navigate('/login');
      if (user.role !== 'student') return this.renderForbidden();
      viewHtml = renderComplaintWizardView(query);
      bindFn = (el) => bindComplaintWizardEvents(el, this, query);
    } else if (caseMatch) {
      if (!isAuth) return this.navigate('/login');
      const caseRef = caseMatch[1];
      viewHtml = renderCaseDetailView(caseRef);
      bindFn = (el) => bindCaseDetailEvents(el, this, caseRef);
    } else if (path === '/review') {
      if (!isAuth) return this.navigate('/login');
      if (!auth.isAuthority()) return this.renderForbidden();
      viewHtml = renderLinkReviewView();
      bindFn = (el) => bindLinkReviewEvents(el, this);
    } else if (path === '/analytics') {
      if (!isAuth) return this.navigate('/login');
      if (!auth.isAuthority()) return this.renderForbidden();
      viewHtml = renderAnalyticsView();
      bindFn = (el) => bindAnalyticsEvents(el, this);
    } else if (path === '/policy') {
      if (!isAuth) return this.navigate('/login');
      if (!auth.isAuthority()) return this.renderForbidden();
      viewHtml = renderPolicyAuditView();
      bindFn = (el) => bindPolicyAuditEvents(el, this);
    } else if (path === '/cctv') {
      if (!isAuth) return this.navigate('/login');
      viewHtml = renderCctvView();
      bindFn = (el) => bindCctvEvents(el, this);
    } else if (path === '/notifications') {
      if (!isAuth) return this.navigate('/login');
      viewHtml = renderNotificationsView();
      bindFn = (el) => bindNotificationsEvents(el, this);
    } else {
      this.renderNotFound();
      return;
    }

    // Render inside main shell view area
    const contentArea = document.getElementById('main-viewport-content');
    if (contentArea) {
      contentArea.innerHTML = viewHtml;
      if (bindFn) bindFn(contentArea);
    }
  }

  renderNotFound() {
    const contentArea = document.getElementById('main-viewport-content');
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="page-container" style="text-align: center; padding: 60px 20px;">
          <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 8px;">404 - Page Not Found</h2>
          <p style="color: #64748B; margin-bottom: 24px;">The requested campus safety portal address does not exist.</p>
          <a href="#/dashboard" class="btn btn-primary">Return to Safety Dashboard</a>
        </div>
      `;
    }
  }

  renderForbidden() {
    const contentArea = document.getElementById('main-viewport-content');
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="page-container" style="text-align: center; padding: 60px 20px;">
          <h2 style="font-size: 2rem; font-weight: 800; color: #DC2626; margin-bottom: 8px;">403 - Access Denied</h2>
          <p style="color: #64748B; margin-bottom: 24px;">You do not possess the required institutional authorization level.</p>
          <a href="#/dashboard" class="btn btn-secondary">Return to Dashboard</a>
        </div>
      `;
    }
  }
}
