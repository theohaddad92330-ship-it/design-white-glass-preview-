import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BPCE_COMPTE_COMPLET_CSV } from './data/bpce-compte-complet.generated'
import { ORANGE_CONSULTANTS_CSV } from './data/orange-consultants.generated'
import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { parseDelimitedText, parseCompteCsvRows } from './compte-csv-parser'

describe('parseDelimitedText', () => {
  it('découpe les champs simples séparés par `;`', () => {
    expect(parseDelimitedText('a;b;c\n1;2;3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('lit un champ entre guillemets contenant le séparateur — sait dire NON à un split naïf', () => {
    const naiveSplit = 'a;b;c\n1;"deux ; encore deux";3\n'.split('\n')[1]?.split(';').length
    expect(naiveSplit).toBe(4) // un split naïf casserait ce champ en deux colonnes
    expect(parseDelimitedText('a;b;c\n1;"deux ; encore deux";3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'deux ; encore deux', '3'],
    ])
  })

  it('lit un guillemet échappé (``"" ``) à l’intérieur d’un champ cité', () => {
    expect(parseDelimitedText('a\n"il dit ""bonjour"""\n')).toEqual([['a'], ['il dit "bonjour"']])
  })

  it('lit un retour à la ligne littéral à l’intérieur d’un champ cité', () => {
    expect(parseDelimitedText('a;b\n"ligne 1\nligne 2";x\n')).toEqual([
      ['a', 'b'],
      ['ligne 1\nligne 2', 'x'],
    ])
  })

  it('retire le BOM UTF-8 en tête de fichier', () => {
    expect(parseDelimitedText('﻿a;b\n1;2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseCompteCsvRows', () => {
  it('indexe chaque ligne par en-tête, cellule vide = absente', () => {
    const rows = parseCompteCsvRows('id;bloc;objet\nSG-0001;01_X;Un objet\nSG-0002;01_X;\n')
    expect(rows).toEqual([
      { id: 'SG-0001', bloc: '01_X', objet: 'Un objet' },
      { id: 'SG-0002', bloc: '01_X', objet: undefined },
    ])
  })

  it('lit le fichier source réel sans perdre de ligne (2289 lignes de données attendues)', () => {
    const raw = readFileSync(join(__dirname, 'data/sg-compte-complet.csv'), 'utf-8')
    const rows = parseCompteCsvRows(raw)
    expect(rows).toHaveLength(2289)
    expect(rows[0]?.bloc).toBe('01_LECTURE_STRUCTURELLE')
    expect(new Set(rows.map(row => row.bloc)).size).toBe(17)
  })

  it('le module généré (`data/sg-compte-complet.generated.ts`, lu en production) est identique, octet pour octet, au CSV source — sinon `node scripts/generate-compte-csv-modules.mjs` n’a pas été relancé après une modification du CSV', () => {
    const rawCsv = readFileSync(join(__dirname, 'data/sg-compte-complet.csv'), 'utf-8')
    expect(SG_COMPTE_COMPLET_CSV).toBe(rawCsv)
  })

  it('lit le fichier BPCE réel sans perdre de ligne (1073 lignes, 25 blocs, 53 colonnes) — 30/09/2026', () => {
    const raw = readFileSync(join(__dirname, 'data/bpce-compte-complet.csv'), 'utf-8')
    const rows = parseCompteCsvRows(raw)
    expect(rows).toHaveLength(1073)
    expect(new Set(rows.map(row => row.bloc)).size).toBe(25)
    expect(Object.keys(rows[0] ?? {})).toHaveLength(53)
    expect(BPCE_COMPTE_COMPLET_CSV).toBe(raw)
  })

  it('lit le relevé Orange du Drive « DÉMO CLIENTS » sans perdre de ligne (614 lignes, 13 colonnes) — 12/10/2026', () => {
    const raw = readFileSync(join(__dirname, 'data/orange-consultants.csv'), 'utf-8')
    const rows = parseCompteCsvRows(raw)
    expect(rows).toHaveLength(614)
    expect(Object.keys(rows[0] ?? {})).toHaveLength(13)
    expect(ORANGE_CONSULTANTS_CSV).toBe(raw)
  })

  // #3550.2 (recette 02/10) — la démo SG montrait « Target DSI with a régie proposition; qualify the
  // domain-specific panel/gatekeeper before outreach » : de l'anglais brut dans une carte d'analyse FR.
  it('#3550.2 — la prochaine étape recommandée des deux comptes de démo est rédigée en français', () => {
    for (const csv of [SG_COMPTE_COMPLET_CSV, BPCE_COMPTE_COMPLET_CSV]) {
      expect(csv).not.toMatch(/qualify the domain-specific panel|\bTarget [^;"]+ with an? [^;"]+ proposition/)
    }
  })
})
