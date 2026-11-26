import { SINCE_LAST_VISIT_LINES } from '@bellum/contracts'
import type { ActionHistoryItem, ActionHistoryQuery, SinceLastVisitDigest, SinceLastVisitLine } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * « Ce qui a bougé depuis ma dernière visite » — le rendu de ses états.
 *
 * Le bloc est le levier de rétention le plus simple du produit : il donne une
 * raison d'ouvrir l'outil le matin. Il ne la donne que s'il est CRU, et il n'est
 * cru que si ses silences se distinguent — d'où la moitié des tests ci-dessous.
 *
 * ⚠️ Ce fichier existait AVANT les quatre lignes typées et il était vert : le
 * bloc était monté, visible, et ne montrait que le journal `user_actions` brut.
 * C'est ce qui a fait marquer l'item « branché et vu à l'écran » le 27/08/2026.
 * Un test de CONTENANT ne dit rien du contenu.
 */

const lastSeen = vi.fn()
const history = vi.fn()
const digest = vi.fn()
const historyArgs = vi.fn<(filters: ActionHistoryQuery, options: { enabled?: boolean }) => void>()
const digestArgs = vi.fn<(since: string | null) => void>()

vi.mock('@/features/action-history/hooks/useActionHistory', () => ({
  useLastSeen: () => lastSeen(),
  useActionHistory: (filters: ActionHistoryQuery, options: { enabled?: boolean } = {}) => {
    historyArgs(filters, options)
    return history()
  },
}))
vi.mock('../api', () => ({
  useSinceLastVisit: (since: string | null) => {
    digestArgs(since)
    return digest()
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { SinceLastVisitBlock } = await import('./SinceLastVisitBlock')

const SINCE = '2026-08-26T18:04:00.000Z'
// Même instant que `SINCE` par défaut : zéro jour d'absence, donc jamais le
// résumé condensé de longue absence dans les tests qui ne le visent pas.
const NOW = new Date(SINCE)
const idle = { data: undefined, isLoading: false, isError: false }
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false })
const failed = { data: undefined, isLoading: false, isError: true }

function item(id: string, label: string, target: string): ActionHistoryItem {
  return {
    id,
    action_type: 'analysis_completed',
    category: 'analysis',
    action_label: label,
    detail: '',
    channel: null,
    actor: { id: '11111111-1111-1111-1111-111111111111', name: 'Théo', initials: 'T' },
    target: { account_id: null, contact_id: null, label: target, initials: target.slice(0, 1) },
    created_at: '2026-08-27T07:00:00.000Z',
    rollback: null,
    crmTaskClosable: false,
  }
}

function page(items: ActionHistoryItem[], totalItems = items.length) {
  return ok({
    data: items,
    pagination: {
      currentPage: 1,
      size: 4,
      totalItems,
      totalPages: 1,
      hasNext: totalItems > items.length,
      hasPrev: false,
    },
  })
}

/** Les quatre lignes servies : à zéro par défaut, sauf celles qu'on nomme. */
function lines(...overrides: SinceLastVisitLine[]) {
  return linesAndAggregates({}, ...overrides)
}

/**
 * #2106.30/.31 — mêmes quatre lignes, avec les deux agrégats SERVEUR du
 * résumé condensé de longue absence (`null` par défaut, comme `lines()`).
 */
function linesAndAggregates(
  aggregates: { expiredItemsCount?: number | null; treatedByColleagueCount?: number | null },
  ...overrides: SinceLastVisitLine[]
) {
  const byKind = new Map(overrides.map(line => [line.kind, line]))
  return ok<SinceLastVisitDigest>({
    since: SINCE,
    lines: SINCE_LAST_VISIT_LINES.map(
      kind => byKind.get(kind) ?? { kind, state: 'ready' as const, reason: null, count: 0, scope: null },
    ),
    expiredItemsCount: aggregates.expiredItemsCount ?? null,
    treatedByColleagueCount: aggregates.treatedByColleagueCount ?? null,
  })
}

describe('SinceLastVisitBlock', () => {
  it('sur une première visite, annonce qu’il commence à compter — jamais « 0 »', () => {
    lastSeen.mockReturnValue(ok({ since: null }))
    history.mockReturnValue(idle)
    digest.mockReturnValue(idle)
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/première visite/i)).toBeInTheDocument()
    expect(screen.queryByText(/^0\b/)).not.toBeInTheDocument()
  })

  it('n’interroge NI le journal NI les quatre lignes tant qu’il n’existe pas de repère', () => {
    // Sans fenêtre à interroger, une requête rendrait TOUT l'historique de
    // l'espace — c'est-à-dire un « ce qui a bougé » qui n'a rien à voir. Et
    // l'API refuse un `since` absent plutôt que d'en deviner un.
    historyArgs.mockClear()
    digestArgs.mockClear()
    lastSeen.mockReturnValue(ok({ since: null }))
    history.mockReturnValue(idle)
    digest.mockReturnValue(idle)
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(historyArgs).toHaveBeenCalledWith(expect.anything(), { enabled: false })
    expect(historyArgs.mock.calls[0]?.[0].since).toBeUndefined()
    expect(digestArgs).toHaveBeenCalledWith(null)
  })

  it('dit « tu es à jour » avec la DATE de la fenêtre', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(lines())
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/à jour/i)).toBeInTheDocument()
    // Sans la date, « à jour » ne dit pas à jour de QUOI.
    expect(screen.getByText(/26 août/)).toBeInTheDocument()
  })

  it('« je n’ai pas pu lire » ne se confond ni avec « à jour » ni avec une première visite', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(failed)
    digest.mockReturnValue(failed)
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/pas pu lire/i)).toBeInTheDocument()
    expect(screen.queryByText(/à jour/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/première visite/i)).not.toBeInTheDocument()
  })

  it('montre au plus quatre lignes de journal et DIT ce qu’il replie', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    digest.mockReturnValue(lines())
    history.mockReturnValue(
      page(
        [
          item('a', 'Analyse terminée', 'ACME'),
          item('b', 'Contact enrichi', 'BETA'),
          item('c', 'Message envoyé', 'GAMMA'),
          item('d', 'Export généré', 'DELTA'),
        ],
        11,
      ),
    )
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    // #1393 — le journal est REPLIÉ : ce que j'ai fait moi-même ne pousse plus
    // les quatre lignes typées sous la ligne de flottaison.
    expect(screen.queryByText('Analyse terminée')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mon activité récente/ }))
    expect(screen.getByText('Analyse terminée')).toBeInTheDocument()
    expect(screen.getByText('Export généré')).toBeInTheDocument()
    expect(screen.getByText(/7 autres/)).toBeInTheDocument()
  })

  it('#1393 — le dépli s’annonce, et il n’existe pas quand le journal est vide', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    digest.mockReturnValue(lines())
    history.mockReturnValue(page([item('a', 'Analyse terminée', 'ACME')]))
    const { rerender } = render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    const toggle = screen.getByRole('button', { name: /Mon activité récente/ })
    // Sans `aria-expanded`, le chevron ne dit rien à un lecteur d'écran.
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: /Mon activité récente/ })).toHaveAttribute('aria-expanded', 'true')

    // Une porte qui ouvre sur rien ne s'affiche pas.
    history.mockReturnValue(page([], 0))
    rerender(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.queryByRole('button', { name: /Mon activité récente/ })).not.toBeInTheDocument()
  })

  it('demande exactement le nombre de lignes qu’il sait afficher', () => {
    // Le compte « et N autres » se lit sur le TOTAL du serveur, pas sur ce qui
    // est arrivé : demander une page entière pour n'en montrer que quatre ferait
    // payer une lecture large à un bloc qui n'en affiche rien.
    historyArgs.mockClear()
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    digest.mockReturnValue(lines())
    history.mockReturnValue(page([item('a', 'Analyse terminée', 'ACME')]))
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(historyArgs).toHaveBeenCalledWith({ since: SINCE, limit: 4 }, { enabled: true })
  })

  /* ------------------------------------------------------------------ */
  /*  Les quatre lignes typées — le contenu qui manquait                */
  /* ------------------------------------------------------------------ */

  it('écrit les quatre lignes typées, chacune avec son vrai chiffre', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      lines(
        { kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 },
        { kind: 'replies_received', state: 'ready', reason: null, count: 2, scope: null },
        { kind: 'job_changes', state: 'ready', reason: null, count: 1, scope: null },
        { kind: 'missions_moving', state: 'ready', reason: null, count: 1, scope: null },
      ),
    )
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText('3 nouveaux signaux sur 2 comptes')).toBeInTheDocument()
    expect(screen.getByText('2 réponses reçues')).toBeInTheDocument()
    expect(screen.getByText(/1 contact a changé d’entreprise|1 contact a changé d'entreprise/)).toBeInTheDocument()
    expect(screen.getByText(/1 mission passe sous 30 jours de fin/)).toBeInTheDocument()
  })

  it('une ligne mesurée à ZÉRO ne s’affiche pas — pas de zéro décoratif', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([item('a', 'Analyse terminée', 'ACME')]))
    digest.mockReturnValue(lines({ kind: 'job_changes', state: 'ready', reason: null, count: 2, scope: null }))
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/2 contacts ont changé/)).toBeInTheDocument()
    // Les trois autres sont à zéro : elles ne sont NULLE PART, ni en « 0 », ni
    // en ligne vide. C'est la contrepartie exacte du test précédent.
    expect(screen.queryByText(/signal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/réponse/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/mission/i)).not.toBeInTheDocument()
  })

  it('« messagerie non connectée » s’affiche À LA PLACE de « 0 réponse »', () => {
    // Les deux appellent des gestes opposés : attendre, ou aller brancher.
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      lines({
        kind: 'replies_received',
        state: 'not_connected',
        reason: 'mailbox_not_connected',
        count: null,
        scope: null,
      }),
    )
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/Aucune messagerie connectée/)).toBeInTheDocument()
    expect(screen.queryByText(/0 réponse/)).not.toBeInTheDocument()
    // Et le bloc ne se lit surtout pas « tu es à jour ».
    expect(screen.queryByText(/à jour/i)).not.toBeInTheDocument()
  })

  it('un journal muet n’efface pas les quatre lignes, et le DIT', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(failed)
    digest.mockReturnValue(lines({ kind: 'missions_moving', state: 'ready', reason: null, count: 1, scope: null }))
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/1 mission passe sous 30 jours/)).toBeInTheDocument()
    expect(screen.getByText(/journal n’a pas répondu|journal n'a pas répondu/)).toBeInTheDocument()
  })

  it('des quatre lignes muettes n’effacent pas le journal, et le DISENT', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([item('a', 'Analyse terminée', 'ACME')]))
    digest.mockReturnValue(failed)
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByText(/pas pu compter ce qui a bougé/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mon activité récente/ }))
    expect(screen.getByText('Analyse terminée')).toBeInTheDocument()
    expect(screen.queryByText(/à jour/i)).not.toBeInTheDocument()
  })

  // #2106.22/.23/.24/.25 (#2834 pour .24) — les quatre lignes ouvrent la page
  // qu'elles annoncent, et ce lien se TABULE (`<Link>`, jamais un `<div>`).
  it.each([
    ['account_signals', '/accounts?headline=newSignals7d'],
    ['replies_received', '/mailbox?intent=unread'],
    ['missions_moving', '/missions'],
    ['job_changes', '/contacts?sourceTag=RISQUE'],
  ] as const)('la ligne « %s » est un lien vers %s', (kind, href) => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(lines({ kind, state: 'ready', reason: null, count: 3, scope: null }))
    render(<SinceLastVisitBlock now={NOW} openTasksCount={null} />)
    expect(screen.getByRole('link', { name: new RegExp(String(3)) })).toHaveAttribute('href', href)
  })

  /* ------------------------------------------------------------------ */
  /*  #2106.29/.32 — le résumé condensé de longue absence                */
  /* ------------------------------------------------------------------ */

  const LONG_ABSENCE_NOW = new Date('2026-09-02T18:04:00.000Z') // SINCE + 7 jours pile

  it('sous sept jours, aucun résumé condensé — les lignes suffisent déjà', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(lines({ kind: 'replies_received', state: 'ready', reason: null, count: 4, scope: null }))
    render(<SinceLastVisitBlock now={NOW} openTasksCount={9} />)
    expect(screen.queryByText(/l’essentiel|l'essentiel/)).not.toBeInTheDocument()
  })

  it('à sept jours, nomme la ligne la plus mesurée et les tâches encore ouvertes', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      lines(
        { kind: 'account_signals', state: 'ready', reason: null, count: 1, scope: 1 },
        { kind: 'replies_received', state: 'ready', reason: null, count: 4, scope: null },
      ),
    )
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={3} />)
    expect(screen.getByText(/l’essentiel|l'essentiel/)).toBeInTheDocument()
    expect(screen.getByText(/Le plus important : 4 réponses reçues/)).toBeInTheDocument()
    expect(screen.getByText(/3 tâches encore ouvertes/)).toBeInTheDocument()
  })

  it('#2106.33 — le résumé condensé nomme UNE ligne, jamais une liste d’items', () => {
    // La contrainte anti-journal-exhaustif, vue depuis l'écran : un seul
    // « le plus important », jamais une seconde carte ou une liste en plus —
    // les quatre lignes en détail restent, elles, affichées une fois chacune.
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(lines({ kind: 'account_signals', state: 'ready', reason: null, count: 5, scope: 3 }))
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={null} />)
    expect(screen.getAllByText(/Le plus important :/)).toHaveLength(1)
  })

  it('zéro tâche restante ne s’affiche jamais — silence, pas un zéro', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(lines({ kind: 'account_signals', state: 'ready', reason: null, count: 2, scope: 1 }))
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={0} />)
    expect(screen.queryByText(/tâche/)).not.toBeInTheDocument()
  })

  /* ------------------------------------------------------------------ */
  /*  #2106.30/.31 — les deux agrégats serveur du résumé condensé         */
  /* ------------------------------------------------------------------ */

  it('#2106.30 — nomme ce qui a EXPIRÉ pendant l’absence', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      linesAndAggregates(
        { expiredItemsCount: 3 },
        { kind: 'account_signals', state: 'ready', reason: null, count: 1, scope: 1 },
      ),
    )
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={null} />)
    expect(screen.getByText(/3 actions ont expiré/)).toBeInTheDocument()
  })

  it('#2106.31 — nomme ce qu’un COLLÈGUE a traité pendant l’absence', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      linesAndAggregates(
        { treatedByColleagueCount: 1 },
        { kind: 'account_signals', state: 'ready', reason: null, count: 1, scope: 1 },
      ),
    )
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={null} />)
    expect(screen.getByText(/1 action a été traitée par un collègue/)).toBeInTheDocument()
  })

  it('zéro élément expiré ou traité par un collègue ne s’affiche jamais — silence, pas un zéro', () => {
    lastSeen.mockReturnValue(ok({ since: SINCE }))
    history.mockReturnValue(page([]))
    digest.mockReturnValue(
      linesAndAggregates(
        { expiredItemsCount: 0, treatedByColleagueCount: 0 },
        { kind: 'account_signals', state: 'ready', reason: null, count: 2, scope: 1 },
      ),
    )
    render(<SinceLastVisitBlock now={LONG_ABSENCE_NOW} openTasksCount={null} />)
    expect(screen.queryByText(/expiré/)).not.toBeInTheDocument()
    expect(screen.queryByText(/collègue/)).not.toBeInTheDocument()
  })
})
