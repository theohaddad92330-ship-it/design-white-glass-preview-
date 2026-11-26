import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3941 / #3091 (craft rule n°9) — la levée de fonds annoncée est SEMÉE dans la
 * salle : une carte de Découvrir porte un signal `funding` daté, avec la nature de
 * sa source, et la ligne « Sources » la nomme (`funding-feed`, jamais un fournisseur).
 * En production ce signal vient des fils publics (`funding_feed.py`).
 */
type RawCandidate = {
  name: string
  signals: Array<{ type: string; label: string; date: string; detail?: string; url?: string }>
  sources: Array<{ name: string }>
}

const defaultView = () => (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates

describe('#3941 — la levée de fonds est visible dans la salle démo', () => {
  it('la VUE PAR DÉFAUT porte un candidat avec une levée DATÉE et sourcée', () => {
    const funded = defaultView().filter(c => c.signals.some(s => s.type === 'funding'))
    expect(funded.length).toBeGreaterThan(0)
    for (const candidate of funded) {
      const signal = candidate.signals.find(s => s.type === 'funding')
      expect(signal?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(signal?.label).toMatch(/^Levée de fonds/)
      expect(signal?.detail).toBe('Presse spécialisée')
      expect(candidate.sources.map(s => s.name)).toContain('funding-feed')
    }
  })

  it('sait dire NON : un candidat sans levée n’en porte pas, et ne nomme pas la source des levées', () => {
    const others = defaultView().filter(c => !c.signals.some(s => s.type === 'funding'))
    expect(others.length).toBeGreaterThan(0)
    for (const candidate of others) expect(candidate.sources.map(s => s.name)).not.toContain('funding-feed')
  })

  // #4285.1 (recette 23/10) — « 10/10/2026 Levée de fonds : 12 M€ série B » était datée mais SANS lien : toute levée
  // affichée porte un lien vers son annonce. La salle semait la levée sans URL ; un domaine fictif `.example` (jamais un
  // vrai site), l'annonce sur le site de l'entreprise elle-même.
  it('#4285.1 — chaque levée de la vue par défaut porte un lien vers son annonce, sur un domaine fictif', () => {
    const funded = defaultView().filter(c => c.signals.some(s => s.type === 'funding'))
    for (const candidate of funded) {
      for (const signal of candidate.signals.filter(s => s.type === 'funding')) {
        expect(signal.url).toMatch(/^https:\/\/[a-z0-9.-]+\.example\/.+/)
      }
    }
  })

  it('#4285.1 — le lien d’Askelia est sur le site d’Askelia', () => {
    const askelia = defaultView().find(c => c.name === 'Askelia Partners (démo)')
    const signal = askelia?.signals.find(s => s.type === 'funding')
    expect(signal?.url).toMatch(/^https:\/\/askelia\.example\//)
  })
})
