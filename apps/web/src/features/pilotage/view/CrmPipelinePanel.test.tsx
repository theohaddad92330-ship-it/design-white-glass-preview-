import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * Le pipeline du CRM, et la réponse d'API parfaite que l'écran jetait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 27/08
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /crm/pipeline/report?period=quarter` répondait 503 avec un corps qui dit
 * TOUT : `code: "scope_missing"`, la capacité, les trois portées manquantes, et
 * une phrase déjà écrite pour l'utilisateur avec le geste à faire. Le CRM était
 * bel et bien connecté ; il lui manquait trois autorisations.
 *
 * L'écran affichait : « Aucun CRM connecté, **ou** lecture impossible. » Un
 * « ou » qui fond trois situations qui n'appellent pas le même geste — et aucun
 * chemin pour agir. C'est la cause racine « une réponse juste sans chemin », et
 * la cause racine « cassé et non mesurable se ressemblent », sur le même écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. les TROIS états se distinguent : pas connecté · connecté sans le droit de
 *     lire · panne réelle ;
 *  2. la phrase du serveur est AFFICHÉE, pas réécrite (elle nomme les portées) ;
 *  3. il y a un chemin — Réglages › Intégrations ;
 *  4. le nom de l'ÉDITEUR n'atteint jamais le JSX. Le corps 503 porte
 *     `"provider":"hubspot"` ; l'app nomme la CAPACITÉ (« ton CRM »), et la seule
 *     exception du dépôt est Réglages › Intégrations.
 */

/** Le corps EXACT rendu par la production le 27/08. */
const PRODUCTION_BODY = {
  statusCode: 503,
  error: 'Service Unavailable',
  code: 'scope_missing',
  reason: 'scope_missing',
  provider: 'hubspot',
  capability: 'crm',
  scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read'],
  message:
    "Je n'ai pas le droit de regarder ton CRM. Reconnecte cet outil : un accès déjà donné ne s'élargit pas tout seul.",
}

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { pipeline: vi.fn() } }))

const { CrmPipelinePanel } = await import('./CrmPipelinePanel')

const failing = (error: unknown) => ({ data: undefined, isLoading: false, isError: true, error, refetch: vi.fn() })

beforeEach(() => {
  useQuery.mockReset()
})

describe('CrmPipelinePanel — trois états, jamais un « ou »', () => {
  it('portée manquante : AFFICHE la phrase du serveur, et ouvre un chemin', () => {
    useQuery.mockReturnValue(failing(new ApiError(PRODUCTION_BODY.message, 503, 'scope_missing')))
    const { container } = render(<CrmPipelinePanel />)

    // La phrase du serveur, telle quelle : elle nomme le geste, on ne la réécrit pas.
    expect(container.textContent).toContain("Je n'ai pas le droit de regarder ton CRM")
    // Le « ou » qui fondait trois cas a disparu.
    expect(container.textContent).not.toContain('Aucun CRM connecté, ou lecture impossible')
    // Un chemin, pas seulement un constat.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('aucun CRM connecté : un AUTRE message, et le même chemin', () => {
    // Le serveur rend 412 sur ce cas-là (« la route existe, il manque une
    // CONDITION »), sans code de connecteur.
    useQuery.mockReturnValue(failing(new ApiError('Aucun CRM connecté à cet espace.', 412)))
    const { container } = render(<CrmPipelinePanel />)

    expect(container.textContent).toContain('Aucun CRM n’est connecté')
    expect(container.textContent).not.toContain("Je n'ai pas le droit")
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('vraie panne : distincte des deux autres — « cassé » et « pas le droit » ne se ressemblent pas', () => {
    useQuery.mockReturnValue(failing(new ApiError('boom', 500)))
    const { container } = render(<CrmPipelinePanel />)

    expect(container.textContent).toContain("c'est la lecture qui a échoué")
    expect(container.textContent).not.toContain('Aucun CRM n’est connecté')
    expect(container.textContent).not.toContain("Je n'ai pas le droit")
    // Une panne ne se répare pas dans Intégrations : aucun chemin faux.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('un corps sans `message` ne laisse pas l’écran muet', () => {
    // Le contrat impose `message`, mais un écran qui n'a rien à dire quand il
    // manque afficherait une phrase vide, ce qui se lit comme un bug d'affichage.
    useQuery.mockReturnValue(failing(new ApiError('', 503, 'scope_missing')))
    const { container } = render(<CrmPipelinePanel />)
    expect(container.textContent).toContain('Reconnecte-le')
  })

  /**
   * #1836 — LE QUATRIÈME ÉTAT : CONNECTÉ, ET MORT.
   *
   * Le panneau distinguait trois échecs et rangeait celui-ci dans « panne » :
   * l'API rendait un 503 NU (`'CRM token expired and cannot be refreshed'`,
   * sans `code`), l'écran concluait « ton CRM n'a pas répondu » et RETIRAIT le
   * lien vers Intégrations — au motif, juste en soi, qu'une panne ne s'y répare
   * pas. Sauf que la connexion existait et qu'elle était morte : le geste
   * existait, et c'était le seul qui réparait.
   *
   * FAIL (défaut du produit) contre BLOCKED (configuration), rendus à l'envers.
   */
  it('#1836 — autorisation expirée : la phrase du SERVEUR, et un chemin', () => {
    const message =
      'ton CRM est bien connecté, mais son autorisation a expiré. ' +
      'Reconnecte-le depuis Intégrations : une autorisation expirée ne se renouvelle pas toute seule.'
    useQuery.mockReturnValue(failing(new ApiError(message, 503, 'authorization_expired')))
    const { container } = render(<CrmPipelinePanel />)

    expect(container.textContent).toContain('son autorisation a expiré')
    // Ce qu'on ne dit PLUS : « réessaie », devant quelque chose qui ne
    // repassera jamais tout seul.
    expect(container.textContent).not.toContain("c'est la lecture qui a échoué")
    // Le geste, rendu cliquable.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('#1836 — un corps sans `message` ne laisse pas cet état muet non plus', () => {
    useQuery.mockReturnValue(failing(new ApiError('', 503, 'authorization_expired')))
    const { container } = render(<CrmPipelinePanel />)
    expect(container.textContent).toContain('autorisation a expiré')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('un échec qui n’est PAS une `ApiError` reste lisible', () => {
    useQuery.mockReturnValue(failing(new Error('network')))
    const { container } = render(<CrmPipelinePanel />)
    expect(container.textContent).toContain("c'est la lecture qui a échoué")
  })
})

/**
 * Le taux de réussite, et le zéro qu'il fabriquait.
 *
 * Ce panneau formatait son pourcentage à la main — comme la chaîne commerciale
 * et le taux d'intercontrat, sur le MÊME écran. Trois copies de la même ligne,
 * et aucune des trois ne traitait un taux non nul qui s'arrondit à zéro.
 */
describe('CrmPipelinePanel — le taux de réussite ne ment pas sur zéro', () => {
  const report = (winRate: number | null) => ({
    data: {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-03-31T00:00:00.000Z',
      period: 'quarter' as const,
      open: { deals: 0, amount: 0, amountUnknown: 0, byStage: [] },
      closed: { won: 1, lost: 300, wonAmount: 0, lostAmount: 0, outcomeUnknown: 0 },
      winRate,
      averageCycleDays: null,
      cycleUnmeasured: 0,
      byOwner: [],
      coverage: { dealsRead: 301, truncated: false, syncedAt: null },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })

  it('une affaire gagnée sur 301 n’écrit pas « 0 % »', () => {
    // 1 / 301 = 0,33 %. « 0 % » se lirait « nous ne gagnons rien », à côté d'un
    // « Gagnées 1 » qui dit le contraire.
    useQuery.mockReturnValue(report(1 / 301))
    render(<CrmPipelinePanel />)
    expect(screen.getByText('< 1 %')).toBeInTheDocument()
  })

  it('mais rien de clos reste « pas encore de deal clos », jamais un pourcentage', () => {
    useQuery.mockReturnValue(report(null))
    const { container } = render(<CrmPipelinePanel />)
    expect(container.textContent).toContain('aucune affaire close')
  })
})

describe('doctrine — le nom de l’éditeur n’atteint pas cet écran', () => {
  it('le corps 503 porte « hubspot », le DOM ne le porte jamais', () => {
    useQuery.mockReturnValue(failing(new ApiError(PRODUCTION_BODY.message, 503, 'scope_missing')))
    const { container } = render(<CrmPipelinePanel />)
    expect(container.textContent ?? '').not.toMatch(/hubspot/i)
    // …et la capacité, elle, est bien nommée.
    expect(container.textContent).toMatch(/ton CRM/i)
  })

  it('le composant ne lit AUCUN champ `provider` — c’est structurel, pas une convention', () => {
    // `ApiError` ne transporte que `status`, `code` et `message` : `provider`
    // n'arrive jamais jusqu'ici. La garde vérifie que personne ne le rebranche.
    const raw = readFileSync(join(__dirname, 'CrmPipelinePanel.tsx'), 'utf8')
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // La garde LIT quelque chose : c'est bien le fichier qui traite ce cas.
    expect(source).toContain('scope_missing')
    expect(source).not.toMatch(/\bprovider\b/)
  })
})
