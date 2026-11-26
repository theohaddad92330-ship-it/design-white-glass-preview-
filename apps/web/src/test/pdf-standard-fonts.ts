import { Font } from '@react-pdf/renderer'

/**
 * Re-point the PDF font families at the PDF "standard 14" fonts, for tests that
 * render a real document.
 *
 * `account-pdf/styles.ts` registers Geist from a jsDelivr CDN, so rendering in a
 * test would perform real network I/O: slow, offline-hostile, and pinned to an
 * unpinned upstream ref (`@main`) that can change under us. @react-pdf resolves
 * a `src` naming a standard font (`Helvetica` & co.) straight from pdfkit's
 * built-in metrics — no `fetch` at all — so swapping only the *sources* keeps
 * the real renderer, the real layout engine (yoga) and the real document tree in
 * the test while removing the network entirely.
 *
 * Glyph metrics obviously differ from Geist. That is fine: the tests that use
 * this assert that a valid, non-empty PDF is produced, never its pixels.
 *
 * Call it in `beforeAll`, after the module under test has imported `styles.ts`
 * (importing it is what performs the CDN registration this overrides).
 */
export function useStandardPdfFonts(): void {
  // `clear()` drops *everything*, including the standard families @react-pdf
  // registers in its own constructor — and the stylesheet still refers to
  // `Helvetica` directly. Re-register those defaults before the aliases.
  Font.clear()

  for (const [family, faces] of [
    ['Helvetica', ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']],
    ['Courier', ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']],
    ['Times-Roman', ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic']],
  ] as const) {
    const [regular, bold, italic, boldItalic] = faces
    Font.register({
      family,
      fonts: [
        { src: regular, fontStyle: 'normal', fontWeight: 400 },
        { src: bold, fontStyle: 'normal', fontWeight: 700 },
        { src: italic, fontStyle: 'italic', fontWeight: 400 },
        { src: boldItalic, fontStyle: 'italic', fontWeight: 700 },
      ],
    })
    // @react-pdf also exposes each face as a single-face family for
    // backwards compatibility (`fontFamily: 'Helvetica-Bold'`).
    for (const face of faces.slice(1)) Font.register({ family: face, src: face })
  }

  // Mirrors the families registered by `account-pdf/styles.ts`. Keep in sync:
  // a family used by the stylesheet but missing here makes @react-pdf throw
  // "Font family not registered", which is a loud, correct failure.
  Font.register({
    family: 'Geist',
    fonts: [
      { src: 'Helvetica', fontWeight: 400 },
      { src: 'Helvetica', fontWeight: 500 },
      { src: 'Helvetica-Bold', fontWeight: 600 },
      { src: 'Helvetica-Bold', fontWeight: 700 },
      { src: 'Helvetica-Oblique', fontWeight: 400, fontStyle: 'italic' },
      { src: 'Helvetica-BoldOblique', fontWeight: 700, fontStyle: 'italic' },
    ],
  })
  Font.register({ family: 'Geist-Bold', src: 'Helvetica-Bold' })
  Font.register({ family: 'Geist-Italic', src: 'Helvetica-Oblique' })
  Font.register({ family: 'Geist-Mono', src: 'Courier' })
}
