import jsPDF from 'jspdf';
import { toCanvas } from 'html-to-image';

const SCALE = 2;
const BANNER_H = 88;

function makeBannerCanvas(title: string, w: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width  = w * SCALE;
  c.height = BANNER_H * SCALE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8f9fb';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = SCALE;
  ctx.beginPath(); ctx.moveTo(0, c.height - 1); ctx.lineTo(c.width, c.height - 1); ctx.stroke();

  const pad = 24 * SCALE;
  // Icon
  ctx.fillStyle = '#6366f1';
  ctx.beginPath(); ctx.roundRect(pad, 16 * SCALE, 40 * SCALE, 40 * SCALE, 10 * SCALE); ctx.fill();
  ctx.fillStyle = '#fff';
  const gs = 7 * SCALE, gg = 3 * SCALE, ix = pad + 7 * SCALE, iy = 23 * SCALE;
  ctx.fillRect(ix, iy, gs, gs); ctx.fillRect(ix+gs+gg, iy, gs, gs);
  ctx.fillRect(ix, iy+gs+gg, gs, gs); ctx.fillRect(ix+gs+gg, iy+gs+gg, gs, gs);
  // Title
  ctx.fillStyle = '#111827';
  ctx.font = `bold ${20 * SCALE}px -apple-system,sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(title, pad + 52 * SCALE, 38 * SCALE);
  // Date
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${11 * SCALE}px -apple-system,sans-serif`;
  ctx.fillText(`Exported ${new Date().toLocaleString('en-GB')}`, pad + 52 * SCALE, 56 * SCALE);
  // Watermark
  ctx.fillStyle = '#d1d5db';
  ctx.textAlign = 'right';
  ctx.fillText('AI BI Studio', c.width - pad, 44 * SCALE);
  return c;
}

/** Wait for React to commit, Recharts to finish animating, and browser to paint */
async function waitForPaint(): Promise<void> {
  // Kill all CSS animations/transitions instantly so labels are visible immediately
  const style = document.createElement('style');
  style.id = '__export_no_anim';
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0ms !important;
      animation-delay: 0ms !important;
      transition-duration: 0ms !important;
      transition-delay: 0ms !important;
    }
  `;
  document.head.appendChild(style);

  // Several frames + generous timeout so Recharts SVG elements fully render
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 1200));
}

function removeAnimKill() {
  document.getElementById('__export_no_anim')?.remove();
}

async function buildExportCanvas(scrollEl: HTMLElement, title: string): Promise<HTMLCanvasElement> {
  // Expand scroll container so full content is visible
  const saved = {
    height: scrollEl.style.height,
    maxHeight: scrollEl.style.maxHeight,
    overflow: scrollEl.style.overflow,
    flex: scrollEl.style.flex,
    minHeight: scrollEl.style.minHeight,
    position: scrollEl.style.position,
  };
  const fullW = scrollEl.scrollWidth;
  const fullH = scrollEl.scrollHeight;

  scrollEl.style.height    = `${fullH}px`;
  scrollEl.style.maxHeight = 'none';
  scrollEl.style.minHeight = 'unset';
  scrollEl.style.overflow  = 'visible';
  scrollEl.style.flex      = 'none';
  scrollEl.scrollTop = 0;

  // Let the browser repaint fully
  await waitForPaint();

  // Use html-to-image to capture the full scroll container as a canvas.
  // pixelRatio: 2 for retina quality; skipFonts: false so labels render.
  const capturedCanvas = await toCanvas(scrollEl, {
    pixelRatio: SCALE,
    backgroundColor: '#f1f5f9',
    filter: (node) => {
      // Skip tooltips and overlay elements that shouldn't appear in export
      if (node instanceof HTMLElement) {
        if (node.getAttribute('data-export-skip')) return false;
      }
      return true;
    },
  });

  // Restore original styles and remove animation kill
  Object.assign(scrollEl.style, saved);
  removeAnimKill();

  // Compose: banner on top, chart capture below
  const out = document.createElement('canvas');
  out.width  = capturedCanvas.width;
  out.height = BANNER_H * SCALE + capturedCanvas.height;

  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, out.width, out.height);

  // Draw banner
  ctx.drawImage(makeBannerCanvas(title, fullW), 0, 0);

  // Draw captured dashboard below banner
  ctx.drawImage(capturedCanvas, 0, BANNER_H * SCALE);

  return out;
}

export async function exportDashboardToPNG(scrollEl: HTMLElement, title = 'Dashboard'): Promise<void> {
  const canvas = await buildExportCanvas(scrollEl, title);
  const link = document.createElement('a');
  link.download = `${title}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportDashboardToPDF(scrollEl: HTMLElement, title = 'Dashboard'): Promise<void> {
  const canvas = await buildExportCanvas(scrollEl, title);
  const imgData = canvas.toDataURL('image/png');
  const pxW = canvas.width / SCALE;
  const pxH = canvas.height / SCALE;
  const pdf = new jsPDF({
    orientation: pxW > pxH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pxW, pxH],
    hotfixes: ['px_scaling'],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, pxW, pxH);
  pdf.save(`${title}.pdf`);
}
