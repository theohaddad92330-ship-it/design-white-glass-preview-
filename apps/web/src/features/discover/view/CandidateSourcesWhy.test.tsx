import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { computeDiscoverSourceAxes, type DiscoverSourceFacts } from '@bellum/contracts'
import { CandidateSourcesWhy } from './CandidateSourcesWhy'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}))

const NOW = new Date('2026-10-12T00:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const NO_FACTS: DiscoverSourceFacts = {
  signalHistory: null,
  crm: null,
  marketMemory: null,
  dataforge: null,
  drive: null,
  missions: null,
}

/**
 * #4067 — le détail des sources de l'espace, en points ; un signal ancien DATÉ.
 * #4068 (Louis 13/10) — plus de ligne « Pourquoi » ni de « Voir plus » : les faits
 * datés de l'espace sont parmi les signaux forts, ce bloc ne vit que dans le repliable.
 */
describe('CandidateSourcesWhy (#4067, #4068)', () => {
  it('rien de décisif ⇒ aucun bloc (on n’affiche pas ce qu’on n’a pas)', () => {
    const { container } = render(
      <CandidateSourcesWhy sourceAxes={computeDiscoverSourceAxes(NO_FACTS, NOW)} now={NOW} />,
    )
    expect(container).toBeEmptyDOMElement()
    const { container: none } = render(<CandidateSourcesWhy sourceAxes={undefined} now={NOW} />)
    expect(none).toBeEmptyDOMElement()
  })

  it('montre tous les axes mesurés, leurs points, date le signal ancien et nomme ce qui n’a pas pu être évalué', () => {
    const axes = computeDiscoverSourceAxes(
      {
        ...NO_FACTS,
        signalHistory: {
          signals: [
            { type: 'hiring', date: daysAgo(240), changeCount: 0 },
            { type: 'hiring', date: daysAgo(400), changeCount: 0 },
          ],
        },
        crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: null },
      },
      NOW,
    )
    render(<CandidateSourcesWhy sourceAxes={axes} now={NOW} />)
    const detail = screen.getByTestId('sources-why-detail')
    expect(detail.textContent).toContain('sourceAxes.axis.signal_history')
    expect(detail.textContent).toContain('sourceAxes.ago.months:8')
    // #4306.3 — des repères NOMMÉS par source (trouvé / rien trouvé), jamais « 10 / 20 » ni un chiffre sur 60.
    expect(detail.textContent).toContain('sourceAxes.mark.found')
    expect(detail.textContent).not.toMatch(/\d+\s*\/\s*\d+/)
    expect(detail.textContent).toContain('sourceAxes.total')
    expect(detail.textContent).toContain('sourceAxes.unmeasured')
    expect(detail.textContent).toContain('sourceAxes.axis.drive')
    // sait dire NON : aucune ligne « Pourquoi », aucun bouton
    expect(detail.textContent).not.toContain('sourceAxes.why')
    expect(screen.queryByRole('button')).toBeNull()
  })

  // #4306 — la phrase dit ce qui est compté, jamais lue comme une probabilité, et nomme la raison d'un axe non évalué.
  it('la phrase du total dit la base du compte et refuse la lecture en probabilité', () => {
    for (const lang of ['fr', 'en'] as const) {
      const { sourceAxes } = JSON.parse(
        readFileSync(resolve(__dirname, `../../../i18n/locales/${lang}/discover.json`), 'utf8'),
      ) as { sourceAxes: { total: string; unmeasured: string } }
      // #4306.3 — plus de « X sur 60 » : la phrase nomme la base du compte sans chiffre.
      expect(sourceAxes.total).not.toContain('{{score}}')
      expect(sourceAxes.total).not.toContain('{{max}}')
      expect(sourceAxes.total).not.toMatch(/\b60\b/)
      expect(sourceAxes.total).toMatch(lang === 'fr' ? /pas une probabilité/ : /not a probability/)
      expect(sourceAxes.unmeasured).toMatch(lang === 'fr' ? /faute de donnée/ : /lack of data/)
      expect((sourceAxes as unknown as { mark: Record<string, string> }).mark.found).toBeTruthy()
      expect((sourceAxes as unknown as { mark: Record<string, string> }).mark.nothing).toBeTruthy()
      expect(sourceAxes.total).not.toMatch(/%/)
    }
  })
})
