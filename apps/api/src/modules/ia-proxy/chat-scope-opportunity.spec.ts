import { renderChatScopeObject, type ChatScopeOpportunityRead } from './chat-scope-object'

/**
 * #1951.4 — LA FICHE QUE LAURA LIT QUAND UN FIL EST CADRÉ SUR UNE OPPORTUNITÉ.
 *
 * « Opportunité » désigne deux choses dans ce produit : un STATUT commercial de
 * compte, et une LIGNE du pipe. C'est la seconde qui fait une portée — la
 * première aurait donné un second nom au compte. Ce qui suit vérifie surtout ce
 * qui n'entre PAS dans le prompt : aucune probabilité, aucun nom de fournisseur.
 */

const opportunity: ChatScopeOpportunityRead = {
  label: 'Refonte du SI paiement',
  kind: 'projet',
  detail: 'Migration du socle de paiement vers une architecture événementielle',
  offer: 'Delivery au forfait',
  sector: 'Transport',
  urgency: 'haute',
  stage: 'qualification',
  stage_entered_at: '2026-08-14',
  accountName: 'Société Générale',
  has_mission: false,
}

describe('renderChatScopeObject — une opportunité (#1951.4)', () => {
  it('nomme l’affaire, son compte et son étape', () => {
    const text = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity })
    expect(text).toContain('Refonte du SI paiement')
    expect(text).toContain('Société Générale')
    expect(text).toContain('qualification')
    expect(text).toContain('2026-08-14')
  })

  /**
   * ⚠️ `c26_probabilite` — refusée SIX fois. Un mot comme « élevée » posé à côté
   * d'une affaire se lit comme une chance de conclure, quelle que soit
   * l'intention du champ. L'étape et sa date sont des faits ; une confiance n'en
   * est pas un.
   */
  it('ne laisse entrer AUCUNE probabilité, même si la ligne en porte une', () => {
    const withConfidence = { ...opportunity, confidence: 'élevée' } as ChatScopeOpportunityRead
    const text = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity: withConfidence })
    expect(text).not.toMatch(/élevée/i)
    expect(text).not.toMatch(/confian/i)
  })

  /** NOS fournisseurs ne se nomment jamais — ni à l'écran, ni dans un prompt. */
  it('ne laisse entrer AUCUN nom de fournisseur par le champ `source`', () => {
    const withSource = { ...opportunity, source: 'un fournisseur de veille' } as ChatScopeOpportunityRead
    const text = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity: withSource })
    expect(text).not.toMatch(/fournisseur/i)
  })

  it('« aucune mission ouverte » est une VRAIE mesure ; « on ne sait pas » n’écrit rien', () => {
    const measured = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity })
    expect(measured).toMatch(/Aucune mission/i)

    const { has_mission: _omitted, ...unknownStaffing } = opportunity
    const silent = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity: unknownStaffing })
    expect(silent).not.toMatch(/mission/i)
  })

  it('n’écrit pas une valeur absente — ni « 0 », ni « inconnu » de remplissage', () => {
    const bare: ChatScopeOpportunityRead = {
      label: 'Affaire sans détail',
      kind: null,
      detail: null,
      offer: null,
      sector: null,
      urgency: null,
      stage: null,
      stage_entered_at: null,
      accountName: null,
    }
    const text = renderChatScopeObject({ kind: 'opportunity', status: 'found', opportunity: bare })
    expect(text.split('\n')).toHaveLength(1)
    expect(text).not.toContain('0')
  })

  it('une opportunité introuvable le dit, et ne répond pas sur une autre affaire', () => {
    const text = renderChatScopeObject({ kind: 'opportunity', status: 'not_found' })
    expect(text).toContain('introuvable')
    expect(text).toContain('opportunité')
    expect(text).not.toContain('Refonte')
  })
})
