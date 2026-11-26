import { mapColumn, parseConsultantCsv } from './csv-import'

/**
 * #2183.5 — import CSV/XLSX associé au dépôt de CV en masse.
 *
 * Même discipline que `contacts/csv-import.ts` (D3.5 — « pas de scraping,
 * l'utilisateur exporte depuis SA session ») : une colonne qu'on ne reconnaît
 * pas est ignorée, jamais devinée ; une ligne sans identité est écartée AVEC
 * sa raison. Le XLSX n'est PAS couvert ici — voir la ligne de registre 2183.5.
 */
describe('mapColumn (consultants)', () => {
  it('reconnaît les formes FR et EN, accents et casse compris', () => {
    expect(mapColumn('Prénom')).toBe('firstName')
    expect(mapColumn('PRENOM')).toBe('firstName')
    expect(mapColumn('Job Title')).toBe('title')
    expect(mapColumn('Téléphone')).toBe('phone')
  })

  it('ne devine JAMAIS une colonne inconnue', () => {
    expect(mapColumn('Score interne')).toBeNull()
    expect(mapColumn('TJM')).toBeNull()
  })
})

describe('parseConsultantCsv', () => {
  it('lit un export courant (prénom, nom, poste, email, téléphone)', () => {
    const csv = [
      'Prénom,Nom,Poste,Email,Téléphone',
      'Claire,Vasseur,Ingénieure plateforme,claire@example.com,0612345678',
    ].join('\n')

    const preview = parseConsultantCsv(csv)

    expect(preview.consultants).toHaveLength(1)
    expect(preview.consultants[0]).toMatchObject({
      fullName: 'Claire Vasseur',
      firstName: 'Claire',
      lastName: 'Vasseur',
      title: 'Ingénieure plateforme',
      email: 'claire@example.com',
      phone: '0612345678',
    })
  })

  it('liste les colonnes ignorées au lieu de les deviner', () => {
    const preview = parseConsultantCsv('Prénom,Nom,TJM cible\nClaire,Vasseur,650')
    expect(preview.mappedColumns).toEqual({ Prénom: 'firstName', Nom: 'lastName' })
    expect(preview.ignoredColumns).toEqual(['TJM cible'])
  })

  // #2732.2 — une ligne SANS NOM est refusée avec son motif ; une adresse seule ne fabrique plus un nom.
  it('#2732.2 — une ligne avec e-mail mais SANS nom est refusée (no_name), jamais créée sous son adresse', () => {
    const preview = parseConsultantCsv('Nom complet,Email\n,claire@example.com\nMarc Dupont,marc@example.com')
    expect(preview.consultants.map(row => row.fullName)).toEqual(['Marc Dupont'])
    expect(preview.skipped).toEqual([{ line: 2, reason: 'no_name' }])
  })

  it('écarte une ligne sans identité exploitable, AVEC sa raison — jamais de fiche « Inconnu »', () => {
    const preview = parseConsultantCsv('Prénom,Nom,Poste\n,,Ingénieur')
    expect(preview.consultants).toHaveLength(0)
    expect(preview.skipped).toEqual([{ line: 2, reason: 'no_identity' }])
  })

  it('déduplique DANS le fichier, et le dit — même adresse, casse différente', () => {
    const csv = ['Nom complet,Email', 'Claire Vasseur,claire@example.com', 'Claire V.,CLAIRE@example.com'].join('\n')
    const preview = parseConsultantCsv(csv)
    expect(preview.consultants).toHaveLength(1)
    expect(preview.skipped).toEqual([{ line: 3, reason: 'duplicate_in_file' }])
  })

  it('rejette une adresse qui n’en est pas une plutôt que de la garder', () => {
    const preview = parseConsultantCsv('Nom complet,Email\nClaire Vasseur,à compléter')
    expect(preview.consultants[0]?.email).toBeNull()
  })

  it('reconstitue le nom complet depuis prénom + nom quand aucune colonne « nom complet » n’existe', () => {
    const preview = parseConsultantCsv('Prénom,Nom\nClaire,Vasseur')
    expect(preview.consultants[0]?.fullName).toBe('Claire Vasseur')
  })

  it('gère un fichier vide sans lever', () => {
    expect(parseConsultantCsv('')).toEqual({
      consultants: [],
      skipped: [],
      mappedColumns: {},
      ignoredColumns: [],
      truncated: false,
    })
  })

  it('annonce la troncature au lieu de couper en silence', () => {
    const rows = Array.from({ length: 2100 }, (_, index) => `Consultant ${index},c${index}@acme.com`)
    const preview = parseConsultantCsv(['Nom complet,Email', ...rows].join('\n'))
    expect(preview.truncated).toBe(true)
    expect(preview.consultants).toHaveLength(2000)
  })

  it('reconnaît le point-virgule d’un Excel français', () => {
    const preview = parseConsultantCsv('Prénom;Nom;Email\nClaire;Vasseur;claire@example.com')
    expect(preview.consultants[0]?.fullName).toBe('Claire Vasseur')
  })
})
