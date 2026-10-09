import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../components/toast.js';

export function renderRegisterView() {
  return `
    <div class="page-container" style="max-width: 640px; padding-top: 30px;">
      <div class="card">
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 1.375rem; font-weight: 700;">Student Account Registration</h2>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 4px;">
            Create a synthetic student profile for demonstration testing.
          </p>
        </div>

        <form id="register-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label" for="reg-name">Full Name</label>
              <input type="text" id="reg-name" class="form-control" placeholder="e.g. Divya Krishnan" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-email">Campus Email</label>
              <input type="email" id="reg-email" class="form-control" placeholder="divya.k@campus.edu" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-password">Password (min 8 chars)</label>
              <input type="password" id="reg-password" class="form-control" placeholder="••••••••" required minlength="8">
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-sif">SIF Number</label>
              <input type="text" id="reg-sif" class="form-control tabular-nums" placeholder="SIF202699" required pattern="SIF\\d{4,8}">
              <div class="form-hint">Must begin with SIF followed by digits</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-dept">Department</label>
              <select id="reg-dept" class="form-control" required>
                <option value="">Loading departments...</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-prog">Programme</label>
              <input type="text" id="reg-prog" class="form-control" placeholder="e.g. B.Tech CSE" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-year">Year of Study</label>
              <select id="reg-year" class="form-control" required>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3" selected>3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-section">Section</label>
              <input type="text" id="reg-section" class="form-control" placeholder="A" required maxlength="4">
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-phone">Mobile Phone (10 Digits)</label>
              <input type="tel" id="reg-phone" class="form-control tabular-nums" placeholder="9840123456" required pattern="[6-9]\\d{9}">
              <div class="form-hint">Shown to authorities only when necessary and logged</div>
            </div>
          </div>

          <button type="submit" id="btn-submit-reg" class="btn btn-primary" style="width: 100%; margin-top: 16px;">
            Create Student Profile & Sign In
          </button>
        </form>

        <div style="text-align: center; margin-top: 16px; font-size: 0.8125rem;">
          <a href="#/login" style="color: var(--accent-teal-dark); font-weight: 600; text-decoration: none;">
            Already have an account? Sign In
          </a>
        </div>
      </div>
    </div>
  `;
}

export async function bindRegisterEvents(container, router) {
  const deptSelect = container.querySelector('#reg-dept');
  try {
    const res = await api.get('/api/meta/departments');
    deptSelect.innerHTML = res.departments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
  } catch {
    deptSelect.innerHTML = '<option value="1">Computer Science & Engineering (CSE)</option>';
  }

  const form = container.querySelector('#register-form');
  const btn = container.querySelector('#btn-submit-reg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Registering account...';

    const payload = {
      full_name: container.querySelector('#reg-name').value.trim(),
      email: container.querySelector('#reg-email').value.trim(),
      password: container.querySelector('#reg-password').value,
      sif_number: container.querySelector('#reg-sif').value.trim().toUpperCase(),
      department_id: parseInt(container.querySelector('#reg-dept').value, 10),
      programme: container.querySelector('#reg-prog').value.trim(),
      year_of_study: parseInt(container.querySelector('#reg-year').value, 10),
      section: container.querySelector('#reg-section').value.trim().toUpperCase(),
      phone: container.querySelector('#reg-phone').value.trim()
    };

    try {
      await auth.register(payload);
      showToast('Account registered successfully! Welcome to SENTINEL.', 'success');
      router.navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create Student Profile & Sign In';
    }
  });
}
