import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * LE COCKPIT DU COMMERCIAL (BEL-BO-002).
 *
 * Chaque test protège une lecture FAUSSE, jamais une ligne de code :
 *
 *  · les QUATRE chiffres d'affaires côte à côte — un « CA du mois » unique est
 *    le chiffre le plus dangereux d'un outil commercial ;
 *  · une valeur absente qui s'affiche « non mesuré », jamais « 0 € » ;
 *  · un 403 sur le SEUL chiffre d'affaires qui fait disparaître son bloc — le
 *    défaut d'origine était `revenue.isError && pipeline.isError`, donc il
 *    fallait que les deux échouent ;
 *  · les liens de sortie qui RESTENT quand le financier disparaît.
 *
 * #2567.K2 (18/09/2026) — l'ancien bloc 5 (« ce qui m'attend », la file
 * d'interventions) a migré vers `DailyGesturesBlock.test.tsx` : ce fichier ne
 * le teste plus, pour ne pas tester deux fois la même chose à deux endroits.
 */
const revenue = vi.fn()
const pipeline = vi.fn()
const missions = vi.fn()
const capacity = vi.fn()

// ⚠️ La PORTÉE est recopiée dans le mock, comme le `search` du lien plus bas.
// Un mock qui jette les arguments laisse passer exactement le défaut du
// 28/08 — le serveur savait rendre « le mien », le cockpit ne le demandait
// pas, et un total d'ESN sous le mot « Mon » n'a l'air de rien à l'écran.
// ⚠️ Faux PARTIEL : `cockpit.ts` importe `assigneeNames` du même module, et un
// faux exhaustif le ferait disparaître sous l'écran.
vi.mock('@/features/missions/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/missions/api')>()),
  useRevenue: (month?: string, scope?: string) => revenue(month, scope),
  useMissions: () => missions(),
  useCapacity: (month: string) => capacity(month),
}))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: (scope?: string) => pipeline(scope) }))
// Le `search` du lien EST recopié dans le `href`. Sans ça, la barre du pipe
// serait vérifiée sur sa seule destination, et le défaut du 28/08 — un lien
// juste, un paramètre jeté — repasserait au vert.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search }: { children: React.ReactNode; to?: string; search?: Record<string, unknown> }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    ).toString()
    return <a href={query ? `${to ?? '#'}?${query}` : (to ?? '#')}>{children}</a>
  },
}))

const { MyActivityBlock } = await import('./MyActivityBlock')

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })
const refused = () => ({ data: undefined, isLoading: false, isError: true, error: { status: 403 } })
const broken = () => ({ data: undefined, isLoading: false, isError: true, error: { status: 500 } })

function revenueLines(over: Partial<Record<string, number | null>> = {}) {
  const amounts: Record<string, number | null> = {
    signed: 3_000_000,
    produced: 1_250_000,
    invoiced: 900_000,
    collected: 400_000,
    ...over,
  }
  return ok({
    periodMonth: '2026-07-01',
    lines: (['signed', 'produced', 'invoiced', 'collected'] as const).map(kind => ({
      kind,
      amountCents: amounts[kind] ?? null,
      withoutAmount: 0,
      unavailableReason: amounts[kind] === null ? 'no_source' : null,
    })),
  })
}

function pipe(over: Record<string, unknown> = {}) {
  return ok({
    columns: [
      { stage: 'qualified', label: 'Qualifié', count: 2, amount_cents: 1_000_000, without_amount: 0 },
      { stage: 'confirmed', label: 'Besoin exprimé', count: 6, amount_cents: 0, without_amount: 6 },
      { stage: 'negotiation', label: 'Négociation', count: 3, amount_cents: 4_000_000, without_amount: 1 },
    ],
    intake: 4,
    signals: 0,
    total_count: 11,
    total_amount_cents: 5_000_000,
    total_without_amount: 7,
    ...over,
  })
}

const mission = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  label: 'Refonte du SI paiement',
  account_id: 'a1',
  accountName: 'Cliente SA',
  status: 'active',
  started_on: '2026-06-01',
  ends_on: '2036-09-30',
  marginPercent: 22,
  assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }],
  ...over,
})

/** Tout répond, tout est plein : le décor par défaut de chaque test. */
function everythingServed() {
  revenue.mockReturnValue(revenueLines())
  pipeline.mockReturnValue(pipe())
  missions.mockReturnValue(ok({ missions: [mission()], canReadFinance: true }))
  capacity.mockImplementation((month: string) => ok({ periodMonth: `${month}-01`, availableDays: 10 }))
}

beforeEach(() => {
  vi.clearAllMocks()
  everythingServed()
})

describe('bloc 1 — les quatre chiffres d’affaires', () => {
  /**
   * Le mot « Mon » du titre est une PROMESSE, et elle se tient dans la requête.
   *
   * Le serveur accepte `?scope=own` et rend l'espace entier quand on ne demande
   * rien. Le cockpit ne demandait rien : sur une ESN à cinq commerciaux, chacun
   * lisait le chiffre des cinq sous le mot « Mon ». Rien à l'écran ne pouvait le
   * dire — un total juste pour l'espace ressemble trait pour trait à un total
   * juste pour soi quand on ignore la bonne réponse.
   */
  it('DEMANDE le chiffre du lecteur, pas celui de l’ESN', () => {
    render(<MyActivityBlock />)
    expect(revenue).toHaveBeenCalledWith(undefined, 'own')
  })

  it('rend les QUATRE, côte à côte et jamais fondus, avec LE MOIS qu’ils décrivent', () => {
    render(<MyActivityBlock />)
    // Sans `?month=`, l'API rend le mois PRÉCÉDENT. Le bloc annonçait « Produit
    // ce mois » au-dessus du chiffre du mois d'avant : un chiffre juste sur la
    // mauvaise période, ce qui est pire qu'un chiffre absent.
    expect(screen.getByText(/Mon chiffre d’affaires — juillet 2026/)).toBeInTheDocument()
    for (const label of ['Signé', 'Produit', 'Facturé', 'Encaissé']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/30\s?000/)).toBeInTheDocument() // signé
    expect(screen.getByText(/12\s?500/)).toBeInTheDocument() // produit
    expect(screen.getByText(/9\s?000/)).toBeInTheDocument() // facturé
    expect(screen.getByText(/4\s?000/)).toBeInTheDocument() // encaissé
  })

  it('dit « non mesuré » et POURQUOI, jamais « 0 € »', () => {
    revenue.mockReturnValue(revenueLines({ invoiced: null, collected: null }))
    render(<MyActivityBlock />)
    expect(screen.getAllByText('Non mesuré')).toHaveLength(2)
    expect(screen.getAllByText(/Aucune source pour ce chiffre/)).toHaveLength(2)
    expect(screen.queryByText(/^0\s?€$/)).not.toBeInTheDocument()
  })
})

describe('bloc 2 — ce qu’il reste à vendre', () => {
  it('somme les trois mois quand les trois répondent', () => {
    render(<MyActivityBlock />)
    expect(screen.getByText('30 jours à vendre')).toBeInTheDocument()
  })

  it('un mois non mesurable rend « non mesuré » — jamais « 0 jour à vendre »', () => {
    // Le PREMIER mois demandé ne répond pas, quelle que soit la date du jour : un mois
    // écrit en dur (« -09 ») sortait de la fenêtre glissante le 1er octobre.
    let unmeasured: string | null = null
    capacity.mockImplementation((month: string) => {
      unmeasured ??= month
      return ok({ periodMonth: `${month}-01`, availableDays: month === unmeasured ? null : 10 })
    })
    render(<MyActivityBlock />)
    expect(screen.queryByText(/0 jour à vendre/)).not.toBeInTheDocument()
    expect(screen.getByText(/n’a rien pu rendre|n’ont rien pu rendre/)).toBeInTheDocument()
  })
})

// #2567.K2 (18/09/2026) — l'ancien « bloc 3 — ce qui m'attend » a migré,
// texte pour texte, vers `DailyGesturesBlock.test.tsx` : le moteur ne change
// pas, seul l'écran qui le rend a changé.

describe('sans le droit financier', () => {
  it('un 403 sur le SEUL chiffre d’affaires fait disparaître son bloc — et lui seul', () => {
    // Le défaut d'origine : `revenue.isError && pipeline.isError`. Il fallait
    // que les DEUX échouent, donc un 403 sur le CA laissait quatre « Non
    // mesuré » à l'écran — un droit manquant présenté comme une donnée absente.
    revenue.mockReturnValue(refused())
    render(<MyActivityBlock />)
    expect(screen.queryByText(/Mon chiffre d’affaires/)).not.toBeInTheDocument()
    expect(screen.getByText(/Ce qu’il reste à vendre/)).toBeInTheDocument()
  })

  it('les deux blocs chiffrés disparaissent ; les liens de sortie restent', () => {
    revenue.mockReturnValue(refused())
    capacity.mockImplementation(() => refused())
    render(<MyActivityBlock />)
    expect(screen.queryByText(/Mon chiffre d’affaires/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ce qu’il reste à vendre/)).not.toBeInTheDocument()
    expect(screen.getByText('Voir mon pipe')).toBeInTheDocument()
  })

  it('un bloc refusé ne compte PAS comme une panne — « 2 blocs sur 3 » serait faux', () => {
    revenue.mockReturnValue(refused())
    capacity.mockImplementation(() => refused())
    render(<MyActivityBlock />)
    expect(screen.queryByText(/blocs sur/)).not.toBeInTheDocument()
  })
})

describe('les états de l’écran', () => {
  it('PARTIEL : compte les blocs servis et NOMME celui qui n’a pas répondu', () => {
    capacity.mockImplementation(() => broken())
    render(<MyActivityBlock />)
    expect(screen.getByText(/2 blocs sur 3\./)).toBeInTheDocument()
    expect(screen.getByText(/Le calcul de capacité n’a pas répondu\./)).toBeInTheDocument()
  })

  it('ESPACE NEUF : le dit, et donne les DEUX gestes qui le remplissent', () => {
    pipeline.mockReturnValue(pipe({ columns: [], intake: 0, signals: 0, total_count: 0, total_amount_cents: 0 }))
    missions.mockReturnValue(ok({ missions: [], canReadFinance: true }))
    render(<MyActivityBlock />)
    expect(screen.getByText('Aucun compte suivi. Lance une recherche ou importe ta base.')).toBeInTheDocument()
    expect(screen.getByText('Lancer une recherche').closest('a')).toHaveAttribute('href', '/search')
    expect(screen.getByText('Importer ma base').closest('a')).toHaveAttribute(
      'href',
      '/settings/mes-donnees?tab=imports',
    )
  })

  it('ne conclut JAMAIS d’un silence : une lecture en panne n’est pas un espace vide', () => {
    // ⚠️ #1394 — le pipe n'est PLUS affiché, il est toujours LU. C'est ce qui
    // distingue « rien n'existe ici » de « je n'ai pas pu regarder », et la
    // panne ne doit surtout pas se lire « espace neuf ». Le bloc ne l'ANNONCE
    // plus (il ne compte plus dans « N blocs sur M ») : il se contente de ne
    // pas conclure.
    pipeline.mockReturnValue(broken())
    missions.mockReturnValue(ok({ missions: [], canReadFinance: true }))
    render(<MyActivityBlock />)
    expect(screen.queryByText(/Aucun compte suivi/)).not.toBeInTheDocument()
    expect(screen.getByText(/Ce qu’il reste à vendre/)).toBeInTheDocument()
  })

  it('#1394 — l’écran ne rend plus le pipe par étape ni la liste des missions', () => {
    // La garde de la RÉDUCTION elle-même : sans elle, un futur retour « remets
    // le pipe » se réappliquerait ici plutôt que sur `/projects`, et le brief
    // redeviendrait le second tableau de bord que ce retour a fait retirer.
    render(<MyActivityBlock />)
    expect(screen.queryByText('Mon pipe')).not.toBeInTheDocument()
    expect(screen.queryByText('Mes missions en cours')).not.toBeInTheDocument()
    // Et il dit où elles sont parties : un bloc qu'on allège sans donner la
    // sortie se lit comme une perte.
    // Théo A today-jour.A8 — le Tableau de bord est retiré : plus aucune sortie vers /dashboard.
    expect(screen.queryByText('Voir mon tableau de bord')).not.toBeInTheDocument()
    expect(screen.getByText('Voir mon pipe').closest('a')).toHaveAttribute('href', '/projects')
    expect(screen.getByText('Voir mes missions').closest('a')).toHaveAttribute('href', '/missions')
  })
})
