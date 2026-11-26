import { render, screen } from '@testing-library/react'
import type { DataHygiene, HygieneCheck } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * « Données à compléter » sur `/pilotage` (Louis 14/10/2026, refonte Pilotage
 * L0a) — les neuf contrôles de l'ancien onglet « Qualité des données »,
 * redistribués sur le cockpit. Ce qui est gardé ici :
 *
 * 1. on n'affiche pas ce qu'on n'a pas : une ligne à 0 ne fait AUCUNE ligne, et
 *    si tout est à 0 le bloc disparaît ;
 * 2. « non lu » est nommé, jamais 0 ;
 * 3. chaque ligne garde son lien de correction (les doublons mènent à
 *    `/contacts#hygiene-doublons`, plus à `/pilotage/qualite`) ;
 * 4. aucun lien mort, et le bloc est déplié (plus d'accordéon).
 */
let routesByPath: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    hash,
    ...rest
  }: { children: React.ReactNode; to: string; hash?: string } & Record<string, unknown>) => (
    <a href={hash ? `${to}#${hash}` : to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))

const hygiene = vi.fn()
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene } }))

const { DataToComplete } = await import('./DataToComplete')

const LINKS: Record<HygieneCheck, string> = {
  accounts_without_next_action: '/accounts',
  contacts_without_email: '/contacts',
  projects_without_amount: '/projects',
  missions_without_end_date: '/missions',
  needs_without_skills: '/projects/needs',
  talents_unknown_availability: '/consultants?view=reactivation',
  unresolved_duplicates: '/pilotage/qualite',
  missions_without_cost: '/missions/facturation',
  contacts_flagged_incorrect: '/contacts',
}
const ALL_ROUTES: Record<string, unknown> = Object.fromEntries(
  Object.values(LINKS).map(path => [path.split('?')[0], true]),
)

function line(key: HygieneCheck, count: number | null, total: number | null): DataHygiene['lines'][number] {
  return { key, count, total, link: LINKS[key] }
}

function allClear(): DataHygiene {
  return {
    lines: (Object.keys(LINKS) as HygieneCheck[]).map(key => line(key, 0, 10)),
  }
}

const served = (data: DataHygiene) => ({ data, isLoading: false, isError: false })

beforeEach(() => {
  routesByPath = ALL_ROUTES
  useQuery.mockReset()
  hygiene.mockReset()
})

describe('« Données à compléter » sur /pilotage', () => {
  it('lit la MÊME entrée de cache que l’ancien écran — une seule vérité', () => {
    useQuery.mockReturnValue(served(allClear()))
    render(<DataToComplete />)
    const options = useQuery.mock.calls[0]?.[0] as { queryKey: unknown[]; queryFn: unknown }
    expect(options.queryKey).toEqual(['pilotage-hygiene'])
    expect(options.queryFn).toBe(hygiene)
  })

  it('disparaît quand tout est à 0 — une absence ne fait aucune ligne', () => {
    useQuery.mockReturnValue(served(allClear()))
    const { container } = render(<DataToComplete />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche QUE les lignes dont le compte est > 0, déplié, avec leur lien', () => {
    const data = allClear()
    data.lines[0] = line('accounts_without_next_action', 7, 12)
    data.lines[1] = line('contacts_without_email', 3, 400)
    useQuery.mockReturnValue(served(data))
    const { container } = render(<DataToComplete />)
    expect(screen.getByText('Données à compléter')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(container.textContent).toContain('Comptes suivis sans prochaine action')
    expect(container.textContent).toContain('sur 400')
    expect(container.textContent).not.toContain('Missions actives sans date de fin')
    expect(
      screen
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
        .sort(),
    ).toEqual(['/accounts', '/contacts'])
    // Aucun accordéon : rien à déplier.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('un contrôle illisible se NOMME « non lu » — jamais 0', () => {
    const data = allClear()
    data.lines[2] = line('projects_without_amount', null, null)
    useQuery.mockReturnValue(served(data))
    const { container } = render(<DataToComplete />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(container.textContent).toContain('Projets ouverts sans montant')
    expect(container.textContent).toContain('non mesuré')
  })

  it('les doublons mènent à /contacts#hygiene-doublons, plus à /pilotage/qualite', () => {
    const data = allClear()
    data.lines[6] = line('unresolved_duplicates', 2, null)
    useQuery.mockReturnValue(served(data))
    render(<DataToComplete />)
    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'))
    expect(hrefs).toEqual(['/contacts#hygiene-doublons'])
  })

  it('ne rend AUCUN lien vers une destination que ce navigateur ne connaît pas', () => {
    routesByPath = Object.fromEntries(Object.entries(ALL_ROUTES).filter(([path]) => path !== '/missions/facturation'))
    const data = allClear()
    data.lines[7] = line('missions_without_cost', 4, 4)
    useQuery.mockReturnValue(served(data))
    const { container } = render(<DataToComplete />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.textContent).toContain('Missions sans coût chargé')
    expect(container.textContent).toContain("n'existe pas dans cette version")
  })

  it('une lecture en cours ou en échec ne rend rien de faux', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    expect(render(<DataToComplete />).container).toBeEmptyDOMElement()
    useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { container } = render(<DataToComplete />)
    expect(container.textContent).toContain('Lecture impossible')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
