import { describe, expect, it } from 'vitest'
import { CONNECTORS, type ConnectorId, type ConnectorState } from './connectors'
import { starterSteps } from './recommended'

/**
 * #1445 — « Recommandé pour démarrer » ne recommande que ce qui est vrai.
 *
 * Deux propriétés, et la seconde est celle qui coûte cher si elle lâche :
 *  · une étape déjà franchie DISPARAÎT — sinon la section redemande ce qui est
 *    fait, et devient la charge mentale qu'elle devait supprimer ;
 *  · un outil que CE serveur n'offre pas n'est jamais recommandé — un bouton
 *    « Connecter » qui répond 400 est pire qu'une absence, et c'est un défaut
 *    déjà payé sur cet écran.
 */
function candidate(id: ConnectorId, state: ConnectorState) {
  return { id, state }
}

const TOUT_A_BRANCHER = [
  candidate('google', 'available'),
  candidate('microsoft', 'available'),
  candidate('hubspot', 'available'),
  candidate('notion', 'available'),
]

describe('les étapes de démarrage', () => {
  it('lit un catalogue réel : les identifiants visés existent', () => {
    // Une garde doit prouver qu'elle lit : si un identifiant était renommé au
    // catalogue, la recommandation viserait un connecteur fantôme en silence.
    const known = new Set<string>(CONNECTORS.map(c => c.id))
    expect(
      ['google', 'microsoft', 'hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'notion', 'admin_docs'].filter(
        id => !known.has(id),
      ),
    ).toEqual([])
  })

  it('propose les trois étapes, dans l’ordre, sur un espace vierge', () => {
    expect(starterSteps(TOUT_A_BRANCHER)).toEqual([
      { key: 'mailbox', connectorId: 'google' },
      { key: 'crm', connectorId: 'hubspot' },
      { key: 'documents', connectorId: 'notion' },
    ])
  })

  it('RETIRE une étape déjà franchie', () => {
    const steps = starterSteps([candidate('google', 'connected'), candidate('hubspot', 'available')])
    expect(steps.map(s => s.key)).toEqual(['crm'])
  })

  it('compte une réparation comme franchie — ce n’est pas un démarrage', () => {
    const steps = starterSteps([candidate('google', 'action_required'), candidate('hubspot', 'available')])
    expect(steps.map(s => s.key)).toEqual(['crm'])
  })

  it('ne recommande JAMAIS un outil que ce serveur n’offre pas', () => {
    // Aucun CRM ni document dans la liste visible : deux étapes disparaissent.
    expect(starterSteps([candidate('google', 'available')])).toEqual([{ key: 'mailbox', connectorId: 'google' }])
  })

  it('bascule sur le candidat suivant quand le premier n’est pas offert', () => {
    const steps = starterSteps([candidate('microsoft', 'available'), candidate('attio', 'available')])
    expect(steps).toEqual([
      { key: 'mailbox', connectorId: 'microsoft' },
      { key: 'crm', connectorId: 'attio' },
    ])
  })

  it('ne rend RIEN quand tout est branché — la section disparaît', () => {
    expect(starterSteps(TOUT_A_BRANCHER.map(c => ({ ...c, state: 'connected' as const })))).toEqual([])
  })

  it('n’en rend jamais plus de trois', () => {
    expect(starterSteps(TOUT_A_BRANCHER).length).toBeLessThanOrEqual(3)
  })
})
