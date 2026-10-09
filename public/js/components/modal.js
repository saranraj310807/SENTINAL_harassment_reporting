// Accessible Modal Dialog Component

export function openModal({ title, content, footer = '', maxWidth = '560px', onClose = null }) {
  const container = document.getElementById('modal-container');
  if (!container) return null;

  // Clear any existing modal
  container.innerHTML = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  backdrop.innerHTML = `
    <div class="modal-dialog" style="max-width: ${maxWidth};">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button type="button" class="btn btn-ghost btn-sm close-modal-btn" aria-label="Close dialog" style="font-size: 1.25rem; line-height: 1; padding: 4px 8px;">
          &times;
        </button>
      </div>
      <div class="modal-body">
        ${typeof content === 'string' ? content : ''}
      </div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  if (content instanceof HTMLElement) {
    backdrop.querySelector('.modal-body').appendChild(content);
  }

  const close = () => {
    document.removeEventListener('keydown', handleKey);
    backdrop.remove();
    if (onClose) onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
  };

  backdrop.querySelector('.close-modal-btn').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.addEventListener('keydown', handleKey);
  container.appendChild(backdrop);

  // Focus the first actionable item
  const focusable = backdrop.querySelector('button, [href], input, select, textarea');
  if (focusable) focusable.focus();

  return { close, backdrop };
}
