import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NoteEntity } from '../../database/entities/note.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { candidateNoteEntityId, DiscoverCandidateNotesService } from './discover-candidate-notes.service'

/**
 * #2151.59 — une note de terrain sur un candidat de Découvrir : libre, datée,
 * signée, et REPRISE quand le candidat devient un dossier de compte.
 *
 * Un candidat Découvrir n'a pas de ligne en base tant qu'il n'est pas un
 * compte : la table `notes` polymorphe (déjà datée/signée/scopée espace) est
 * réutilisée telle quelle, avec un `entity_id` DÉRIVÉ de façon stable du SIREN
 * + de l'espace — jamais une table neuve, jamais un identifiant aléatoire (la
 * même recherche doit toujours retrouver les mêmes notes).
 */
describe('DiscoverCandidateNotesService', () => {
  const WORKSPACE = 'ws-1'
  const SIREN = '552081317'

  const build = async (manager: { query: jest.Mock }, repoOverrides: Record<string, unknown> = {}) => {
    const repo = {
      manager,
      create: jest.fn(input => input),
      save: jest.fn(async input => ({ id: 'note-1', ...input })),
      ...repoOverrides,
    }
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoverCandidateNotesService,
        { provide: getRepositoryToken(NoteEntity), useValue: repo },
        { provide: WorkspaceContextService, useValue: workspace },
      ],
    }).compile()
    return { service: moduleRef.get(DiscoverCandidateNotesService), repo, workspace }
  }

  describe('candidateNoteEntityId', () => {
    it('est stable pour le même (espace, siren)', () => {
      expect(candidateNoteEntityId(WORKSPACE, SIREN)).toBe(candidateNoteEntityId(WORKSPACE, SIREN))
    })

    it('diffère entre deux espaces pour le MÊME siren — jamais de fuite inter-espace', () => {
      expect(candidateNoteEntityId('ws-1', SIREN)).not.toBe(candidateNoteEntityId('ws-2', SIREN))
    })

    it('diffère entre deux siren du même espace', () => {
      expect(candidateNoteEntityId(WORKSPACE, '111111111')).not.toBe(candidateNoteEntityId(WORKSPACE, '222222222'))
    })

    it('rend un UUID valide (la colonne `notes.entity_id` est de type uuid)', () => {
      expect(candidateNoteEntityId(WORKSPACE, SIREN)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })
  })

  describe('create', () => {
    it('signe et date la note, scopée espace + candidat', async () => {
      const query = jest.fn().mockResolvedValue([
        {
          id: 'note-1',
          body: 'À relancer après le comité budget',
          createdAt: '2026-09-18T10:00:00.000Z',
          authorId: 'u-1',
          firstName: 'Louis',
          lastName: 'S',
        },
      ])
      const { service, repo } = await build({ query })
      const note = await service.create('u-1', SIREN, 'À relancer après le comité budget')

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE,
          user_id: 'u-1',
          entity_type: 'discover_candidate',
          entity_id: candidateNoteEntityId(WORKSPACE, SIREN),
          body: 'À relancer après le comité budget',
        }),
      )
      expect(note.authorName).toBe('Louis S')
      expect(note.body).toBe('À relancer après le comité budget')
    })
  })

  describe('list', () => {
    it('ne lit que les notes de CE candidat, dans CET espace', async () => {
      const query = jest.fn().mockResolvedValue([])
      const { service } = await build({ query })
      await service.list('u-1', SIREN)

      expect(query).toHaveBeenCalledWith(expect.stringContaining('entity_type = $1'), [
        'discover_candidate',
        candidateNoteEntityId(WORKSPACE, SIREN),
        WORKSPACE,
      ])
    })
  })

  describe('claimForAccount', () => {
    it('re-tague les notes du candidat sur le compte créé — même ligne, pas une copie', async () => {
      const query = jest.fn().mockResolvedValue(undefined)
      const { service } = await build({ query })
      await service.claimForAccount(WORKSPACE, SIREN, 'acc-1')

      expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE notes'), [
        'acc-1',
        'discover_candidate',
        candidateNoteEntityId(WORKSPACE, SIREN),
        WORKSPACE,
      ])
    })

    it('un SIREN absent ne fait RIEN — jamais de requête sur un candidat qui n’en a pas', async () => {
      const query = jest.fn()
      const { service } = await build({ query })
      await service.claimForAccount(WORKSPACE, null, 'acc-1')
      expect(query).not.toHaveBeenCalled()
    })

    it('un incident ici ne fait jamais échouer la création du compte — journalisé, jamais levé', async () => {
      const query = jest.fn().mockRejectedValue(new Error('db down'))
      const { service } = await build({ query })
      await expect(service.claimForAccount(WORKSPACE, SIREN, 'acc-1')).resolves.toBeUndefined()
    })
  })
})
