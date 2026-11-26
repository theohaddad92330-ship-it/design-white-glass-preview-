import { describe, expect, it } from 'vitest'
import { findTalentDuplicates, type TalentIdentity } from './talent-duplicates.js'

/**
 * La détection de doublon à l'ingestion (PDF 3 §3.4).
 *
 * Ce que ces tests protègent : l'ORDRE des clés. Deux personnes qui partagent
 * une adresse professionnelle sont la même personne ; deux personnes qui
 * portent le même nom ne le sont pas. Confondre les deux produit soit des
 * fiches en double, soit une carrière écrasée par une autre.
 */
function talent(over: Partial<TalentIdentity> & { id: string }): TalentIdentity {
  return { fullName: 'Yanis Berthier', email: null, phone: null, lastEmployer: null, ...over }
}

describe('findTalentDuplicates', () => {
  it('rapproche sur l’adresse — la clé certaine', () => {
    const found = findTalentDuplicates(
      { fullName: 'Y. Berthier', email: 'YANIS@example.fr', phone: null, lastEmployer: null },
      [talent({ id: 'a', fullName: 'Yanis Berthier', email: 'yanis@example.fr' })],
    )
    // La casse ne distingue pas deux adresses, et le nom abrégé n'empêche rien.
    // #2327.18 — « Y. Berthier » ABRÈGE le nom, il ne le contredit pas : aucun
    // conflit n'est levé.
    expect(found).toEqual([
      {
        talentId: 'a',
        fullName: 'Yanis Berthier',
        reason: 'same_email',
        confidence: 0.95,
        signals: ['email'],
        sharedExperiences: 0,
        conflicts: [],
      },
    ])
  })

  it('rapproche sur le téléphone quel que soit son écriture', () => {
    // « 01 42 … » et « +33 1 42 … » sont le même numéro écrit par deux
    // personnes différentes.
    const found = findTalentDuplicates(
      { fullName: 'Inconnu', email: null, phone: '+33 1 42 68 53 00', lastEmployer: null },
      [talent({ id: 'a', phone: '0142685300' })],
    )
    expect(found[0]?.reason).toBe('same_phone')
  })

  it('ne confond PAS deux numéros différents qui finissent pareil de peu', () => {
    const found = findTalentDuplicates({ fullName: 'Inconnu', email: null, phone: '0142685300', lastEmployer: null }, [
      talent({ id: 'a', phone: '0142685301' }),
    ])
    expect(found).toEqual([])
  })

  it('distingue « même nom » de « même nom, même employeur »', () => {
    const homonymes = findTalentDuplicates(
      { fullName: 'Marie Dupont', email: null, phone: null, lastEmployer: 'Orange' },
      [talent({ id: 'a', fullName: 'Marie Dupont', lastEmployer: 'Capgemini' })],
    )
    // Deux homonymes chez deux employeurs différents : on POSE la question,
    // avec une confiance basse. Se taire ferait créer un doublon ; affirmer
    // ferait fusionner deux carrières.
    expect(homonymes[0]).toMatchObject({ reason: 'same_name', confidence: 0.3 })

    const memeBoite = findTalentDuplicates(
      { fullName: 'Marie Dupont', email: null, phone: null, lastEmployer: 'Orange' },
      [talent({ id: 'a', fullName: 'Marie Dupont', lastEmployer: 'orange' })],
    )
    expect(memeBoite[0]).toMatchObject({ reason: 'same_name_same_employer', confidence: 0.6 })
  })

  it('ignore les accents et les espaces en trop', () => {
    const found = findTalentDuplicates(
      { fullName: '  Inès   KACZMAREK ', email: null, phone: null, lastEmployer: null },
      [talent({ id: 'a', fullName: 'Ines Kaczmarek' })],
    )
    expect(found[0]?.reason).toBe('same_name')
  })

  it('ne rend RIEN quand la personne qu’on ingère n’a aucune donnée comparable', () => {
    // Un CV sans nom, sans adresse et sans téléphone ne ressemble à personne :
    // proposer une fusion « au cas où » ferait rapprocher deux inconnus.
    const found = findTalentDuplicates({ fullName: '', email: null, phone: null, lastEmployer: null }, [
      talent({ id: 'a' }),
      talent({ id: 'b', fullName: '' }),
    ])
    expect(found).toEqual([])
  })

  it('ne dit qu’UNE chose par personne, la plus forte, et classe du plus certain', () => {
    const found = findTalentDuplicates(
      { fullName: 'Yanis Berthier', email: 'yanis@example.fr', phone: '0600000000', lastEmployer: 'Orange' },
      [
        talent({ id: 'faible', fullName: 'Yanis Berthier' }),
        talent({ id: 'certain', email: 'yanis@example.fr', fullName: 'Y. B.' }),
      ],
    )
    expect(found.map(match => match.talentId)).toEqual(['certain', 'faible'])
    expect(found).toHaveLength(2)
  })
})
