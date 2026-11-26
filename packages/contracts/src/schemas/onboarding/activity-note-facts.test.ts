import { describe, expect, it } from 'vitest'
import { ACTIVITY_NOTE_FACTS_MAX, proposeActivityNoteFacts } from './activity-note-facts.js'

describe('#4016 L13b — la note libre d’accueil découpée en faits À REVOIR', () => {
  it('découpe par phrase et par puce, chaque fait reste TEXTUEL et « à revoir »', () => {
    const facts = proposeActivityNoteFacts(
      'Nous ouvrons un bureau à Lyon en janvier. Mon associé part en juin.\n- Client stratégique : Acme\n• Conflit de territoire avec Paris',
    )
    expect(facts.map(f => f.text)).toEqual([
      'Nous ouvrons un bureau à Lyon en janvier.',
      'Mon associé part en juin.',
      'Client stratégique : Acme',
      'Conflit de territoire avec Paris',
    ])
    expect(facts.every(f => f.status === 'to_review')).toBe(true)
  })

  it('JAMAIS « confirmé » : le statut est toujours à revoir, quel que soit le texte', () => {
    for (const note of ['Un seul fait.', 'Oui. Non. Peut-être, on verra bien.', '  ']) {
      for (const fact of proposeActivityNoteFacts(note)) expect(fact.status).toBe('to_review')
    }
  })

  it('un texte vide, blanc ou absent ne produit AUCUN fait — pas de fait inventé', () => {
    expect(proposeActivityNoteFacts(null)).toEqual([])
    expect(proposeActivityNoteFacts(undefined)).toEqual([])
    expect(proposeActivityNoteFacts('   \n  ')).toEqual([])
  })

  it('écarte les fragments trop courts pour être un fait, et les doublons', () => {
    const facts = proposeActivityNoteFacts('Oui. Nouveau marché en Belgique. Nouveau marché en Belgique.')
    expect(facts.map(f => f.text)).toEqual(['Nouveau marché en Belgique.'])
  })

  it('ne coupe pas sur un nombre décimal ni une abréviation courante', () => {
    const facts = proposeActivityNoteFacts('Objectif de 2.5 M€ de CA en 2027, cf. le plan. Équipe de 12 personnes.')
    expect(facts.map(f => f.text)).toEqual([
      'Objectif de 2.5 M€ de CA en 2027, cf. le plan.',
      'Équipe de 12 personnes.',
    ])
  })

  it('borne le nombre de faits proposés', () => {
    const note = Array.from(
      { length: ACTIVITY_NOTE_FACTS_MAX + 5 },
      (_, i) => `Fait numéro ${i + 100} de la liste.`,
    ).join(' ')
    expect(proposeActivityNoteFacts(note)).toHaveLength(ACTIVITY_NOTE_FACTS_MAX)
  })

  it('un identifiant stable par fait (même texte → même id), pour pouvoir le revoir', () => {
    const a = proposeActivityNoteFacts('Mon associé part en juin.')
    const b = proposeActivityNoteFacts('Mon associé part en juin.')
    expect(a[0]?.id).toBe(b[0]?.id)
  })
})
