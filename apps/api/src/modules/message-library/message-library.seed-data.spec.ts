import { messageLibraryEntrySchema } from '@bellum/contracts'
import {
  ALL_IMPORTED_SEQUENCES,
  SEQUENCE_3437,
  SEQUENCE_3438,
  SEQUENCE_3439,
  SEQUENCE_3440,
  BEHAVIOR_EXAMPLES_3443,
} from './message-library.seed-data'

describe('message-library seed data — #3437-#3440', () => {
  it('imports nine messages for the three complete sequences, twelve for #3440', () => {
    expect(SEQUENCE_3437).toHaveLength(9)
    expect(SEQUENCE_3438).toHaveLength(9)
    expect(SEQUENCE_3439).toHaveLength(9)
    expect(SEQUENCE_3440).toHaveLength(12)
  })

  it('every slug is unique', () => {
    const slugs = ALL_IMPORTED_SEQUENCES.map(entry => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('validates against the contracts schema once given an id', () => {
    for (const entry of ALL_IMPORTED_SEQUENCES) {
      const result = messageLibraryEntrySchema.safeParse({ id: entry.slug, ...entry })
      if (!result.success) throw new Error(`${entry.slug}: ${JSON.stringify(result.error.issues)}`)
      expect(result.success).toBe(true)
    }
  })

  it('expectedVariables always mirrors the {{…}} placeholders actually present in the text', () => {
    for (const entry of ALL_IMPORTED_SEQUENCES) {
      const placeholders = new Set([...entry.text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]))
      expect(new Set(entry.expectedVariables)).toEqual(placeholders)
    }
  })

  it('#3439 (recommandation) is entirely a_revoir — the referral preconditions are never pre-verified at import', () => {
    for (const entry of SEQUENCE_3439) {
      expect(entry.status).toBe('a_revoir')
      expect(entry.mandatoryFacts).toEqual([
        'identité du référent',
        'accord ou contexte permettant de citer son nom',
        'relation documentée',
        'périmètre confirmé',
      ])
    }
  })

  it('flags the one truncated #3437 message as a_revoir with its reason, never inventing an ending', () => {
    const truncated = SEQUENCE_3437.find(entry => entry.slug === 'c19-3437-m3-operationnel')
    expect(truncated?.status).toBe('a_revoir')
    expect(truncated?.usageConstraints[0]).toContain('tronqué')
    expect(truncated?.text.endsWith('un raccourci que')).toBe(true)
  })

  it('#3440 — M3-Opérationnel est au semis, rédigé (sans chiffre) et a_revoir : Laura ne le sert pas avant relecture', () => {
    const entry = SEQUENCE_3440.find(e => e.slug === 'x80-3440-m3-operationnel')
    expect(entry?.persona).toBe('operationnel')
    expect(entry?.status).toBe('a_revoir')
    expect(entry?.claims).toHaveLength(0)
    expect(entry?.text).not.toMatch(/\d/)
  })

  it('gates every entry carrying an unverified numeric/result claim to a_revoir', () => {
    for (const entry of ALL_IMPORTED_SEQUENCES) {
      if (entry.claims.length > 0) expect(entry.status).toBe('a_revoir')
    }
  })

  it('every entry is mode verbatim (category 1 — modèles approuvés)', () => {
    expect(ALL_IMPORTED_SEQUENCES.every(entry => entry.mode === 'verbatim')).toBe(true)
  })

  it('#3443 — le dialogue d’appel à froid est un EXEMPLE DE COMPORTEMENT, jamais un modèle verbatim', () => {
    expect(BEHAVIOR_EXAMPLES_3443).toHaveLength(1)
    const [dialogue] = BEHAVIOR_EXAMPLES_3443
    expect(dialogue).toMatchObject({
      mode: 'inspiration',
      status: 'approuve',
      channel: 'call_brief',
      scenarioId: 'cold_approach',
    })
    expect(dialogue?.usageConstraints.join(' ')).toContain('pas à réciter')
    // Le corps est celui de l’issue : cinq refus/ouvertures du prospect, repris tels quels.
    expect(dialogue?.text).toContain('On passe surtout par nos partenaires référencés.')
    expect(dialogue?.text).toContain('Quel est le meilleur email pour cela ?')
    // « nos références comparables » : affirmation nommée, non vérifiée.
    expect(dialogue?.claims.map(c => c.verifiedFactId)).toEqual([null])
    expect(messageLibraryEntrySchema.safeParse({ id: dialogue?.slug, ...dialogue }).success).toBe(true)
  })

  it('#3437/#3438/#3440 — chaque message de séquence porte son étape, une seule par (scénario, persona, étape)', () => {
    const seen = new Set<string>()
    for (const entry of ALL_IMPORTED_SEQUENCES) {
      expect(entry.step).toBeTruthy()
      const key = `${entry.scenarioId}|${entry.persona}|${entry.step}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('l’étape suit le titre : « Invitation — … note d’invitation » est l’invitation, « M2 — … » est M2', () => {
    const byTitle = (needle: string) => ALL_IMPORTED_SEQUENCES.find(e => e.title.includes(needle))
    expect(byTitle('note d’invitation')?.step).toBe('invitation')
    expect(byTitle('après acceptation')?.step).toBe('M1')
    expect(ALL_IMPORTED_SEQUENCES.filter(e => e.title.startsWith('M3 — ')).every(e => e.step === 'M3')).toBe(true)
  })

  // #3440 (recette prod 03/10) — « M1 — Décideur — note d'invitation » : l'étape affichée à Laura
  // (le titre) disait M1 pour ce qui est l'invitation. Le titre porte désormais la vraie étape.
  it('#3440 — le titre d’une note d’invitation dit INVITATION, jamais M1', () => {
    const notes = ALL_IMPORTED_SEQUENCES.filter(e => e.step === 'invitation')
    expect(notes.length).toBeGreaterThanOrEqual(3)
    for (const note of notes) {
      expect(note.title.startsWith('Invitation — ')).toBe(true)
      expect(note.title.startsWith('M1')).toBe(false)
    }
  })

  it('⚠️ SAIT DIRE NON — « après acceptation » reste M1 : le titre ne mélange pas les deux étapes', () => {
    const afterAcceptance = ALL_IMPORTED_SEQUENCES.filter(e => e.title.includes('après acceptation'))
    expect(afterAcceptance.length).toBeGreaterThanOrEqual(3)
    expect(afterAcceptance.every(e => e.step === 'M1' && e.title.startsWith('M1 — '))).toBe(true)
  })

  it('un exemple de comportement n’a pas d’étape, jamais devinée', () => {
    expect(BEHAVIOR_EXAMPLES_3443.every(e => e.step == null)).toBe(true)
  })
})
