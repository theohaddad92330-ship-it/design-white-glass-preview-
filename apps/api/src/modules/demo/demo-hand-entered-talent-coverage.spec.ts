import { DEMO_CONSULTANTS, DEMO_HAND_ENTERED_TALENT_FIELDS } from './demo-dataset'

/**
 * #4577.3 — « Saisi à la main » se MONTRE en démonstration (craft rule n°9) : la fiche d'un talent de la salle porte
 * une correction humaine datée sur un champ (`field_provenance`, source `human`). Sans cette ligne, le marqueur que le
 * chantier pose sur la fiche serait un écran livré mais invisible en réunion.
 *
 * Garde : la liste désigne un talent QUI EXISTE dans le vivier de la salle et une colonne qui existe sur sa fiche —
 * une faute de frappe sèmerait une provenance orpheline, que rien ne ferait voir.
 */
describe('démo — champs de fiche talent « saisis à la main » (#4577.3)', () => {
  it('LIT quelque chose : au moins un champ corrigé à la main est semé', () => {
    expect(DEMO_HAND_ENTERED_TALENT_FIELDS.length).toBeGreaterThan(0)
  })

  for (const entry of DEMO_HAND_ENTERED_TALENT_FIELDS) {
    it(`${entry.full_name} : le talent existe et porte une valeur sur chaque champ corrigé`, () => {
      const talent = DEMO_CONSULTANTS.find(candidate => candidate.full_name === entry.full_name)
      expect(talent).toBeDefined()
      expect(entry.fields.length).toBeGreaterThan(0)
      for (const field of entry.fields) {
        // Une correction humaine suppose une valeur : « saisi à la main » sur un champ vide mentirait.
        expect((talent as unknown as Record<string, unknown>)[field]).not.toBeNull()
        expect((talent as unknown as Record<string, unknown>)[field]).not.toBeUndefined()
      }
      expect(entry.daysAgo).toBeGreaterThan(0)
    })
  }

  it('sait dire NON : un talent inconnu du vivier serait attrapé', () => {
    expect(DEMO_CONSULTANTS.find(candidate => candidate.full_name === 'Personne Inconnue')).toBeUndefined()
  })
})
