import { describe, expect, it } from 'vitest'
import {
  deriveOutreachDisplayStatus,
  OUTREACH_SEQUENCE_MAX_STEPS,
  OUTREACH_SEQUENCE_TEMPLATES,
  createOutreachSequenceRequestSchema,
  createOutreachStepInputSchema,
  updateOutreachStepInputSchema,
  outreachSequenceSchema,
  outreachSequenceStepSchema,
  outreachDisplayStatusSchema,
  outreachMessageSpacingProblems,
  outreachMessageCount,
  outreachChannelForbidden,
  outreachTemplateSpan,
  OUTREACH_MIN_DAYS_BETWEEN_MESSAGES,
} from './outreach-sequence.js'
import { OUTREACH_SCENARIOS, minDelayBeforeStep } from './outreach-scenarios.js'

const validStep = {
  id: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  sequence_id: 'b4cc289e-8bf9-3888-9912-ace4e6543003',
  position: 0,
  due_at: '2026-07-16T08:00:00.000Z',
  kind: 'email' as const,
  payload: { label: 'Email préparé (J0)', draft_available: true },
  status: 'pending' as const,
  done_at: null,
  engagement_signal: null,
  engagement_signal_at: null,
}

const validSequence = {
  id: 'c5dd389e-8bf9-3888-9912-ace4e6543004',
  contact_id: 'd6ee489e-8bf9-3888-9912-ace4e6543005',
  contact_name: 'Jean Dupont',
  name: 'Prospection — 3 touches',
  status: 'active' as const,
  created_at: '2026-07-16T07:59:00.000Z',
  steps: [validStep],
  next_step: validStep,
  contact_replied: false,
  // La capacité d'envoi RÉELLE, résolue par le serveur (lot D du Recovery Pack).
  // Elle n'a pas de défaut : un appelant qui l'oublie doit être refusé par le
  // compilateur plutôt que d'hériter d'un « true » qui promettrait un envoi.
  can_send: true,
}

describe('outreach-sequence contracts', () => {
  it('parses a valid step and sequence', () => {
    expect(outreachSequenceStepSchema.parse(validStep)).toEqual(validStep)
    expect(outreachSequenceSchema.parse(validSequence)).toMatchObject(validSequence)
  })

  it('#1515 — une réponse d’une API PLUS ANCIENNE que l’app rend null, jamais undefined', () => {
    // L'app et l'API se déploient séparément. Un navigateur qui reçoit une
    // charge utile sans `contact_role` / `account_id` / `account_name` doit
    // obtenir trois `null` — et NON voir la ligne entière refusée par le
    // parsing. Un champ qui change de forme ne dégrade pas : il casse.
    const parsed = outreachSequenceSchema.parse(validSequence)
    expect(parsed.contact_role).toBeNull()
    expect(parsed.account_id).toBeNull()
    expect(parsed.account_name).toBeNull()
  })

  it('#1510 — ce qu’un gabarit promet est DÉRIVÉ de ses étapes, jamais recopié', () => {
    // « 4 touches · 18 jours · e-mail » — les trois se lisent dans la table.
    // Les écrire à côté d'elle serait deux vérités sur la même cadence.
    expect(outreachTemplateSpan('cold_email')).toEqual({ stepCount: 4, spanDays: 18, kinds: ['email'] })
    // Les natures sont SANS DOUBLON et dans l'ordre du gabarit : « tâche ·
    // rappel » et non « tâche · tâche · rappel · rappel ».
    expect(outreachTemplateSpan('cold_linkedin')).toEqual({ stepCount: 4, spanDays: 12, kinds: ['task', 'reminder'] })
    // Une cadence dont tout tombe à J0 aurait une durée de zéro, pas « une
    // journée » : le nombre est la distance, pas un compte de jours.
    expect(outreachTemplateSpan('fresh_signal').spanDays).toBe(7)
  })

  it('rejects an unknown step kind or status', () => {
    expect(outreachSequenceStepSchema.safeParse({ ...validStep, kind: 'sms' }).success).toBe(false)
    expect(outreachSequenceStepSchema.safeParse({ ...validStep, status: 'running' }).success).toBe(false)
    expect(outreachSequenceSchema.safeParse({ ...validSequence, status: 'archived' }).success).toBe(false)
  })

  it('requires every custom step to be dated (offset_days or due_at)', () => {
    expect(createOutreachStepInputSchema.safeParse({ kind: 'reminder' }).success).toBe(false)
    expect(createOutreachStepInputSchema.safeParse({ kind: 'reminder', offset_days: 4 }).success).toBe(true)
    expect(createOutreachStepInputSchema.safeParse({ kind: 'task', due_at: '2026-07-20T08:00:00.000Z' }).success).toBe(
      true,
    )
  })

  it('#2202.33 — objectif est un champ distinct de note, sur la création comme sur la retouche', () => {
    const created = createOutreachStepInputSchema.safeParse({
      kind: 'email',
      offset_days: 0,
      note: 'A déjà eu un point avec le CTO en mars.',
      objective: 'Obtenir un accord de principe pour un point de 20 min.',
    })
    expect(created.success).toBe(true)
    if (created.success) {
      expect(created.data.note).toBe('A déjà eu un point avec le CTO en mars.')
      expect(created.data.objective).toBe('Obtenir un accord de principe pour un point de 20 min.')
    }

    // Objectif seul suffit à justifier une retouche — ni libellé ni note ne
    // sont un préalable pour poser ce que l'étape cherche à obtenir.
    const updated = updateOutreachStepInputSchema.safeParse({
      objective: 'Qualifier le besoin avant la relance suivante.',
    })
    expect(updated.success).toBe(true)
  })

  it('accepts a create request with a template, or with custom steps — never both, never neither', () => {
    const contactId = 'd6ee489e-8bf9-3888-9912-ace4e6543005'
    expect(
      createOutreachSequenceRequestSchema.safeParse({ contact_id: contactId, template: 'prospection_3_touches' })
        .success,
    ).toBe(true)
    expect(
      createOutreachSequenceRequestSchema.safeParse({
        contact_id: contactId,
        steps: [{ kind: 'email', offset_days: 0 }],
      }).success,
    ).toBe(true)
    expect(createOutreachSequenceRequestSchema.safeParse({ contact_id: contactId }).success).toBe(false)
    expect(
      createOutreachSequenceRequestSchema.safeParse({
        contact_id: contactId,
        template: 'prospection_3_touches',
        steps: [{ kind: 'email', offset_days: 0 }],
      }).success,
    ).toBe(false)
  })

  it('caps custom steps at OUTREACH_SEQUENCE_MAX_STEPS', () => {
    const steps = Array.from({ length: OUTREACH_SEQUENCE_MAX_STEPS + 1 }, (_, i) => ({
      kind: 'reminder' as const,
      offset_days: i,
    }))
    expect(
      createOutreachSequenceRequestSchema.safeParse({
        contact_id: 'd6ee489e-8bf9-3888-9912-ace4e6543005',
        steps,
      }).success,
    ).toBe(false)
  })

  it('ships a well-formed default template (J0 email → J+4 rappel → J+10 relance, offsets croissants)', () => {
    const template = OUTREACH_SEQUENCE_TEMPLATES.prospection_3_touches
    expect(template.steps.map(s => s.offset_days)).toEqual([0, 4, 10])
    expect(template.steps.map(s => s.kind)).toEqual(['email', 'reminder', 'email'])
    for (const step of template.steps) {
      expect(step.label.length).toBeGreaterThan(0)
    }
    // Chaque template reste dans la borne du create custom.
    for (const tpl of Object.values(OUTREACH_SEQUENCE_TEMPLATES)) {
      expect(tpl.steps.length).toBeLessThanOrEqual(OUTREACH_SEQUENCE_MAX_STEPS)
      const offsets = tpl.steps.map(s => s.offset_days)
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
    }
  })
})

/**
 * Le statut d'AFFICHAGE d'une séquence (addendum final p56).
 *
 * Le badge disait « Active » sur une séquence dont la prochaine étape était un
 * e-mail que personne ne pouvait envoyer. Ces tests décrivent la seule question
 * qui compte : ce que l'utilisateur lit correspond-il à ce qui va réellement
 * se passer ?
 */
describe('statut d’affichage dérivé', () => {
  const future = new Date('2026-09-10T09:00:00.000Z').toISOString()
  const past = new Date('2026-08-01T09:00:00.000Z').toISOString()
  const now = new Date('2026-09-01T09:00:00.000Z')

  it('dit « en attente de connexion » quand la prochaine étape est un e-mail sans messagerie', () => {
    // Le cas exact de la capture : « Active » sur une séquence que rien ne peut
    // faire avancer. Le dire AVANT l'échéance évite la découverte au pire moment.
    expect(
      deriveOutreachDisplayStatus({
        status: 'active',
        nextStep: { due_at: future, kind: 'email' },
        canSend: false,
        now,
      }),
    ).toBe('awaiting_connection')
  })

  it('considère l’absence d’information sur l’envoi comme un « non »', () => {
    // Pire cas honnête : un appelant qui oublie `canSend` affiche un état
    // visible et corrigeable, pas un « active » qui ne l'est pas.
    expect(deriveOutreachDisplayStatus({ status: 'active', nextStep: { due_at: future, kind: 'email' }, now })).toBe(
      'awaiting_connection',
    )
  })

  it('dit « en attente de validation » quand une étape est due', () => {
    expect(
      deriveOutreachDisplayStatus({
        status: 'active',
        nextStep: { due_at: past, kind: 'reminder' },
        canSend: true,
        now,
      }),
    ).toBe('awaiting_validation')
  })

  it('distingue une séquence à peine créée d’une séquence entamée', () => {
    const base = { status: 'active' as const, nextStep: { due_at: future, kind: 'reminder' as const }, now }
    expect(deriveOutreachDisplayStatus(base)).toBe('prepared')
    expect(deriveOutreachDisplayStatus({ ...base, hasProgress: true })).toBe('scheduled')
  })

  it('rend « terminée » quand il ne reste aucune étape', () => {
    expect(deriveOutreachDisplayStatus({ status: 'active', nextStep: null, now })).toBe('completed')
  })

  it('laisse passer les états explicites de la base', () => {
    for (const status of ['paused', 'completed', 'cancelled'] as const) {
      expect(deriveOutreachDisplayStatus({ status, nextStep: null, now })).toBe(status)
    }
  })

  // #2202.48/#2202.51 — un refus et un bounce tombaient tous les deux dans le
  // même « cancelled » générique que n'importe quel arrêt manuel : le
  // commercial ne pouvait pas distinguer « il a dit non » de « l'adresse est
  // mauvaise » sans rouvrir le journal. La CAUSE existe déjà (#2381,
  // `outreach_transitions.cause`) — il ne manquait que son exposition ici.
  it('distingue un refus et un bounce sous « cancelled », par la cause déjà journalisée', () => {
    expect(deriveOutreachDisplayStatus({ status: 'cancelled', nextStep: null, cancelReason: 'refusal', now })).toBe(
      'refused',
    )
    expect(deriveOutreachDisplayStatus({ status: 'cancelled', nextStep: null, cancelReason: 'hard_bounce', now })).toBe(
      'bounced',
    )
  })

  it('un autre motif d’arrêt, ou aucun motif connu, reste un « cancelled » générique', () => {
    expect(deriveOutreachDisplayStatus({ status: 'cancelled', nextStep: null, cancelReason: 'opt_out', now })).toBe(
      'cancelled',
    )
    expect(deriveOutreachDisplayStatus({ status: 'cancelled', nextStep: null, now })).toBe('cancelled')
  })
})

describe('les états que le rapport exige (§44)', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const now = new Date()

  it('une réponse arrête la séquence, avant toute autre considération', () => {
    // Relancer quelqu'un qui vient de répondre est la faute la plus coûteuse
    // d'une séquence, et la seule que l'outil peut éviter à coup sûr. Elle
    // domine donc l'échec comme l'échéance.
    expect(
      deriveOutreachDisplayStatus({
        status: 'active',
        nextStep: { due_at: past, kind: 'email' },
        hasReply: true,
        hasFailure: true,
        now,
      }),
    ).toBe('responded')
  })

  it('sans messagerie, une étape DUE devient « prête à copier », pas « en attente de connexion »', () => {
    // La distinction est le sujet du §44 : « il manque quelque chose » et
    // « vous pouvez travailler » ne se disent pas pareil. Tant que rien n'est
    // dû, la connexion manquante est l'information utile ; une fois l'échéance
    // passée, le brouillon est prêt et copiable — annoncer un blocage
    // décrirait une panne qui n'existe pas.
    const base = { status: 'active' as const, nextStep: { due_at: past, kind: 'email' as const }, canSend: false, now }
    expect(deriveOutreachDisplayStatus(base)).toBe('ready_to_copy')
    expect(deriveOutreachDisplayStatus({ ...base, nextStep: { due_at: future, kind: 'email' } })).toBe(
      'awaiting_connection',
    )
  })

  it('un échec se dit, il ne se déguise pas en « planifiée »', () => {
    expect(
      deriveOutreachDisplayStatus({
        status: 'active',
        nextStep: { due_at: future, kind: 'reminder' },
        hasFailure: true,
        now,
      }),
    ).toBe('failed')
  })

  it('ne dit JAMAIS « active » — le mot n’existe pas côté affichage', () => {
    // C'est le reproche d'origine : le badge annonçait « Active » sur une
    // séquence dont aucune étape ne pouvait partir. Le mot est absent de
    // l'énumération d'affichage, et ce test le vérifie plutôt que de faire
    // confiance à la relecture.
    expect(outreachDisplayStatusSchema.options).not.toContain('active')
  })
})

/* ------------------- espacement gouverné par le scénario ------------------- */

const day = (n: number): Date => new Date(Date.UTC(2026, 6, 1 + n, 7, 0, 0))
const mail = (n: number) => ({ kind: 'email' as const, due_at: day(n) })
const task = (n: number) => ({ kind: 'task' as const, due_at: day(n) })

describe('outreachMessageSpacingProblems — le rythme vient du scénario', () => {
  it('sans scénario, garde le plancher plat — le chemin d’avant, à l’identique', () => {
    // Aucun appelant ne connaît toujours l'état de relation. Quand il est
    // inconnu, le comportement historique doit rester EXACTEMENT celui-là :
    // brancher une cadence ne doit pas resserrer ce qu'on n'a pas mesuré.
    expect(outreachMessageSpacingProblems([mail(0), mail(4)])).toEqual([])
    const tooClose = outreachMessageSpacingProblems([mail(0), mail(3)])
    expect(tooClose).toHaveLength(1)
    expect(tooClose[0]?.required).toBe(OUTREACH_MIN_DAYS_BETWEEN_MESSAGES)
  })

  it('avec un scénario, applique SON délai — 4 jours ne suffisent plus à un compte froid', () => {
    // La cadence d'une approche froide est 0 / 5 / 7. Un second message à J+4
    // passait le plancher plat et viole le scénario : c'est précisément l'écart
    // que le registre existait pour dire, et que personne ne lui demandait.
    const problems = outreachMessageSpacingProblems([mail(0), mail(4)], OUTREACH_SCENARIOS.cold_approach)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ previousIndex: 0, index: 1, days: 4, required: 5 })
  })

  it('le délai exigé CHANGE avec le rang du message, il n’est pas constant', () => {
    // 0 / 5 / 7 : le troisième message demande plus que le deuxième. Un seuil
    // unique aurait laissé passer le troisième à cinq jours.
    const problems = outreachMessageSpacingProblems([mail(0), mail(5), mail(11)], OUTREACH_SCENARIOS.cold_approach)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ index: 2, days: 6, required: 7 })
  })

  it('une cadence conforme au scénario ne produit aucun problème', () => {
    expect(outreachMessageSpacingProblems([mail(0), mail(5), mail(12)], OUTREACH_SCENARIOS.cold_approach)).toEqual([])
  })

  it('un contact recommandé a droit à son rythme plus court — 4 jours lui suffisent', () => {
    expect(outreachMessageSpacingProblems([mail(0), mail(4)], OUTREACH_SCENARIOS.referred_contact)).toEqual([])
  })

  it('au-delà de la cadence déclarée, le dernier délai continue de s’appliquer', () => {
    // Une séquence plus longue que son scénario ne doit pas retomber à zéro sur
    // son quatrième message — c'est la règle que porte `minDelayBeforeStep`.
    const problems = outreachMessageSpacingProblems(
      [mail(0), mail(5), mail(12), mail(17)],
      OUTREACH_SCENARIOS.cold_approach,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ index: 3, days: 5, required: 7 })
  })

  it('ne compte que les étapes qui ÉCRIVENT — une tâche le même jour reste légitime', () => {
    // « Vérifier le signal » puis « premier contact » le même jour est l'ordre
    // voulu du gabarit `fresh_signal`. Le scénario ne doit pas le casser.
    expect(outreachMessageSpacingProblems([task(0), mail(0), mail(5)], OUTREACH_SCENARIOS.cold_approach)).toEqual([])
  })

  it('AUCUN scénario n’autorise ce que le plancher plat refuse', () => {
    // La propriété qui rend ce branchement sûr : brancher le registre ne peut
    // que RESSERRER. Si un scénario descendait sous le plancher, le brancher
    // relâcherait une garde en silence — et personne ne le verrait.
    for (const scenario of Object.values(OUTREACH_SCENARIOS)) {
      for (let position = 1; position <= OUTREACH_SEQUENCE_MAX_STEPS; position += 1) {
        expect(minDelayBeforeStep(scenario, position)).toBeGreaterThanOrEqual(OUTREACH_MIN_DAYS_BETWEEN_MESSAGES)
      }
    }
  })
})

/* --------- #2374.24 (épopée #2800) — plafond par relation ET canal --------- */

describe('outreachMessageCount — le plafond de messages du scénario', () => {
  it('ne compte que les étapes qui ENVOIENT, pas les tâches ni les rappels', () => {
    expect(outreachMessageCount([task(0), mail(0), mail(5)])).toBe(2)
    expect(outreachMessageCount([task(0), task(1)])).toBe(0)
  })

  it('chaque scénario déclare un plafond que ce compteur peut confronter', () => {
    // `maxSteps` était une colonne du registre que rien ne lisait — ce test
    // fixe la valeur de RÉFÉRENCE que le service compare désormais.
    expect(OUTREACH_SCENARIOS.cold_approach.maxSteps).toBe(3)
    expect(outreachMessageCount([mail(0), mail(5), mail(12), mail(17)])).toBe(4)
  })
})

describe('outreachChannelForbidden — le canal doit appartenir au scénario', () => {
  it('sans scénario, ne refuse jamais rien — le plancher plat ne connaît pas de canal', () => {
    expect(outreachChannelForbidden([mail(0)], null)).toBe(false)
    expect(outreachChannelForbidden([mail(0)], undefined)).toBe(false)
  })

  it('une connexion LinkedIn (canal LinkedIn seul) refuse un e-mail automatisé', () => {
    // `accepted_connection` n'autorise que `linkedin_draft` — jamais `email_draft`.
    expect(outreachChannelForbidden([mail(0)], OUTREACH_SCENARIOS.accepted_connection)).toBe(true)
  })

  it('une tâche ou un rappel seuls ne portent aucun canal — jamais refusés', () => {
    expect(outreachChannelForbidden([task(0)], OUTREACH_SCENARIOS.accepted_connection)).toBe(false)
  })

  it('un scénario qui autorise l’e-mail (froid, référé, dormant) ne refuse rien', () => {
    expect(outreachChannelForbidden([mail(0)], OUTREACH_SCENARIOS.cold_approach)).toBe(false)
    expect(outreachChannelForbidden([mail(0)], OUTREACH_SCENARIOS.referred_contact)).toBe(false)
    expect(outreachChannelForbidden([mail(0)], OUTREACH_SCENARIOS.dormant_connection)).toBe(false)
  })
})
