import { detectDelimiter, mapColumn, parseContactCsv, splitCsvLine } from './csv-import'

/**
 * Un import silencieusement faux ne se voit pas : des colonnes mal devinées
 * produisent trois cents contacts dont le prénom est un intitulé de poste, et
 * personne ne s'en aperçoit avant d'envoyer les messages.
 */
describe('splitCsvLine', () => {
  it('respecte les guillemets et les virgules qu’ils protègent', () => {
    expect(splitCsvLine('"Dupont, Jean",DSI,acme', ',')).toEqual(['Dupont, Jean', 'DSI', 'acme'])
  })

  it('lit un guillemet littéral doublé', () => {
    expect(splitCsvLine('"Jean ""Le Boss"" Dupont",DSI', ',')).toEqual(['Jean "Le Boss" Dupont', 'DSI'])
  })
})

describe('detectDelimiter', () => {
  it('reconnaît le point-virgule d’un Excel français', () => {
    // L'utilisateur ne sait pas que son Excel exporte en point-virgule ; il ne
    // devrait pas avoir à le savoir.
    expect(detectDelimiter('Prénom;Nom;Société')).toBe(';')
    expect(detectDelimiter('First name,Last name,Company')).toBe(',')
  })

  it("#4890 — à égalité, `;` l'emporte sur la virgule d'un en-tête non cité", () => {
    expect(detectDelimiter('Entreprise;Tiering (A, B, C);Secteur')).toBe(';')
  })
})

describe('mapColumn', () => {
  it('reconnaît les formes FR et EN, accents et casse compris', () => {
    expect(mapColumn('Prénom')).toBe('firstName')
    expect(mapColumn('PRENOM')).toBe('firstName')
    expect(mapColumn('Job Title')).toBe('title')
    expect(mapColumn('Société')).toBe('companyName')
  })

  it('ne devine JAMAIS une colonne inconnue', () => {
    // Deviner « Company » depuis « Comp. » produirait une donnée fausse que
    // personne ne relirait.
    expect(mapColumn('Comp.')).toBeNull()
    expect(mapColumn('Score interne')).toBeNull()
  })
})

describe('parseContactCsv', () => {
  it('#4586 — une ligne sans nom ne prend jamais son adresse pour nom', () => {
    const csv = ['Email,Company', 'menette.sebastien@societe.example,Societe', 'contact@societe.example,Societe'].join(
      '\n',
    )

    const names = parseContactCsv(csv).contacts.map(c => c.fullName)

    expect(names).toEqual(['Menette Sebastien', 'Contact à compléter'])
  })

  it("#4599.2 — un gabarit « prenom.nom@… » n'entre jamais comme adresse (la ligne reste, sans adresse)", () => {
    const csv = [
      'Prénom,Nom,Email',
      'Claire,Vasseur,prenom.nom@helios.example',
      'Paul,Martin,paul.martin@helios.example',
    ].join('\n')

    const emails = parseContactCsv(csv).contacts.map(c => c.email)

    expect(emails).toEqual([null, 'paul.martin@helios.example'])
  })

  it('lit un export type Sales Navigator', () => {
    const csv = [
      'First Name,Last Name,Title,Company,Email,LinkedIn URL',
      'Claire,Vasseur,Directrice des systèmes,Groupe Helios,claire@helios.example,https://www.linkedin.com/in/claire-vasseur/',
    ].join('\n')

    const preview = parseContactCsv(csv)

    expect(preview.contacts).toHaveLength(1)
    expect(preview.contacts[0]).toMatchObject({
      fullName: 'Claire Vasseur',
      title: 'Directrice des systèmes',
      companyName: 'Groupe Helios',
      email: 'claire@helios.example',
      linkedinUrl: 'https://www.linkedin.com/in/claire-vasseur',
    })
  })

  it('liste les colonnes ignorées au lieu de les deviner', () => {
    const preview = parseContactCsv('Prénom,Nom,Score interne\nClaire,Vasseur,42')
    expect(preview.mappedColumns).toEqual({ Prénom: 'firstName', Nom: 'lastName' })
    expect(preview.ignoredColumns).toEqual(['Score interne'])
  })

  it('écarte une ligne sans identité exploitable, AVEC sa raison', () => {
    const preview = parseContactCsv('Prénom,Nom,Société\n,,Groupe Helios')
    expect(preview.contacts).toHaveLength(0)
    expect(preview.skipped).toEqual([{ line: 2, reason: 'no_identity' }])
  })

  it('déduplique dans le fichier, et le dit', () => {
    const csv = ['Nom complet,Email', 'Claire Vasseur,claire@helios.example', 'Claire V.,CLAIRE@helios.example'].join(
      '\n',
    )
    const preview = parseContactCsv(csv)
    expect(preview.contacts).toHaveLength(1)
    expect(preview.skipped).toEqual([{ line: 3, reason: 'duplicate_in_file' }])
  })

  it('rejette une adresse qui n’en est pas une plutôt que de la garder', () => {
    const preview = parseContactCsv('Nom complet,Email\nClaire Vasseur,à compléter')
    expect(preview.contacts[0]?.email).toBeNull()
  })

  it('ne prend pour LinkedIn qu’une vraie URL de profil', () => {
    const preview = parseContactCsv(
      'Nom complet,LinkedIn URL\nClaire,https://www.linkedin.com/company/helios\nPaul,https://linkedin.com/in/paul?trk=x',
    )
    expect(preview.contacts[0]?.linkedinUrl).toBeNull()
    expect(preview.contacts[1]?.linkedinUrl).toBe('https://linkedin.com/in/paul')
  })

  it('reconstitue le nom complet depuis prénom + nom', () => {
    const preview = parseContactCsv('Prénom,Nom\nClaire,Vasseur')
    expect(preview.contacts[0]?.fullName).toBe('Claire Vasseur')
  })

  it('gère un fichier vide sans lever', () => {
    expect(parseContactCsv('')).toEqual({
      contacts: [],
      skipped: [],
      mappedColumns: {},
      ignoredColumns: [],
      truncated: false,
    })
  })

  it('annonce la troncature au lieu de couper en silence', () => {
    const rows = Array.from({ length: 2100 }, (_, index) => `Contact ${index},c${index}@acme.com`)
    const preview = parseContactCsv(['Nom complet,Email', ...rows].join('\n'))
    expect(preview.truncated).toBe(true)
    expect(preview.contacts).toHaveLength(2000)
  })
})
