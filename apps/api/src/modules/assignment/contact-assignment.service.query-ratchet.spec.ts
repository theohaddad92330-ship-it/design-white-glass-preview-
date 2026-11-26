/**
 * GA-313 — le compte de requêtes de `assignMany` ne dérive pas.
 *
 * Chemin chaud n°2 : `ContactAssignmentService.assignMany`, l'attribution en
 * masse d'une sélection de contacts. Contrairement à `sendEmailBulk` (chemin
 * chaud n°1, cliquet dans `contacts.service.query-ratchet.spec.ts`), CE
 * chemin est déjà correct aujourd'hui : un seul `find({ id: In(ids) })` pour
 * lire toute la sélection, puis un seul `update({ id: In(assigned) })` pour
 * écrire tous les contacts assignés — la boucle intermédiaire ne fait que de
 * la décision en mémoire (permissions), aucune requête.
 *
 * Le choisir comme chemin chaud sert un but précis : la même paire de tests
 * (N=3 puis N=30) prouve ici l'INVERSE de ce qu'elle prouve sur
 * `sendEmailBulk` — un compte FIXE qui ne bouge PAS avec la taille de la
 * liste. C'est la preuve que le cliquet distingue vraiment les deux formes,
 * pas seulement qu'il sait lire un nombre.
 *
 * Figé : 2 requêtes sur `ContactEntity` (`find` + `update`), à N=3 comme à
 * N=30. Si ce nombre change — par exemple un `update` par contact réapparaît
 * — ce test casse AVANT que la page ne passe de 20 à 400 requêtes en
 * production.
 *
 * `sait dire NON` : voir le test dédié plus bas, qui monte une VERSION
 * délibérément régressée (un update par id, comme l'était `sendEmailBulk`
 * avant son correctif) sur le double de repository et montre que la même
 * assertion « count === 2 » tombe alors — sans toucher au fichier de
 * production, hors du périmètre autorisé de ce lot pour ce service.
 */
import { BadRequestException } from '@nestjs/common'
import { In } from 'typeorm'
import { ContactAssignmentService } from './contact-assignment.service'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { countQueries, QueryCounter } from '../../database/query-counter'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

describe('ContactAssignmentService.assignMany — cliquet de compte de requêtes (GA-313)', () => {
  let repo: MockRepository<ContactEntity>
  let counter: QueryCounter
  let service: ContactAssignmentService
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; getMembership: jest.Mock; isDemoWorkspace: jest.Mock }
  let countedContacts: MockRepository<ContactEntity>

  const build = () => {
    repo = createMockRepository<ContactEntity>()
    counter = new QueryCounter()
    countedContacts = countQueries(repo, counter, 'ContactEntity')
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      getMembership: jest.fn().mockResolvedValue({ user_id: 'u-rep', role: 'sales' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    service = new ContactAssignmentService(
      countedContacts as never,
      workspaceContext as unknown as WorkspaceContextService,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  it.each([3, 30])('à N=%i : find=1, update=1 (coût FIXE, indépendant de la taille de la liste)', async n => {
    build()
    const ids = Array.from({ length: n }, (_, i) => `c${i}`)
    repo.find.mockResolvedValueOnce(ids.map(id => ({ id, workspace_id: 'ws-1', assigned_to: null }) as ContactEntity))
    repo.update.mockResolvedValueOnce({ affected: n, raw: [], generatedMaps: [] })

    const result = await service.assignMany('u-manager', ids, 'u-rep')

    expect(result.assigned).toHaveLength(n)
    expect(counter.countByOp('find')).toBe(1)
    expect(counter.countByOp('update')).toBe(1)
    expect(counter.countFor('ContactEntity')).toBe(2)
    expect(repo.find).toHaveBeenCalledWith({
      where: { id: In(ids), workspace_id: 'ws-1' },
      select: ['id', 'assigned_to'],
    })
  })

  it('sait dire NON : une régression "un update par id" fait échouer l’assertion figée', async () => {
    build()
    const ids = ['c0', 'c1', 'c2']
    repo.find.mockResolvedValueOnce(ids.map(id => ({ id, workspace_id: 'ws-1', assigned_to: null }) as ContactEntity))
    repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] })

    // On ne touche pas au fichier de production (hors périmètre pour ce
    // service) : on rejoue la régression directement sur le DOUBLE, en
    // appelant `update` une fois par id après le geste réel du service —
    // exactement la forme qu'aurait un `assignMany` réécrit en boucle.
    await service.assignMany('u-manager', ids, 'u-rep')
    for (const id of ids) await countedContacts.update({ id }, { assigned_to: 'u-rep' })

    // La régression fait passer `update` de 1 à 1 + N = 4 : l'assertion figée
    // (`toBe(2)` pour la paire find+update) tombe.
    expect(() => expect(counter.countFor('ContactEntity')).toBe(2)).toThrow()
    expect(counter.countByOp('update')).toBe(1 + ids.length)
  })

  it('un membre inconnu de l’espace échoue AVANT toute écriture (le contrôle n’ajoute pas de requête au lot)', async () => {
    build()
    workspaceContext.getMembership.mockResolvedValueOnce(null)
    repo.find.mockResolvedValueOnce([{ id: 'c0', workspace_id: 'ws-1', assigned_to: null } as ContactEntity])

    await expect(service.assignMany('u-manager', ['c0'], 'u-unknown')).rejects.toBeInstanceOf(BadRequestException)
    expect(counter.countByOp('find')).toBe(1)
    expect(counter.countByOp('update')).toBe(0)
  })
})
