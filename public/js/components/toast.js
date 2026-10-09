// Accessible Toast Notifications

export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const borderColors = {
    info: 'var(--color-info)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-danger)'
  };

  toast.style.borderLeft = `4px solid ${borderColors[type] || borderColors.info}`;
  toast.innerHTML = `
    <div style="flex: 1;">${message}</div>
    <button type="button" aria-label="Dismiss toast" style="background: none; border: none; color: #94A3B8; cursor: pointer; padding: 4px; display: flex;">
      &times;
    </button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 150ms ease';
    setTimeout(() => toast.remove(), 160);
  };

  closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
