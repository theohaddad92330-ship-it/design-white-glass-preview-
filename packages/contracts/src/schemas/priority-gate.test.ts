import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARK_REASONS,
  PRIORITY_GATES,
  canTransitionGate,
  gateRequiresReason,
  nextReviewCondition,
  reactivationOptions,
} from './priority-gate.js'

/**
 * La porte G1 (PDF 2 §4.4 B2, ticket BEL-CRM-102).
 *
 * Une seule règle porte tout le reste, et le ticket la nomme comme un
 * INTERDIT : un compte écarté ne redevient pas prioritaire d'un geste. Il
 * repasse par `pending`, c'est-à-dire par la question. Sans ça, le motif de
 * l'écartement — le seul apprentissage que produit un « non » — disparaît au
 * premier revirement.
 */
describe('canTransitionGate', () => {
  it('laisse décider depuis « la question n’a pas été posée »', () => {
    expect(canTransitionGate('pending', 'prioritised').allowed).toBe(true)
    expect(canTransitionGate('pending', 'parked').allowed).toBe(true)
  })

  it('laisse écarter un compte priorisé — on se trompe, et c’est normal', () => {
    expect(canTransitionGate('prioritised', 'parked').allowed).toBe(true)
  })

  it('REFUSE parked → prioritised sans repasser par la question', () => {
    const verdict = canTransitionGate('parked', 'prioritised')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBeTruthy()
  })

  it('laisse rouvrir la question sur un compte écarté', () => {
    expect(canTransitionGate('parked', 'pending').allowed).toBe(true)
  })

  it('refuse une transition vers soi-même', () => {
    for (const gate of PRIORITY_GATES) {
      expect(canTransitionGate(gate, gate).allowed).toBe(false)
    }
  })

  it('lit un compte sans porte comme « pending » plutôt que de bloquer', () => {
    expect(canTransitionGate(null, 'prioritised').allowed).toBe(true)
  })
})

/**
 * La ré-ouverture ne rappelait ni le motif ni la date du refus qu'elle
 * referme (N15-A). `gate_reason` et `gate_decided_at` SONT stockés sur le
 * compte (colonnes déjà écrites par `AccountGateService.decide`) — ce n'est
 * donc pas une migration qui manquait, c'est la fonction de transition qui ne
 * les rendait pas. Sans ça, l'utilisateur qui rouvre un compte ne sait plus
 * pourquoi ni quand il avait été écarté, et refait le travail — ou rouvre ce
 * qu'un collègue avait fermé pour une bonne raison.
 */
describe('la réouverture rend le motif et la date du refus qu’elle referme', () => {
  it('rend le motif et la date passés en paramètre, sur une réouverture', () => {
    const verdict = canTransitionGate('parked', 'pending', {
      reason: 'Hors cible',
      decidedAt: '2026-03-01T00:00:00.000Z',
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.reopening).toEqual({
      previousReason: 'Hors cible',
      previousDecidedAt: '2026-03-01T00:00:00.000Z',
    })
  })

  it('rend `null`, jamais une erreur, quand l’appelant ne fournit rien', () => {
    const verdict = canTransitionGate('parked', 'pending')
    expect(verdict.reopening).toEqual({ previousReason: null, previousDecidedAt: null })
  })

  it('ne rend rien pour une transition qui n’est PAS une réouverture', () => {
    // Pas de refus à rappeler : la question n'avait jamais été fermée.
    expect(canTransitionGate('pending', 'prioritised').reopening).toBeUndefined()
    expect(canTransitionGate('prioritised', 'parked').reopening).toBeUndefined()
  })

  it('ne rend rien non plus sur le refus parked → prioritised', () => {
    // La transition est bloquée : il n'y a rien à « voyager », le message
    // d'interdiction suffit.
    expect(canTransitionGate('parked', 'prioritised').reopening).toBeUndefined()
  })
})

describe('gateRequiresReason', () => {
  it('exige un motif pour ÉCARTER — c’est le seul apprentissage que produit un « non »', () => {
    expect(gateRequiresReason('parked')).toBe(true)
  })

  it('n’en exige pas pour prioriser : un geste qu’on refait chaque semaine avec un formulaire se contourne', () => {
    expect(gateRequiresReason('prioritised')).toBe(false)
    expect(gateRequiresReason('pending')).toBe(false)
  })
})

describe('les motifs par défaut', () => {
  it('garde « autre » en dernier, quel que soit le nombre de motifs', () => {
    // Le catalogue s'ÉLARGIT : le tome 1 §11.5 a nommé « pas intéressé », « ne
    // plus me contacter » et « mauvais timing », qu'aucune liste ne portait et
    // qui ne se réexaminent pas au même rythme. Ce qui doit tenir n'est pas le
    // nombre, c'est la place d'`other` : en dernier, pour qu'on lise la liste
    // avant de le cocher.
    expect(DEFAULT_PARK_REASONS.length).toBeGreaterThanOrEqual(7)
    expect(DEFAULT_PARK_REASONS.at(-1)?.key).toBe('other')
    expect(DEFAULT_PARK_REASONS.filter(r => r.key === 'other')).toHaveLength(1)
  })

  it('porte ses libellés en FR et en EN', () => {
    for (const reason of DEFAULT_PARK_REASONS) {
      expect(reason.fr.length).toBeGreaterThan(0)
      expect(reason.en.length).toBeGreaterThan(0)
    }
  })

  /**
   * #3262 (BEL-SC-233) — les treize motifs de la spec qu'aucun catalogue ne
   * portait encore. « Aucune voie d'accès après plusieurs tests » n'y est pas :
   * c'est `no_access` (« pas d'accès »), déjà au catalogue — le reformuler en
   * doublon aurait créé un second motif concurrent (instruction commune #3249,
   * règle 4).
   */
  it('porte les treize motifs de #3262 qu’aucun catalogue ne tenait — un par un', () => {
    const keys = DEFAULT_PARK_REASONS.map(r => r.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'no_sponsor',
        'panel_locked',
        'cycle_mismatch',
        'margin_insufficient',
        'need_not_qualifiable',
        'no_leverageable_proof',
        'scope_too_broad',
        'prolonged_silence_no_signal',
        'worked_by_colleague',
        'partner_conflict',
        'legal_reputational_risk',
        'insufficient_capacity',
        'more_profitable_priority_available',
      ]),
    )
  })
})

/**
 * #3262.20 (épopée #3262, lot R11 29/09) — la prochaine condition de revue,
 * unifiée entre `reexaminationDueAt` (calculée) et `relationship_memory.
 * nextReviewAt` (posée à la main).
 */
describe('nextReviewCondition', () => {
  it('une date posée à la main GAGNE toujours — correction humaine (doctrine)', () => {
    const result = nextReviewCondition({
      gateReason: 'no_budget',
      gateDecidedAt: '2020-01-01T00:00:00.000Z',
      relationshipMemoryNextReviewAt: '2099-01-01T00:00:00.000Z',
    })
    expect(result).toEqual({ dueAt: new Date('2099-01-01T00:00:00.000Z'), source: 'relationship_memory' })
  })

  it('sans date posée, le calcul reprend la main', () => {
    const result = nextReviewCondition({
      gateReason: 'no_budget',
      gateDecidedAt: '2020-01-01T00:00:00.000Z',
      relationshipMemoryNextReviewAt: null,
    })
    expect(result.source).toBe('priority_gate')
    expect(result.dueAt).toEqual(new Date('2020-07-01T00:00:00.000Z'))
  })

  it('une date posée illisible ne bloque pas le calcul — jamais une date devinée', () => {
    const result = nextReviewCondition({
      gateReason: 'no_budget',
      gateDecidedAt: '2020-01-01T00:00:00.000Z',
      relationshipMemoryNextReviewAt: 'pas une date',
    })
    expect(result.source).toBe('priority_gate')
  })

  it('ni date posée ni motif d’écart : aucune condition', () => {
    expect(
      nextReviewCondition({ gateReason: null, gateDecidedAt: null, relationshipMemoryNextReviewAt: null }),
    ).toEqual({ dueAt: null, source: null })
  })
})

/**
 * #3262.21 (épopée #3262, lot R11 29/09) — les évènements pouvant réactiver,
 * unifiés entre `shouldSwitch` (sprint) et le `reopening` de
 * `canTransitionGate` (porte de priorité).
 */
describe('reactivationOptions', () => {
  it('un signal fort sur un no_go/parked ouvre les deux portes à la fois', () => {
    const result = reactivationOptions('strong_signal', 'no_go', 'parked')
    expect(result.sprintSwitch).toEqual({
      to: 'volume',
      automatic: false,
      reason: 'Signal fort sur un compte écarté — proposition de réouverture.',
    })
    expect(result.gateReopeningEligible).toBe(true)
  })

  it('un compte pending (pas écarté) n’a aucune porte à rouvrir, même sur un signal fort', () => {
    const result = reactivationOptions('strong_signal', 'no_go', 'pending')
    expect(result.gateReopeningEligible).toBe(false)
  })

  it('un évènement qui ne réactive rien pour `no_go` ne rouvre pas la porte non plus', () => {
    const result = reactivationOptions('meeting_booked', 'volume', 'parked')
    expect(result.gateReopeningEligible).toBe(false)
  })

  it('sans niveau de sprint connu, seule la porte de priorité répond', () => {
    const result = reactivationOptions('positive_reply', null, 'parked')
    expect(result.sprintSwitch).toBeNull()
    expect(result.gateReopeningEligible).toBe(true)
  })
})
