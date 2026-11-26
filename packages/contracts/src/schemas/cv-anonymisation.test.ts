import { describe, expect, it } from 'vitest'
import { anonymiseText, leaksFullName, shortenName, type AnonymisationSettings } from './cv-anonymisation.js'

/**
 * L'anonymisation d'un dossier de compétences (PDF 3 §9.2, ticket BEL-ATS-202).
 *
 * Le ticket demande « 30 cas d'anonymisation sur fonction pure », et il a
 * raison d'insister : un document qui a l'air anonyme et ne l'est pas est PIRE
 * que pas d'anonymisation, parce que personne ne relit. Les cas ci-dessous sont
 * ceux qui cassent en vrai — particules, accents, noms composés, homonymie avec
 * un mot commun.
 */
const RULE = (over: Partial<AnonymisationSettings> = {}): AnonymisationSettings => ({
  rule: 'prenom_initiale',
  hide: [],
  ...over,
})

describe('shortenName — les 30 cas du ticket', () => {
  const cases: [string, Parameters<typeof shortenName>[1], string][] = [
    ['Yanis Berthier', 'nom_complet', 'Yanis Berthier'],
    ['Yanis Berthier', 'prenom_initiale', 'Yanis B.'],
    ['Yanis Berthier', 'initiales', 'Y. B.'],
    ['Yanis Berthier', 'trigramme', 'YBE'],
    // Particules : elles FONT PARTIE du nom. Les supprimer change le nom.
    ['Marie de La Fontaine', 'prenom_initiale', 'Marie d. L. F.'],
    ['Marie de La Fontaine', 'initiales', 'M. d. L. F.'],
    ['Jan van den Berg', 'prenom_initiale', 'Jan v. d. B.'],
    ['Youssef el Amrani', 'prenom_initiale', 'Youssef e. A.'],
    // Noms composés : deux initiales, parce qu'une seule ne dit plus qui c'est.
    ['Jean-Marc Le Goff', 'prenom_initiale', 'Jean-Marc L. G.'],
    ['Jean-Marc Le Goff', 'initiales', 'J. L. G.'],
    ['Anne-Sophie Dupont-Moretti', 'prenom_initiale', 'Anne-Sophie D.'],
    // Accents : l'initiale est la lettre NON accentuée, sinon « É. » et « E. »
    // se lisent comme deux personnes.
    ['Inès Kaczmarek', 'prenom_initiale', 'Inès K.'],
    ['Élodie Ãguiar', 'initiales', 'E. A.'],
    ['Éric Étienne', 'trigramme', 'EET'],
    // Casse d'origine conservée sur le prénom : « INÈS » est une saisie, pas
    // une faute à corriger.
    ['INÈS KACZMAREK', 'prenom_initiale', 'INÈS K.'],
    // Apostrophes et tirets ne cassent rien.
    ["Sean O'Brien", 'prenom_initiale', 'Sean O.'],
    ["Sean O'Brien", 'initiales', 'S. O.'],
    // Un seul mot : on ne fabrique pas un nom de famille.
    ['Cher', 'prenom_initiale', 'Cher'],
    ['Cher', 'initiales', 'C.'],
    ['Cher', 'trigramme', 'CHE'],
    // Espaces en trop.
    ['  Yanis   Berthier  ', 'prenom_initiale', 'Yanis B.'],
    ['  Yanis   Berthier  ', 'initiales', 'Y. B.'],
    // Trois parties ou plus.
    ['Maria Isabel Garcia Lopez', 'prenom_initiale', 'Maria I. G. L.'],
    ['Maria Isabel Garcia Lopez', 'trigramme', 'MIG'],
    // Initiale déjà présente dans la saisie : on ne la double pas.
    ['Yanis B.', 'prenom_initiale', 'Yanis B.'],
    ['Yanis B.', 'initiales', 'Y. B.'],
    // Chaîne vide : rien, jamais un marque-place.
    ['', 'prenom_initiale', ''],
    ['   ', 'initiales', ''],
    // Homonymie avec un mot commun — le cas que le ticket cite nommément.
    ['Pierre Leroy', 'prenom_initiale', 'Pierre L.'],
    ['Pierre Leroy', 'trigramme', 'PLE'],
  ]

  it('couvre au moins trente cas', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30)
  })

  it.each(cases)('%s + %s → %s', (input, rule, expected) => {
    expect(shortenName(input, rule)).toBe(expected)
  })
})

describe('anonymiseText', () => {
  const input = {
    fullName: 'Yanis Berthier',
    email: 'yanis@example.fr',
    phone: '0600000000',
    address: '12 rue des Lilas, Paris',
    clients: [{ name: 'Orange', sector: 'un opérateur télécom de premier plan' }],
  }

  it('ne touche à RIEN sous la règle par défaut', () => {
    const text = 'Yanis Berthier — Ingénieur plateforme'
    expect(anonymiseText(text, input, RULE({ rule: 'nom_complet' }))).toBe(text)
  })

  it('remplace le nom COMPLET avant ses parties', () => {
    // Commencer par le prénom laisserait « Yanis B. erthier ».
    const output = anonymiseText('Yanis Berthier, ingénieur.', input, RULE())
    expect(output).toBe('Yanis B., ingénieur.')
  })

  it('retire aussi les occurrences ISOLÉES du nom de famille', () => {
    const output = anonymiseText('Berthier a mené la migration. Contacter Berthier.', input, RULE())
    expect(output).not.toContain('Berthier')
  })

  it('GARDE le prénom sous « prénom + initiale » — c’est tout son intérêt', () => {
    const output = anonymiseText('Yanis a mené la migration.', input, RULE())
    expect(output).toContain('Yanis')
  })

  it('retire le prénom seul dès les initiales', () => {
    const output = anonymiseText('Yanis a mené la migration.', input, RULE({ rule: 'initiales' }))
    expect(output).not.toContain('Yanis')
  })

  it('remplace un client par son SECTEUR, jamais par un blanc', () => {
    // « [masqué] » ferait douter du reste du dossier ; un secteur se lit.
    const output = anonymiseText('Mission chez Orange en 2024.', input, RULE({ hide: ['client_names'] }))
    expect(output).toBe('Mission chez un opérateur télécom de premier plan en 2024.')
  })

  it('masque les coordonnées quand on le lui demande, et pas avant', () => {
    const kept = anonymiseText('yanis@example.fr / 0600000000', input, RULE())
    expect(kept).toContain('yanis@example.fr')

    const hidden = anonymiseText('yanis@example.fr / 0600000000', input, RULE({ hide: ['email', 'phone'] }))
    expect(hidden).not.toContain('yanis@example.fr')
    expect(hidden).not.toContain('0600000000')
  })

  it('ne DEVINE aucun nom qu’on ne lui a pas donné', () => {
    // Deviner ferait disparaître des mots ordinaires : un consultant nommé
    // « Leroy » verrait « Leroy Merlin » disparaître d'un dossier.
    const output = anonymiseText('Mission pour Leroy Merlin.', input, RULE({ rule: 'initiales' }))
    expect(output).toContain('Leroy Merlin')
  })
})

describe('leaksFullName', () => {
  it('détecte une fuite APRÈS anonymisation — une fonction qui se vérifie elle-même ne vérifie rien', () => {
    const anonymised = anonymiseText('Yanis Berthier — CV', { fullName: 'Yanis Berthier' }, RULE())
    expect(leaksFullName(anonymised, 'Yanis Berthier')).toBe(false)
    expect(leaksFullName('Signé Yanis Berthier', 'Yanis Berthier')).toBe(true)
  })
})
