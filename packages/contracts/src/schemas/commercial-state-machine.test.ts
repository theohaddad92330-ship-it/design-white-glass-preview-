import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_CANONICAL_STAGES,
  COMMERCIAL_GUARDED_TRANSITIONS,
  canonicalCommercialStage,
  commercialTransitionSourceSchema,
  effectiveCommercialStage,
  evaluateCommercialTransition,
} from './commercial-state-machine.js'
import { NEED_STATUS_ORDER, LEGACY_NEED_STATUSES } from './need-status.js'
import { PROJECT_STAGES } from './project.js'
import { SUBMISSION_STAGES } from './submission.js'
import { SHORTLIST_STATUSES } from './shortlist.js'
import { FINISHED_MISSION_STATUSES, RUNNING_MISSION_STATUSES } from './account-missions.js'

describe('machine d’état commerciale canonique (#2967)', () => {
  describe('rattachement des statuts EXISTANTS, sans renommage (#2320.7, #2320.30)', () => {
    it('chaque statut stocké de chaque objet a UN stade canonique — aucun trou', () => {
      const all: Array<[Parameters<typeof canonicalCommercialStage>[0], readonly string[]]> = [
        ['opportunity', PROJECT_STAGES],
        ['need', [...NEED_STATUS_ORDER, 'cancelled', ...LEGACY_NEED_STATUSES]],
        ['shortlist', SHORTLIST_STATUSES],
        ['submission', SUBMISSION_STAGES],
        ['mission', [...RUNNING_MISSION_STATUSES, ...FINISHED_MISSION_STATUSES]],
        ['signal', ['piste']],
      ]
      for (const [subject, states] of all) {
        for (const state of states) {
          expect(canonicalCommercialStage(subject, state), `${subject}:${state}`).not.toBeNull()
        }
      }
    })

    it('un statut inconnu rend null — jamais un stade deviné', () => {
      expect(canonicalCommercialStage('need', 'inventé')).toBeNull()
    })

    it('le même fait lu depuis deux objets donne le même stade (deux pages, un état)', () => {
      expect(canonicalCommercialStage('need', 'shortlist_ready')).toBe('shortlist')
      expect(canonicalCommercialStage('shortlist', 'shared')).toBe('shortlist')
      expect(canonicalCommercialStage('need', 'submitted')).toBe('positionnement')
      expect(canonicalCommercialStage('submission', 'submitted')).toBe('positionnement')
      expect(canonicalCommercialStage('signal', 'piste')).toBe('piste')
    })

    it('un besoin gagné est RETENU, jamais déjà une mission (#2320.3)', () => {
      expect(canonicalCommercialStage('need', 'won')).toBe('retenu')
      expect(canonicalCommercialStage('submission', 'accepted')).toBe('retenu')
      expect(canonicalCommercialStage('submission', 'interview')).toBe('positionnement')
    })
  })

  describe('les cinq transitions gardées', () => {
    it('sont exactement les cinq nommées par l’épopée', () => {
      expect(COMMERCIAL_GUARDED_TRANSITIONS.map(g => `${g.from}->${g.to}`)).toEqual([
        'signal->piste',
        'opportunite->besoin_confirme',
        'match->shortlist',
        'shortlist->positionnement',
        'retenu->mission',
      ])
    })

    it('Signal→Piste exige une interprétation explicable (#2320.14)', () => {
      const v = evaluateCommercialTransition({ from: 'signal', to: 'piste', source: 'human', evidence: {} })
      expect(v.allowed).toBe(false)
      expect(v.missing).toEqual(['interpretation'])
      expect(
        evaluateCommercialTransition({
          from: 'signal',
          to: 'piste',
          source: 'human',
          evidence: { interpretation: 'Recrutement de 3 devops annoncé' },
        }).allowed,
      ).toBe(true)
    })

    it('une preuve blanche ne vaut pas preuve', () => {
      const v = evaluateCommercialTransition({
        from: 'signal',
        to: 'piste',
        source: 'human',
        evidence: { interpretation: '   ' },
      })
      expect(v.missing).toEqual(['interpretation'])
    })

    it('Opportunité→Besoin confirmé exige une qualification (#2320.16)', () => {
      expect(
        evaluateCommercialTransition({ from: 'opportunite', to: 'besoin_confirme', source: 'human', evidence: {} })
          .missing,
      ).toEqual(['qualification'])
    })

    it('Match→Shortlist exige la revue des critères ET des inconnues (#2320.17)', () => {
      expect(
        evaluateCommercialTransition({
          from: 'match',
          to: 'shortlist',
          source: 'human',
          evidence: { criteria_review: 'ok' },
        }).missing,
      ).toEqual(['unknowns_review'])
    })

    it('Shortlist→Positionnement exige l’accord consultant (#2320.18)', () => {
      expect(
        evaluateCommercialTransition({ from: 'shortlist', to: 'positionnement', source: 'human', evidence: {} })
          .missing,
      ).toEqual(['consultant_agreement'])
    })

    it('Retenu→Mission exige l’accord client ET consultant (#2320.21)', () => {
      const v = evaluateCommercialTransition({
        from: 'retenu',
        to: 'mission',
        source: 'human',
        evidence: { client_agreement: 'bon de commande 12' },
      })
      expect(v.allowed).toBe(false)
      expect(v.missing).toEqual(['consultant_agreement'])
    })

    it('sauter des stades ne contourne pas les gardes traversées (#2320.22)', () => {
      const v = evaluateCommercialTransition({ from: 'positionnement', to: 'mission', source: 'human', evidence: {} })
      expect(v.allowed).toBe(false)
      expect(v.missing).toEqual(['client_agreement', 'consultant_agreement'])
    })
  })

  describe('Laura propose, l’humain valide (#2320.22, #2320.26, #2320.28)', () => {
    it('une transition venue de Laura exige TOUJOURS une validation humaine', () => {
      const v = evaluateCommercialTransition({
        from: 'besoin_confirme',
        to: 'match',
        source: 'laura',
        evidence: {},
      })
      expect(v.allowed).toBe(true)
      expect(v.requiresHumanValidation).toBe(true)
    })

    it('Laura ne peut pas corriger à rebours : seule une correction humaine recule', () => {
      expect(
        evaluateCommercialTransition({ from: 'shortlist', to: 'match', source: 'laura', evidence: {} }).reason,
      ).toBe('backward_requires_human_correction')
      expect(
        evaluateCommercialTransition({ from: 'shortlist', to: 'match', source: 'human', evidence: {} }).reason,
      ).toBe('backward_requires_human_correction')
      const correction = evaluateCommercialTransition({
        from: 'shortlist',
        to: 'match',
        source: 'human_correction',
        evidence: {},
      })
      expect(correction.allowed).toBe(true)
      expect(correction.requiresHumanValidation).toBe(false)
    })

    it('sortir (perdu / en veille) est permis depuis tout stade actif, rouvrir un perdu exige une correction', () => {
      expect(evaluateCommercialTransition({ from: 'match', to: 'perdu', source: 'human', evidence: {} }).allowed).toBe(
        true,
      )
      expect(evaluateCommercialTransition({ from: 'perdu', to: 'match', source: 'human', evidence: {} }).allowed).toBe(
        false,
      )
      expect(
        evaluateCommercialTransition({ from: 'en_veille', to: 'match', source: 'human', evidence: {} }).allowed,
      ).toBe(true)
    })

    it('rester sur place n’est pas une transition', () => {
      expect(evaluateCommercialTransition({ from: 'match', to: 'match', source: 'human', evidence: {} }).reason).toBe(
        'same_stage',
      )
    })

    it('la source est une liste fermée', () => {
      expect(commercialTransitionSourceSchema.options).toEqual(['human', 'laura', 'human_correction'])
      expect(commercialTransitionSourceSchema.safeParse('robot').success).toBe(false)
    })
  })

  describe('une correction humaine gagne toujours, quelle que soit sa date', () => {
    it('une proposition Laura validée APRÈS une correction humaine ne l’écrase pas', () => {
      expect(
        effectiveCommercialStage([
          { stage: 'match', source: 'human', occurredAt: '2026-09-01T10:00:00Z' },
          { stage: 'besoin_confirme', source: 'human_correction', occurredAt: '2026-09-02T10:00:00Z' },
          { stage: 'shortlist', source: 'laura', occurredAt: '2026-09-03T10:00:00Z' },
        ]),
      ).toBe('besoin_confirme')
    })

    it('un geste humain postérieur à la correction s’applique', () => {
      expect(
        effectiveCommercialStage([
          { stage: 'besoin_confirme', source: 'human_correction', occurredAt: '2026-09-02T10:00:00Z' },
          { stage: 'match', source: 'human', occurredAt: '2026-09-04T10:00:00Z' },
        ]),
      ).toBe('match')
    })

    it('ordonne par date, pas par position dans le tableau', () => {
      expect(
        effectiveCommercialStage([
          { stage: 'shortlist', source: 'human', occurredAt: '2026-09-05T10:00:00Z' },
          { stage: 'match', source: 'human', occurredAt: '2026-09-01T10:00:00Z' },
        ]),
      ).toBe('shortlist')
    })

    it('aucun journal = aucun stade, jamais un défaut', () => {
      expect(effectiveCommercialStage([])).toBeNull()
    })
  })

  it('les stades canoniques sont une liste fermée et ordonnée', () => {
    expect(COMMERCIAL_CANONICAL_STAGES).toEqual([
      'signal',
      'piste',
      'opportunite',
      'besoin_confirme',
      'match',
      'shortlist',
      'positionnement',
      'retenu',
      'mission',
      'perdu',
      'en_veille',
    ])
  })
})
