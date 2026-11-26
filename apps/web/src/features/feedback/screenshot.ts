// Viewport capture for bug reports. html2canvas-pro is loaded on demand so the
// ~50 KB renderer never lands in the initial bundle — it is only pulled once a
// user actually reports something.

const MAX_WIDTH = 1600
const IGNORED_ATTRIBUTE = 'data-bellum-capture-ignore'

/**
 * Captures the visible viewport as a PNG data URL, outlining `highlight` when
 * given. Returns null on failure — a missing screenshot must never block the
 * report from being sent.
 */
export async function captureViewport(highlight?: DOMRect | null): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const { default: html2canvas } = await import('html2canvas-pro')
    const scale = Math.min(1, MAX_WIDTH / window.innerWidth)

    const canvas = await html2canvas(document.body, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#0b0b0f',
      scale,
      useCORS: true,
      logging: false,
      width: window.innerWidth,
      height: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      scrollX: 0,
      scrollY: 0,
      // The reporter's own overlay/dialog must not appear in the capture.
      ignoreElements: element => element.hasAttribute(IGNORED_ATTRIBUTE),
    })

    if (highlight) outline(canvas, highlight, scale)
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('[Feedback] screenshot failed', error)
    return null
  }
}

/** Draws the picked element's box so the issue shows what was reported. */
function outline(canvas: HTMLCanvasElement, rect: DOMRect, scale: number): void {
  const context = canvas.getContext('2d')
  if (!context) return
  context.save()
  context.strokeStyle = '#f43f5e'
  context.lineWidth = Math.max(2, 3 * scale)
  context.setLineDash([8 * scale, 5 * scale])
  context.strokeRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale)
  context.restore()
}
