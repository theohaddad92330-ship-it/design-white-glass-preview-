import { Logger } from '@nestjs/common'
import { AccountAccessService } from './account-access.service'

/**
 * LE RÉSUMÉ D'ACCESSIBILITÉ DU PORTEFEUILLE — manque B du 30/08.
 *
 * `raw_analysis.access_barrier` existe déjà sur chaque compte analysé (posé à
 * chaque analyse par `phase1_research.py`, lu par `landscape()` ci-dessus
 * depuis le 29/08) — mais RIEN ne le fait remonter à la LISTE des comptes :
 * zéro occurrence de `access_barrier` / `accessBarrier` dans
 * `apps/web/src/features/accounts/view/accounts-list/`, aucun filtre de
 * classe dans `AccountsToolbar.tsx`.
 *
 * L'endpoint de LISTE lui-même (`GET /accounts`, `accounts.service.ts` /
 * `accountListItemSchema`) est HORS PÉRIMÈTRE de cette tâche — un autre agent
 * y travaille. Cette méthode sert donc la MÊME donnée par un second chemin,
 * entièrement dans ce module : un résumé PAR COMPTE (`accountId, accessClass`)
 * pour tout le workspace, que le portefeuille fusionne côté client avec la
 * liste déjà chargée.
 *
 * ⚠️ Elle ne RECALCULE rien (GA-26) : la même lecture que `landscape()` —
 * `accessBarrierSchema.safeParse` sur `raw.access_barrier ?? raw.accessBarrier`
 * — appliquée à chaque ligne plutôt qu'à une seule.
 */

type Row = Record<string, unknown>

function buildService(accountRows: { id: string; status: string; raw_analysis: Row | null }[]): AccountAccessService {
  const facts = { find: jest.fn(), query: jest.fn(), save: jest.fn(), create: jest.fn() }
  const accounts = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue(accountRows),
  }
  const entities = { find: jest.fn() }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

/** Même fabrique, mais avec un contrôle direct sur `accounts.find` — pour
 *  simuler un ÉCHEC de lecture plutôt qu'un résultat. */
function buildServiceWithAccountsRepo(accounts: { findOne: jest.Mock; find: jest.Mock }): AccountAccessService {
  const facts = { find: jest.fn(), query: jest.fn(), save: jest.fn(), create: jest.fn() }
  const entities = { find: jest.fn() }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

const MEASURED_BARRIER_A = {
  score: 2.1,
  accessibility: 7.9,
  access_class: 'A',
  label: 'Ouvert probable',
  proxies: [],
  measurable: true,
  missing: [],
  corrections: [],
}
const MEASURED_BARRIER_D = {
  score: 9.4,
  accessibility: 0.6,
  access_class: 'D',
  label: 'Verrouillage probable',
  proxies: [],
  measurable: true,
  missing: [],
  corrections: [],
}

describe('le résumé d’accessibilité du portefeuille — lu, jamais recalculé', () => {
  it('rend une classe par compte, dans le périmètre du workspace demandé', async () => {
    const service = buildService([
      { id: 'acc-1', status: 'completed', raw_analysis: { access_barrier: MEASURED_BARRIER_A } },
      { id: 'acc-2', status: 'completed', raw_analysis: { accessBarrier: MEASURED_BARRIER_D } },
    ])
    const summary = await service.accessSummary('ws-1')

    expect(summary).toEqual([
      { accountId: 'acc-1', accessClass: 'A' },
      { accountId: 'acc-2', accessClass: 'D' },
    ])
  })

  it('rend `null` — jamais une classe devinée — pour un compte sans barrière lisible', async () => {
    const service = buildService([
      { id: 'acc-1', status: 'completed', raw_analysis: {} },
      { id: 'acc-2', status: 'analyzing', raw_analysis: null },
    ])
    const summary = await service.accessSummary('ws-1')

    expect(summary).toEqual([
      { accountId: 'acc-1', accessClass: null },
      { accountId: 'acc-2', accessClass: null },
    ])
  })

  it('exclut les comptes supprimés — un compte effacé ne doit pas se voir depuis le portefeuille', async () => {
    const service = buildService([
      { id: 'acc-1', status: 'completed', raw_analysis: { access_barrier: MEASURED_BARRIER_A } },
      { id: 'acc-2', status: 'deleted', raw_analysis: { access_barrier: MEASURED_BARRIER_A } },
    ])
    const summary = await service.accessSummary('ws-1')

    expect(summary.map(s => s.accountId)).toEqual(['acc-1'])
  })

  /**
   * N18 — `GET /accounts/access-summary` répondait 500 en production, ET
   * l'écran affichait « – » pour chaque compte : EXACTEMENT ce qu'il affiche
   * quand la fonctionnalité marche sur un espace sans donnée. « cassé et non
   * mesurable se ressemblent ».
   *
   * L'hypothèse initiale — un `select` en forme d'objet sur `raw_analysis`
   * (jsonb) produirait du SQL invalide côté TypeORM — a été VÉRIFIÉE et
   * INFIRMÉE contre une vraie base migrée (`access-summary.db.spec.ts`) : la
   * requête s'exécute sans erreur, avec les 278 migrations réelles du dépôt.
   *
   * La cause réelle n'a pas pu être reproduite (aucune donnée de production
   * disponible ici). Ce qui EST certain, et corrigé ici : la méthode ne
   * journalisait RIEN avant de jeter — un `500` sur cette route ne laissait
   * aucune trace exploitable, ce qui est précisément ce qui a empêché de
   * diagnostiquer le défaut en production. Ces deux tests tiennent la
   * correction : la lecture échouée est journalisée puis PROPAGÉE (jamais
   * ravalée en tableau vide, qui se confondrait avec « pas de barrière » —
   * la doctrine que ce chantier lui-même vient de raviver), et une ligne
   * dont la barrière est illisible ne fait pas tomber tout le portefeuille.
   */
  it('un échec de LECTURE est journalisé puis propagé — jamais un tableau vide qui se confondrait avec « pas de barrière »', async () => {
    const dbError = new Error('connexion perdue')
    const accounts = { findOne: jest.fn(), find: jest.fn().mockRejectedValue(dbError) }
    const service = buildServiceWithAccountsRepo(accounts)
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    await expect(service.accessSummary('ws-1')).rejects.toBe(dbError)

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('accessSummary'),
      expect.objectContaining({ error: dbError, tags: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    )
    errorSpy.mockRestore()
  })

  it('une barrière illisible sur UN compte est journalisée et rend `null` pour cette ligne — les autres restent lisibles', async () => {
    // Une propriété qui JETTE à la lecture : la façon la plus fidèle de
    // simuler une forme de donnée si inattendue qu'elle échappe à tous les
    // replis défensifs (`??`, `safeParse`) déjà en place dans le mapping.
    const corrupted: Row = {}
    Object.defineProperty(corrupted, 'access_barrier', {
      enumerable: true,
      get() {
        throw new Error('forme de donnée corrompue')
      },
    })
    const service = buildService([
      { id: 'acc-corrompu', status: 'completed', raw_analysis: corrupted },
      { id: 'acc-ok', status: 'completed', raw_analysis: { access_barrier: MEASURED_BARRIER_A } },
    ])
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const summary = await service.accessSummary('ws-1')

    expect(summary).toEqual([
      { accountId: 'acc-corrompu', accessClass: null },
      { accountId: 'acc-ok', accessClass: 'A' },
    ])
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('accessSummary'),
      expect.objectContaining({
        tags: expect.objectContaining({ workspaceId: 'ws-1', accountId: 'acc-corrompu' }),
      }),
    )
    errorSpy.mockRestore()
  })
})
