import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #2166.11 (épopée #2806) — « et en démonstration, la référence comparable de
 * Découvrir montre quoi ? »
 *
 * Craft rule n°9 : l'écran n'a ni table ni clé `raw_analysis` à lui — la
 * garde par table ne poserait jamais la question. Ce fichier est l'appelant
 * qui lit la VRAIE réponse scriptée (`demoDiscoverResponse`), pas un
 * commentaire qui l'affirme : la classification `seede` ne vaut que si la
 * salle nomme réellement un compte du portefeuille sur un candidat NEUF, avec
 * le NAF exact qui rend cette référence vraie.
 */
describe('#2166.11 — la référence comparable de Découvrir, en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE.reason).toContain('#2166.11')
  })

  it('un candidat NEUF nomme Société Générale, avec le même NAF exact', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const marenval = parsed.candidates.find(c => c.name === 'Marenval Financement (démo)')
    expect(marenval?.portfolioState).toBe('new')
    expect(marenval?.nafCode).toBe('64.19Z')
    expect(marenval?.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Société Générale' })
  })

  it('un candidat sans secteur apparié ne porte AUCUNE référence — jamais devinée', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const withoutMatch = parsed.candidates.find(c => c.name === 'Pharmatek Santé (démo)')
    expect(withoutMatch?.similarityHeadline).toBeUndefined()
  })
})
