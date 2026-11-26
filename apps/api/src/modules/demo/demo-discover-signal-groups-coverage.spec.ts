import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4045 (Louis, 12/10) — « je veux voir les signaux recrutements et projet plus vie de
 * l'entreprise, avec le lien de l'offre ». Craft rule n°9 : la vue par défaut de la salle
 * doit montrer UN candidat qui porte les trois familles, chacune avec son lien cliquable —
 * sinon la ligne de Découvrir serait vide de ce que la réunion de démonstration vient voir.
 */
type DemoSignal = { type: string; label: string; url?: string }
type DemoCandidate = { name: string; signals: DemoSignal[]; sources: { name: string }[] }

describe('#4045 — Découvrir en démonstration : recrutement + projet + vie de l’entreprise, avec liens', () => {
  const candidates = (demoDiscoverResponse({}) as { candidates: DemoCandidate[] }).candidates

  it('un candidat porte un recrutement ET au moins deux actualités d’entreprise', () => {
    // #4068 — Aubrac porte aussi recrutement + actualités (le contexte de sa carte) : `filter`, pas `find`.
    const rich = candidates.filter(
      c => c.signals.some(s => s.type === 'hiring') && c.signals.filter(s => s.type === 'business').length >= 2,
    )
    expect(rich.map(c => c.name)).toContain('Naval Group')

    // Depuis #4115, Aubrac (grille 5 forts + 10 contexte) porte aussi les trois familles : on ne désigne donc plus
    // « le premier qui qualifie » mais Naval Group, par son nom, qui doit TOUJOURS qualifier.
    const naval = candidates.find(c => c.name === 'Naval Group')
    expect(naval?.signals.some(s => s.type === 'hiring')).toBe(true)
    expect(naval?.signals.filter(s => s.type === 'business').length).toBeGreaterThanOrEqual(2)
  })

  it('chaque signal de ce candidat porte un lien https vérifiable (offre, article)', () => {
    const rich = candidates.find(c => c.name === 'Naval Group')
    const linked = rich?.signals.filter(s => s.type === 'hiring' || s.type === 'business') ?? []
    expect(linked.length).toBeGreaterThanOrEqual(3)
    for (const signal of linked) expect(signal.url).toMatch(/^https:\/\//)
  })

  // #4045.9 — la liste « Besoins » range par famille : les trois sont semées (recrutement,
  // actualité/projet, marchés et vie juridique), sinon un groupe serait vide à la démo.
  it('#4045.9 — la démonstration porte un signal de CHAQUE famille de la liste Besoins', () => {
    const types = new Set(candidates.flatMap(c => c.signals.map(s => s.type)))
    expect(types.has('hiring')).toBe(true)
    expect(types.has('business')).toBe(true)
    expect(['tender', 'award', 'legal'].some(type => types.has(type))).toBe(true)
  })

  it('la démonstration ne nomme aucun registre pour une actualité (elle n’en vient pas)', () => {
    const rich = candidates.find(c => c.name === 'Naval Group')
    expect(rich?.sources.map(s => s.name)).toEqual(['France Travail'])
  })
})
