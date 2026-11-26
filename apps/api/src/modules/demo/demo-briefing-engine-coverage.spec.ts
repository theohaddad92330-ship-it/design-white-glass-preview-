import { buildAllBriefingActions } from '../briefing/briefing-actions'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * L1 (31/10/2026, #2095.45) — LA PARITÉ DÉMO DE LA CARTE « AVENANT EN ATTENTE
 * DE SIGNATURE ».
 *
 * La lecture (`BriefingService.buildEngineCards`) passe sur le jeu SEMÉ de la
 * salle, comme en production : la carte n'existe donc en démonstration que si
 * le semis porte un avenant ENVOYÉ, daté. Cette garde rejoue le producteur sur
 * la forme exacte que le semis écrit (`seedMissionDocuments`), plutôt que de
 * supposer le commentaire à jour.
 */
describe('parité démo — la carte « avenant en attente de signature »', () => {
  const sent = DEMO_DELIVERY_CLIENT.missionDocuments.filter(
    document => document.kind === 'amendment' && document.status === 'sent',
  )

  it('le semis porte au moins un avenant ENVOYÉ, daté de plus de zéro jour', () => {
    expect(sent.length).toBeGreaterThan(0)
    for (const document of sent) {
      expect('sentDaysAgo' in document ? document.sentDaysAgo : 0).toBeGreaterThan(0)
    }
  })

  it('le producteur en fait une carte qui ouvre la mission', () => {
    const actions = buildAllBriefingActions({
      now: new Date('2026-10-31T08:00:00Z'),
      meetings: [],
      conflicts: [],
      awaitingReply: [],
      unread: [],
      positiveReplies: [],
      accountsWithFreshSignal: [],
      staleNeeds: [],
      amendmentsPending: sent.map(document => ({
        missionId: 'mission-demo',
        label: 'Fiabilisation plateforme — renfort exploitation',
        documentName: document.name,
        days: 'sentDaysAgo' in document ? document.sentDaysAgo : 0,
      })),
    })
    expect(actions.filter(action => action.kind === 'mission_amendment_pending')).toHaveLength(sent.length)
  })
})
