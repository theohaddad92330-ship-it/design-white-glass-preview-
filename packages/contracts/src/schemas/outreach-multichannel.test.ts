import { describe, expect, it } from 'vitest'
import {
  OUTREACH_CALL_OUTCOMES,
  OUTREACH_DELAY_UNITS,
  OUTREACH_LINKEDIN_INVITE_OUTCOMES,
  OUTREACH_RECENT_CONTACT_DAYS,
  addBusinessDays,
  blockingEnrollmentExclusions,
  businessDaysBetween,
  parseStepVariables,
  resolveStepVariables,
  computeSequenceStepStats,
  dueAtForDelay,
  evaluateEnrollmentExclusions,
  linkedinGateFor,
  linkedinStepsToSkip,
  shiftDueAfterPause,
} from './outreach-multichannel.js'
import { OUTREACH_STEP_REACH, outreachStepKindSchema, outreachStepExecution } from './outreach-sequence.js'

const utc = (iso: string): Date => new Date(`${iso}T07:00:00Z`)

describe('Lot L-B — vrais canaux d’étape', () => {
  it('ajoute LinkedIn (invitation, message) et appel EN FIN, sans rien retirer', () => {
    expect(outreachStepKindSchema.options).toEqual([
      'email',
      'reminder',
      'task',
      'linkedin_invite',
      'linkedin_message',
      'call',
    ])
  })

  it('LinkedIn et appel restent MANUELS : aucun côté « externe » qui partirait seul', () => {
    for (const kind of ['linkedin_invite', 'linkedin_message', 'call'] as const) {
      expect(OUTREACH_STEP_REACH[kind]).toBe('internal')
    }
    expect(outreachStepExecution('email')).toBe('awaits_validation')
  })

  it('déclare les issues manuelles', () => {
    expect([...OUTREACH_LINKEDIN_INVITE_OUTCOMES]).toEqual(['accepted', 'pending'])
    expect([...OUTREACH_CALL_OUTCOMES]).toEqual(['reached', 'voicemail', 'no_answer'])
    expect([...OUTREACH_DELAY_UNITS]).toEqual(['business_days', 'calendar_days'])
  })
})

describe('Lot L-B — jours ouvrés', () => {
  it('saute le week-end : vendredi + 1 jour ouvré = lundi', () => {
    expect(addBusinessDays(utc('2026-10-16'), 1).toISOString()).toBe('2026-10-19T07:00:00.000Z')
  })

  it('jeudi + 3 jours ouvrés = mardi suivant', () => {
    expect(addBusinessDays(utc('2026-10-15'), 3).toISOString()).toBe('2026-10-20T07:00:00.000Z')
  })

  it('zéro jour ouvré un samedi glisse au lundi, zéro un mardi ne bouge pas', () => {
    expect(addBusinessDays(utc('2026-10-17'), 0).toISOString()).toBe('2026-10-19T07:00:00.000Z')
    expect(addBusinessDays(utc('2026-10-13'), 0).toISOString()).toBe('2026-10-13T07:00:00.000Z')
  })

  it('dix jours ouvrés = deux semaines pile', () => {
    expect(addBusinessDays(utc('2026-10-14'), 10).toISOString()).toBe('2026-10-28T07:00:00.000Z')
  })

  it('un délai en jours calendaires reste en jours calendaires (aucun changement silencieux)', () => {
    expect(dueAtForDelay(utc('2026-10-14'), 4, 'calendar_days').toISOString()).toBe('2026-10-18T07:00:00.000Z')
    expect(dueAtForDelay(utc('2026-10-14'), 4, 'business_days').toISOString()).toBe('2026-10-20T07:00:00.000Z')
  })
})

describe('Lot L-B — saut si invitation LinkedIn non acceptée', () => {
  const now = new Date('2026-10-20T08:00:00Z')
  const step = (
    position: number,
    kind: 'linkedin_invite' | 'linkedin_message' | 'email',
    over: Partial<{ status: 'pending' | 'done' | 'skipped'; due_at: string; outcome: string }> = {},
  ) => ({
    id: `s${position}`,
    position,
    kind,
    status: over.status ?? 'pending',
    due_at: over.due_at ?? '2026-10-19T07:00:00.000Z',
    payload: over.outcome ? { outcome: over.outcome } : {},
  })

  it('un message qui suit une invitation non acceptée est « en attente d’acceptation »', () => {
    const steps = [step(0, 'linkedin_invite', { status: 'done', outcome: 'pending' }), step(1, 'linkedin_message')]
    expect(linkedinGateFor(steps, steps[1]!)).toBe('awaiting_acceptance')
  })

  it('une invitation acceptée lève la porte', () => {
    const steps = [step(0, 'linkedin_invite', { status: 'done', outcome: 'accepted' }), step(1, 'linkedin_message')]
    expect(linkedinGateFor(steps, steps[1]!)).toBe('accepted')
    expect(linkedinStepsToSkip(steps, now)).toEqual([])
  })

  it('une invitation sans issue déclarée compte comme non acceptée', () => {
    const steps = [step(0, 'linkedin_invite', { status: 'done' }), step(1, 'linkedin_message')]
    expect(linkedinGateFor(steps, steps[1]!)).toBe('awaiting_acceptance')
  })

  it('sans invitation avant lui, un message LinkedIn n’est jamais retenu', () => {
    const steps = [step(0, 'email'), step(1, 'linkedin_message')]
    expect(linkedinGateFor(steps, steps[1]!)).toBeNull()
    expect(linkedinStepsToSkip(steps, now)).toEqual([])
  })

  it('saute SEULEMENT à l’échéance : avant, il attend', () => {
    const steps = [
      step(0, 'linkedin_invite', { status: 'done', outcome: 'pending' }),
      step(1, 'linkedin_message', { due_at: '2026-10-22T07:00:00.000Z' }),
    ]
    expect(linkedinStepsToSkip(steps, now)).toEqual([])
    expect(linkedinStepsToSkip(steps, new Date('2026-10-22T07:00:00Z'))).toEqual(['s1'])
  })

  it('ne touche ni une étape déjà faite ni une autre nature : séquence linéaire, pas de branche', () => {
    const steps = [
      step(0, 'linkedin_invite', { status: 'done', outcome: 'pending' }),
      step(1, 'linkedin_message', { status: 'done' }),
      step(2, 'email'),
    ]
    expect(linkedinStepsToSkip(steps, now)).toEqual([])
  })
})

describe('Lot L-B — exclusions à l’inscription', () => {
  const now = new Date('2026-10-14T08:00:00Z')
  const base = { hasActiveSequence: false, lastSentAt: null, erased: false, alreadyClient: null, now }

  it('ne retient rien quand rien ne s’oppose', () => {
    expect(evaluateEnrollmentExclusions(base)).toEqual([])
  })

  it('nomme chaque raison, avec son caractère forçable', () => {
    const out = evaluateEnrollmentExclusions({
      ...base,
      hasActiveSequence: true,
      lastSentAt: new Date('2026-10-01T08:00:00Z'),
      erased: true,
      alreadyClient: true,
    })
    expect(out.map(e => [e.code, e.forceable])).toEqual([
      ['active_sequence', true],
      ['recently_contacted', true],
      ['rgpd_opposition', false],
      ['already_client', true],
    ])
  })

  it(`« contacté » = envoyé il y a moins de ${OUTREACH_RECENT_CONTACT_DAYS} jours (30 pile est libre)`, () => {
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000)
    expect(evaluateEnrollmentExclusions({ ...base, lastSentAt: at(29) }).map(e => e.code)).toEqual([
      'recently_contacted',
    ])
    expect(evaluateEnrollmentExclusions({ ...base, lastSentAt: at(30) })).toEqual([])
  })

  it('compte client inconnu (null) n’exclut pas : on ne devine pas', () => {
    expect(evaluateEnrollmentExclusions({ ...base, alreadyClient: null })).toEqual([])
    expect(evaluateEnrollmentExclusions({ ...base, alreadyClient: false })).toEqual([])
  })

  it('forcer lève les exclusions forçables, jamais le RGPD', () => {
    const all = evaluateEnrollmentExclusions({ ...base, hasActiveSequence: true, alreadyClient: true })
    expect(blockingEnrollmentExclusions(all, true)).toEqual([])
    expect(blockingEnrollmentExclusions(all, false).map(e => e.code)).toEqual(['active_sequence', 'already_client'])
    const rgpd = evaluateEnrollmentExclusions({ ...base, erased: true })
    expect(blockingEnrollmentExclusions(rgpd, true).map(e => e.code)).toEqual(['rgpd_opposition'])
  })
})

describe('Lot L-B — pause vacances', () => {
  const pausedAt = new Date('2026-10-14T07:00:00Z')
  const resumedAt = new Date('2026-10-28T07:00:00Z')

  it('décale l’échéance restante de la durée de la pause', () => {
    const due = new Date('2026-11-02T07:00:00Z')
    expect(shiftDueAfterPause(due, pausedAt, resumedAt, 'calendar_days').toISOString()).toBe('2026-11-16T07:00:00.000Z')
  })

  it('en jours ouvrés, une échéance décalée sur un week-end glisse au lundi', () => {
    const due = new Date('2026-10-23T07:00:00Z') // vendredi + 14 j = vendredi 6/11 : OK
    expect(shiftDueAfterPause(due, pausedAt, resumedAt, 'business_days').toISOString()).toBe('2026-11-06T07:00:00.000Z')
    const sat = new Date('2026-10-17T07:00:00Z') // samedi (calendaire) + 14 = samedi
    expect(shiftDueAfterPause(sat, pausedAt, resumedAt, 'business_days').toISOString()).toBe('2026-11-02T07:00:00.000Z')
  })

  it('une étape déjà en retard à la pause repart à la reprise, pas avant', () => {
    const overdue = new Date('2026-10-10T07:00:00Z')
    expect(shiftDueAfterPause(overdue, pausedAt, resumedAt, 'calendar_days').toISOString()).toBe(
      resumedAt.toISOString(),
    )
  })

  it('une pause de durée nulle ou négative ne décale rien', () => {
    const due = new Date('2026-11-02T07:00:00Z')
    expect(shiftDueAfterPause(due, resumedAt, pausedAt, 'calendar_days').toISOString()).toBe(due.toISOString())
  })
})

describe('Lot L-B — stats par étape', () => {
  const seq = (
    steps: { position: number; kind: 'email' | 'call'; status: 'pending' | 'done' | 'skipped' }[],
    over: { contact_replied?: boolean; cancel_reason?: string | null } = {},
  ) => ({ steps, contact_replied: over.contact_replied ?? false, cancel_reason: over.cancel_reason ?? null })

  it('compte préparé · fait · répondu · RDV par position', () => {
    const rows = computeSequenceStepStats([
      seq(
        [
          { position: 0, kind: 'email', status: 'done' },
          { position: 1, kind: 'call', status: 'done' },
        ],
        { contact_replied: true },
      ),
      seq(
        [
          { position: 0, kind: 'email', status: 'done' },
          { position: 1, kind: 'call', status: 'pending' },
        ],
        { contact_replied: true, cancel_reason: 'meeting_booked' },
      ),
    ])
    expect(rows).toEqual([
      { position: 0, kind: 'email', prepared: 2, done: 2, replied: 1, meeting: 1 },
      { position: 1, kind: 'call', prepared: 2, done: 1, replied: 1, meeting: 0 },
    ])
  })

  it('une réponse est attribuée à la DERNIÈRE étape faite, pas à toutes', () => {
    const rows = computeSequenceStepStats([
      seq(
        [
          { position: 0, kind: 'email', status: 'done' },
          { position: 1, kind: 'email', status: 'done' },
        ],
        { contact_replied: true },
      ),
    ])
    expect(rows.map(r => r.replied)).toEqual([0, 1])
  })

  it('rien de fait à une position : réponses et RDV sont « non mesurés » (null), jamais 0', () => {
    const rows = computeSequenceStepStats([seq([{ position: 0, kind: 'email', status: 'pending' }])])
    expect(rows).toEqual([{ position: 0, kind: 'email', prepared: 1, done: 0, replied: null, meeting: null }])
  })

  it('une étape sautée n’est pas « préparée » ; une position entièrement sautée est « — » partout', () => {
    const rows = computeSequenceStepStats([seq([{ position: 0, kind: 'email', status: 'skipped' }])])
    expect(rows).toEqual([{ position: 0, kind: 'email', prepared: null, done: null, replied: null, meeting: null }])
  })

  it('aucune séquence : aucune ligne', () => {
    expect(computeSequenceStepStats([])).toEqual([])
  })
})

describe('Lot L-B — variables avec valeur de repli', () => {
  it('lit {{nom}} et {{nom|repli}}', () => {
    expect(parseStepVariables('Bonjour {{prenom|à vous}}, chez {{entreprise}} ?')).toEqual([
      { name: 'prenom', fallback: 'à vous' },
      { name: 'entreprise', fallback: null },
    ])
  })

  it('une variable n’est listée qu’une fois, la première définition de repli gagne', () => {
    expect(parseStepVariables('{{prenom}} puis {{prenom|ami}}')).toEqual([{ name: 'prenom', fallback: null }])
  })

  it('remplace par la valeur, sinon par le repli, sinon signale la variable VIDE', () => {
    const out = resolveStepVariables('Bonjour {{prenom|à vous}} de {{entreprise}}', { prenom: '', entreprise: 'EDF' })
    expect(out.text).toBe('Bonjour à vous de EDF')
    expect(out.usedFallback).toEqual(['prenom'])
    expect(out.empty).toEqual([])
    const empty = resolveStepVariables('Bonjour {{prenom}}', { prenom: null })
    expect(empty.empty).toEqual(['prenom'])
    // jamais un {{prenom}} littéral dans le texte rendu
    expect(empty.text).toBe('Bonjour ')
  })

  it('espaces ignorés autour du nom ; valeur d’espaces = vide', () => {
    expect(resolveStepVariables('{{ prenom }}', { prenom: '   ' }).empty).toEqual(['prenom'])
  })

  it('un texte sans variable ne produit rien', () => {
    expect(resolveStepVariables('Bonjour', {})).toEqual({ text: 'Bonjour', empty: [], usedFallback: [] })
  })
})

describe('Lot L-B — délai affiché', () => {
  it('compte les jours ouvrés entre deux dates (pour afficher « J+3 ouvrés »)', () => {
    expect(businessDaysBetween(utc('2026-10-14'), utc('2026-10-19'))).toBe(3)
    expect(businessDaysBetween(utc('2026-10-14'), utc('2026-10-14'))).toBe(0)
    expect(businessDaysBetween(utc('2026-10-17'), utc('2026-10-19'))).toBe(0)
  })
})
