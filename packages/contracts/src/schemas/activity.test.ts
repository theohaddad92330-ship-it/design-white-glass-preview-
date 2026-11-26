import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KINDS,
  activityDedupeKey,
  splitTimelineSystemSubject,
  timelineSystemSubject,
  activitySchema,
  callDebriefSchema,
  callNextActionSchema,
  CALL_OUTCOMES,
  callOutcomeSchema,
  dedupeActivityBatch,
  engagementSummary,
  ingestActivitySchema,
  logActivitySchema,
} from './activity.js'
import { WORKFLOW_OUTCOME_CATALOG } from './workflow-outcomes.js'

const NOW = new Date('2026-08-17T12:00:00.000Z')

describe('ingestActivitySchema', () => {
  const base = {
    kind: 'email' as const,
    source: 'mailbox' as const,
    direction: 'outbound' as const,
    occurredAt: '2026-08-10T09:00:00.000Z',
  }

  it('accepte une activité datée et rattachée', () => {
    const parsed = ingestActivitySchema.parse({ ...base, externalId: 'msg-1' })
    expect(parsed.externalId).toBe('msg-1')
    expect(parsed.participants).toEqual([])
  })

  it('REFUSE une activité sans date — la timeline ne promet que l’ordre', () => {
    const { occurredAt: _dropped, ...undated } = base
    expect(() => ingestActivitySchema.parse(undated)).toThrow()
  })

  it('refuse une date qui n’en est pas une plutôt que de la remplacer par maintenant', () => {
    expect(() => ingestActivitySchema.parse({ ...base, occurredAt: 'la semaine dernière' })).toThrow()
  })
})

describe('logActivitySchema', () => {
  it('exige un rattachement — une activité orpheline n’apparaît nulle part', () => {
    expect(() => logActivitySchema.parse({ kind: 'call' })).toThrow()
  })

  it('accepte une saisie rattachée au seul projet', () => {
    const parsed = logActivitySchema.parse({
      kind: 'call',
      projectId: '00000000-0000-4000-8000-000000000001',
    })
    expect(parsed.direction).toBe('outbound')
    expect(parsed.durationSeconds).toBeNull()
  })

  it('n’accepte PAS un identifiant externe — une saisie main ne se déguise pas en capture', () => {
    expect(() =>
      logActivitySchema.parse({
        kind: 'call',
        accountId: '00000000-0000-4000-8000-000000000001',
        externalId: 'gmail-42',
      }),
    ).toThrow()
  })
})

describe('activityDedupeKey', () => {
  it('rend une clé stable pour une ligne importée', () => {
    expect(activityDedupeKey({ source: 'mailbox', externalId: 'abc' })).toBe('mailbox:abc')
  })

  it('ne dédoublonne PAS deux saisies manuelles identiques — deux appels sont deux appels', () => {
    expect(activityDedupeKey({ source: 'manual', externalId: null })).toBeNull()
  })

  it('sépare deux sources qui useraient du même identifiant', () => {
    expect(activityDedupeKey({ source: 'telephony', externalId: '1' })).not.toBe(
      activityDedupeKey({ source: 'mailbox', externalId: '1' }),
    )
  })
})

describe('dedupeActivityBatch', () => {
  it('garde la PREMIÈRE occurrence — les fournisseurs rendent le plus complet en tête', () => {
    const kept = dedupeActivityBatch([
      { source: 'mailbox' as const, externalId: 'a', tag: 'first' },
      { source: 'mailbox' as const, externalId: 'a', tag: 'second' },
      { source: 'mailbox' as const, externalId: 'b', tag: 'other' },
    ])
    expect(kept.map(item => item.tag)).toEqual(['first', 'other'])
  })

  it('laisse passer TOUTES les lignes sans identifiant', () => {
    const kept = dedupeActivityBatch([
      { source: 'manual' as const, externalId: null },
      { source: 'manual' as const, externalId: null },
    ])
    expect(kept).toHaveLength(2)
  })
})

describe('engagementSummary', () => {
  it('sépare la dernière touche de la dernière RÉPONSE', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: '2026-08-15T10:00:00.000Z' },
        { kind: 'email', direction: 'inbound', occurredAt: '2026-08-12T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.lastOutboundAt).toBe('2026-08-15T10:00:00.000Z')
    expect(summary.lastInboundAt).toBe('2026-08-12T10:00:00.000Z')
    expect(summary.awaitingReply).toBe(true)
    expect(summary.daysSinceLastActivity).toBe(2)
  })

  it('ferme la question dès qu’ils ont répondu APRÈS notre envoi', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: '2026-08-10T10:00:00.000Z' },
        { kind: 'email', direction: 'inbound', occurredAt: '2026-08-11T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.awaitingReply).toBe(false)
  })

  it('à égalité de date, considère qu’ils ont répondu', () => {
    // Deux messages datés à la seconde près est un artefact d'import. Conclure
    // « on attend encore » ferait relancer quelqu'un qui vient d'écrire.
    const at = '2026-08-11T10:00:00.000Z'
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: at },
        { kind: 'email', direction: 'inbound', occurredAt: at },
      ],
      NOW,
    )
    expect(summary.awaitingReply).toBe(false)
  })

  it('n’attend rien quand personne n’a jamais écrit de notre côté', () => {
    const summary = engagementSummary(
      [{ kind: 'email', direction: 'inbound', occurredAt: '2026-08-11T10:00:00.000Z' }],
      NOW,
    )
    expect(summary.awaitingReply).toBe(false)
  })

  it('ne laisse PAS une réunion interne repousser la dernière touche client', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: '2026-08-01T10:00:00.000Z' },
        { kind: 'meeting', direction: 'internal', occurredAt: '2026-08-16T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.lastOutboundAt).toBe('2026-08-01T10:00:00.000Z')
    expect(summary.awaitingReply).toBe(true)
    // Elle compte quand même dans le total : elle a bien eu lieu.
    expect(summary.total).toBe(2)
  })

  // #3688.7 — « RDV calendrier ≠ tenu » et « réunion interne ≠ échange client » :
  // « dernier échange il y a N j » ne se lit ni sur un rendez-vous PLANIFIÉ ni
  // sur un point d'équipe.
  it('#3688.7 — un rendez-vous planifié (futur) n’est ni compté, ni une touche, ni « dernier échange »', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'inbound', occurredAt: '2026-08-10T10:00:00.000Z' },
        { kind: 'meeting', direction: 'outbound', occurredAt: '2026-08-20T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.total).toBe(1)
    expect(summary.lastOutboundAt).toBeNull()
    expect(summary.awaitingReply).toBe(false)
    expect(summary.daysSinceLastActivity).toBe(7)
  })

  it('#3688.7 — une réunion interne récente ne ramène pas « dernier échange » à aujourd’hui', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: '2026-08-01T10:00:00.000Z' },
        { kind: 'meeting', direction: 'internal', occurredAt: '2026-08-16T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.daysSinceLastActivity).toBe(16)
  })

  it('rend des nulls et non des zéros quand il ne s’est rien passé', () => {
    const summary = engagementSummary([], NOW)
    expect(summary.total).toBe(0)
    expect(summary.lastInboundAt).toBeNull()
    expect(summary.daysSinceLastActivity).toBeNull()
    expect(summary.awaitingReply).toBe(false)
  })

  it('ignore une date illisible plutôt que de la compter à maintenant', () => {
    const summary = engagementSummary([{ kind: 'call', direction: 'outbound', occurredAt: 'jamais' }], NOW)
    expect(summary.total).toBe(0)
    expect(summary.lastOutboundAt).toBeNull()
  })

  it('ne rend jamais un nombre de jours négatif sur une activité future', () => {
    // Un rendez-vous à venir est légitimement dans la table ; « -3 jours »
    // s'afficherait comme une donnée corrompue. #3688.7 : et « 0 jour » ferait
    // lire un rendez-vous PLANIFIÉ comme un échange d'aujourd'hui — il n'est
    // pas encore tenu, donc rien n'est mesuré (null, jamais 0).
    const summary = engagementSummary(
      [{ kind: 'meeting', direction: 'outbound', occurredAt: '2026-08-20T10:00:00.000Z' }],
      NOW,
    )
    expect(summary.daysSinceLastActivity).toBeNull()
    expect(summary.total).toBe(0)
  })

  it('compte par nature', () => {
    const summary = engagementSummary(
      [
        { kind: 'email', direction: 'outbound', occurredAt: '2026-08-15T10:00:00.000Z' },
        { kind: 'email', direction: 'inbound', occurredAt: '2026-08-15T11:00:00.000Z' },
        { kind: 'call', direction: 'outbound', occurredAt: '2026-08-16T10:00:00.000Z' },
      ],
      NOW,
    )
    expect(summary.byKind.email).toBe(2)
    expect(summary.byKind.call).toBe(1)
    expect(summary.byKind.meeting).toBeUndefined()
  })
})

describe('le catalogue des natures', () => {
  it('n’a pas de doublon', () => {
    expect(new Set(ACTIVITY_KINDS).size).toBe(ACTIVITY_KINDS.length)
  })
})

describe('CALL_OUTCOMES — réutilise le catalogue existant, ne le duplique pas', () => {
  it('est EXACTEMENT la taxonomie de la motion `cold_call_qualification`, dans le même ordre', () => {
    // La garde GA-12 ne peut comparer une contrainte SQL qu'à un tableau
    // littéral NOMMÉ dans `packages/contracts/src/schemas/` — un accès
    // `WORKFLOW_OUTCOME_CATALOG.cold_call_qualification.outcomes` lui est
    // invisible. `CALL_OUTCOMES` est donc écrite À PLAT, et ce test est ce qui
    // empêche les deux écritures de diverger — même principe que
    // `CONTACT_STOP_REASONS` dans `workflow-outcomes.ts`.
    expect(CALL_OUTCOMES).toEqual(WORKFLOW_OUTCOME_CATALOG.cold_call_qualification.outcomes)
  })

  it('n’a pas de doublon', () => {
    expect(new Set(CALL_OUTCOMES).size).toBe(CALL_OUTCOMES.length)
  })

  // #2377.3 — « couvrir les 18 outcomes canoniques d'un appel » (corps de
  // l'issue #2377, §OUTCOMES CANONIQUES). Élargit la taxonomie existante, ne
  // la recrée pas (GA-08 : les 6 valeurs d'origine restent, dans le même
  // ordre — un renommage casserait des lignes déjà écrites en base).
  it('couvre les 18 outcomes canoniques du corps de l’issue #2377', () => {
    const CANONICAL_2377 = [
      'no_answer',
      'voicemail',
      'wrong_person',
      'orientation_given',
      'callback_requested',
      'not_now',
      'interest',
      'need_detected',
      'need_confirmed',
      'meeting_booked',
      'refused',
      'opt_out',
      'email_requested',
      'document_requested',
      'partner_opportunity',
      'invalid_contact',
      'left_company',
      'other',
    ] as const
    // `wrong_contact` et `callback_scheduled` PRÉ-EXISTAIENT sous ce nom avant
    // #2377 ; ils portent la même intention que `wrong_person`/
    // `callback_requested` (décision : élargir, pas renommer — CLAUDE.md
    // §Doctrine, même arbitrage que #2400.3/#2383.1).
    const SYNONYMS: Partial<Record<(typeof CANONICAL_2377)[number], string>> = {
      wrong_person: 'wrong_contact',
      callback_requested: 'callback_scheduled',
    }
    for (const code of CANONICAL_2377) {
      const covered =
        CALL_OUTCOMES.includes(code as (typeof CALL_OUTCOMES)[number]) ||
        CALL_OUTCOMES.includes(SYNONYMS[code] as (typeof CALL_OUTCOMES)[number])
      expect(covered, `manque : ${code}`).toBe(true)
    }
  })
})

describe('callOutcomeSchema — une énumération FERMÉE', () => {
  it('accepte chaque issue du catalogue', () => {
    for (const value of CALL_OUTCOMES) expect(callOutcomeSchema.parse(value)).toBe(value)
  })

  it('REFUSE une issue hors énumération', () => {
    expect(() => callOutcomeSchema.parse('interested')).toThrow()
    expect(() => callOutcomeSchema.parse('')).toThrow()
  })
})

describe('logActivitySchema — l’issue d’un appel', () => {
  const base = { accountId: '00000000-0000-4000-8000-000000000001' }

  it('un APPEL sans issue reste valide — « non renseignée » est un état honnête', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', ...base })
    expect(parsed.outcome).toBeUndefined()
  })

  it('accepte une issue reprise du catalogue existant sur un appel', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', outcome: 'voicemail', ...base })
    expect(parsed.outcome).toBe('voicemail')
  })

  it('REFUSE une issue hors énumération', () => {
    expect(() => logActivitySchema.parse({ kind: 'call', outcome: 'interested', ...base })).toThrow()
  })

  it('REFUSE une issue déclarée sur autre chose qu’un appel', () => {
    expect(() => logActivitySchema.parse({ kind: 'meeting', outcome: 'voicemail', ...base })).toThrow()
  })
})

// #2377.4 — l'extraction retourne des champs SÉPARÉS, jamais un blob unique.
describe('callDebriefSchema — les champs structurés restent séparés, jamais un blob', () => {
  it('accepte les quatre champs, tous facultatifs', () => {
    const parsed = callDebriefSchema.parse({
      fact: 'Marie ne porte pas le sujet',
      need: 'Reprise de projet en janvier',
      objection: 'Budget non validé',
      engagement: 'Rappelle le 8 janvier',
    })
    expect(parsed).toEqual({
      fact: 'Marie ne porte pas le sujet',
      need: 'Reprise de projet en janvier',
      objection: 'Budget non validé',
      engagement: 'Rappelle le 8 janvier',
    })
  })

  it('un objet vide reste valide — chaque champ est un état honnête, pas obligatoire', () => {
    expect(() => callDebriefSchema.parse({})).not.toThrow()
  })

  it('REFUSE un champ étranger au schéma (`.strict()`) — pas de blob caché', () => {
    expect(() => callDebriefSchema.parse({ fact: 'x', note: 'ne doit pas passer' })).toThrow()
  })
})

// #2377.6 — toute prochaine action déclarée exige owner + date + condition.
describe('callNextActionSchema — une prochaine action sans owner/date/condition est REFUSÉE', () => {
  const complete = { owner: 'Camille', dueDate: '2026-01-08', condition: 'si Marie ne rappelle pas' }

  it('accepte une prochaine action complète', () => {
    const parsed = callNextActionSchema.parse(complete)
    expect(parsed).toMatchObject(complete)
  })

  it('REFUSE sans owner', () => {
    expect(() => callNextActionSchema.parse({ ...complete, owner: '' })).toThrow()
  })

  it('REFUSE sans date', () => {
    expect(() => callNextActionSchema.parse({ ...complete, dueDate: '' })).toThrow()
  })

  it('REFUSE sans condition — « Rappeler » seul est insuffisant', () => {
    expect(() => callNextActionSchema.parse({ ...complete, condition: '' })).toThrow()
  })

  it('le résultat attendu reste facultatif', () => {
    const parsed = callNextActionSchema.parse(complete)
    expect(parsed.expectedResult).toBeUndefined()
  })
})

describe('logActivitySchema — debrief et prochaine action ne se déclarent que sur un appel', () => {
  const base = { accountId: '00000000-0000-4000-8000-000000000001' }
  const debrief = { fact: 'Marie ne porte pas le sujet' }
  const nextAction = { owner: 'Camille', dueDate: '2026-01-08', condition: 'si Marie ne rappelle pas' }

  it('accepte debrief et prochaine action sur un appel', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', callDebrief: debrief, nextAction, ...base })
    expect(parsed.callDebrief).toEqual(debrief)
    expect(parsed.nextAction).toEqual(nextAction)
  })

  it('REFUSE un debrief déclaré sur autre chose qu’un appel', () => {
    expect(() => logActivitySchema.parse({ kind: 'meeting', callDebrief: debrief, ...base })).toThrow()
  })

  it('REFUSE une prochaine action déclarée sur autre chose qu’un appel', () => {
    expect(() => logActivitySchema.parse({ kind: 'note', nextAction, ...base })).toThrow()
  })

  it('REFUSE une prochaine action incomplète, même sur un appel', () => {
    expect(() => logActivitySchema.parse({ kind: 'call', nextAction: { owner: 'Camille' }, ...base })).toThrow()
  })
})

// #2984 — le consentement à l'enregistrement est DÉCLARATIF : un booléen que
// le commercial coche ou non, jamais une porte qui bloque la saisie (patron
// #2319.57 réservé à la transcription audio réelle, pas à une note manuelle).
describe('logActivitySchema — recordingConsent ne se déclare que sur un appel', () => {
  const base = { accountId: '00000000-0000-4000-8000-000000000001' }

  it('accepte recordingConsent à true sur un appel', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', recordingConsent: true, ...base })
    expect(parsed.recordingConsent).toBe(true)
  })

  it('accepte recordingConsent à false sur un appel — un refus reste un état honnête', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', recordingConsent: false, ...base })
    expect(parsed.recordingConsent).toBe(false)
  })

  it('un appel sans recordingConsent reste valide — non déclaré n’est pas refusé', () => {
    const parsed = logActivitySchema.parse({ kind: 'call', ...base })
    expect(parsed.recordingConsent).toBeUndefined()
  })

  it('REFUSE recordingConsent déclaré sur autre chose qu’un appel', () => {
    expect(() => logActivitySchema.parse({ kind: 'note', recordingConsent: true, ...base })).toThrow()
  })
})

describe('activitySchema — une ligne SANS issue se lit « non renseignée »', () => {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'call' as const,
    source: 'manual' as const,
    direction: 'outbound' as const,
    subject: null,
    body: null,
    bodyTruncated: false,
    occurredAt: '2026-08-10T09:00:00.000Z',
    durationSeconds: null,
    accountId: null,
    contactId: null,
    projectId: null,
    linkReason: null,
    userId: null,
    authorName: null,
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: '2026-08-10T09:00:00.000Z',
  }

  it('accepte une ligne HÉRITÉE, antérieure au champ — jamais une issue par défaut', () => {
    // Une ligne écrite avant ce champ n'a jamais porté `outcome` : l'omission
    // complète doit rester valide, exactement comme `channel` et `verdict`.
    const parsed = activitySchema.parse(base)
    expect(parsed.outcome).toBeUndefined()
  })

  it('lit un `null` explicite comme « non renseignée » elle aussi', () => {
    expect(activitySchema.parse({ ...base, outcome: null }).outcome).toBeNull()
  })

  it('porte une issue connue quand elle a été renseignée', () => {
    expect(activitySchema.parse({ ...base, outcome: 'connected_qualified' }).outcome).toBe('connected_qualified')
  })

  // #2984 — recordingConsent et le brouillon de suivi voyagent DANS le même
  // objet `callDebrief`, comme `nextAction` déjà.
  it('lit recordingConsent et followUpDraft depuis le debrief', () => {
    const parsed = activitySchema.parse({
      ...base,
      callDebrief: {
        nextAction: null,
        recordingConsent: true,
        followUpDraft: { subject: null, body: 'Suite à notre échange…' },
      },
    })
    expect(parsed.callDebrief?.recordingConsent).toBe(true)
    expect(parsed.callDebrief?.followUpDraft).toEqual({ subject: null, body: 'Suite à notre échange…' })
  })

  it('une ligne écrite avant ces deux champs reste valide — rien de deviné', () => {
    const parsed = activitySchema.parse({ ...base, callDebrief: { nextAction: null } })
    expect(parsed.callDebrief?.recordingConsent).toBeUndefined()
    expect(parsed.callDebrief?.followUpDraft).toBeUndefined()
  })
})

/**
 * #2124.68 — la FORME de l'objet d'une ligne système, définie à UN endroit.
 *
 * L'API l'écrit, l'écran la relit. Deux définitions du séparateur divergeraient
 * le jour où l'une des deux change de tiret — et le symptôme serait une clé
 * `snake_case` affichée dans l'historique d'un compte, exactement ce qui a été
 * mesuré en production le 14/09/2026.
 */
describe('objet d’une ligne de timeline système', () => {
  it('compose et redécoupe le même couple', () => {
    const subject = timelineSystemSubject('account_priority', 'accept')
    expect(subject).toBe('account_priority — accept')
    expect(splitTimelineSystemSubject(subject)).toEqual({ context: 'account_priority', key: 'accept' })
  })

  it('coupe sur le DERNIER séparateur — un nom de projet peut en porter un', () => {
    expect(splitTimelineSystemSubject('Refonte SI — phase 2 — negotiation')).toEqual({
      context: 'Refonte SI — phase 2',
      key: 'negotiation',
    })
  })

  it('rend `null` sur ce qui n’est pas une ligne système — on ne réécrit pas le texte de quelqu’un', () => {
    expect(splitTimelineSystemSubject('Deux profils conformité')).toBeNull()
    expect(splitTimelineSystemSubject('— accept')).toBeNull()
    expect(splitTimelineSystemSubject('account_priority — ')).toBeNull()
    expect(splitTimelineSystemSubject('')).toBeNull()
  })
})
