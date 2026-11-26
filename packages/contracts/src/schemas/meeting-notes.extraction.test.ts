import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  MEETING_NOTES_INPUT_KINDS,
  buildMeetingCascade,
  isCitableMeetingInput,
  meetingEvidenceSchema,
  meetingInternalOutputKindSchema,
  meetingRecapSchema,
  meetingSourceSchema,
  type MeetingEvidence,
  type MeetingRecap,
} from './meeting-notes.js'

/**
 * #2319.61-.82 — le compte rendu d'APRÈS : trois entrées de plus, six
 * extractions séparées, et les deux interdits (aucun budget inventé, aucune
 * mission créée) avec leurs libellés prudents.
 */

const HEARD: MeetingEvidence = { kind: 'transcript', excerpt: 'on lance le projet en mars, c’est validé' }
const DICTATED: MeetingEvidence = { kind: 'notes-derived' }
const DECLARED: MeetingEvidence = { kind: 'user-statement' }

function recap(extra: Record<string, unknown> = {}): MeetingRecap {
  return meetingRecapSchema.parse({
    summary: 'Point exploratoire.',
    decisions: [],
    nextSteps: [],
    openQuestions: [],
    signals: [],
    followUpEmail: '',
    recapEvidence: DICTATED,
    ...extra,
  })
}

/** Toutes les clés d'un schéma zod, à toute profondeur. */
function keysOf(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodTypeAny>).flatMap(([key, child]) => [
      key,
      ...keysOf(child),
    ])
  }
  if (schema instanceof z.ZodDefault) return keysOf(schema._def.innerType)
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) return keysOf(schema.unwrap())
  if (schema instanceof z.ZodArray) return keysOf(schema.element)
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return (schema.options as z.ZodTypeAny[]).flatMap(option => keysOf(option))
  }
  return []
}

describe('#2319.61-.63 — les entrées', () => {
  it('connaît quatre natures de texte — notes, transcription, compte rendu importé, e-mail collé', () => {
    expect(MEETING_NOTES_INPUT_KINDS).toEqual(['notes', 'transcript', 'imported_report', 'email'])
  })

  it('un compte rendu importé et un e-mail COLLÉ sont citables ; des notes à la main ne le sont pas', () => {
    expect(isCitableMeetingInput('imported_report')).toBe(true)
    expect(isCitableMeetingInput('email')).toBe(true)
    expect(isCitableMeetingInput('transcript')).toBe(true)
    expect(isCitableMeetingInput('notes')).toBe(false)
  })

  it('les sources lues savent dire « compte rendu importé », « e-mail collé » et « ta déclaration »', () => {
    for (const kind of ['imported_report', 'email', 'user_statement']) {
      expect(meetingSourceSchema.safeParse({ kind }).success, kind).toBe(true)
    }
  })

  it('une déclaration de l’utilisateur a SA propre origine — elle ne se fait pas passer pour une note', () => {
    expect(meetingEvidenceSchema.parse(DECLARED)).toEqual({ kind: 'user-statement' })
  })
})

describe('#2319.64-.74 — six extractions séparées', () => {
  it('un compte rendu d’avant ce lot se relit sans migration : tout vaut « rien de connu »', () => {
    const old = recap()
    expect(old.facts).toEqual([])
    expect(old.requests).toEqual([])
    expect(old.criteria).toEqual([])
    expect(old.dates).toEqual([])
    expect(old.clientCommitments).toEqual([])
    expect(old.userCommitments).toEqual([])
  })

  it('l’engagement du client et celui de l’utilisateur sont deux listes, pas un drapeau', () => {
    const parsed = recap({
      clientCommitments: [{ content: 'Ils envoient le cahier des charges', evidence: HEARD }],
      userCommitments: [{ content: 'Je renvoie deux CV', evidence: DECLARED }],
    })
    expect(parsed.clientCommitments.map(item => item.content)).toEqual(['Ils envoient le cahier des charges'])
    expect(parsed.userCommitments.map(item => item.content)).toEqual(['Je renvoie deux CV'])
  })

  it('une date garde l’échéance TELLE QU’ÉNONCÉE — jamais une date fabriquée', () => {
    const parsed = recap({ dates: [{ label: 'Comité de décision', when: 'fin octobre', evidence: HEARD }] })
    expect(parsed.dates).toEqual([{ label: 'Comité de décision', when: 'fin octobre', evidence: HEARD }])
  })

  it('un objet extrait SANS source n’a pas de forme où loger', () => {
    expect(meetingRecapSchema.safeParse({ ...recap(), facts: [{ content: 'Un fait' }] }).success).toBe(false)
  })
})

describe('#2319.79-.82 — ne pas surqualifier', () => {
  it('une opportunité sans qualification explicite est un « Projet à qualifier »', () => {
    const parsed = recap({ opportunity: { title: 'Migration cloud', evidence: HEARD } })
    expect(parsed.opportunity?.qualification).toBe('to_qualify')
    const card = buildMeetingCascade(parsed).cards.find(item => item.kind === 'opportunity')
    expect(card?.state).toBe('to_qualify')
  })

  it('une opportunité CONFIRMÉE et citée reste un brouillon d’opportunité', () => {
    const parsed = recap({ opportunity: { title: 'Migration cloud', qualification: 'confirmed', evidence: HEARD } })
    expect(buildMeetingCascade(parsed).cards.find(item => item.kind === 'opportunity')?.state).toBe('draft')
  })

  it('la seule déclaration de l’utilisateur ne CONFIRME pas un projet du client', () => {
    const parsed = recap({ opportunity: { title: 'Migration', qualification: 'confirmed', evidence: DECLARED } })
    expect(buildMeetingCascade(parsed).cards.find(item => item.kind === 'opportunity')?.state).toBe('to_qualify')
  })

  it('un besoin sans preuve suffisante est un « Besoin potentiel »', () => {
    const potential = recap({ need: { title: 'Deux développeurs', evidence: DICTATED } })
    expect(potential.need?.qualification).toBe('potential')
    expect(buildMeetingCascade(potential).cards.find(item => item.kind === 'need')?.state).toBe('potential_need')

    const expressed = recap({ need: { title: 'Deux développeurs', qualification: 'expressed', evidence: HEARD } })
    expect(buildMeetingCascade(expressed).cards.find(item => item.kind === 'need')?.state).toBe('draft_go_no_go')
  })

  it('.79 — le compte rendu n’a AUCUN champ budget, à aucune profondeur', () => {
    expect(keysOf(meetingRecapSchema).length).toBeGreaterThan(20)
    expect(keysOf(meetingRecapSchema).filter(key => /budget/i.test(key))).toEqual([])
  })

  it('.79 — un budget glissé par le modèle est retiré à la lecture', () => {
    const parsed = recap({ budget: '500 k€', opportunity: { title: 'Migration', budget: '500 k€', evidence: HEARD } })
    expect(JSON.stringify(parsed)).not.toContain('500 k€')
  })

  it('la garde sait dire NON — un champ budget ajouté serait vu', () => {
    expect(keysOf(z.object({ need: z.object({ budget: z.string() }).nullable() }))).toContain('budget')
  })

  it('.81 — aucune mission ne se crée : ni champ, ni sortie à valider', () => {
    expect(keysOf(meetingRecapSchema).filter(key => /mission/i.test(key))).toEqual([])
    expect(meetingInternalOutputKindSchema.safeParse('mission').success).toBe(false)
    expect(meetingInternalOutputKindSchema.safeParse('need').success).toBe(true)
  })
})

describe('#2103.10 (épopée #2878) — un problème client, distinct d’un besoin', () => {
  it('un compte rendu d’avant ce lot se relit sans migration : `clientIssue` vaut « rien de connu »', () => {
    expect(recap().clientIssue).toBeNull()
  })

  it('devient une carte, DIXIÈME position — aucune position existante ne bouge', () => {
    const parsed = recap({ clientIssue: { title: 'Portail transporteurs instable', evidence: HEARD } })
    const card = buildMeetingCascade(parsed).cards.find(item => item.kind === 'client_issue')
    expect(card?.position).toBe(10)
    expect(card?.state).toBe('to_confirm')
    // Une carte interne : elle rejoint le lot de validation, elle ne part nulle part.
    expect(card?.reachesOutside).toBe(false)
    expect(buildMeetingCascade(parsed).summary.internalWrites).toContainEqual({ kind: 'client_issue', count: 1 })
  })

  it('un problème client SANS source n’a pas de forme où loger', () => {
    expect(meetingRecapSchema.safeParse({ ...recap(), clientIssue: { title: 'Un problème' } }).success).toBe(false)
  })

  it('un besoin ET un problème client peuvent coexister — l’un n’implique pas l’autre', () => {
    const parsed = recap({
      need: { title: 'Deux développeurs', evidence: HEARD },
      clientIssue: { title: 'Portail transporteurs instable', evidence: HEARD },
    })
    const cards = buildMeetingCascade(parsed).cards
    expect(cards.some(card => card.kind === 'need')).toBe(true)
    expect(cards.some(card => card.kind === 'client_issue')).toBe(true)
  })
})
