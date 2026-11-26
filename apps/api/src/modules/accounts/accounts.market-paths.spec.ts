import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { MarketCompanyLookup, MarketMemoryService, MarketPathsRead } from '../market-memory/market-memory.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ListAccountsDto } from './dto/list-accounts.dto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1577 — « 41 parcours observés » sous le nom du compte.
 *
 * Ce que cette suite garde n'est pas le fragment (il vit à l'écran) mais la
 * DISTINCTION QUI LE COMMANDE, et qui est la seule chose que le serveur peut
 * tenir : « je n'ai pas pu lire la mémoire » et « ce compte n'est pas couvert »
 * sont deux phrases différentes, et une seule des deux autorise l'écran à se
 * taire tranquillement.
 *
 * Confondre les deux produit le défaut le plus cher de cette famille : une
 * mémoire marché en panne se lirait « aucun de tes comptes n'est couvert »,
 * c'est-à-dire une bonne nouvelle fausse — exactement le motif que GA-179 a
 * corrigé sur la colonne Accessibilité, et que #1575 rappelle en demandant de
 * lire `isError` plutôt qu'un tableau vide.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }

type Ligne = { id: string; company_name: string; website?: string | null }

function build(rows: Ligne[], read: MarketPathsRead | 'absent') {
  // ⚠️ La signature est DÉCLARÉE, et ce n'est pas de la décoration : sans elle,
  // `jest.fn(async () => …)` type `mock.calls` en `[][]`, donc `calls[0][0]`
  // devient « Tuple type '[]' of length '0' has no element at index '0' » — un
  // rouge que le typecheck des TESTS de l'API est seul à voir.
  const pathsFor = jest.fn(async (_lookups: readonly MarketCompanyLookup[]) => read as MarketPathsRead)

  const accountsService = {
    findAccountsByWorkspace: jest.fn().mockResolvedValue({
      data: rows,
      pagination: { currentPage: 1, size: 25, totalItems: rows.length, totalPages: 1, hasNext: false, hasPrev: false },
    }),
  } as unknown as AccountsService

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    portfolioVisibilityOf: jest.fn().mockResolvedValue('shared'),
  } as unknown as WorkspaceContextService

  const marketMemory = (read === 'absent' ? undefined : ({ pathsFor } as unknown as MarketMemoryService)) as
    MarketMemoryService | undefined

  // ⚠️ Construction POSITIONNELLE, comme les autres suites de ce contrôleur :
  // `marketMemory` est le 13e et DERNIER paramètre. C'est précisément pourquoi
  // il a été ajouté à la fin — inséré au milieu, il décalerait la vingtaine de
  // specs qui construisent ce contrôleur à la main.
  const controller = new AccountsController(
    accountsService,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext,
    {} as never, // needPlay
    {} as never, // analytics
    {} as never, // esnProfile
    {} as never, // stockSnapshots
    {} as never, // firstEuro
    marketMemory,
    undefined, // accountMissions
    undefined, // intelligence
    // Le cloisonnement de périmètre (#2005.9). `@Optional()` au constructeur,
    // jamais optionnel pour la RÈGLE : absent, le contrôleur LÈVE au lieu de
    // servir tout l'espace. Ici, « pas de cloisonnement » se dit `null`.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, pathsFor }
}

const QUERY = {} as ListAccountsDto

async function lignesDe(rows: Ligne[], read: MarketPathsRead | 'absent') {
  const { controller, pathsFor } = build(rows, read)
  const page = (await controller.findAll(USER, QUERY)) as { data: Record<string, unknown>[] }
  return { data: page.data, pathsFor }
}

describe('#1577 — les parcours observés voyagent avec la ligne de compte', () => {
  const THALES: Ligne = { id: 'acc-1', company_name: 'Thales', website: 'https://thalesgroup.com' }
  const INCONNU: Ligne = { id: 'acc-2', company_name: 'Entreprise Sans Corpus', website: null }

  it('pose le NOMBRE sur un compte couvert', async () => {
    const { data } = await lignesDe([THALES], {
      status: 'ok',
      paths: new Map([['acc-1', 41]]),
    })
    expect(data[0]?.['market_paths_observed']).toBe(41)
  })

  it('pose `null` — et pas 0 — sur un compte que la mémoire NE COUVRE PAS', async () => {
    // Le seuil vit dans le service : sous `MARKET_MEMORY_MIN_PATHS`, il rend
    // déjà `null`. Le contrôleur ne le rejoue pas — une dérivation vit à un
    // seul endroit — il se contente de ne pas transformer ce `null` en `0`.
    const { data } = await lignesDe([INCONNU], {
      status: 'ok',
      paths: new Map([['acc-2', null]]),
    })
    expect(data[0]?.['market_paths_observed']).toBeNull()
    expect(data[0]?.['market_paths_observed']).not.toBe(0)
  })

  it('pose `null` sur un compte que la lecture n’a pas mentionné du tout', async () => {
    // Une carte incomplète ne doit pas rendre `undefined` sur certaines lignes
    // et un nombre sur d'autres : à l'intérieur d'une lecture RÉUSSIE, l'absence
    // d'une référence est un « non couvert », pas une panne.
    const { data } = await lignesDe([THALES, INCONNU], {
      status: 'ok',
      paths: new Map([['acc-1', 41]]),
    })
    expect(data[0]?.['market_paths_observed']).toBe(41)
    expect(data[1]?.['market_paths_observed']).toBeNull()
  })

  it('N’ÉCRIT RIEN quand la mémoire est INDISPONIBLE — une panne n’est pas une absence de couverture', async () => {
    // LE test de cette suite. Un `null` ici ferait dire à l'écran « aucun de tes
    // comptes n'est couvert » pendant une panne : une bonne nouvelle fausse.
    const { data } = await lignesDe([THALES, INCONNU], { status: 'unavailable', reason: 'read_failed' })
    expect(data[0]).not.toHaveProperty('market_paths_observed')
    expect(data[1]).not.toHaveProperty('market_paths_observed')
  })

  it('n’écrit rien non plus quand le module de mémoire n’est pas branché', async () => {
    // `@Optional()` : le module accounts reste autonome (règle #7 du dépôt).
    const { data } = await lignesDe([THALES], 'absent')
    expect(data[0]).not.toHaveProperty('market_paths_observed')
  })

  it('ne lit la mémoire QU’UNE FOIS pour toute la page — jamais un appel par ligne', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `acc-${i}`,
      company_name: `Société ${i}`,
      website: null,
    }))
    const { pathsFor } = await lignesDe(rows, { status: 'ok', paths: new Map() })
    expect(pathsFor).toHaveBeenCalledTimes(1)
    expect(pathsFor.mock.calls[0]?.[0]).toHaveLength(25)
  })

  it('ne lit RIEN sur une page vide — une requête pour zéro ligne est une requête de trop', async () => {
    const { pathsFor } = await lignesDe([], { status: 'ok', paths: new Map() })
    expect(pathsFor).not.toHaveBeenCalled()
  })

  it('passe le nom ET le site — les deux chemins d’appariement du corpus', async () => {
    // Le service apparie par domaine racine ET par clé de nom. Ne lui passer
    // que le nom diviserait silencieusement le taux de couverture.
    const { pathsFor } = await lignesDe([THALES], { status: 'ok', paths: new Map() })
    expect(pathsFor.mock.calls[0]?.[0]).toEqual([{ ref: 'acc-1', name: 'Thales', website: 'https://thalesgroup.com' }])
  })
})

/**
 * « ET EN DÉMONSTRATION, LE FRAGMENT MONTRE QUOI ? » — craft rule n°9.
 *
 * La réponse n'est PAS une entrée dans `demo-coverage.ts`, et c'est délibéré :
 * ce registre est indexé par TABLE PURGEABLE, et les tables de mémoire marché
 * n'y sont pas — elles sont PARTAGÉES entre espaces (GA-16), donc une remise à
 * zéro de la salle de démonstration ne doit surtout pas les vider.
 *
 * La réponse est ailleurs, et elle est meilleure : **la salle de démonstration
 * porte de VRAIS noms d'entreprises**. Le fragment s'y allume donc tout seul,
 * avec de la vraie donnée observée, pour les comptes que le corpus couvre.
 *
 * ⚠️ ET SURTOUT : semer la mémoire marché pour la démonstration serait un
 * DÉFAUT, pas un oubli. Ces tables sont lues par les espaces RÉELS — y écrire
 * des parcours fictifs ferait apparaître des observations inventées dans le
 * portefeuille de clients qui paient. « Jamais de donnée fictive » et le
 * cloisonnement disent la même chose ici.
 *
 * Corpus vide en production ⇒ aucun fragment nulle part, démonstration comprise.
 * C'est la vérité de l'état d'ingestion, pas un écran vide à réparer.
 */
describe('#1577 — la démonstration est nourrie par le corpus RÉEL, jamais semée', () => {
  const dataset = readFileSync(join(__dirname, '../demo/demo-dataset.ts'), 'utf8')

  it('lit un corpus non vide — sinon la garde ne prouve rien', () => {
    expect(dataset.length).toBeGreaterThan(1000)
  })

  it('la salle porte de VRAIS noms, que la mémoire marché peut couvrir', () => {
    // Si ces noms devenaient fictifs, le fragment ne s'allumerait plus jamais en
    // démonstration — et personne ne le verrait avant une réunion.
    // Les six comptes cibles de la salle (01/10/2026) : trois dossiers écrits à
    // la main (`company_name`) et trois semés depuis un brief (`company:`).
    for (const nom of ['Société Générale', 'SNCF']) {
      expect(dataset).toContain(`company_name: '${nom}'`)
    }
    for (const nom of ['ENGIE', 'TotalEnergies', 'Alstom']) {
      expect(dataset).toContain(`company: '${nom}'`)
    }
  })

  it('AUCUN semis n’écrit dans les tables PARTAGÉES de la mémoire marché', () => {
    // La garde qui compte : elle dit NON le jour où quelqu'un « remplit la
    // démo » en injectant des parcours inventés dans une table que les espaces
    // réels lisent.
    for (const table of ['market_company_signal', 'market_esn_client', 'market_ex_esn_at_client']) {
      expect(dataset).not.toContain(table)
    }
  })
})
