import { renderChatScopeObject, type ChatScopeContactRead } from './chat-scope-object'

/**
 * #1951.1 — LA FICHE QUE LAURA LIT QUAND UN FIL EST CADRÉ SUR UNE PERSONNE.
 *
 * C'est le périmètre le plus demandé du retour, et le plus exposé : une fiche de
 * contact porte des COORDONNÉES et des CRITÈRES PROTÉGÉS. Ce qui suit vérifie ce
 * qui n'entre PAS dans le prompt autant que ce qui y entre.
 */

const contact: ChatScopeContactRead = {
  full_name: 'Sophie Martin',
  title: 'Directrice des systèmes d’information',
  entity: 'Direction technique',
  decision_role: 'decideur',
  seniority: 'C-level',
  scope: 'Infrastructure et données, périmètre groupe',
  budget_authority: 'Arbitre les budgets IT au-delà de 100 k€',
  why_contact: 'Recrute deux architectes cloud depuis mars',
  key_points: ['A parlé d’externalisation en conférence', 'Ancienne de la maison mère'],
  user_status: 'to_contact',
  accountName: 'LATÉCOÈRE',
}

describe('renderChatScopeObject — une personne (#1951.1)', () => {
  it('nomme la personne, son poste et son compte', () => {
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact })
    expect(text).toContain('Sophie Martin')
    expect(text).toContain('Directrice des systèmes d’information')
    expect(text).toContain('LATÉCOÈRE')
  })

  it('rend le rôle dans la décision, le périmètre et ce qui motive l’approche', () => {
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact })
    expect(text).toContain('decideur')
    expect(text).toContain('périmètre groupe')
    expect(text).toContain('Recrute deux architectes cloud')
    expect(text).toContain('A parlé d’externalisation en conférence')
  })

  /**
   * ⚠️ LA GARDE QUI COMPTE. Laura PRÉPARE, elle ne contacte pas : ses outils
   * n'ont aucun chemin d'envoi. Une coordonnée dans le prompt ne sert donc à
   * rien et ne peut que fuir — et le cloisonnement des coordonnées se règle par
   * rôle, ce que ce rendu ne connaît pas.
   */
  it('ne laisse entrer AUCUNE coordonnée, même si la fiche en porte', () => {
    const withContactDetails = {
      ...contact,
      email: 'sophie.martin@latecoere.example',
      phone: '+33612345678',
      linkedin_url: 'https://profiles.example/sophie',
    } as ChatScopeContactRead
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact: withContactDetails })
    expect(text).not.toContain('@')
    expect(text).not.toContain('+336')
    expect(text).not.toContain('http')
  })

  /**
   * ⚠️ `c58_criteres_proteges` — un fil cadré sur une personne peut en comparer
   * plusieurs. Un champ présent dans le prompt pèse sans qu'aucune ligne ne le
   * « lise » : c'est exactement ainsi que `photoUrl` voyageait jusqu'à un prompt
   * qui classe des gens par priorité.
   */
  it('ne laisse entrer AUCUN critère protégé, photo comprise', () => {
    const withProtected = {
      ...contact,
      photo_url: 'https://cdn.example/sophie.jpg',
      location: '12 rue des Lilas, 31000 Toulouse',
    } as ChatScopeContactRead
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact: withProtected })
    expect(text).not.toContain('cdn.example')
    expect(text).not.toContain('rue des Lilas')
  })

  /** Un score NU n'entre pas dans un prompt : sous trois axes, il n'y a pas de score. */
  it('n’écrit aucun score nu — ni priorité, ni note de contact', () => {
    const scored = { ...contact, priority: 5, contact_score: 82 } as ChatScopeContactRead
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact: scored })
    expect(text).not.toContain('82')
    expect(text).not.toMatch(/priorit/i)
  })

  it('n’écrit pas une valeur absente — ni « 0 », ni « inconnu » de remplissage', () => {
    const bare: ChatScopeContactRead = {
      full_name: 'Karim Benali',
      title: null,
      entity: null,
      decision_role: null,
      seniority: null,
      scope: null,
      budget_authority: null,
      why_contact: null,
      key_points: null,
      user_status: null,
      accountName: null,
    }
    const text = renderChatScopeObject({ kind: 'contact', status: 'found', contact: bare })
    expect(text).toContain('Karim Benali')
    expect(text).not.toContain('0')
    expect(text).not.toMatch(/inconnu/i)
    expect(text.split('\n')).toHaveLength(1)
  })

  it('une personne introuvable le dit, sans répondre sur quelqu’un d’autre', () => {
    const text = renderChatScopeObject({ kind: 'contact', status: 'not_found' })
    expect(text).toContain('introuvable')
    expect(text).not.toContain('Sophie')
  })

  it('une fiche illisible n’est pas une fiche absente', () => {
    const text = renderChatScopeObject({ kind: 'contact', status: 'unavailable' })
    expect(text).toContain('illisible')
    expect(text).toContain('introuvable')
  })
})
