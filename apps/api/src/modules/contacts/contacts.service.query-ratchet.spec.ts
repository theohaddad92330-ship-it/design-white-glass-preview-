/**
 * GA-313 — le compte de requêtes de `sendEmailBulk` ne dérive pas.
 *
 * Chemin chaud n°1 (des 2 à 4 demandés) : `ContactsService.sendEmailBulk`,
 * le cas franc nommé par le lot — un `findOne` par identifiant, borné à
 * `BULK_SEND_MAX` (50). Le compte de requêtes est un meilleur budget que la
 * durée ici : à 3 contacts la boucle et le batch se ressemblent ; à 30 la
 * boucle coûte 30 allers-retours et le batch continue d'en coûter 1.
 *
 * Ce que ce fichier fige, PAR OPÉRATION plutôt que sur le total — le total
 * grossit de toute façon avec N (chaque envoi RÉUSSI écrit sa propre ligne
 * `contacts.save` + `user_actions.save`, ce qui est du travail réel, pas un
 * défaut) :
 *   - `findOne` sur `ContactEntity`  → **0**, quel que soit N (avant le
 *     correctif de ce lot : exactement N — un appel par identifiant) ;
 *   - `find` sur `ContactEntity`     → **1**, quel que soit N (un seul
 *     SELECT avec `id IN (...)`, batché pour toute la sélection) ;
 *   - `save` sur `ContactEntity`     → N (un par envoi réussi — écrit
 *     `email_sent_at` sur CETTE ligne, irréductible) ;
 *   - `save` sur `UserActionEntity`  → N (une ligne de journal par envoi
 *     réussi — irréductible, ce n'est pas la même ligne qui se répète).
 *
 * C'est la paire (`findOne` figé à 0, `find` figé à 1) — testée à N=3 PUIS
 * N=30 — qui distingue le coût FIXE (le lookup, corrigé) du coût qui SUIT la
 * taille de la liste (les écritures, intrinsèques et non touchées ici).
 *
 * `sait dire NON` : avant le correctif de ce lot, ce fichier échouait
 * (`findOne` valait N, `find` valait 0) — sortie rouge collée dans le
 * rapport. Remettre `sendEmailBulk` à sa version `findOne`-par-id (git
 * diff inversé) refait échouer `findOne === 0` immédiatement.
 */
import { In, IsNull } from 'typeorm'
import { isSuccess } from '@bellum/utils'
import { resolveBrand } from '@bellum/contracts'
import { ContactsService } from './contacts.service'
import { ContactEntity } from '../../database/entities/contact.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { countQueries, QueryCounter } from '../../database/query-counter'
import type { CreditsService } from '../credits/credits.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/** Un contact prêt à envoyer — brouillon déjà rédigé, jamais encore envoyé. */
const draftedRow = (id: string): ContactEntity =>
  ({
    id,
    user_id: 'user-1',
    account_id: 'acc-1',
    full_name: `Contact ${id}`,
    email: `${id}@corp.fr`,
    email_message: { subject: 'Bonjour', body: 'Corps.' },
    email_sent_at: null,
  }) as ContactEntity

describe('ContactsService.sendEmailBulk — cliquet de compte de requêtes (GA-313)', () => {
  let service: ContactsService
  let repo: MockRepository<ContactEntity>
  let userActions: MockRepository<UserActionEntity>
  let counter: QueryCounter

  const build = () => {
    repo = createMockRepository<ContactEntity>()
    userActions = createMockRepository<UserActionEntity>()
    counter = new QueryCounter()
    const countedContacts = countQueries(repo, counter, 'ContactEntity')
    const countedUserActions = countQueries(userActions, counter, 'UserActionEntity')

    const merges = createMockRepository()
    merges.findOne.mockResolvedValue(null)
    const accounts = createMockRepository()
    const transitions = createMockRepository()
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    const mailer = {
      sendOutreachEmail: jest.fn().mockResolvedValue({ providerId: undefined }),
      resolveSenderAddress: jest.fn().mockReturnValue('noreply@bellum.test'),
    }
    const suppression = { isSuppressed: jest.fn().mockResolvedValue(false) }
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const cadence = { scheduleForContact: jest.fn().mockResolvedValue(undefined) }
    const dropcontact = { isEnabled: jest.fn().mockReturnValue(false), enrich: jest.fn() }
    const provenance = {
      currentSources: jest.fn().mockResolvedValue({}),
      commit: jest.fn().mockResolvedValue(undefined),
    }
    const sprintBus = { emit: jest.fn().mockResolvedValue(undefined) }
    const credits = { hasEnrichmentCredit: jest.fn(), consumeEnrichmentCredit: jest.fn(), getCredits: jest.fn() }

    service = new ContactsService(
      countedContacts as never,
      countedUserActions as never,
      { enrichContact: jest.fn() } as unknown as IaClient,
      credits as unknown as CreditsService,
      workspace as unknown as WorkspaceContextService,
      mailer as never,
      suppression as never,
      config as never,
      cadence as never,
      accounts as never,
      transitions as never,
      dropcontact as never,
      { isEnabled: () => false } as never,
      merges as never,
      brandsStub as never,
      undefined,
      undefined,
      provenance as never,
      sprintBus as never,
    )
  }

  /** Fait apparaître N contacts trouvables, envoi réussi pour chacun. */
  const seedFindableContacts = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `c${i}`)
    const rows = ids.map(draftedRow)
    repo.find.mockResolvedValueOnce(rows)
    repo.save.mockImplementation(async (x: ContactEntity) => x)
    userActions.save.mockImplementation(async (x: UserActionEntity) => x)
    return ids
  }

  it.each([3, 30])('à N=%i : findOne=0, find=1, save(Contact)=N, save(UserAction)=N', async n => {
    build()
    const ids = seedFindableContacts(n)

    const result = await service.sendEmailBulk(ids, 'user-1', 'rep@esn.fr')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.sent).toHaveLength(n)

    // Le lookup est FIXE, quel que soit N — c'est le cœur du correctif.
    expect(counter.countByOp('findOne')).toBe(0)
    expect(counter.countByOp('find')).toBe(1)
    // Les écritures SUIVENT N — irréductible, documenté ci-dessus. #3699.3 : la
    // tentative est RÉSERVÉE (1 `update` par contact) avant l'appel au transport,
    // c'est ce qui empêche le double envoi — une écriture de plus par contact,
    // jamais une LECTURE de plus.
    expect(counter.countFor('ContactEntity')).toBe(1 + 2 * n) // 1 find + N réservation + N save
    expect(counter.countFor('UserActionEntity')).toBe(n)
    expect(counter.count).toBe(1 + 3 * n)

    // Preuve que le batch a bien porté TOUS les identifiants demandés, dans
    // une clause `In(...)`, et pas un `findOne` déguisé appelé une fois.
    // #4731 — borné par l'ESPACE (OU la ligne ancienne de l'appelant), toujours en UNE requête.
    expect(repo.find).toHaveBeenCalledWith({
      where: [
        { id: In(ids), workspace_id: 'ws-1', deleted_at: IsNull() },
        { id: In(ids), workspace_id: IsNull(), user_id: 'user-1', deleted_at: IsNull() },
      ],
    })
  })

  it('un identifiant introuvable est rapporté "not_found" sans requête findOne supplémentaire', async () => {
    build()
    repo.find.mockResolvedValueOnce([draftedRow('c1')]) // c2 absent du résultat batché
    repo.save.mockImplementation(async (x: ContactEntity) => x)
    userActions.save.mockImplementation(async (x: UserActionEntity) => x)

    const result = await service.sendEmailBulk(['c1', 'c2'], 'user-1', 'rep@esn.fr')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) {
      expect(result.output.sent).toEqual([{ contact_id: 'c1', sent_to: 'c1@corp.fr' }])
      expect(result.output.skipped).toEqual([{ contact_id: 'c2', reason: 'not_found' }])
    }
    expect(counter.countByOp('findOne')).toBe(0)
    expect(counter.countByOp('find')).toBe(1)
  })
})
