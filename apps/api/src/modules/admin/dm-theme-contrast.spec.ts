import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrast guard for the dashboard-manager's light/dark theme tokens.
 *
 * Report (2026-07-20): "le mode clair a toujours des bugs" on the DM. The
 * toggle and the `data-theme` plumbing (`layout.tsx`'s pre-paint script,
 * `theme-toggle.tsx`, `globals.css`'s `:root[data-theme=...]` blocks) were
 * already correct and verified live in both themes across every route — this
 * is NOT a case of a route the theme fails to reach, nor a hardcoded
 * dark-only class with no light counterpart. The actual defects were CSS
 * custom properties that never got a real per-theme value:
 *
 *  - `--danger` and `--stop` were referenced only as `var(--danger, #e0533d)`
 *    / `var(--stop, #c0392b)` — the custom property itself was never defined
 *    in either `:root[data-theme=...]` block, so every reference silently
 *    fell back to the SAME hardcoded hex in both themes. `#e0533d` passes AA
 *    on the dark surfaces it was tuned for but fails on light (3.39:1 on
 *    `--bg`); `#c0392b` is the reverse (3.21:1 on the dark surfaces).
 *  - `.badge.TECHNICAL/.quick_win/.INTERNE` and the "source down" status
 *    colour used a bare `#60a5fa` / `#ff6b6b` with NO `var()` at all — the
 *    exact "dark: variant with no light counterpart" pattern, just expressed
 *    as a standalone literal instead of a Tailwind class. `#60a5fa` on white
 *    is 2.25–2.54:1 (a "TECHNICAL" decision-role badge was close to
 *    invisible in light mode).
 *  - `--green` (light) and `--red` (light) were already real per-theme
 *    tokens but measured under AA on their worst realistic surface
 *    (`--bg`): 3.63:1 and 4.41:1.
 *  - `--accent` (dark) measured 4.43:1 on `--surface` — just under AA.
 *
 * Fix: `--danger`, `--stop` and `--blue` are now real tokens in BOTH
 * `:root[data-theme='dark']` and `:root[data-theme='light']`, tuned to clear
 * AA with margin; `--green`/`--red` (light) and `--accent` (dark) were
 * retuned; every hardcoded fallback/literal was replaced with the bare
 * `var(--token)` it stood in for.
 *
 * The dashboard-manager has no test runner of its own (see
 * `dm-plan-proxy-parity.spec.ts`, same reasoning), so this guard lives here
 * and reads `globals.css` as TEXT, computing ratios from the parsed custom
 * properties — never copying a "known good" hex into the assertions — so a
 * future edit that quietly re-lightens a token, or re-hardcodes a literal
 * outside the token system, fails this test instead of shipping unreadable
 * text.
 */
describe('dashboard-manager theme tokens — WCAG AA contrast', () => {
  const DM_APP = join(__dirname, '../../../../dashboard-manager/src/app')
  const GLOBALS_CSS = join(DM_APP, 'globals.css')
  const ANALYSIS_PAGE = join(DM_APP, 'analysis/[id]/page.tsx')
  const css = readFileSync(GLOBALS_CSS, 'utf8')

  /** WCAG 2.1 AA threshold for normal-size text. */
  const AA_NORMAL_TEXT = 4.5

  type Rgb = readonly [number, number, number]

  function parseHex(value: string): Rgb {
    const raw = value.trim().replace('#', '')
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map(c => c + c)
            .join('')
        : raw
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)] as const
  }

  function relativeLuminance([r, g, b]: Rgb): number {
    const [rs, gs, bs] = [r, g, b].map(v => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  /** WCAG 2.1 contrast ratio: (L_light + 0.05) / (L_dark + 0.05). */
  function contrastRatio(a: Rgb, b: Rgb): number {
    const la = relativeLuminance(a)
    const lb = relativeLuminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }

  /**
   * `globals.css` never nests braces inside a `:root[data-theme=...]` block
   * or a `.badge.X` block (no `color-mix()`/media queries in there — the
   * `color-mix(` calls use parens, not braces), so a plain "first `{` to
   * matching first `}`" slice is enough; no brace-depth counting needed.
   */
  function ruleBlock(marker: string): string {
    const idx = css.indexOf(marker)
    if (idx === -1) throw new Error(`Selector not found in globals.css: "${marker}" — did the rule move?`)
    const braceStart = css.indexOf('{', idx)
    const braceEnd = css.indexOf('}', braceStart)
    if (braceStart === -1 || braceEnd === -1) throw new Error(`Unbalanced braces reading "${marker}"`)
    return css.slice(braceStart + 1, braceEnd)
  }

  function customProps(block: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out[m[1]] = m[2].trim()
    }
    return out
  }

  const darkTokens = customProps(ruleBlock(":root[data-theme='dark']"))
  const lightTokens = customProps(ruleBlock(":root[data-theme='light']"))

  type Theme = { name: string; tokens: Record<string, string> }
  const THEMES: Theme[] = [
    { name: 'dark', tokens: darkTokens },
    { name: 'light', tokens: lightTokens },
  ]

  /** Every surface real page content is painted on (`.card`/table = surface, page chrome = bg). */
  const SURFACE_TOKENS = ['--bg', '--surface'] as const

  /**
   * Every token used as TEXT (body copy, badges, links, alert banners) rather
   * than purely as a decorative chart-fill colour. Chart bar/donut fills are
   * graphical, not text (WCAG 1.4.11 non-text 3:1, not 4.5:1) and are handled
   * separately below — series colour choice is intentionally out of scope
   * here (see the chart-labels check below for what actually matters in
   * charts).
   */
  const TEXT_TOKENS = [
    '--text',
    '--muted',
    '--accent',
    '--green',
    '--amber',
    '--red',
    '--blue',
    '--danger',
    '--stop',
  ] as const

  it('parses real hex values for every token in both themes (guard of the guard)', () => {
    // If the parsing silently breaks, every ratio test below would compare
    // `undefined` and either throw or vacuously pass — this proves the
    // extraction actually found something real first.
    for (const theme of THEMES) {
      for (const token of TEXT_TOKENS) {
        expect(theme.tokens[token]).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      }
      for (const surface of SURFACE_TOKENS) {
        expect(theme.tokens[surface]).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      }
    }
  })

  for (const theme of THEMES) {
    describe(theme.name, () => {
      for (const token of TEXT_TOKENS) {
        for (const surface of SURFACE_TOKENS) {
          it(`${token} on ${surface} passes AA (${AA_NORMAL_TEXT}:1)`, () => {
            const ratio = contrastRatio(parseHex(theme.tokens[token]), parseHex(theme.tokens[surface]))
            // Ratio is asserted via the loop, but surfaced in the failure
            // through a wrapping object so a broken token prints its actual
            // hex + computed ratio rather than a bare "false".
            expect({
              token,
              surface,
              tokenValue: theme.tokens[token],
              surfaceValue: theme.tokens[surface],
              ratio: Number(ratio.toFixed(2)),
              passesAA: ratio >= AA_NORMAL_TEXT,
            }).toMatchObject({ passesAA: true })
          })
        }
      }
    })
  }

  /**
   * Axis/label/grid/tooltip colours in the DM's charts (`_components/charts.tsx`)
   * are NOT hardcoded — every label and axis <span> already renders in
   * `var(--muted)` or `var(--text)`, both of which pass AA above. Only the
   * bar/segment FILL colours are literal hex (`charts.tsx`'s `COLORS` array,
   * `STATUS_COLORS`, `tokenSegments` in `cockpit-panel.tsx`) — those are
   * graphical marks (background/stroke), not text, so they are exempt from
   * the 4.5:1 text threshold. This test pins that split: chart labels stay
   * on real tokens, so a palette tuned for dark surfaces can never make a
   * chart's labels unreadable on white — only its bar colours, which is
   * cosmetic, not a readability regression.
   */
  it('chart labels/axes stay on theme tokens, not hardcoded colours', () => {
    const charts = readFileSync(join(DM_APP, '_components/charts.tsx'), 'utf8')
    const labelSpans = [...charts.matchAll(/<span[^>]*style=\{\{([^}]*)\}\}/g)].map(m => m[1])
    // If markup changes shape and this regex stops matching anything, fail
    // loud instead of the loop below silently checking zero spans.
    expect(labelSpans.length).toBeGreaterThan(0)
    const colorStyles = labelSpans.filter(style => /color:/.test(style))
    expect(colorStyles.length).toBeGreaterThan(0)
    for (const style of colorStyles) {
      expect(style).toMatch(/color:\s*'var\(--(muted|text)\)'/)
    }
  })

  /**
   * The two literals that shipped genuinely broken: `.badge.TECHNICAL` (and
   * its siblings) hardcoded `#60a5fa` directly with no `var()` at all, and
   * the source-status "down" colour hardcoded `#ff6b6b` inline in the
   * analysis page. Both are read back as TEXT — importing the page would
   * pull in the Next.js runtime, and the regression we're guarding against
   * (a literal creeping back in) is exactly what text search proves.
   */
  it('badge colours reference var(--blue)/var(--danger), not a re-hardcoded literal', () => {
    for (const badge of ['TECHNICAL', 'quick_win', 'INTERNE']) {
      const block = ruleBlock(`.badge.${badge}`)
      expect(block).toMatch(/var\(--blue\)/)
      expect(block).not.toMatch(/#60a5fa/)
    }
    const riskBlock = ruleBlock('.badge.RISQUE')
    expect(riskBlock).toMatch(/var\(--danger\)/)
  })

  it('the analysis page never hardcodes the old #ff6b6b / bare fallback literals', () => {
    const source = readFileSync(ANALYSIS_PAGE, 'utf8')
    // source-status "down" must theme via var(--danger), not a bare hex.
    expect(source).not.toMatch(/#ff6b6b/i)
    // No var(--token, #hex) fallback should remain now that the tokens are
    // real — a lingering fallback is exactly how --danger/--stop went
    // undetected: the property looked wired up but silently never resolved.
    expect(source).not.toMatch(/var\(--(danger|stop|accent),\s*#/)
  })
})
