// Hand-built SVG Chart Components (Zero external dependencies)

export function renderBarChart(items, options = {}) {
  if (!items || items.length === 0) {
    return '<div class="empty-state" style="padding: 24px;">No data points available</div>';
  }

  const height = options.height || 220;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const width = options.width || 600;

  const maxVal = Math.max(...items.map(d => d.value), 1);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = Math.max(16, Math.min(48, Math.floor(chartWidth / items.length) - 12));

  // Y-axis grid lines (4 intervals)
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const yVal = Math.round((maxVal / 4) * i);
    const yPos = padding.top + chartHeight - (chartHeight / 4) * i;
    gridLines += `
      <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" class="chart-grid-line" />
      <text x="${padding.left - 8}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text tabular-nums">${yVal}</text>
    `;
  }

  // Bars and X-axis labels
  let bars = '';
  const slotWidth = chartWidth / items.length;

  items.forEach((item, index) => {
    const barHeight = Math.max(4, Math.round((item.value / maxVal) * chartHeight));
    const xPos = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
    const yPos = padding.top + chartHeight - barHeight;
    const color = item.color || 'var(--accent-teal)';

    bars += `
      <g class="chart-bar-group" tabindex="0" role="img" aria-label="${item.label}: ${item.value}">
        <rect x="${xPos}" y="${yPos}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" class="chart-bar">
          <title>${item.label}: ${item.value}</title>
        </rect>
        <text x="${xPos + barWidth / 2}" y="${yPos - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="#0F172A" class="tabular-nums">
          ${item.value > 0 ? item.value : ''}
        </text>
        <text x="${xPos + barWidth / 2}" y="${height - 12}" text-anchor="middle" class="chart-axis-text">
          ${item.label.length > 10 ? item.label.substring(0, 9) + '…' : item.label}
        </text>
      </g>
    `;
  });

  return `
    <div class="chart-container" style="overflow-x: auto;">
      <svg viewBox="0 0 ${width} ${height}" class="svg-chart" style="min-width: 480px; max-height: ${height}px;" role="graphics-document">
        ${gridLines}
        ${bars}
      </svg>
    </div>
  `;
}

export function renderDonutChart(items, options = {}) {
  if (!items || items.length === 0) {
    return '<div class="empty-state">No category breakdown</div>';
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return '<div class="empty-state">No incidents recorded</div>';
  }

  const size = options.size || 180;
  const strokeWidth = options.strokeWidth || 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let currentOffset = 0;
  let circles = '';
  const colors = options.colors || ['#14B8A6', '#8B7CFF', '#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#6366F1', '#EC4899'];

  const legendItems = [];

  items.forEach((item, index) => {
    const fraction = item.value / total;
    const dashLength = fraction * circumference;
    const color = item.color || colors[index % colors.length];

    circles += `
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="transparent"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${dashLength} ${circumference - dashLength}"
        stroke-dashoffset="-${currentOffset}"
        transform="rotate(-90 ${center} ${center})"
      >
        <title>${item.label}: ${item.value} (${(fraction * 100).toFixed(1)}%)</title>
      </circle>
    `;

    currentOffset += dashLength;

    legendItems.push(`
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
          <span style="color: var(--text-primary); font-weight: 500;">${item.label}</span>
        </div>
        <span class="tabular-nums" style="font-weight: 600; color: var(--text-secondary);">${item.value} <span style="font-size: 0.75rem; color: var(--text-muted);">(${(fraction * 100).toFixed(0)}%)</span></span>
      </div>
    `);
  });

  return `
    <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
      <div style="position: relative; width: ${size}px; height: ${size}px; flex-shrink: 0;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          ${circles}
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
          <span class="tabular-nums" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); line-height: 1;">${total}</span>
          <span style="font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase;">Total</span>
        </div>
      </div>
      <div style="flex: 1; min-width: 180px;">
        ${legendItems.join('')}
      </div>
    </div>
  `;
}
