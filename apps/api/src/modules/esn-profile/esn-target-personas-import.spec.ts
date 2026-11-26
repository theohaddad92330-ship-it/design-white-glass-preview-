import { parseTargetPersonasCells, parseTargetPersonasCsv } from './esn-target-personas-import'

// #3754.1 — import csv/xlsx des postes cibles : alias tolérants, lignes invalides nommées.
describe('parseTargetPersonasCsv', () => {
  it('lit un csv `;` avec BOM UTF-8 (export Excel FR)', () => {
    const csv = '﻿Catégorie;Intitulé;Niveau décideur\nDirection IT;CTO;1\nData;Directeur Data;2\n'
    const res = parseTargetPersonasCsv(csv)
    expect(res.missingColumns).toEqual([])
    expect(res.rejected).toEqual([])
    expect(res.personas).toEqual([
      { category: 'Direction IT', title: 'CTO', level: 1 },
      { category: 'Data', title: 'Directeur Data', level: 2 },
    ])
  })

  it('lit un csv `,` et des en-têtes EN', () => {
    const res = parseTargetPersonasCsv('Category,Job title,Decision level\nIT,CIO,1\nIT,Tech Lead,4\n')
    expect(res.personas.map(p => [p.title, p.level])).toEqual([
      ['CIO', 1],
      ['Tech Lead', 4],
    ])
  })

  it('tolère « N2 », « niveau 3 », « 1 - signataire »', () => {
    const res = parseTargetPersonasCsv('intitule;niveau\nA;N2\nB;niveau 3\nC;1 - signataire\n')
    expect(res.personas.map(p => p.level)).toEqual([2, 3, 1])
  })

  it('nomme les lignes invalides, sans rien inventer', () => {
    const res = parseTargetPersonasCsv('intitule;niveau\nA;1\nB;\nC;9\n;2\nD;2\n')
    expect(res.personas.map(p => p.title)).toEqual(['A', 'D'])
    expect(res.rejected).toEqual([
      { line: 3, reason: 'level_missing' },
      { line: 4, reason: 'level_invalid', value: '9' },
      { line: 5, reason: 'title_missing' },
    ])
  })

  it('sans catégorie → category null', () => {
    const res = parseTargetPersonasCsv('intitule;niveau\nCTO;1\n')
    expect(res.personas[0]).toEqual({ category: null, title: 'CTO', level: 1 })
  })

  it('colonne obligatoire absente → fichier refusé, colonnes nommées', () => {
    const res = parseTargetPersonasCsv('categorie;poste\nIT;CTO\n')
    expect(res.missingColumns).toEqual(['level'])
    expect(res.personas).toEqual([])
  })

  it('un fichier vide ne produit rien', () => {
    expect(parseTargetPersonasCsv('').personas).toEqual([])
  })
})

// #4426.5 — le fichier réel du pack client : séparateur `;`, BOM, en-têtes à underscores.
describe('#4426.5 — en-têtes normalisés (BOM, casse, accents, underscore)', () => {
  const REAL =
    '\uFEFFCategorie;Intitule_Poste;Source;Niveau_Decideur\n' +
    'Direction IT;Directeur des systèmes d’information;Client;Niveau 1 - Acheteur Final / Signataire\n' +
    'Achats;Responsable achats IT;Client;Niveau 2 - Prescripteur\n'

  it('lit « Intitule_Poste » et « Niveau_Decideur » : le niveau se range par son chiffre', () => {
    const res = parseTargetPersonasCsv(REAL)
    expect(res.missingColumns).toEqual([])
    expect(res.personas).toEqual([
      { category: 'Direction IT', title: 'Directeur des systèmes d’information', level: 1 },
      { category: 'Achats', title: 'Responsable achats IT', level: 2 },
    ])
  })

  it.each([
    ['poste', 'niveau'],
    ['Titre', 'Séniorité'],
    ['FONCTION', 'niveau-decideur'],
    ['intitule-poste', 'Niveau Décideur'],
  ])('synonymes « %s » / « %s »', (title, level) => {
    const res = parseTargetPersonasCsv(`${title};${level}\nCTO;1\n`)
    expect(res.missingColumns).toEqual([])
    expect(res.personas).toHaveLength(1)
  })

  it('sait dire NON : un niveau hors échelle est écarté et nommé, jamais deviné', () => {
    const res = parseTargetPersonasCsv(
      'Intitule_Poste;Niveau_Decideur\nA;Niveau 1 - Signataire\nB;Stratégique\nC;Niveau 7\n',
    )
    expect(res.personas.map(p => p.title)).toEqual(['A'])
    expect(res.rejected).toEqual([
      { line: 3, reason: 'level_invalid', value: 'Stratégique' },
      { line: 4, reason: 'level_invalid', value: 'Niveau 7' },
    ])
  })
})

describe('parseTargetPersonasCells (xlsx)', () => {
  it('première ligne = en-tête, mêmes règles que le csv', () => {
    const res = parseTargetPersonasCells([
      ['Catégorie', 'Intitulé', 'Niveau décideur'],
      ['IT', 'CTO', '1'],
      ['IT', 'Dev', ''],
    ])
    expect(res.personas).toEqual([{ category: 'IT', title: 'CTO', level: 1 }])
    expect(res.rejected).toEqual([{ line: 3, reason: 'level_missing' }])
  })
})
