import { ConflictException } from '@nestjs/common'
import type { ProfileContext, ProfileContextStatus } from '@bellum/contracts'
import { AdminProfileContextsService } from './admin-profile-contexts.service'

/**
 * #2231 — « rejouer tout de suite » (Louis, 15/09/2026), contre la
 * recommandation. Le prompt du Profiler interdit la probabilité depuis le
 * 13/09 (`039ea2e8c`) ; ce que ce service garde est le STOCK écrit avant ce
 * commit. Règle du dépôt pour toute écriture de masse : « le compte s'affiche
 * avant d'écrire » — `audit()` compte, `regenerate()` refuse d'écrire si ce
 * compte a bougé entre-temps (409).
 *
 * `triggerGeneration` (idempotent, archive une révision) est atteint UNIQUEMENT
 * via `EsnProfileService.regenerateProfileContext` — le même appelant que le
 * bouton « Régénérer » (`esn-profile.controller.ts:267`, `POST
 * regenerate-context`) — jamais recontacté directement.
 */

type ProfileRow = {
  user_id: string
  profile_context: ProfileContext | null
  profile_context_status: ProfileContextStatus
}

function repo(rows: ProfileRow[]): { find: jest.Mock } {
  return { find: jest.fn().mockResolvedValue(rows) }
}

const PROPRE: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  bellumPhrases: {
    welcome: 'Bienvenue, on va transformer votre expertise en pipeline qualifié.',
    firstAnalysisCta: 'Lancer une analyse sur une ETI du secteur Industrie.',
    weeklySummaryIntro: 'Votre semaine en un coup d’œil.',
    emptyState: 'Aucune analyse pour l’instant : lancez la première.',
    scoreContext: 'Le score se justifie par ses axes : couverture stakeholders et signaux marché.',
  },
}

const PORTE_LE_TEXTE_INTERDIT: ProfileContext = {
  esnArchetype: 'scaleUp',
  sellingPosture: 'volumeFlexible',
  bellumPhrases: {
    welcome: 'Bienvenue, on transforme votre pipeline.',
    firstAnalysisCta: 'Lancer une analyse.',
    weeklySummaryIntro: 'Votre semaine.',
    emptyState: 'Aucune analyse.',
    // #2231 — texte mesuré en production le 14/09 avant le fix du prompt.
    scoreContext: 'Le scoring évaluera la probabilité de closing de ce compte.',
  },
  welcomeSummary: {
    profileRecap: 'Vous êtes une ESN "Data" de 10 consultants.',
    searchesPersonalization: 'Les recherches cibleront en priorité "cloud".',
    contactsPersonalization: 'Les contacts identifiés seront "DSI", "CTO".',
    messagesPersonalization: 'Les messages seront rédigés dans un ton direct.',
    scoringPersonalization: 'Le scoring évaluera la probabilité de closing.',
    firstAnalysisSuggestions: [],
  },
}

function makeService(rows: ProfileRow[]) {
  const profiles = repo(rows)
  const regenerateProfileContext = jest.fn().mockResolvedValue({})
  const esnProfile = { regenerateProfileContext } as unknown as { regenerateProfileContext: jest.Mock }
  const service = new AdminProfileContextsService(profiles as never, esnProfile as never)
  return { service, profiles, regenerateProfileContext }
}

describe('AdminProfileContextsService.audit — le compte s’affiche avant d’écrire', () => {
  it('compte les contextes qui portent le texte interdit, sur le total des contextes stockés', async () => {
    const { service } = makeService([
      { user_id: 'u1', profile_context: PROPRE, profile_context_status: 'succeeded' },
      { user_id: 'u2', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
      { user_id: 'u3', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'validated' },
    ])
    const report = await service.audit()
    expect(report.totalCount).toBe(3)
    expect(report.flaggedCount).toBe(2)
  })

  it('rend un échantillon de 3 extraits masqués au plus, sans identifiant de personne ni d’espace', async () => {
    const { service } = makeService([
      { user_id: 'u1', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    const report = await service.audit()
    expect(report.samples.length).toBeGreaterThan(0)
    expect(report.samples.length).toBeLessThanOrEqual(3)
    for (const sample of report.samples) {
      expect(sample).not.toHaveProperty('userId')
      expect(sample).not.toHaveProperty('user_id')
      expect(sample).not.toHaveProperty('workspaceId')
      expect(sample.excerpt.length).toBeLessThan(120)
      expect(sample.excerpt.length).toBeGreaterThan(0)
    }
  })

  it('lit un corpus non vide — le détecteur lit vraiment quelque chose, jusque dans les champs imbriqués', async () => {
    const { service } = makeService([
      { user_id: 'u1', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    const report = await service.audit()
    // Le premier champ probabilité-porteur du fixture est `bellumPhrases.scoreContext` :
    // si l'extracteur ne descendait pas dans les objets imbriqués, ce chemin
    // n'apparaîtrait jamais et ce test resterait rouge pour la bonne raison.
    expect(report.samples.some(sample => sample.path.startsWith('bellumPhrases.'))).toBe(true)
  })

  it('rend zéro sur un stock qui ne porte aucune probabilité', async () => {
    const { service } = makeService([{ user_id: 'u1', profile_context: PROPRE, profile_context_status: 'succeeded' }])
    const report = await service.audit()
    expect(report.flaggedCount).toBe(0)
    expect(report.samples).toEqual([])
  })
})

describe('AdminProfileContextsService.regenerate — refuse d’écrire si le compte a bougé', () => {
  it('409 si `confirmCount` ne correspond plus au compte actuel', async () => {
    const { service } = makeService([
      { user_id: 'u1', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
      { user_id: 'u2', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    await expect(service.regenerate(1)).rejects.toBeInstanceOf(ConflictException)
  })

  it('n’écrit rien quand `confirmCount` a bougé : aucun appel à `regenerateProfileContext`', async () => {
    const { service, regenerateProfileContext } = makeService([
      { user_id: 'u1', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    await expect(service.regenerate(0)).rejects.toBeInstanceOf(ConflictException)
    expect(regenerateProfileContext).not.toHaveBeenCalled()
  })

  it('rejoue UNIQUEMENT les contextes détectés, via `triggerGeneration` et rien d’autre', async () => {
    const { service, regenerateProfileContext } = makeService([
      { user_id: 'propre', profile_context: PROPRE, profile_context_status: 'succeeded' },
      { user_id: 'porte-le-texte', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    const report = await service.regenerate(1)
    expect(regenerateProfileContext).toHaveBeenCalledTimes(1)
    expect(regenerateProfileContext).toHaveBeenCalledWith('porte-le-texte')
    expect(report.results).toEqual([{ userId: 'porte-le-texte', outcome: 'regenere', reason: expect.any(String) }])
  })

  it('un contexte VALIDÉ reste « inchangé » — D9, une correction humaine gagne toujours', async () => {
    const { service, regenerateProfileContext } = makeService([
      { user_id: 'valide', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'validated' },
    ])
    const report = await service.regenerate(1)
    expect(regenerateProfileContext).not.toHaveBeenCalled()
    expect(report.results).toEqual([{ userId: 'valide', outcome: 'inchange', reason: expect.any(String) }])
  })

  it('rend « échec » avec sa raison quand `triggerGeneration` (via l’appelant) rejette', async () => {
    const { service, regenerateProfileContext } = makeService([
      { user_id: 'en-echec', profile_context: PORTE_LE_TEXTE_INTERDIT, profile_context_status: 'succeeded' },
    ])
    regenerateProfileContext.mockRejectedValueOnce(new Error('IA indisponible'))
    const report = await service.regenerate(1)
    expect(report.results).toEqual([
      { userId: 'en-echec', outcome: 'echec', reason: expect.stringContaining('IA indisponible') },
    ])
  })
})
