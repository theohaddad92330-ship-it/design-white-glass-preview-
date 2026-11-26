import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MemoryService } from './memory.service'

/**
 * #1919 — « TOUT OUBLIER » EMPORTE AUSSI LES RETOURS SUR LES RÉPONSES DE LAURA.
 *
 * Ces retours (`chat_reply_feedback`) sont relus dans le prompt de leur SEUL
 * auteur : c'est de la mémoire personnelle, au même titre que les résumés de
 * conversation. Un « tout oublier » qui les laisserait derrière lui serait un
 * « tout » faux.
 *
 * Fichier SÉPARÉ de `memory-forget-all.spec.ts` : un autre lot modifie le module
 * de mémoire en parallèle, et un fichier neuf ne peut pas entrer en conflit.
 *
 * Ce qui est tenu : la clause RÉELLEMENT passée à la base (les deux bornes),
 * le compte ajouté au total, et — parce que ces retours ne sont pas une couche
 * du registre, donc pas nommables dans `failedLayers` — l'ÉCHEC qui arrête le
 * geste AVANT toute suppression irréversible plutôt qu'un succès partiel muet.
 */
describe('MemoryService.forgetAll — #1919 les retours sur les réponses de Laura', () => {
  let service: MemoryService
  let facts: MockRepository<MemoryPinnedFactEntity>
  let prefs: MockRepository<UserPreferenceEntity>
  let summaries: MockRepository<ConversationSummaryEntity>
  let interventions: MockRepository<LauraInterventionEntity>
  let profiles: MockRepository<ProfileEntity>
  let sql: jest.Mock

  beforeEach(() => {
    facts = createMockRepository<MemoryPinnedFactEntity>()
    prefs = createMockRepository<UserPreferenceEntity>()
    summaries = createMockRepository<ConversationSummaryEntity>()
    interventions = createMockRepository<LauraInterventionEntity>()
    profiles = createMockRepository<ProfileEntity>()
    prefs.findOne.mockResolvedValue(null)
    sql = facts.manager.query as unknown as jest.Mock
    service = new MemoryService(
      facts as never,
      prefs as never,
      summaries as never,
      interventions as never,
      profiles as never,
      { resolveProfileData: jest.fn(), resolveContext: jest.fn() } as never,
      // #1916.23 — `events`, le journal des gestes sur la mémoire : 7e paramètre
      // du service depuis main, ajouté par la fusion du 13/09.
      createMockRepository() as never,
    )
  })

  function replyFeedbackStatements(): Array<[string, unknown[]]> {
    return sql.mock.calls.filter(([text]) => /chat_reply_feedback/.test(String(text))) as Array<[string, unknown[]]>
  }

  it('efface MES retours dans CET espace, et les compte dans le total', async () => {
    sql.mockImplementation(async (text: string) => (/count\(/i.test(text) ? [{ count: 4 }] : []))
    facts.count.mockResolvedValue(1)

    const report = await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    const statements = replyFeedbackStatements()
    const deletion = statements.find(([text]) => /^\s*DELETE/i.test(text))
    expect(deletion).toBeDefined()
    // Les DEUX bornes, passées en paramètres — jamais un DELETE qui emporterait
    // les retours d'un collègue ou ceux d'un autre espace.
    expect(deletion?.[0]).toMatch(/user_id = \$1/)
    expect(deletion?.[0]).toMatch(/workspace_id = \$2/)
    expect(deletion?.[1]).toEqual(['u-1', 'ws-1'])
    // 1 fait + 4 retours.
    expect(report.forgotten).toBe(5)
    expect(report.failedLayers).toEqual([])
  })

  it('sait dire NON — un échec sur ces retours ARRÊTE le geste avant toute suppression irréversible', async () => {
    sql.mockImplementation(async (text: string) => {
      if (/chat_reply_feedback/.test(text)) throw new Error('lecture impossible')
      return []
    })

    await expect(service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })).rejects.toThrow()
    // Rien n'est parti : l'échec ne peut pas se lire comme un succès partiel.
    expect(facts.delete).not.toHaveBeenCalled()
    expect(prefs.delete).not.toHaveBeenCalled()
    expect(summaries.delete).not.toHaveBeenCalled()
    expect(interventions.delete).not.toHaveBeenCalled()
  })

  it('n’efface rien quand il n’y a aucun retour, et le total n’en compte aucun', async () => {
    sql.mockImplementation(async (text: string) => (/count\(/i.test(text) ? [{ count: 0 }] : []))

    const report = await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(replyFeedbackStatements().some(([text]) => /^\s*DELETE/i.test(text))).toBe(false)
    expect(report.forgotten).toBe(0)
  })
})
