import { describe, expect, it } from 'vitest'
import { ORG_FILE_MAX_ROWS, parseOrgFile, withDocumentDate } from './parseOrgFile'

/**
 * #1103 — « soit charger un organigramme si on en a un ».
 *
 * Ce que ces tests protègent, c'est ce que le parseur REFUSE de deviner : une
 * colonne inconnue, une ligne sans nom, un doublon interne, un fichier trop
 * long. Chacun de ces cas se termine par une phrase à l'écran, jamais par un
 * silence.
 */

describe("la lecture d'un fichier d'organigramme (#1103)", () => {
  it('lit les colonnes françaises avec le point-virgule d’Excel', () => {
    const reading = parseOrgFile(
      ['Nom;Fonction;Direction;N+1', 'Caroline Jaouen;DSI;Direction SI;Marc Petit'].join('\n'),
    )

    expect(reading.rows).toEqual([
      { fullName: 'Caroline Jaouen', title: 'DSI', entityName: 'Direction SI', managerName: 'Marc Petit' },
    ])
    expect(reading.ignored).toEqual([])
  })

  it('lit aussi les en-têtes anglaises et la virgule', () => {
    const reading = parseOrgFile(['Full name,Job title,Department', 'Jane Doe,CTO,IT'].join('\n'))

    expect(reading.rows).toEqual([{ fullName: 'Jane Doe', title: 'CTO', entityName: 'IT' }])
  })

  it('NOMME les colonnes qu’il ne sait pas lire au lieu de les deviner', () => {
    // Une colonne devinée est une colonne qui écrira la mauvaise chose.
    const reading = parseOrgFile(['Nom;Salaire;Matricule', 'Caroline Jaouen;60000;A12'].join('\n'))

    expect(reading.recognised).toEqual(['Nom'])
    expect(reading.ignored).toEqual(['Salaire', 'Matricule'])
    expect(reading.rows).toEqual([{ fullName: 'Caroline Jaouen' }])
  })

  it('ne rend rien et le dit quand aucune colonne ne porte le nom', () => {
    // Rendre zéro ligne se lirait « mon fichier est vide ».
    const reading = parseOrgFile(['Fonction;Direction', 'DSI;SI'].join('\n'))

    expect(reading.rows).toEqual([])
    expect(reading.ignored).toEqual(['Fonction', 'Direction'])
  })

  it('écarte une ligne sans nom, avec sa raison et son numéro', () => {
    const reading = parseOrgFile(['Nom;Fonction', ';DSI', 'Marc Petit;DG'].join('\n'))

    expect(reading.skipped).toEqual([{ line: 2, reason: 'no_name' }])
    expect(reading.rows).toHaveLength(1)
  })

  it('garde la PREMIÈRE de deux lignes homonymes et le dit', () => {
    // Deux lignes contradictoires partiraient et la dernière gagnerait en
    // silence.
    const reading = parseOrgFile(['Nom;Fonction', 'Caroline Jaouen;DSI', 'caroline  JAOUEN;Directrice'].join('\n'))

    expect(reading.rows).toEqual([{ fullName: 'Caroline Jaouen', title: 'DSI' }])
    expect(reading.skipped).toEqual([{ line: 3, reason: 'duplicate' }])
  })

  it('respecte les guillemets autour d’une cellule qui contient le séparateur', () => {
    const reading = parseOrgFile(['Nom,Fonction', '"Doe, Jane","Directrice, SI"'].join('\n'))

    expect(reading.rows).toEqual([{ fullName: 'Doe, Jane', title: 'Directrice, SI' }])
  })

  it('ANNONCE la troncature au lieu de couper en silence', () => {
    const lines = ['Nom', ...Array.from({ length: ORG_FILE_MAX_ROWS + 5 }, (_, i) => `Personne ${i}`)]

    const reading = parseOrgFile(lines.join('\n'))

    expect(reading.rows).toHaveLength(ORG_FILE_MAX_ROWS)
    expect(reading.truncated).toBe(true)
  })

  it('rend un état vide et calme sur un fichier vide', () => {
    expect(parseOrgFile('')).toEqual({ rows: [], recognised: [], ignored: [], skipped: [], truncated: false })
  })
})

describe('#2553.3 — appliquer la date du document lu', () => {
  it('porte la date choisie sur chaque ligne', () => {
    const reading = parseOrgFile(['Nom', 'Jean Dupont', 'Marc Petit'].join('\n'))

    expect(withDocumentDate(reading.rows, '2023-06-01')).toEqual([
      { fullName: 'Jean Dupont', documentDate: '2023-06-01' },
      { fullName: 'Marc Petit', documentDate: '2023-06-01' },
    ])
  })

  it('sans date renseignée, les lignes ne changent pas', () => {
    const reading = parseOrgFile(['Nom', 'Jean Dupont'].join('\n'))

    expect(withDocumentDate(reading.rows, '')).toEqual(reading.rows)
  })
})
