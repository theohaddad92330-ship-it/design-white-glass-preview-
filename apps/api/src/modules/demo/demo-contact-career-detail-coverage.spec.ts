import { DENSIFIED_COMPANIES, densifiedContactsFor } from './demo-contact-density'

/**
 * #3716 (parité démo, craft rule 9) — le détail « Parcours et informations
 * complémentaires » de la fiche contact doit s'ouvrir en démonstration sur : un
 * ancien poste, l'employeur détecté À VÉRIFIER, et des colonnes importées sans
 * champ d'accueil — sur un interlocuteur FICTIF.
 */
describe('#3716 — la démo montre le parcours et les colonnes importées', () => {
  const rows = DENSIFIED_COMPANIES.flatMap(company => densifiedContactsFor(company))
  const seeded = rows.filter(row => Object.keys(row.extra ?? {}).length > 0)

  it('au moins un contact porte des colonnes importées, sous leur intitulé d’origine', () => {
    expect(seeded.length).toBeGreaterThan(0)
    for (const row of seeded) {
      for (const [header, value] of Object.entries(row.extra ?? {})) {
        expect(header.trim()).not.toBe('')
        expect(value.trim()).not.toBe('')
      }
    }
  })

  it('ce contact a aussi un ancien poste ET un employeur détecté (proposition à vérifier)', () => {
    for (const row of seeded) {
      const history = row.apollo_enrichment?.employment_history ?? []
      expect(history.some(entry => entry.current)).toBe(true)
      expect(history.some(entry => !entry.current)).toBe(true)
      expect(row.lifecycle_state).toBe('historique')
    }
  })
})
