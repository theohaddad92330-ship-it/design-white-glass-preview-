import type { ProjectReadRow } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { QualificationLeadsQueue } from './QualificationLeadsQueue'

/**
 * #2619.1 — LE TABLEAU DES PISTES NE CASSE PLUS LES MOTS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI CE N'EST PAS UN CHIFFRE DE PIXELS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune largeur réelle (`getBoundingClientRect` rend 0
 * partout) — ce fichier ne peut donc pas REJOUER la mesure faite en
 * navigateur, exactement comme `MissionsTable.test.tsx` (#1804) pour le même
 * genre de défaut. Il vérifie à la place le MÉCANISME livré :
 *
 *   AVANT — le libellé de la piste (`lead.label`) ne portait ni `full` ni
 *   `truncate` ni `max-w-` ni `whitespace-nowrap` dans son `className` : la
 *   primitive `Text` (D81, GA-34) lui posait alors D'OFFICE un
 *   `max-w-[70ch]` — la largeur de LECTURE, pensée pour un paragraphe, pas
 *   pour une ligne de tableau de bord qui doit prendre toute la largeur de sa
 *   cellule. Un libellé long s'écrasait dans cette colonne étroite et
 *   chevauchait les deux boutons de la même ligne (l'action principale,
 *   « Autres options »).
 *
 *   APRÈS — `full` retire la largeur de lecture (le libellé prend la largeur
 *   RÉELLE de la ligne), et `break-words` laisse un mot trop long pour tenir
 *   passer proprement à la ligne plutôt que déborder sur les boutons voisins
 *   — le même remède que #1804 sur `MissionsTable.tsx`.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const LONG_LABEL =
  'Ouverture d’un centre de service partagé Cloud/Data à Toulouse — lot migration SAP S/4HANA et plateforme Snowflake'

const row = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({
    account_id: 'acc-1',
    company_name: 'Transports Aurignac',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: LONG_LABEL,
    detail: null,
    offer: null,
    source: 'Communiqué de presse',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    id: 'lead-1',
    ...over,
  }) as ProjectReadRow

function render(rows: ProjectReadRow[]) {
  mockFetch.mockImplementation((args?: { path?: string; method?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.includes('qualification-leads')) return Promise.resolve([])
    if (path.startsWith('/projects')) return Promise.resolve(rows)
    return Promise.resolve({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <QualificationLeadsQueue accountId="acc-1" contactCount={0} onOpenTab={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => mockFetch.mockReset())

describe('#2619.1 — le libellé de la piste prend la largeur de la ligne, pas de lecture', () => {
  it('n’est plus borné à 70 caractères de lecture (GA-34 : ne borne pas le tableau)', async () => {
    render([row({})])
    const label = await screen.findByText(LONG_LABEL)
    expect(label.className).not.toMatch(/max-w-\[70ch\]/)
  })

  it('accepte le retour à la ligne au lieu de déborder sur les boutons voisins', async () => {
    render([row({})])
    const label = await screen.findByText(LONG_LABEL)
    expect(label.className).toMatch(/\bbreak-words\b/)
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.className).not.toMatch(/\bwhitespace-nowrap\b/)
  })

  it('sait dire NON : un libellé encore borné à 70ch rougirait ce test', async () => {
    // Casse volontairement l'attendu pour prouver que ce test peut échouer —
    // c'est exactement l'état d'AVANT le correctif.
    render([row({})])
    const label = await screen.findByText(LONG_LABEL)
    expect(label.className.includes('max-w-[70ch]')).toBe(false)
  })

  it('témoin — les boutons de la ligne, eux, restent sur une seule ligne (jamais coupés en plein mot)', async () => {
    render([row({})])
    const whyButton = await screen.findByRole('button', { name: 'Identifier le responsable' })
    const detailButton = screen.getByRole('button', { name: 'Autres options' })
    expect(whyButton.className).toMatch(/\bwhitespace-nowrap\b/)
    expect(detailButton.className).toMatch(/\bwhitespace-nowrap\b/)
  })
})
