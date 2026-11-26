import { render, screen } from '@testing-library/react'
import type { Contribution } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * « Ce que Bellum a contribué » — et où va-t-on ensuite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau affiche « 4 comptes ouverts via Découvrir » et « 1 mission signée
 * sur ces comptes ». Les deux chiffres sont justes, vérifiables, et **inertes** :
 * il n'existait aucun chemin depuis l'endroit où la question se pose (« lesquels
 * ? ») vers les objets comptés. C'est la troisième fois dans ce dépôt — le
 * tableau de bord (#1095), puis le compteur d'alertes de `/pilotage` (#1128).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Un compteur nomme sa population.** Chaque ligne mène à l'écran qui
 *    contient les objets qu'elle COMPTE — pas à un écran voisin qui parlerait du
 *    même sujet. Les quatre destinations se lisent sur les quatre requêtes du
 *    serveur (`contribution.service.ts`) : `accounts`, `opportunities`,
 *    `submissions`, `missions`.
 * 2. **Aucun lien mort.** Le serveur et le navigateur sont deux déploiements ;
 *    une destination que CE navigateur ne connaît pas ne devient pas un `<Link>`
 *    vers « Page introuvable ». L'information reste, le lien disparaît — la même
 *    discipline que l'écran Qualité des données.
 * 3. **Le lien porte un nom.** « 4 » n'est pas un nom accessible ; le libellé
 *    visible entre dans le nom annoncé (WCAG 2.5.3, « label in name »).
 */
let routesByPath: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const { ContributionPanel } = await import('./ContributionPanel')

/** Les quatre écrans qui portent les objets comptés, plus rien d'autre. */
const ALL_ROUTES: Record<string, unknown> = {
  '/accounts': true,
  '/projects/needs': true,
  '/consultants': true,
  '/missions': true,
}

function contribution(over: Partial<Contribution> = {}): Contribution {
  return {
    since: '2026-05-29T00:00:00.000Z',
    unattributedAccounts: 0,
    lines: [
      { key: 'accounts_opened', count: 4, attribution: 'direct' },
      { key: 'needs_from_signal', count: 2, attribution: 'direct' },
      { key: 'submissions_from_matching', count: 6, attribution: 'direct' },
      { key: 'missions_signed', count: 1, attribution: 'partial' },
    ],
    ...over,
  }
}

const hrefs = () => screen.getAllByRole('link').map(link => link.getAttribute('href'))

beforeEach(() => {
  routesByPath = ALL_ROUTES
  useQuery.mockReset()
})

describe('ContributionPanel — un comptage mène à sa population', () => {
  it('rend les quatre lignes, chacune vers l’écran qui porte ses objets', () => {
    useQuery.mockReturnValue({ data: contribution() })
    render(<ContributionPanel />)

    expect(hrefs()).toEqual(['/accounts', '/projects/needs', '/consultants', '/missions'])
  })

  it('les comptes dont l’origine n’est pas enregistrée mènent au portefeuille', () => {
    // Annoncés, jamais absorbés — et désormais consultables : « 12 comptes plus
    // anciens » sans chemin vers eux ne se vérifie pas.
    useQuery.mockReturnValue({ data: contribution({ unattributedAccounts: 12 }) })
    render(<ContributionPanel />)

    const unattributed = screen.getByRole('link', { name: /12 comptes plus anciens/ })
    expect(unattributed).toHaveAttribute('href', '/accounts')
  })

  it('ne rend AUCUN lien vers une destination que ce navigateur ne connaît pas', () => {
    // Le serveur livré en avance sur le web : `/consultants/submissions` n'existe
    // pas encore dans cet arbre de routes. Un lien mort est pire qu'une absence
    // de lien — il fait douter de tout le reste de la liste.
    routesByPath = Object.fromEntries(Object.entries(ALL_ROUTES).filter(([path]) => path !== '/consultants'))
    useQuery.mockReturnValue({ data: contribution() })
    const { container } = render(<ContributionPanel />)

    expect(hrefs()).toEqual(['/accounts', '/projects/needs', '/missions'])
    // Ce qu'on retire est le lien, jamais l'information.
    expect(container.textContent).toContain('6 positionnements issus d’un matching')
  })

  it('le lien porte un nom qui contient son libellé visible (GA-32 / WCAG 2.5.3)', () => {
    useQuery.mockReturnValue({ data: contribution() })
    render(<ContributionPanel />)

    const accounts = screen.getByRole('link', { name: /4 comptes ouverts via Découvrir/ })
    expect(accounts.getAttribute('aria-label')).toContain('ouvrir la liste')
  })

  it('les TROIS natures d’attribution sont des groupes nommés (#1434)', () => {
    // Une mission signée sur un compte ouvert via Découvrir a été gagnée par un
    // commercial. La nuance était rendue en petit à droite de la ligne, donc
    // invisible : quatre chiffres se lisaient tous comme des revendications
    // directes, dont les zéros. Elle est maintenant un intitulé de groupe.
    useQuery.mockReturnValue({ data: contribution() })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toContain('Attribution directe')
    expect(container.textContent).toContain('Attribution partielle')
    expect(container.textContent).toContain('Historique non attribuable')
  })

  it('la PÉRIODE des comptages est écrite (#1434 / #1440)', () => {
    // `since` voyageait dans la charge utile depuis le premier jour et aucun
    // écran ne le rendait : des comptages sans fenêtre de calcul.
    useQuery.mockReturnValue({ data: contribution() })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toContain('Depuis le')
  })

  it('une lecture qui n’a pas abouti n’affiche aucun lien', () => {
    useQuery.mockReturnValue({ data: undefined })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toBe('')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UN COMPTAGE QUI N'A PAS PU SE FAIRE N'EST PAS UN COMPTAGE À ZÉRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur rendait `0` sur exception jusqu'au 29/08/2026 ; il rend `null`.
 * L'écran doit finir le travail — un `{count ?? 0}` ici annulerait la correction
 * et remettrait « 0 compte ouvert via Découvrir » sur l'écran qui édicte la
 * règle. C'est le motif que GA-19 compte, vu depuis le rendu.
 */
describe('ContributionPanel — « non mesuré » ne s’écrit pas « 0 »', () => {
  it('une ligne non lue affiche « non mesuré » et NON un chiffre', () => {
    useQuery.mockReturnValue({
      data: contribution({
        lines: [
          { key: 'accounts_opened', count: null, attribution: 'direct' },
          { key: 'needs_from_signal', count: 2, attribution: 'direct' },
          { key: 'submissions_from_matching', count: 6, attribution: 'direct' },
          { key: 'missions_signed', count: 1, attribution: 'partial' },
        ],
      }),
    })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toContain('non mesuré')
    // La population reste NOMMÉE : « non mesuré » tout seul ne dit pas de quoi.
    expect(container.textContent).toContain('comptes ouverts via Découvrir')
    // Et surtout : aucun chiffre n'est écrit pour cette ligne.
    expect(container.textContent).not.toContain('0 compte')
  })

  it('une ligne non lue ne devient PAS un lien — une liste inconnue ne s’ouvre pas', () => {
    // Même arbitrage que la mosaïque de `/pilotage` : « une valeur NON LUE ne
    // dit rien de ce qu'une liste contiendrait ». Y envoyer quelqu'un lui ferait
    // chercher des objets dont on ignore jusqu'au nombre.
    useQuery.mockReturnValue({
      data: contribution({
        lines: [
          { key: 'accounts_opened', count: null, attribution: 'direct' },
          { key: 'needs_from_signal', count: 2, attribution: 'direct' },
          { key: 'submissions_from_matching', count: 6, attribution: 'direct' },
          { key: 'missions_signed', count: 1, attribution: 'partial' },
        ],
      }),
    })
    render(<ContributionPanel />)

    expect(hrefs()).toEqual(['/projects/needs', '/consultants', '/missions'])
  })

  it('un ZÉRO mesuré, lui, s’affiche et reste une réponse', () => {
    // Le symétrique : un espace neuf a vraiment zéro compte venu de Découvrir.
    // Le masquer derrière « non mesuré » serait le même mensonge, retourné.
    useQuery.mockReturnValue({
      data: contribution({
        lines: [
          { key: 'accounts_opened', count: 0, attribution: 'direct' },
          { key: 'needs_from_signal', count: 2, attribution: 'direct' },
          { key: 'submissions_from_matching', count: 6, attribution: 'direct' },
          { key: 'missions_signed', count: 1, attribution: 'partial' },
        ],
      }),
    })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toContain('0 compte ouvert via Découvrir')
    expect(container.textContent).not.toContain('non mesuré')
  })

  it('les comptes d’origine inconnue non lus le DISENT au lieu de disparaître', () => {
    // `> 0` masquait `null` comme il masquait `0` : le bloc existe pour ne rien
    // absorber, et se taire absorbe.
    useQuery.mockReturnValue({ data: contribution({ unattributedAccounts: null }) })
    const { container } = render(<ContributionPanel />)

    expect(container.textContent).toContain('non mesuré')
    expect(container.textContent).toContain('comptes plus anciens')
    expect(screen.queryByRole('link', { name: /comptes plus anciens/ })).toBeNull()
  })
})
