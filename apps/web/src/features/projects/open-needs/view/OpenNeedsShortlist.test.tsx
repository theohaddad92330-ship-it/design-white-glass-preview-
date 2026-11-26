import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * LA COLONNE « SHORTLIST » — colonne n°10 de la source (PDF-03:104-106).
 *
 * La source demande « **“3/5” ou “aucune” en orange** ». La colonne rendait un
 * compte NU : « 0 » à côté de « 3 », dans le même gris, alors que les deux
 * appellent des gestes opposés — l'un dit « regarde où ça en est », l'autre dit
 * « personne n'a encore rien proposé ».
 *
 * ⚠️ CE QUI EST LIVRÉ, ET CE QUI EST REFUSÉ
 *
 *  · « aucune » EST livré, et en orange : le seuil est écrit dans le dépôt
 *    (« besoins ouverts sans shortlist, **seuil 0** »), il porte même son
 *    compteur de tête (`counters.withoutShortlist`) et son filtre
 *    (`without_shortlist`). Une couleur dont le seuil est décidé est une
 *    couleur qu'on a le droit de peindre.
 *  · le **dénominateur « /5 » est REFUSÉ**. Il n'existe pas : `shortlist_count`
 *    compte les lignes de `submissions`, qui n'a AUCUN plafond. Le seul « 5 »
 *    du dépôt est `SHORTLIST_MAX`, le plafond d'un objet `shortlist` — un
 *    AUTRE objet. L'emprunter afficherait « 7/5 » sur un besoin à sept
 *    positionnements, et ferait passer un plafond pour un objectif.
 *
 * ⚠️ « 0 » n'est PAS « non mesuré » ici : la requête a compté, elle a trouvé
 * zéro. `UnknownValue` n'a rien à faire dans cette cellule.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
// #2173.31 — voir OpenNeedsSheetReachable.test.tsx pour la raison de ce mock.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

const { OpenNeedsTable } = await import('./OpenNeedsTable')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [{ term: 'Kubernetes', required: true }],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

function draw(rows: OpenNeedRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsTable
        rows={rows}
        poolIsEmpty={false}
        onOpenNeed={() => {}}
        onAddConsultant={() => {}}
        onMatch={() => {}}
        selectedIds={[]}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    </QueryClientProvider>,
  )
}

function cell(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('[data-testid="need-shortlist"]')
  // La cellule doit EXISTER : sans cette ligne, le jour où la colonne
  // disparaît, toutes les assertions « n'affiche pas » passeraient sur du vide.
  expect(found).not.toBeNull()
  return found as HTMLElement
}

describe('besoins ouverts — la colonne « Shortlist »', () => {
  it('écrit « aucune » plutôt qu’un « 0 » perdu dans la colonne', () => {
    const { container } = draw([need({ shortlist_count: 0 })])
    expect(cell(container).textContent).toBe('aucune')
  })

  it('« aucune » est un ZÉRO VRAI, pas un « non mesuré »', () => {
    // La requête a compté et a trouvé zéro. `UnknownValue` inverserait le sens :
    // « je n'ai pas regardé » au lieu de « personne n'a rien proposé ».
    const { container } = draw([need({ shortlist_count: 0 })])
    expect(cell(container).textContent).not.toMatch(/non mesuré/i)
  })

  it('porte l’alerte de couleur, dont le seuil EST décidé (« sans shortlist, seuil 0 »)', () => {
    const { container } = draw([need({ shortlist_count: 0 })])
    expect(cell(container).outerHTML).toContain('--warning-soft-text')
  })

  it('affiche le compte tel quel dès qu’il y a quelque chose, sans alerte', () => {
    const { container } = draw([need({ shortlist_count: 3 })])
    expect(cell(container).textContent).toBe('3')
    expect(cell(container).outerHTML).not.toContain('--warning-soft-text')
  })

  it('n’invente AUCUN dénominateur : « 3/5 » n’a pas de source', () => {
    // `shortlist_count` compte `submissions`, qui n'a aucun plafond ; le seul
    // « 5 » du dépôt (`SHORTLIST_MAX`) plafonne un AUTRE objet. Un besoin à
    // sept positionnements afficherait « 7/5 ».
    const { container } = draw([need({ shortlist_count: 7 })])
    expect(cell(container).textContent).toBe('7')
    expect(cell(container).textContent).not.toMatch(/\/\s*5/)
  })
})
