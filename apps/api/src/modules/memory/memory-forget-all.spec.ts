import { BadRequestException } from '@nestjs/common'
import { MEMORY_LAYERS, isDeclaredMemoryLayer } from '@bellum/contracts'
import { IsNull } from 'typeorm'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MemoryService } from './memory.service'

/**
 * « TOUT OUBLIER » — le geste global, et la portée qu'il ne franchit pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION QUI A ÉTÉ TRANCHÉE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La suppression ligne à ligne d'un FAIT est bornée par l'ESPACE
 * (`unpinFact({ id, workspaceId })`) : n'importe quel membre peut retirer un
 * fait épinglé par un collègue, et c'est voulu — un fait épinglé est un geste
 * délibéré de partage vers l'équipe, retiré ligne à ligne, en connaissance de
 * ce qu'on retire.
 *
 * Un bouton « tout oublier » borné de la même façon viderait le portefeuille de
 * faits de TOUTE l'ESN d'un clic, depuis un écran intitulé « ma mémoire ».
 * C'est la même requête, ce n'est pas le même geste. La portée du bouton est
 * donc : **ce qui est à moi**. Un fait épinglé par un collègue survit ; mes
 * préférences, mes résumés de conversation et mes traces partent en entier.
 *
 * Ce fichier tient cette décision contre les dépôts factices : il lit la clause
 * de portée RÉELLEMENT passée à la base, pas le texte du service.
 */

const NOW = new Date('2026-09-01T08:00:00.000Z')

describe('MemoryService.forgetAll — « tout oublier », et ce qu’il n’emporte pas', () => {
  let service: MemoryService
  let facts: MockRepository<MemoryPinnedFactEntity>
  let prefs: MockRepository<UserPreferenceEntity>
  let summaries: MockRepository<ConversationSummaryEntity>
  let interventions: MockRepository<LauraInterventionEntity>
  let profiles: MockRepository<ProfileEntity>
  let esnProfile: { resolveProfileData: jest.Mock; resolveContext: jest.Mock }

  beforeEach(() => {
    facts = createMockRepository<MemoryPinnedFactEntity>()
    prefs = createMockRepository<UserPreferenceEntity>()
    summaries = createMockRepository<ConversationSummaryEntity>()
    interventions = createMockRepository<LauraInterventionEntity>()
    profiles = createMockRepository<ProfileEntity>()
    // Le résolveur de profil est en LECTURE SEULE par construction : il n'expose
    // aucune méthode d'écriture. C'est ce qui met les deux couches déclarées
    // hors d'atteinte de « tout oublier » — l'absence de code, pas une consigne.
    esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue({}),
      resolveContext: jest.fn().mockResolvedValue({ canonicalRow: null, ownRow: null }),
    }
    service = new MemoryService(
      facts as never,
      prefs as never,
      summaries as never,
      interventions as never,
      profiles as never,
      esnProfile as never,
      // #1916.23 — le journal des gestes : la cascade SQL l'emporte avec les faits.
      createMockRepository() as never,
    )
  })

  it('n’efface QUE les faits que J’AI épinglés — ceux d’un collègue restent', async () => {
    facts.count.mockResolvedValue(2)
    prefs.findOne.mockResolvedValue(null)
    summaries.count.mockResolvedValue(0)
    interventions.count.mockResolvedValue(0)

    await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    // La clause porte les DEUX bornes. Sans `user_id`, ce DELETE viderait le
    // portefeuille de faits de toute l'ESN depuis un écran « ma mémoire ».
    expect(facts.delete).toHaveBeenCalledWith({ user_id: 'u-1', workspace_id: 'ws-1' })
    // #2439.10 — le COMPTE rendu à l'écran est celui des lignes encore VIVANTES :
    // une mémoire déjà oubliée ligne à ligne (`archived_at`) ne se re-compte pas
    // comme « oubliée à l'instant ». Le DELETE, lui, garde la portée entière.
    expect(facts.count).toHaveBeenCalledWith({
      where: { user_id: 'u-1', workspace_id: 'ws-1', archived_at: IsNull() },
    })
  })

  it('emporte MES préférences, MES résumés de ce fil et MES traces', async () => {
    facts.count.mockResolvedValue(0)
    prefs.findOne.mockResolvedValue({
      id: 'p-1',
      user_id: 'u-1',
      preferences: { tone: 'direct', langue: 'fr' },
      updated_at: NOW,
    } as UserPreferenceEntity)
    summaries.count.mockResolvedValue(3)
    interventions.count.mockResolvedValue(1)

    const report = await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(prefs.delete).toHaveBeenCalledWith({ user_id: 'u-1' })
    // Les résumés archivés partent AUSSI : ils restent des extraits de ce que
    // cette personne a écrit. « Tout oublier » qui en laisserait derrière lui
    // serait un « tout » faux.
    expect(summaries.delete).toHaveBeenCalledWith({ user_id: 'u-1', workspace_id: 'ws-1' })
    expect(interventions.delete).toHaveBeenCalledWith({ user_id: 'u-1' })
    // 0 fait + 2 clés de préférence + 3 résumés + 1 trace
    expect(report.forgotten).toBe(6)
    expect(report.failedLayers).toEqual([])
  })

  it('NOMME la couche qu’il n’a pas pu vider — un compte vrai qui se lit comme un succès complet est un mensonge', async () => {
    facts.count.mockResolvedValue(1)
    prefs.findOne.mockResolvedValue(null)
    summaries.count.mockResolvedValue(0)
    interventions.count.mockRejectedValue(new Error('lecture impossible'))

    const report = await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(report.forgotten).toBe(1)
    expect(report.failedLayers).toEqual(['refusals'])
  })

  it('ne touche JAMAIS aux couches déclarées — ni le profil de la personne, ni celui de l’ESN', async () => {
    prefs.findOne.mockResolvedValue(null)

    await service.forgetAll({ userId: 'u-1', workspaceId: 'ws-1' })

    // Le prénom et le profil de l'ESN sont SAISIS dans un formulaire. Les
    // effacer depuis l'écran de mémoire détruirait une configuration, pas une
    // mémoire — et une suppression ne remplace pas une correction.
    expect(profiles.delete).not.toHaveBeenCalled()
    expect(profiles.save).not.toHaveBeenCalled()
    expect(profiles.update).not.toHaveBeenCalled()
    // Le profil de l'ESN n'est même pas RELU pendant l'oubli : il n'est pas
    // concerné, donc on ne le touche pas — pas même pour le compter.
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(Object.keys(esnProfile)).toEqual(['resolveProfileData', 'resolveContext'])
  })

  it('couvre EXACTEMENT les couches oubliables du contrat — une 7ᵉ couche ne serait pas sautée en silence', async () => {
    const forgettable = MEMORY_LAYERS.filter(layer => !isDeclaredMemoryLayer(layer))
    // Témoin positif : le corpus n'est pas vide, et il n'est pas non plus la
    // liste entière — sinon ce test passerait sur un contrat sans couche
    // déclarée et ne garderait rien.
    expect(forgettable.length).toBeGreaterThan(0)
    expect(forgettable.length).toBeLessThan(MEMORY_LAYERS.length)
    expect(forgettable).toEqual(['facts', 'preferences', 'conversations', 'refusals'])
  })

  it('refuse d’oublier une ligne d’une couche déclarée, et dit où elle se corrige', async () => {
    await expect(
      service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'identity', id: 'firstName' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.forgetLedgerEntry({ userId: 'u-1', workspaceId: 'ws-1', layer: 'workspace', id: 'companyName' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    // Et surtout : rien n'a été effacé au passage.
    expect(facts.delete).not.toHaveBeenCalled()
    expect(prefs.save).not.toHaveBeenCalled()
  })
})
