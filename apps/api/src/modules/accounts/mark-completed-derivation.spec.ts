import {
  COMMERCIAL_LIFECYCLE_LABELS,
  deriveCommercialStatusOnComplete,
  type CommercialLifecycle,
} from '@bellum/contracts'
import { AccountsService } from './accounts.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Le pré-classement commercial de fin de run (D53, 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS FIGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `deriveCommercialStatusOnComplete` existait, était juste, était testée — et
 * n'avait AUCUN appelant à l'exécution. Le SQL de `markCompleted` refaisait la
 * même bande de score à la main, à côté. C'est le motif dominant du dépôt, et
 * il a un coût mesurable ici : la coupure a dérivé entre les deux copies sans
 * que personne le voie, précisément parce que rien n'exerçait la fonction.
 *
 * La fonction fait désormais AUTORITÉ : le SQL ne connaît plus ni la coupure ni
 * les deux issues, il reçoit le verdict en paramètre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE EN SQL, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * La GARDE « seulement depuis l'inbox » reste dans l'UPDATE, elle ne remonte
 * pas dans le TypeScript. Une correction humaine gagne toujours : si le
 * commercial déplace le compte entre la lecture du score et l'écriture, c'est
 * SON geste qui doit tenir — et seul un CASE dans l'UPDATE, sous le verrou de
 * ligne, le garantit. Remonter la garde côté application rouvrirait la fenêtre
 * exacte où un tri manuel se fait écraser par un run qui se termine.
 */
describe('AccountsService.markCompleted — la dérivation branchée', () => {
  let repo: MockRepository<AccountEntity>
  let service: AccountsService

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
  })

  /** Le SELECT puis l'UPDATE, dans l'ordre où le service les émet. */
  async function callsFor(priorityScore: number | null): Promise<[string, unknown[]][]> {
    repo.manager.query.mockResolvedValue([{ priority_score: priorityScore }])
    await service.markCompleted('acc-1')
    const calls = repo.manager.query.mock.calls as [string, unknown[]][]
    // La garde LIT quelque chose : sans ces deux requêtes, tout le fichier
    // passerait au vert sur du vide.
    expect(calls).toHaveLength(2)
    return calls
  }

  const updateOf = (calls: [string, unknown[]][]) => calls[1] as [string, unknown[]]

  it('lit le score puis écrit — et le SQL ne porte plus AUCUNE coupure chiffrée', async () => {
    const calls = await callsFor(9)
    const [selectSql] = calls[0] as [string, unknown[]]
    expect(selectSql).toContain('SELECT priority_score')
    const [updateSql] = updateOf(calls)
    expect(updateSql).toContain("status = 'completed'")
    // Le nombre a disparu du SQL : c'est tout l'objet du branchement.
    expect(updateSql).not.toMatch(/priority_score\s*>=/)
    expect(updateSql).not.toMatch(/\d+\.\d+/)
  })

  it('garde la protection du tri manuel DANS l’UPDATE — une correction humaine gagne', async () => {
    const [updateSql] = updateOf(await callsFor(9))
    expect(updateSql).toContain("COALESCE(commercial_status, 'inbox') = 'inbox'")
    expect(updateSql).toContain('ELSE commercial_status')
  })

  it('passe le verdict de la fonction en paramètre, jamais un littéral', async () => {
    const high = deriveCommercialStatusOnComplete('inbox', 10)
    const low = deriveCommercialStatusOnComplete('inbox', 0)
    expect(high).not.toBe(low)

    const [, highParams] = updateOf(await callsFor(10))
    expect(highParams).toEqual(['acc-1', high])

    repo.manager.query.mockClear()
    const [, lowParams] = updateOf(await callsFor(0))
    expect(lowParams).toEqual(['acc-1', low])
  })

  it('traite un score ABSENT comme le faisait le SQL — « non mesuré » n’est pas au-dessus de la coupure', async () => {
    const [, params] = updateOf(await callsFor(null))
    expect(params).toEqual(['acc-1', deriveCommercialStatusOnComplete('inbox', null)])
  })

  it('lit le score DANS la transaction de l’appelant, pas à côté', async () => {
    const query = jest.fn().mockResolvedValue([{ priority_score: 9 }])
    const transactional = { query, getRepository: jest.fn() }
    transactional.getRepository.mockReturnValue({ manager: transactional })

    await service.markCompleted('acc-1', transactional as never)

    // `priority_score` vient d'être écrit par `applyPlan` DANS cette
    // transaction : le lire par le dépôt hors transaction rendrait la valeur
    // d'avant le run, et pré-classerait tous les comptes sur un score périmé.
    expect(query).toHaveBeenCalledTimes(2)
    expect(repo.manager.query).not.toHaveBeenCalled()
  })
})

/**
 * L'ÉQUIVALENCE, prouvée sur toute la matrice — pas sur trois exemples.
 *
 * ⚠️ La coupure n'est pas recopiée ici : elle est MESURÉE sur la fonction. Un
 * littéral dans ce fichier en ferait une seconde copie du réglage, c'est-à-dire
 * exactement le défaut que D53 corrige — et il rendrait ce test rouge le jour
 * où la coupure bouge, pour une raison qui n'a rien à voir avec l'équivalence.
 */
describe('deriveCommercialStatusOnComplete ≡ l’ancien SQL de markCompleted', () => {
  /** La coupure telle que la fonction l'applique, trouvée en la mesurant. */
  const CUT = (() => {
    for (let tenths = 0; tenths <= 100; tenths += 1) {
      if (deriveCommercialStatusOnComplete('inbox', tenths / 10) === 'opportunity') return tenths / 10
    }
    throw new Error('aucune coupure trouvée : la dérivation ne rend jamais « opportunity »')
  })()

  /**
   * Ce que faisait le SQL AVANT le branchement, transcrit clause par clause :
   *
   *   commercial_status = CASE
   *     WHEN COALESCE(commercial_status, 'inbox') = 'inbox'
   *     THEN CASE WHEN priority_score >= <coupure> THEN 'opportunity' ELSE 'watching' END
   *     ELSE commercial_status
   *   END
   *
   * Y compris la logique ternaire de Postgres : `NULL >= x` vaut NULL, donc le
   * CASE intérieur tombe dans son ELSE — un score absent donnait « à suivre »,
   * jamais « opportunité ».
   */
  function legacySql(current: CommercialLifecycle | null, priorityScore: number | null): CommercialLifecycle | null {
    if ((current ?? 'inbox') !== 'inbox') return current
    return priorityScore !== null && priorityScore >= CUT ? 'opportunity' : 'watching'
  }

  const STARTING: (CommercialLifecycle | null)[] = [
    null,
    ...(Object.keys(COMMERCIAL_LIFECYCLE_LABELS) as CommercialLifecycle[]),
  ]

  /** La bande entière au dixième, plus l'absence de score. La colonne est un
   *  `integer`, mais la fonction accepte un `number` : on couvre plus large que
   *  la base pour que la preuve survive à un changement de type. */
  const SCORES: (number | null)[] = [null, ...Array.from({ length: 101 }, (_, index) => index / 10)]

  it('mesure une coupure réelle — la garde ne tourne pas sur une bande vide', () => {
    expect(CUT).toBeGreaterThan(0)
    expect(CUT).toBeLessThanOrEqual(10)
    // La bande SUIT l'enum : la compter à la main faisait rougir cette garde le
    // jour où `opening` et `dormant` sont arrivés — un statut de plus n'est pas
    // un défaut de dérivation. Ce qu'on garde est ce que la garde voulait dire :
    // elle couvre TOUT l'enum, et elle ne rétrécit jamais sous ce qu'elle
    // couvrait le jour où elle a été écrite (cliquet).
    expect(STARTING).toHaveLength(Object.keys(COMMERCIAL_LIFECYCLE_LABELS).length + 1)
    expect(STARTING.length).toBeGreaterThanOrEqual(6)
    expect(SCORES).toHaveLength(102)
  })

  it('rend le MÊME statut que l’ancien SQL, sur chaque score et chaque statut de départ', () => {
    for (const current of STARTING) {
      for (const score of SCORES) {
        // Le NULL de la colonne est absorbé par le COALESCE du SQL, qui reste
        // dans l'UPDATE : la fonction est appelée avec 'inbox' dans ce cas.
        expect(deriveCommercialStatusOnComplete(current ?? 'inbox', score)).toBe(legacySql(current, score))
      }
    }
  })

  it('n’écrase JAMAIS un tri manuel, quel que soit le score', () => {
    for (const current of Object.keys(COMMERCIAL_LIFECYCLE_LABELS) as CommercialLifecycle[]) {
      if (current === 'inbox') continue
      for (const score of SCORES) expect(deriveCommercialStatusOnComplete(current, score)).toBe(current)
    }
  })

  it('classe la bande de façon monotone autour de la coupure — aucun trou, aucun repli', () => {
    for (const score of SCORES) {
      const expected = score !== null && score >= CUT ? 'opportunity' : 'watching'
      expect(deriveCommercialStatusOnComplete('inbox', score)).toBe(expected)
    }
  })
})
