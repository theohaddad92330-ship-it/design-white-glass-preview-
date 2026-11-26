import { describe, expect, it } from 'vitest'
import {
  importConsultantsCsvSchema,
  summariseConsultantCsvImport,
  type ConsultantCsvImportOutcome,
} from './consultant-csv-import.js'

describe('#2183.5 — le contrat de l’import CSV de consultants', () => {
  it('borne le contenu envoyé — un fichier collé par erreur est refusé proprement', () => {
    expect(importConsultantsCsvSchema.safeParse({ content: 'a,b\n1,2' }).success).toBe(true)
    expect(importConsultantsCsvSchema.safeParse({ content: '' }).success).toBe(false)
    expect(importConsultantsCsvSchema.safeParse({}).success).toBe(false)
  })

  it('compte chaque issue, même à zéro — un total qui ne les nomme pas se lit faux', () => {
    const outcomes: ConsultantCsvImportOutcome[] = [
      { status: 'created', line: 2, consultantId: 'c1' },
      { status: 'duplicate', line: 3, matched: ['Claire Vasseur'] },
      { status: 'skipped', line: 4, reason: 'no_identity' },
    ]
    expect(summariseConsultantCsvImport(outcomes)).toEqual({ created: 1, duplicate: 1, skipped: 1, erased: 0 })
  })

  // #3781.1 (lot K11, 07/10) — la garde « personne effacée » couvrait le dépôt de
  // CV et la création manuelle, jamais l'import CSV : une ligne reproduisant
  // l'identité d'une personne effacée (RGPD art. 17) ARRÊTE la ligne, comme un
  // doublon, plutôt que de recréer la fiche.
  it('une ligne qui reproduit une personne effacée compte à part — ni créée, ni confondue avec un doublon', () => {
    const outcomes: ConsultantCsvImportOutcome[] = [
      { status: 'created', line: 2, consultantId: 'c1' },
      { status: 'erased', line: 5 },
    ]
    expect(summariseConsultantCsvImport(outcomes)).toEqual({ created: 1, duplicate: 0, skipped: 0, erased: 1 })
  })
})
