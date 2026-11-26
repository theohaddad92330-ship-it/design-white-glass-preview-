import { isMissingContactDetails, missingContactDetailsSql, recordedPhoneSql } from './contact-completeness'

describe('recordedPhoneSql — « Avec téléphone » ne retient que les numéros ENREGISTRÉS (#3821)', () => {
  it('exige un vrai numéro (chiffres, 8 à 15, aucune lettre), pas seulement une colonne non nulle', () => {
    const sql = recordedPhoneSql('contact')
    expect(sql).toContain('contact.phone IS NOT NULL')
    expect(sql).toContain("contact.phone ~ '^[+0-9][0-9 ().-]*$'")
    expect(sql).toContain("regexp_replace(contact.phone, '\\D', '', 'g')")
    expect(sql).toContain('BETWEEN 8 AND 15')
  })
})

describe('contact completeness — une seule définition pour le compteur et le filtre', () => {
  it("rend le prédicat sans alias, pour la requête d'agrégat", () => {
    expect(missingContactDetailsSql()).toBe('(email IS NULL OR phone IS NULL)')
  })

  it('rend le prédicat avec alias, pour le query builder de la liste', () => {
    expect(missingContactDetailsSql('contact')).toBe('(contact.email IS NULL OR contact.phone IS NULL)')
  })

  it('parenthèse toujours le OU — sinon un AND en amont capturerait la moitié du prédicat', () => {
    // `x AND email IS NULL OR phone IS NULL` filtrerait des fiches d'autres
    // espaces de travail : la parenthèse n'est pas cosmétique.
    expect(missingContactDetailsSql('c').startsWith('(')).toBe(true)
    expect(missingContactDetailsSql('c').endsWith(')')).toBe(true)
  })

  it('compte comme « à compléter » une fiche sans email OU sans téléphone', () => {
    expect(isMissingContactDetails({ email: null, phone: '0601' })).toBe(true)
    expect(isMissingContactDetails({ email: 'a@b.fr', phone: null })).toBe(true)
    expect(isMissingContactDetails({ email: '', phone: '' })).toBe(true)
  })

  it('ne compte pas une fiche joignable, même sans LinkedIn', () => {
    expect(isMissingContactDetails({ email: 'a@b.fr', phone: '0601020304' })).toBe(false)
  })
})
