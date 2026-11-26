import { createMockRepository } from '../../database/test-utils'
import { ContributionService } from './contribution.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { Repository } from 'typeorm'

/**
 * « Ce que Bellum a contribué » — et ce qu'il ne prétend PAS avoir compté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq comptages rendaient `0` sur exception (`catch → return 0`). Sur
 * l'écran de pilotage — celui-là même qui édicte « un taux sans dénominateur
 * vaut non mesuré, pas 0 % » — « zéro compte ouvert grâce à Découvrir » et « je
 * n'ai pas pu compter » s'affichaient donc à l'identique.
 *
 * La question du dépôt, posée à chaque valeur absente : *si elle manque, « 0 »
 * est-il VRAI ?* Ici non. Un espace qui vient d'ouvrir a réellement zéro compte
 * venu de Découvrir, et cette réponse-là mérite d'être lue ; une requête cassée
 * n'a aucun droit de porter le même chiffre. Le défaut était déjà NOMMÉ ailleurs
 * dans le module (`stock-snapshot.service.ts`) sans avoir jamais été corrigé
 * ici.
 *
 * Trois cas se distinguent, et aucun ne se confond :
 *  - la requête répond `0` → **un zéro mesuré**, on l'affiche ;
 *  - la requête jette → **`null`**, on dit « non mesuré » ;
 *  - la requête ne rend AUCUNE ligne → `null` aussi : `SELECT COUNT(*)` en rend
 *    toujours une, donc son absence est une anomalie, pas un zéro.
 */

type QueryHandler = (sql: string) => unknown[] | Promise<unknown[]>

function buildService(handler: QueryHandler) {
  const repo = createMockRepository<AccountEntity>()
  repo.manager.query.mockImplementation(async (sql: string) => handler(sql))
  const service = new ContributionService(repo as unknown as Repository<AccountEntity>)
  // Le service journalise ses échecs ; on ne veut pas de bruit dans la sortie de
  // la suite, mais on VÉRIFIE plus bas qu'il a bien parlé.
  const logged: string[] = []
  jest.spyOn(service['logger'], 'error').mockImplementation((message: unknown) => {
    logged.push(String(message))
  })
  return { service, logged }
}

/** Ce que rend une lecture saine : une ligne, un entier. */
const ok = (n: number) => [{ n }]

/** La table des lignes, par clé — l'ordre du contrat n'a pas à fuiter ici. */
function countsByKey(lines: { key: string; count: number | null }[]) {
  return Object.fromEntries(lines.map(line => [line.key, line.count]))
}

describe('ContributionService — un comptage impossible n’est pas un comptage à zéro', () => {
  it('rend les cinq comptages quand les cinq lectures aboutissent', async () => {
    const { service } = buildService(sql => {
      if (sql.includes('FROM accounts') && sql.includes("origin = 'discover'")) return ok(4)
      if (sql.includes('FROM opportunities')) return ok(2)
      if (sql.includes('FROM submissions')) return ok(6)
      if (sql.includes('FROM missions')) return ok(1)
      return ok(12)
    })

    const contribution = await service.forWorkspace('w1')

    expect(countsByKey(contribution.lines)).toEqual({
      accounts_opened: 4,
      needs_from_signal: 2,
      submissions_from_matching: 6,
      missions_signed: 1,
    })
    expect(contribution.unattributedAccounts).toBe(12)
  })

  it('un ZÉRO mesuré reste zéro — c’est une réponse, pas une absence', async () => {
    // Le cas qui interdit de rendre `null` par prudence : un espace neuf a
    // vraiment zéro compte venu de Découvrir, et le lui cacher serait le
    // symétrique du défaut qu'on corrige.
    const { service } = buildService(() => ok(0))

    const contribution = await service.forWorkspace('w1')

    for (const line of contribution.lines) expect(line.count).toBe(0)
    expect(contribution.unattributedAccounts).toBe(0)
  })

  it('une lecture qui JETTE rend `null`, jamais `0`', async () => {
    const { service } = buildService(sql => {
      if (sql.includes('FROM opportunities')) throw new Error('relation "opportunities" does not exist')
      return ok(3)
    })

    const contribution = await service.forWorkspace('w1')
    const needs = contribution.lines.find(line => line.key === 'needs_from_signal')

    expect(needs?.count).toBeNull()
    // La formulation compte : c'est `0` qui était affiché, et c'est `0` qui
    // mentait. Un test qui n'assertait que « pas un nombre » passerait au vert
    // le jour où quelqu'un remettrait un repli.
    expect(needs?.count).not.toBe(0)
  })

  it('l’échec d’une ligne n’emporte pas les quatre autres', async () => {
    const { service } = buildService(sql => {
      if (sql.includes('FROM submissions')) throw new Error('timeout')
      return ok(5)
    })

    const contribution = await service.forWorkspace('w1')

    expect(countsByKey(contribution.lines)).toEqual({
      accounts_opened: 5,
      needs_from_signal: 5,
      submissions_from_matching: null,
      missions_signed: 5,
    })
    expect(contribution.unattributedAccounts).toBe(5)
  })

  it('les comptes d’origine inconnue valent `null` quand leur lecture échoue', async () => {
    // Ils sont ANNONCÉS, jamais absorbés. Les afficher à `0` parce que la
    // requête a cassé absorberait l'inconnu dans le silence, ce qui est
    // exactement ce que le contrat refuse.
    const { service } = buildService(sql => {
      if (sql.includes('origin IS NULL')) throw new Error('boom')
      return ok(7)
    })

    const contribution = await service.forWorkspace('w1')

    expect(contribution.unattributedAccounts).toBeNull()
  })

  it('une réponse SANS ligne vaut `null` — `COUNT(*)` en rend toujours une', async () => {
    const { service } = buildService(() => [])

    const contribution = await service.forWorkspace('w1')

    for (const line of contribution.lines) expect(line.count).toBeNull()
    expect(contribution.unattributedAccounts).toBeNull()
  })

  it('l’échec sort en `error` — un `warn` ne remonte pas à la supervision', async () => {
    // Même arbitrage que la vue Qualité : une lecture d'hygiène cassée n'est pas
    // un état dégradé, c'est un BUG. Le transport Sentry ne capture que les
    // `error`, et personne ne va relire les `warn` d'un comptage.
    const { service, logged } = buildService(() => {
      throw new Error('boom')
    })

    await service.forWorkspace('w1')

    expect(logged).toHaveLength(5)
    expect(logged[0]).toContain('Comptage de contribution')
  })
})
