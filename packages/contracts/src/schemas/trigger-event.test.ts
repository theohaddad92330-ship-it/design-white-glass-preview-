import { describe, expect, it } from 'vitest'
import {
  TRIGGER_CATALOG,
  buildTriggerEvent,
  triggerPeriodQualifier,
  combineTriggerEvents,
  isTriggerEventActive,
  triggerEventSchema,
} from './trigger-event.js'

/**
 * #2402.9 — le schéma canonique commun à tout événement (LAU-FINAL-116).
 * #2402.1 — le catalogue unique qui le porte.
 * #2402.3 — les dix signaux COMMERCIAUX de l'issue, détectés de façon uniforme
 *           (même schéma, quel que soit celui qui les émet).
 * #2402.14 — la composition de plusieurs signaux, SANS AUCUNE PROBABILITÉ
 *            (doctrine : refusé six fois).
 *
 * Ce que ces tests tiennent : un événement hors catalogue est REFUSÉ (le
 * schéma sait dire NON), le catalogue nomme les dix signaux commerciaux même
 * ceux qu'aucun détecteur ne produit encore (nommé, jamais caché), et une
 * composition ne fabrique jamais un nombre entre 0 et 1.
 */

const NOW = new Date('2026-09-24T21:00:00.000Z')

function validEvent(over: Partial<Parameters<typeof buildTriggerEvent>[0]> = {}) {
  return buildTriggerEvent({
    type: 'account_no_next_action',
    source: 'playbooks',
    subjectType: 'account',
    subjectId: '00000000-0000-4000-8000-000000000001',
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    evidence: 'Le Bon Coin : aucune prochaine action planifiée depuis 30 jours.',
    now: NOW,
    ...over,
  })
}

describe('triggerEventSchema — le schéma canonique (#2402.9)', () => {
  it('valide un événement construit par buildTriggerEvent', () => {
    const event = validEvent()
    expect(() => triggerEventSchema.parse(event)).not.toThrow()
  })

  it('porte les 17 champs du schéma de l’issue #2402, ni plus ni moins', () => {
    const event = validEvent()
    expect(Object.keys(event).sort()).toEqual(
      [
        'eventId',
        'type',
        'source',
        'object',
        'timestamp',
        'scope',
        'evidence',
        'confidence',
        'severity',
        'urgency',
        'dedupeKey',
        'cooldownDays',
        'expiresAt',
        'eligibleActions',
        'eligibleNotifications',
        'permission',
        'status',
      ].sort(),
    )
  })

  it('SAIT DIRE NON à un type hors catalogue', () => {
    // buildTriggerEvent valide DÉJÀ à la construction (#2402.2) : un type
    // inventé par une page ne produit même pas d'objet, il jette tout de
    // suite. On le prouve aux deux endroits — ici à la construction, et plus
    // bas via triggerEventSchema directement sur un objet déjà construit.
    expect(() => validEvent({ type: 'type_invente_par_une_page' as never })).toThrow()

    const rogue = { ...validEvent(), type: 'type_invente_par_une_page' }
    expect(() => triggerEventSchema.parse(rogue)).toThrow()
  })

  it('ne porte jamais de PROBABILITÉ — la confiance est qualitative, pas un nombre entre 0 et 1', () => {
    const event = validEvent()
    expect(typeof event.confidence).toBe('string')
    expect(['mesuree', 'estimee']).toContain(event.confidence)
  })

  it('le dedupeKey identifie (espace, type, sujet) — deux balayages du même problème rendent la même clé', () => {
    const first = validEvent()
    const second = validEvent()
    expect(first.dedupeKey).toBe(second.dedupeKey)
    expect(first.dedupeKey).toBe('ws-1:account_no_next_action:00000000-0000-4000-8000-000000000001')
  })
})

describe('TRIGGER_CATALOG — le registre unique (#2402.1)', () => {
  it('nomme les dix signaux COMMERCIAUX de LAU-FINAL-116, même ceux sans détecteur', () => {
    const commercial = [
      'signal_nouveau',
      'compte_sans_prochaine_action',
      'silence_client',
      'reponse_positive',
      'changement_decideur',
      'besoin_entrant',
      'opportunite_vieillissante',
      'ao_publie',
      'deadline_ao',
      'referencement_detecte',
    ]
    for (const id of commercial) {
      expect(TRIGGER_CATALOG[id], `catalogue : « ${id} » manquant`).toBeDefined()
      expect(TRIGGER_CATALOG[id]?.family).toBe('commercial')
    }
    expect(commercial).toHaveLength(10)
  })

  it('#2875 (lot X54, 02/10) — « référencement détecté » est unifié, sur le fait d’accès PAR ESPACE', () => {
    // Le fait n'est plus la table partagée du marché (sans espace) : c'est une
    // ligne `access_facts` (kind mode, direct_reference) — espace, compte, date.
    expect(TRIGGER_CATALOG.referencement_detecte?.status).toBe('unified')
    expect(TRIGGER_CATALOG.referencement_detecte?.detector).toContain('access_facts')
  })

  it('#2875 (lot P06, 30/09) — « changement de décideur » est désormais unifié, sur sa mémoire de transition', () => {
    expect(TRIGGER_CATALOG.changement_decideur?.status).toBe('unified')
    expect(TRIGGER_CATALOG.changement_decideur?.detector).toContain('contact_decision_role_history')
  })

  it('#2875 (lot V11, 28/09) — « réponse positive » est désormais unifiée, sur son détecteur réel', () => {
    expect(TRIGGER_CATALOG.reponse_positive?.status).toBe('unified')
    expect(TRIGGER_CATALOG.reponse_positive?.detector).toContain('mailbox.service.ts')
  })

  it('#2875 (lot R03, 29/09) — « signal nouveau » est désormais unifié, sur son détecteur réel', () => {
    expect(TRIGGER_CATALOG.signal_nouveau?.status).toBe('unified')
    expect(TRIGGER_CATALOG.signal_nouveau?.detector).toContain('watchlist-refresh.worker.ts')
  })

  it('#2875 (lot R03, 29/09) — « besoin entrant » est désormais unifié, sur son détecteur réel', () => {
    expect(TRIGGER_CATALOG.besoin_entrant?.status).toBe('unified')
    expect(TRIGGER_CATALOG.besoin_entrant?.detector).toContain('discover-alert-event.sweeper.ts')
  })

  it('#2875 (lot reste, 29/09) — « deadline AO » est désormais unifié, sur son détecteur réel', () => {
    expect(TRIGGER_CATALOG.deadline_ao?.status).toBe('unified')
    expect(TRIGGER_CATALOG.deadline_ao?.detector).toContain('discover-alert-event.sweeper.ts')
  })

  it('un signal déjà détecté porte son détecteur réel, pas un renvoi inventé', () => {
    // compte_sans_prochaine_action == account_no_next_action, câblé et
    // désormais émis en TriggerEvent canonique par interventions.sweeper.ts.
    expect(TRIGGER_CATALOG.compte_sans_prochaine_action?.status).toBe('unified')
    expect(TRIGGER_CATALOG.compte_sans_prochaine_action?.detector).toContain('intervention-rules.ts')
  })

  it('toutes les clés du catalogue construisent un événement valide', () => {
    for (const type of Object.keys(TRIGGER_CATALOG)) {
      const event = validEvent({ type: type as never })
      expect(() => triggerEventSchema.parse(event)).not.toThrow()
    }
  })
})

describe('combineTriggerEvents — la corrélation, sans probabilité (#2402.14)', () => {
  it('refuse une liste vide', () => {
    expect(() => combineTriggerEvents([])).toThrow()
  })

  it('un seul événement reste « single »', () => {
    const event = validEvent()
    const combined = combineTriggerEvents([event])
    expect(combined.strength).toBe('single')
    expect(combined.triggerTypes).toEqual(['account_no_next_action'])
  })

  it('deux signaux sur le même sujet deviennent « combined », gravité = le MAX, jamais une somme ni une probabilité', () => {
    const first = validEvent({ type: 'account_no_next_action', now: NOW })
    const second = validEvent({ type: 'project_no_decision', now: NOW })
    const combined = combineTriggerEvents([first, second])
    expect(combined.strength).toBe('combined')
    expect(combined.triggerTypes.sort()).toEqual(['account_no_next_action', 'project_no_decision'])
    expect(combined.severity).toBe(Math.max(first.severity, second.severity))
    expect(combined.evidence).toHaveLength(2)
  })

  it('ne rend JAMAIS un champ de probabilité — la forme est fermée', () => {
    const combined = combineTriggerEvents([validEvent()])
    expect(Object.keys(combined).sort()).toEqual(
      ['subjectType', 'subjectId', 'triggerTypes', 'strength', 'severity', 'evidence'].sort(),
    )
  })

  it('refuse de combiner deux événements de sujets différents — corréler n’est pas mélanger', () => {
    const first = validEvent({ subjectId: '00000000-0000-4000-8000-000000000001' })
    const second = validEvent({ subjectId: '00000000-0000-4000-8000-000000000002' })
    expect(() => combineTriggerEvents([first, second])).toThrow()
  })
})

// #2875 — un événement résolu ou échu ne déclenche plus d'alerte.
describe('isTriggerEventActive (#2875)', () => {
  const now = new Date('2026-10-13T10:00:00.000Z')
  const base = buildTriggerEvent({
    type: 'duplicate_pair_detected',
    source: 'governance',
    subjectType: 'account',
    subjectId: 'a1',
    workspaceId: 'ws-1',
    ownerId: null,
    evidence: 'Même adresse',
    now,
  })

  it('ouvert et sans échéance : actif', () => {
    expect(isTriggerEventActive(base, now)).toBe(true)
  })
  it('acquitté : encore actif (vu, pas clos)', () => {
    expect(isTriggerEventActive({ ...base, status: 'acknowledged' }, now)).toBe(true)
  })
  it('résolu : inactif', () => {
    expect(isTriggerEventActive({ ...base, status: 'resolved' }, now)).toBe(false)
  })
  it('échu : inactif, à l’instant même de l’échéance aussi', () => {
    expect(isTriggerEventActive({ ...base, expiresAt: '2026-10-13T09:59:59.000Z' }, now)).toBe(false)
    expect(isTriggerEventActive({ ...base, expiresAt: '2026-10-13T10:00:00.000Z' }, now)).toBe(false)
  })
  it('échéance future : actif', () => {
    expect(isTriggerEventActive({ ...base, expiresAt: '2026-10-14T10:00:00.000Z' }, now)).toBe(true)
  })
  it('échéance illisible : on ne devine pas, l’événement reste actif', () => {
    expect(isTriggerEventActive({ ...base, expiresAt: 'pas-une-date' }, now)).toBe(true)
  })

  it('un qualificatif date la clé d’un fait récurrent — même jour = même clé, autre jour = autre clé', () => {
    const base = {
      type: 'credit_low',
      source: 'credits',
      subjectType: 'workspace',
      subjectId: 'ws-1',
      workspaceId: 'ws-1',
      ownerId: null,
      evidence: 'x',
    } as const
    const a = buildTriggerEvent({
      ...base,
      now: new Date('2026-10-15T08:00:00Z'),
      dedupeQualifier: triggerPeriodQualifier(new Date('2026-10-15T08:00:00Z'), 'month'),
    })
    const b = buildTriggerEvent({
      ...base,
      now: new Date('2026-10-20T08:00:00Z'),
      dedupeQualifier: triggerPeriodQualifier(new Date('2026-10-20T08:00:00Z'), 'month'),
    })
    const c = buildTriggerEvent({
      ...base,
      now: new Date('2026-11-02T08:00:00Z'),
      dedupeQualifier: triggerPeriodQualifier(new Date('2026-11-02T08:00:00Z'), 'month'),
    })
    expect(a.dedupeKey).toBe(b.dedupeKey)
    expect(a.dedupeKey).toBe('ws-1:credit_low:ws-1:2026-10')
    expect(c.dedupeKey).not.toBe(a.dedupeKey)
  })

  it('triggerPeriodQualifier : jour, mois, semaine ISO (le 1er janvier 2027 est en W53 de 2026)', () => {
    expect(triggerPeriodQualifier(new Date('2026-10-15T23:59:00Z'), 'day')).toBe('2026-10-15')
    expect(triggerPeriodQualifier(new Date('2026-10-15T23:59:00Z'), 'week')).toBe('2026-W42')
    expect(triggerPeriodQualifier(new Date('2027-01-01T10:00:00Z'), 'week')).toBe('2026-W53')
  })
})
