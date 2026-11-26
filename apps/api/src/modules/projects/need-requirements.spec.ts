import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ProjectPipelineService } from './project-pipeline.service'
import type { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import type { PipelineStageLabelEntity } from '../../database/entities/pipeline-stage-label.entity'
import type { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'

/**
 * LES EXIGENCES D'UN BESOIN — LE VOYAGE COMPLET, ÉCRITURE PUIS LECTURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `languages` et `clearances` traversaient TOUT sauf le milieu :
 *
 *  - la colonne existe (`project-need.entity.ts`, avec son commentaire « une
 *    habilitation manquante BLOQUE ») ;
 *  - le contrat les déclare, en lecture (`projectNeedSchema`) ET en écriture
 *    (`createProjectNeedSchema`, `updateProjectNeedSchema`) ;
 *  - le moteur de rapprochement les lit et en fait deux axes, dont un BLOQUANT ;
 *  - `matching.service.ts` les sélectionne bien depuis la table.
 *
 * Et entre les deux : `addNeed` les jetait, `updateNeed` les ignorait, et
 * `toNeedWire` ne les rendait pas. Une valeur envoyée par un appelant tombait
 * donc dans le vide sans une erreur, la colonne restait `'{}'`, et l'axe 12 —
 * déclaré bloquant — ne bloquait jamais rien.
 *
 * C'est la QUATRIÈME occurrence de « colonne lue, jamais écrite » dans ce
 * dépôt, et la première où le champ mort tenait un garde-fou.
 *
 * ⚠️ Chaque test regarde les DEUX bouts : ce qui part vers la base
 * (`needs.create` / l'entité sauvegardée) ET ce qui revient à l'appelant
 * (`toNeedWire`). Vérifier un seul des deux laisserait vivant exactement le
 * défaut d'origine — le contrat était juste des deux côtés, c'est le milieu qui
 * mentait.
 */
describe('les exigences d’un besoin — langues et habilitations', () => {
  let projects: MockRepository<ProjectEntity>
  let needs: MockRepository<ProjectNeedEntity>
  let service: ProjectPipelineService

  const PROJECT = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    projects = createMockRepository<ProjectEntity>()
    needs = createMockRepository<ProjectNeedEntity>()
    service = new ProjectPipelineService(
      projects as never,
      needs as never,
      createMockRepository<ProjectContactEntity>() as never,
      createMockRepository<PipelineStageLabelEntity>() as never,
      createMockRepository<LossReasonEntity>() as never,
      {
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn(() => ({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn(),
        })),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    )
    projects.manager.query.mockResolvedValue([{ account_id: 'acc-1' }])
    needs.count.mockResolvedValue(0)
    needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
      ...row,
      id: 'n-1',
      created_at: new Date('2026-08-29T09:00:00.000Z'),
      updated_at: new Date('2026-08-29T09:00:00.000Z'),
    }))
  })

  /** Un besoin déjà en base, tel que `findOne` le rend. */
  function existingNeed(over: Partial<ProjectNeedEntity> = {}): ProjectNeedEntity {
    return {
      id: 'n-1',
      workspace_id: 'ws-1',
      project_id: PROJECT,
      title: 'Ingénieur systèmes',
      skills: [],
      seniority: null,
      headcount: 1,
      target_tjm_cents: null,
      start_on: null,
      duration_months: null,
      location: null,
      languages: [],
      clearances: [],
      contract_kind: 'inconnu',
      status: 'to_qualify',
      status_reason: null,
      status_changed_at: null,
      urgency: null,
      owner_id: null,
      deadline_at: null,
      stack: [],
      created_at: new Date('2026-08-19T10:00:00.000Z'),
      updated_at: new Date('2026-08-19T10:00:00.000Z'),
      ...over,
    } as ProjectNeedEntity
  }

  describe('à la création', () => {
    it('PERSISTE les langues et les habilitations, et les REND', async () => {
      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Ingénieur systèmes',
        languages: [{ code: 'en', level: 'c1' }],
        clearances: ['Confidentiel Défense'],
      })

      // Ce qui part vers la base.
      expect(needs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          languages: [{ code: 'en', level: 'c1' }],
          clearances: ['Confidentiel Défense'],
        }),
      )
      // Ce qui revient à l'appelant. Sans cette moitié, l'écran qui vient de
      // saisir l'habilitation ne la reverrait pas et la ressaisirait.
      expect(created.languages).toEqual([{ code: 'en', level: 'c1' }])
      expect(created.clearances).toEqual(['Confidentiel Défense'])
    })

    it('un besoin qui n’en demande pas part avec des listes VIDES, jamais `undefined`', async () => {
      // `[]` a un sens ici, et ce n'est pas « on ne sait pas » : c'est « ce
      // poste n'exige ni langue ni habilitation ». L'axe correspondant sort
      // alors du dénominateur au lieu de valoir zéro — la colonne est `NOT
      // NULL` avec un défaut `'{}'`, et lui envoyer `undefined` laisserait
      // TypeORM décider à notre place.
      const created = await service.addNeed('ws-1', PROJECT, { title: 'Ingénieur systèmes' })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ languages: [], clearances: [] }))
      expect(created.languages).toEqual([])
      expect(created.clearances).toEqual([])
    })
  })

  describe('à la modification', () => {
    it('remplace les habilitations quand le patch les porte', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ clearances: ['Secret'] }))

      const updated = await service.updateNeed('ws-1', 'n-1', { clearances: ['Confidentiel Défense'] })

      expect(updated.clearances).toEqual(['Confidentiel Défense'])
    })

    it('VIDER la liste est un geste, et il passe', async () => {
      // « Cette habilitation n'est plus exigée » doit pouvoir se dire. Traiter
      // `[]` comme « rien à changer » laisserait un besoin bloquant pour
      // toujours sur une exigence retirée.
      needs.findOne.mockResolvedValue(existingNeed({ clearances: ['Secret'] }))

      const updated = await service.updateNeed('ws-1', 'n-1', { clearances: [] })

      expect(updated.clearances).toEqual([])
    })

    it('ne parler QUE des langues n’efface pas les habilitations', async () => {
      // `undefined` = « je n'en parle pas », `[]` = « retire-les ». Les
      // confondre effacerait l'exigence d'habilitation à chaque changement de
      // titre — et un blocage qui disparaît en silence est pire qu'un blocage
      // qui n'a jamais existé.
      needs.findOne.mockResolvedValue(existingNeed({ clearances: ['Secret'], languages: [] }))

      const updated = await service.updateNeed('ws-1', 'n-1', { languages: [{ code: 'de', level: null }] })

      expect(updated.clearances).toEqual(['Secret'])
      expect(updated.languages).toEqual([{ code: 'de', level: null }])
    })
  })

  describe('les six champs servis par le contrat et qui n’avaient aucun écran', () => {
    it('`context`, `expertise`, `stack`, `constraints`, `budget_cents` et `min_tjm_cents` reviennent au lecteur', async () => {
      // Ils étaient en base et dans `projectNeedSchema`, et n'entraient pas
      // dans `OpenNeedRow` : ni la liste ni la fiche ne pouvaient les lire.
      needs.findOne.mockResolvedValue(
        existingNeed({
          context: 'Refonte du socle de supervision, équipe de six.',
          expertise: 'Systèmes industriels',
          stack: ['Ignition', 'PostgreSQL'],
          constraints: 'Astreinte une semaine sur quatre.',
          budget_cents: '9600000',
          min_tjm_cents: '48000',
        }),
      )

      const updated = await service.updateNeed('ws-1', 'n-1', { title: 'Ingénieur systèmes' })

      expect(updated.context).toContain('supervision')
      expect(updated.expertise).toBe('Systèmes industriels')
      expect(updated.stack).toEqual(['Ignition', 'PostgreSQL'])
      expect(updated.constraints).toContain('Astreinte')
      // `bigint` revient en CHAÎNE du pilote pg : un budget entre guillemets
      // s'afficherait tel quel.
      expect(updated.budget_cents).toBe(9_600_000)
      expect(updated.min_tjm_cents).toBe(48_000)
    })

    it('une valeur absente reste `null` — jamais 0, qui se lirait « gratuit »', async () => {
      needs.findOne.mockResolvedValue(existingNeed())

      const updated = await service.updateNeed('ws-1', 'n-1', { title: 'Ingénieur systèmes' })

      expect(updated.budget_cents).toBeNull()
      expect(updated.min_tjm_cents).toBeNull()
      expect(updated.context).toBeNull()
    })
  })
})
