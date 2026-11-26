import type React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fetchPartnerRelations = vi.fn()
const fetchEsnOnMyAccounts = vi.fn()
const setPartnerStage = vi.fn()
const setPartnerNonSolicitation = vi.fn()
const createPartnerRelation = vi.fn()

vi.mock('../api/partner-pipeline-api', () => ({
  PARTNER_PIPELINE_KEY: ['partners', 'pipeline'],
  PARTNER_ON_ACCOUNTS_KEY: ['partners', 'on-my-accounts'],
  fetchPartnerRelations: () => fetchPartnerRelations(),
  fetchEsnOnMyAccounts: () => fetchEsnOnMyAccounts(),
  setPartnerStage: (id: string, stage: string) => setPartnerStage(id, stage),
  setPartnerNonSolicitation: (id: string, value: boolean | null) => setPartnerNonSolicitation(id, value),
  createPartnerRelation: (input: unknown) => createPartnerRelation(input),
}))

/** Un mock qui GARDE `search` — sinon rien ne prouve que le nom de l'ESN
 *  voyage réellement jusqu'à l'écran d'analyse, et pas seulement `to`. */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    search?: Record<string, string>
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to} {...rest}>
      {children}
    </a>
  ),
}))

const { PartnerPipeline } = await import('./PartnerPipeline')

/** Rend l'écran, bascule sur l'onglet « Sur mes comptes », et attend la
 *  liste — `renderWithRouter` ailleurs dans ce dépôt rend ASYNCHRONE, la même
 *  prudence s'applique ici : jamais d'assertion synchrone sur le premier rendu. */
async function look(
  rows: {
    name: string
    accounts: number
    rank1: number
    certainty?: 'forte' | 'moyenne' | 'faible' | null
    accountsList?: { id: string; name: string }[]
    observedAtAccounts?: number
    unresolvedAtAccounts?: number
    rank2Observations?: { measured: false } | { measured: true; count: number; mostRecentAt: string; kinds: string[] }
  }[],
) {
  fetchPartnerRelations.mockResolvedValue([])
  fetchEsnOnMyAccounts.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PartnerPipeline />
    </QueryClientProvider>,
  )
  await userEvent.click(await screen.findByRole('tab', { name: 'Sur mes comptes' }))
}

describe('#1799.2 — « pouvoir cliquer, interagir avec les ESN » (onglet Sur mes comptes)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chaque ligne est un VRAI bouton, atteignable au clavier', async () => {
    await look([{ name: 'Capgemini', accounts: 2, rank1: 1 }])

    // Ce qui se clique se tabule (GA-35) : un `<div onClick>` n'a ni
    // tabulation ni Entrée ni annonce.
    const bouton = await screen.findByRole('button', { name: /Capgemini/i })
    expect(bouton.tagName).toBe('BUTTON')
    expect(bouton).toHaveAttribute('type', 'button')
  })

  it('le clic ouvre la MÊME modale que l’onglet Partenaires d’un compte (#1818.1), et elle porte le lien d’analyse', async () => {
    await look([{ name: 'Capgemini', accounts: 2, rank1: 1 }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Capgemini/i }))

    // La modale NOMME l'ESN (le titre de `BrowsableDialog`).
    expect(await screen.findByRole('heading', { name: 'Capgemini' })).toBeInTheDocument()

    // Un rôle « link » n'existe QUE sur un vrai `<a href>` : ni un `<div
    // onClick>` (GA-35) ni un texte statique ne le produisent.
    const link = await screen.findByRole('link', { name: /Analyser Capgemini/i })
    // La ligne ne mène pas nulle part : elle porte le nom de CETTE ESN
    // jusqu'à l'écran d'analyse déjà existant (#1429) — aucun écran neuf.
    expect(link.getAttribute('href')).toContain('/search')
    expect(link.getAttribute('href')).toContain(encodeURIComponent('Capgemini'))
  })

  it('deux ESN distinctes ouvrent chacune LEUR détail, avec LEUR propre lien', async () => {
    await look([
      { name: 'Capgemini', accounts: 2, rank1: 1 },
      { name: 'Devoteam', accounts: 1, rank1: 0 },
    ])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Devoteam/i }))
    expect(await screen.findByRole('heading', { name: 'Devoteam' })).toBeInTheDocument()
    expect((await screen.findByRole('link', { name: /Analyser Devoteam/i })).getAttribute('href')).toContain(
      encodeURIComponent('Devoteam'),
    )
  })
})

/**
 * #1799 (résidu) — LA MODALE TRANSVERSE PARCOURT LA LISTE DE CET ONGLET, PAS
 * LES COMPTES D'UNE ESN.
 *
 * Le piège de contexte nommé dans le lot : la modale du dossier de compte
 * parcourt « 3 sur 6 » = les ESN de CE compte. Ici, la liste est déjà
 * transverse (une ligne par ESN, tous comptes confondus) — donc « suivante »
 * veut dire « l'ESN suivante de CETTE liste », et rien d'autre.
 */
describe('#1799 — la modale transverse « Sur mes comptes » parcourt SA liste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche le rang dans la liste courante, et passe à l’ESN suivante sans fermer', async () => {
    await look([
      { name: 'Capgemini', accounts: 2, rank1: 1 },
      { name: 'Devoteam', accounts: 1, rank1: 0 },
    ])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Capgemini/i }))
    expect(await screen.findByText('1 sur 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ESN suivante' }))
    expect(await screen.findByRole('heading', { name: 'Devoteam' })).toBeInTheDocument()
    expect(screen.getByText('2 sur 2')).toBeInTheDocument()
  })

  it('ne boucle pas : la flèche est désactivée au bout de la liste', async () => {
    await look([
      { name: 'Capgemini', accounts: 2, rank1: 1 },
      { name: 'Devoteam', accounts: 1, rank1: 0 },
    ])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Capgemini/i }))
    expect(await screen.findByRole('button', { name: 'ESN précédente' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'ESN suivante' }))
    await screen.findByRole('heading', { name: 'Devoteam' })
    expect(screen.getByRole('button', { name: 'ESN suivante' })).toBeDisabled()
  })
})

// #2151.62 — l'annuaire nomme les comptes, pas seulement leur nombre : un
// seul chemin de lecture (GA-26) avec la fiche compte.
describe('#2151.62 — la modale nomme les comptes où l’ESN a été vue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche chaque compte comme un lien vers sa fiche', async () => {
    await look([
      {
        name: 'Capgemini',
        accounts: 2,
        rank1: 1,
        accountsList: [
          { id: 'acc-orange', name: 'Orange' },
          { id: 'acc-sncf', name: 'SNCF' },
        ],
      },
    ])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Capgemini/i }))

    const orangeLink = await screen.findByRole('link', { name: 'Orange' })
    expect(orangeLink).toHaveAttribute('href', '/accounts/$id')
    expect(await screen.findByRole('link', { name: 'SNCF' })).toBeInTheDocument()
  })

  it('ne montre rien de tel quand la réponse ne porte pas encore la liste (fenêtre de déploiement)', async () => {
    await look([{ name: 'Capgemini', accounts: 2, rank1: 1 }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Capgemini/i }))

    expect(screen.queryByText('Comptes où elle est en place')).not.toBeInTheDocument()
  })
})

describe('#1799.1 côté écran — une ESN une fois dans la liste rendue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('n’affiche qu’UNE carte par ESN que l’API rend déjà fusionnée', async () => {
    // La déduplication est prouvée côté service (`esn-on-accounts-merge.spec.ts`
    // et `partner-pipeline.spec.ts`) ; ce test-ci prouve que l'écran ne
    // réintroduit pas de doublon de son côté (ex. une clé de rendu qui
    // dupliquerait la carte).
    await look([{ name: 'Capgemini', accounts: 3, rank1: 1 }])
    expect(await screen.findAllByText('Capgemini')).toHaveLength(1)
  })
})

describe('une absence n’est jamais rendue comme un « non »', () => {
  beforeEach(() => vi.clearAllMocks())

  it('une ESN jamais vue en rang 1 ne porte AUCUNE pastille rang 1 — pas de "0 en rang 1" SUR SA LIGNE', async () => {
    // ⚠️ GA-19 : une valeur non mesurée ne s'affiche jamais « 0 ». Ici,
    // `rank1: 0` est un DÉCOMPTE réel (aucune ligne `account_partners` de
    // cette ESN ne porte `rank = 'rank1'`), donc la phrase-résumé au-dessus
    // de la liste a le droit de dire « 0 en rang 1 » — c'est un total mesuré,
    // pas une absence déguisée. Ce que la garde vise est plus précis : LA
    // LIGNE de cette ESN, elle, ne doit porter AUCUNE pastille rang 1 — la
    // pastille n'existe QUE quand il y a quelque chose à montrer (voir
    // `{esn.rank1 > 0 && <Badge>}` dans `PartnerPipeline.tsx`).
    await look([{ name: 'Devoteam', accounts: 1, rank1: 0 }])
    const name = await screen.findByText('Devoteam')
    const card = name.closest('tr') as HTMLElement
    expect(within(card).queryByText(/rang 1/i)).not.toBeInTheDocument()
  })

  it('une ESN vue en rang 1 sur une partie de ses comptes le dit, sans jamais dire « pas sur les autres »', async () => {
    await look([{ name: 'Capgemini', accounts: 3, rank1: 1 }])
    expect(await screen.findByText(/rang 1 sur 1/)).toBeInTheDocument()
    // Le complément (2 comptes sans rang 1 connu) n'est affirmé nulle part :
    // ni « 2 non en rang 1 », ni un pourcentage qui le sous-entendrait.
    expect(screen.queryByText(/non.*rang 1/i)).not.toBeInTheDocument()
  })
})

describe('#1799 — la certitude voyage à part, jamais dans le nom', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche la certitude de la ligne quand l’API la rend', async () => {
    await look([{ name: 'Capgemini', accounts: 2, rank1: 1, certainty: 'forte' }])
    const name = await screen.findByText('Capgemini')
    const card = name.closest('tr') as HTMLElement
    expect(within(card).getByText('indices solides')).toBeInTheDocument()
  })

  it('fenêtre de déploiement — `certainty` absent du payload ne casse pas l’écran, et ne montre aucune pastille', async () => {
    // Le champ est ADDITIF (voir `EsnOnAccountsRow`) : une API pas encore
    // redéployée ne le rend pas du tout, pas même `null`.
    await look([{ name: 'Devoteam', accounts: 1, rank1: 0 }])
    const name = await screen.findByText('Devoteam')
    expect(name).toBeInTheDocument()
    const card = name.closest('tr') as HTMLElement
    expect(within(card).queryByText(/certitude/i)).not.toBeInTheDocument()
    expect(within(card).queryByText(/à vérifier/i)).not.toBeInTheDocument()
  })

  it('`certainty: null` (aucune ligne du groupe ne la porte) n’affiche aucune pastille — jamais devinée', async () => {
    await look([{ name: 'Devoteam', accounts: 1, rank1: 0, certainty: null }])
    const name = await screen.findByText('Devoteam')
    const card = name.closest('tr') as HTMLElement
    expect(within(card).queryByText(/certitude/i)).not.toBeInTheDocument()
  })
})

/**
 * #2298.8 — TROIS NOTIONS VOISINES, TROIS LECTEURS DISTINCTS DANS LA MODALE.
 *
 * `observedAtAccounts`/`unresolvedAtAccounts` (mémoire marché — main-d'œuvre
 * externe OBSERVÉE) et `rank2Observations` (CRM de l'espace — déjà vue en
 * rang 2) étaient FETCHÉS depuis #2151.32/#1799 sans jamais être rendus :
 * calculés, testés côté service, invisibles à l'écran. Ce bloc les branche.
 */
describe('#2298.8 — main-d’œuvre externe observée et rang 2 déjà vu, dans la modale', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche « observée par la mémoire marché » quand `observedAtAccounts` est mesuré', async () => {
    await look([{ name: 'Halden Numérique', accounts: 1, rank1: 0, observedAtAccounts: 2 }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Halden Numérique/i }))

    expect(await screen.findByText(/observée sur le marché sur 2 comptes/i)).toBeInTheDocument()
  })

  it('ne montre rien de tel quand `observedAtAccounts` est absent (fenêtre de déploiement) ou à 0', async () => {
    await look([{ name: 'Halden Numérique', accounts: 1, rank1: 0 }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Halden Numérique/i }))

    expect(screen.queryByText(/observée sur le marché/i)).not.toBeInTheDocument()
  })

  it('nomme les comptes NON MESURABLES par la mémoire marché — jamais confondus avec « non observée » (GA-259)', async () => {
    await look([{ name: 'Halden Numérique', accounts: 1, rank1: 0, unresolvedAtAccounts: 1 }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Halden Numérique/i }))

    expect(await screen.findByText(/1 compte non mesurable/i)).toBeInTheDocument()
  })

  it('affiche « déjà vue en rang 2 » avec la date de la dernière observation', async () => {
    await look([
      {
        name: 'Halden Numérique',
        accounts: 1,
        rank1: 0,
        rank2Observations: {
          measured: true,
          count: 3,
          mostRecentAt: '2026-08-08T00:00:00.000Z',
          kinds: ['already_subcontracted'],
        },
      },
    ])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Halden Numérique/i }))

    expect(await screen.findByText(/rang 2.*3/i)).toBeInTheDocument()
  })

  it('`rank2Observations: { measured: false }` (ou absent) n’affiche rien — une absence ne fait aucune ligne', async () => {
    await look([{ name: 'Devoteam', accounts: 1, rank1: 0, rank2Observations: { measured: false } }])
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Devoteam/i }))

    // ⚠️ Scopé au DIALOGUE : le texte d'aide de la LISTE (hors modale)
    // mentionne déjà « rang 2 » (« … une porte pour entrer en rang 2. »),
    // et le confondre avec la modale ferait passer ce test à tort.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/rang 2/i)).not.toBeInTheDocument()
  })
})
