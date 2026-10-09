import { auth, DEMO_CREDENTIALS } from '../services/auth.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

export function renderLoginView() {
  return `
    <div class="page-container" style="max-width: 520px; padding-top: 40px;">
      <div class="card">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #0E1530; color: var(--accent-teal); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            ${icon('shield', '', 24)}
          </div>
          <h2 style="font-size: 1.375rem; font-weight: 700; color: var(--text-primary);">SENTINEL Login</h2>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 4px;">
            Institutional Single Sign-On & Incident Management
          </p>
        </div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-email">Campus Email</label>
            <input type="email" id="login-email" class="form-control" placeholder="name@campus.edu" required autocomplete="username">
          </div>

          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
            <div class="form-hint">Rate limited with exponential lockout backoff</div>
          </div>

          <button type="submit" id="btn-submit-login" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
            Sign In to SENTINEL
          </button>
        </form>

        <div style="text-align: center; margin-top: 16px; font-size: 0.8125rem;">
          <a href="#/register" style="color: var(--accent-teal-dark); font-weight: 600; text-decoration: none;">
            New student? Register synthetic demo profile
          </a>
        </div>
      </div>

      <!-- Quick 1-Click Demo Accounts -->
      <div class="card" style="background: #F8FAFC; border-color: #CBD5E1;">
        <div style="font-size: 0.8125rem; font-weight: 700; color: #1E293B; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <span>QUICK DEMO ONE-CLICK SIGN IN:</span>
          <span class="badge" style="background: #E2E8F0; color: #334155;">Judge Helper</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button type="button" class="btn btn-secondary btn-sm quick-login-btn" data-account="student1" style="justify-content: flex-start; text-align: left;">
            <span class="badge badge-info" style="margin-right: 6px;">Student</span>
            <strong>Priya Sharma</strong> (CSE 3rd Year)
          </button>
          <button type="button" class="btn btn-secondary btn-sm quick-login-btn" data-account="student2" style="justify-content: flex-start; text-align: left;">
            <span class="badge badge-info" style="margin-right: 6px;">Student</span>
            <strong>Rahul Varma</strong> (ECE 2nd Year)
          </button>
          <button type="button" class="btn btn-secondary btn-sm quick-login-btn" data-account="hod_cse" style="justify-content: flex-start; text-align: left;">
            <span class="badge badge-hod" style="margin-right: 6px;">HOD</span>
            <strong>Dr. K. Ramanathan</strong> (HOD - CSE)
          </button>
          <button type="button" class="btn btn-secondary btn-sm quick-login-btn" data-account="dean" style="justify-content: flex-start; text-align: left;">
            <span class="badge badge-dean" style="margin-right: 6px;">Dean</span>
            <strong>Dr. Aruna Swaminathan</strong> (Dean Student Affairs)
          </button>
          <button type="button" class="btn btn-secondary btn-sm quick-login-btn" data-account="higher" style="justify-content: flex-start; text-align: left;">
            <span class="badge badge-higher" style="margin-right: 6px;">Higher Auth</span>
            <strong>Prof. V. Rajagopal</strong> (Director of Safety)
          </button>
        </div>

        <div style="font-size: 0.6875rem; color: #64748B; margin-top: 12px; line-height: 1.4;">
          All demo credentials use password: <code>SentinelDemo2026!</code>. Fictional accounts created exclusively for the HackVerse evaluation.
        </div>
      </div>
    </div>
  `;
}

export function bindLoginEvents(container, router) {
  const form = container.querySelector('#login-form');
  const btn = container.querySelector('#btn-submit-login');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;

    btn.disabled = true;
    btn.textContent = 'Verifying credentials...';

    try {
      const user = await auth.login(email, password);
      showToast(`Welcome back, ${user.fullName}`, 'success');
      router.navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Sign In to SENTINEL';
    }
  });

  const quickBtns = container.querySelectorAll('.quick-login-btn');
  quickBtns.forEach(b => {
    b.addEventListener('click', async () => {
      const acct = b.dataset.account;
      b.disabled = true;
      try {
        const user = await auth.quickLogin(acct);
        showToast(`Signed in as ${user.fullName} (${user.role.toUpperCase()})`, 'success');
        router.navigate('/dashboard');
      } catch (err) {
        showToast(err.message, 'error');
        b.disabled = false;
      }
    });
  });
}
