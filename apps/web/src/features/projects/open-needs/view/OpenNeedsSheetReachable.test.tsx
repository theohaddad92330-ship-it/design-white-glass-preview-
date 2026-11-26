import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * LA FICHE D'UN BESOIN EST ATTEIGNABLE — EN CLIQUANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE-CI, EN PLUS DE CELLE DE LA ROUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Taper une URL prouve que la route RÉPOND ; ça ne prouve pas que quelqu'un la
 * trouvera. C'est le motif qui revient dans tous les chantiers de ce dépôt —
 * « du code juste, calculé, testé, que personne n'appelle » — et il s'est
 * rejoué ici sous une forme plus discrète : le clic de ligne existait,
 * `onOpenProject(row.project_id)` était bien câblé au tableau, et l'ÉCRAN
 * jetait l'argument pour naviguer vers `/projects`. Un clic qui perd son sujet
 * n'est pas une navigation, c'est une sortie.
 *
 * Cette garde tient donc trois choses :
 *
 *  1. **UN clic** depuis la liste, pas deux ;
 *  2. **un vrai lien**, tabulable et annonçable — un `onClick` sur un `<tr>`
 *     n'est ni bouton ni lien (GA-35), donc au clavier la fiche serait
 *     inatteignable ;
 *  3. **le libellé dit ce que l'écran montre** : c'est le RÔLE du besoin, pas
 *     un « Voir » générique. Sur une liste de cinquante lignes, cinquante
 *     « Voir » ne se distinguent pas les uns des autres — un lecteur d'écran
 *     annonce alors cinquante fois la même chose.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
  } & Record<string, unknown>) => (
    <a
      href={Object.entries(params ?? {}).reduce((acc, [key, value]) => acc.replace(`$${key}`, String(value)), to)}
      {...rest}
    >
      {children}
    </a>
  ),
}))
// #2173.31 — la colonne « Owner » lit les membres de l'espace ; sans ce mock,
// le tableau plante hors d'un `SessionProvider` (`useWorkspaceMembers` en
// dépend), ce qui n'a rien à voir avec ce que cette garde-ci vérifie.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

const { OpenNeedsTable } = await import('./OpenNeedsTable')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Architecte plateforme',
    skills: [{ term: 'Kubernetes', required: true, level: null }],
    shortlist_count: 2,
    headcount: 1,
    contract_kind: 'regie',
    status: 'matching',
    project_id: 'p-1',
    project_label: 'Portail',
    project_stage: 'qualified',
    account_name: 'ACME',
    ...over,
  } as unknown as OpenNeedRow
}

function draw(onOpenNeed = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <OpenNeedsTable
        rows={[need()]}
        poolIsEmpty={false}
        onOpenNeed={onOpenNeed}
        onMatch={() => {}}
        onAddConsultant={() => {}}
        selectedIds={[]}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    </QueryClientProvider>,
  )
  return { ...view, onOpenNeed }
}

describe('depuis la liste, la fiche est à UN clic', () => {
  it('le rôle est un LIEN vers la fiche de CE besoin', () => {
    draw()
    const link = screen.getByRole('link', { name: 'Architecte plateforme' })
    expect(link).toHaveAttribute('href', '/projects/needs/11111111-1111-4111-8111-111111111111')
  })

  it('son nom accessible est le RÔLE — pas un « Voir » que rien ne distingue', () => {
    draw()
    // Cinquante « Voir » sur une page sont cinquante fois la même annonce.
    expect(screen.queryByRole('link', { name: /^(Voir|Ouvrir|Détail)$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Architecte plateforme' })).toBeInTheDocument()
  })

  it('la ligne entière l’ouvre aussi — le raccourci souris, avec l’identifiant du BESOIN', async () => {
    // ⚠️ L'identifiant du besoin, et pas celui du projet. C'est là que le
    // défaut vivait : le tableau passait `row.project_id` et l'écran
    // n'emmenait nulle part de précis.
    const { onOpenNeed } = draw()
    const rows = screen.getAllByTestId('open-need-row')
    await userEvent.click(rows[0] as HTMLElement)
    expect(onOpenNeed).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('cocher la ligne n’ouvre PAS la fiche', async () => {
    // Le clic est arrêté sur la case : sans ça, cocher un besoin pour une
    // action de masse quitterait l'écran et viderait la sélection.
    const { onOpenNeed } = draw()
    await userEvent.click(screen.getByRole('checkbox', { name: /Architecte plateforme/ }))
    expect(onOpenNeed).not.toHaveBeenCalled()
  })
})
