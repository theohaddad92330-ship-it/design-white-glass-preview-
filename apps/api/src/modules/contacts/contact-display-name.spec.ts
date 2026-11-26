import {
  displayedContactEmail,
  displayedContactName,
  isNameDerivedFromEmail,
  looksLikeEmailAddress,
  repairedContactName,
  UNNAMED_CONTACT_NAME,
  writableContactName,
} from './contact-display-name'

describe('#4586 — un nom qui est une adresse n’entre pas comme nom', () => {
  it('reconnaît une adresse, pas un nom', () => {
    expect(looksLikeEmailAddress('menette.sebastien@societe.example')).toBe(true)
    expect(looksLikeEmailAddress('  Prenom.Nom@Societe.Example ')).toBe(true)
    expect(looksLikeEmailAddress('Marie Dupont')).toBe(false)
    expect(looksLikeEmailAddress('Marie Dupont <marie@societe.example>')).toBe(false)
    expect(looksLikeEmailAddress('')).toBe(false)
    expect(looksLikeEmailAddress(null)).toBe(false)
  })

  it('un vrai nom est gardé tel quel, jamais réécrit', () => {
    expect(writableContactName('Marie Dupont', 'marie@societe.example')).toEqual({
      name: 'Marie Dupont',
      derived: false,
    })
  })

  it('un nom qui est l’adresse devient la partie locale lisible, MARQUÉE dérivée, dans l’ordre écrit', () => {
    expect(writableContactName('menette.sebastien@societe.example', 'menette.sebastien@societe.example')).toEqual({
      name: 'Menette Sebastien',
      derived: true,
    })
    expect(writableContactName(null, 'jean-pierre_durand@societe.example')).toEqual({
      name: 'Jean Pierre Durand',
      derived: true,
    })
  })

  it('ne devine pas : boîte de service ou un seul mot → « à compléter », jamais l’adresse', () => {
    for (const email of ['contact@societe.example', 'rh@societe.example', 'jdupont@societe.example']) {
      const out = writableContactName(email, email)
      expect(out).toEqual({ name: UNNAMED_CONTACT_NAME, derived: false })
      expect(out.name).not.toContain('@')
    }
    expect(writableContactName(null, null)).toEqual({ name: UNNAMED_CONTACT_NAME, derived: false })
  })
})

describe('displayedContactName (#4586)', () => {
  it('une ligne déjà en base nommée par son adresse se lit par sa partie locale, jamais par l’adresse', () => {
    expect(displayedContactName('menette.sebastien@capgemini.com', 'menette.sebastien@capgemini.com')).toBe(
      'Menette Sebastien',
    )
    expect(displayedContactName('contact@capgemini.com', null)).toBe(UNNAMED_CONTACT_NAME)
  })

  it('SAIT DIRE NON : un vrai nom, même avec la société collée, est rendu tel quel (jamais réécrit)', () => {
    expect(displayedContactName('Emmanuel Legros Capgemini', null)).toBe('Emmanuel Legros Capgemini')
    expect(displayedContactName('Inès D.', 'ines@x.fr')).toBe('Inès D.')
  })
})

describe("isNameDerivedFromEmail (#4586.5) — la liste dit qu'un nom est une déduction", () => {
  it("vrai quand l'écriture a posé le marqueur", () => {
    expect(isNameDerivedFromEmail('Menette Sebastien', 'menette.sebastien@capgemini.com', 'true')).toBe(true)
  })

  it("vrai pour une ligne ANTÉRIEURE à la garde : le nom stocké est l'adresse, le nom lu en est dérivé", () => {
    expect(isNameDerivedFromEmail('menette.sebastien@capgemini.com', null, null)).toBe(true)
  })

  it('SAIT DIRE NON : un vrai nom, une boîte de service (« à compléter ») ou un marqueur absent ne sont pas une déduction', () => {
    expect(isNameDerivedFromEmail('Marie Dupont', 'marie.dupont@x.fr', null)).toBe(false)
    expect(isNameDerivedFromEmail('Emmanuel Legros Capgemini', null, 'false')).toBe(false)
    expect(isNameDerivedFromEmail('contact@capgemini.com', null, null)).toBe(false)
    expect(isNameDerivedFromEmail('Marie Dupont', null, undefined)).toBe(false)
  })
})

describe('#4586 — noms mal formés rattrapés (société collée, prénoms séparés par virgules)', () => {
  it('retire la société collée SEULEMENT si elle égale le nom du compte', () => {
    expect(repairedContactName('Camille Martin Exemple Société', 'Exemple Société')).toBe('Camille Martin')
    expect(repairedContactName('Camille Martin Autre Société', 'Exemple Société')).toBeNull()
    expect(repairedContactName('Camille Martin', 'Exemple Société')).toBeNull()
    expect(repairedContactName('Exemple Société', 'Exemple Société')).toBeNull()
  })

  it('replie les prénoms répétés séparés par des virgules', () => {
    expect(repairedContactName('Camille, Camille, Camille MARTIN', null)).toBe('Camille MARTIN')
    expect(repairedContactName('Camille, Jean, Camille MARTIN', null)).toBeNull()
    expect(repairedContactName('Martin, Camille', null)).toBeNull()
  })
})

describe('#4599 — un e-mail gabarit n’est jamais affiché', () => {
  it('masque le gabarit, laisse une vraie adresse et l’absence', () => {
    expect(displayedContactEmail('prenom.nom@exemple.test')).toBeNull()
    expect(displayedContactEmail('camille.martin@exemple.test')).toBe('camille.martin@exemple.test')
    expect(displayedContactEmail(null)).toBeNull()
  })
})
