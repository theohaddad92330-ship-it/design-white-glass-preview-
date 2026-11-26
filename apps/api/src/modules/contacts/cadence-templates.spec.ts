import type { EsnRevenueModel } from '@bellum/contracts'
import {
  cadencePatternForState,
  resolveCadenceScenario,
  resolveRelationshipEvidence,
  resolveRevenueModel,
} from './cadence-templates'
import { AccountEntity } from '../../database/entities/account.entity'

const account = (over: Partial<AccountEntity> = {}): AccountEntity =>
  ({
    id: 'acc-1',
    commercial_status: 'inbox',
    raw_analysis: {},
    ...over,
  }) as AccountEntity

describe('cadence-templates', () => {
  describe('cadencePatternForState', () => {
    it('a cold account keeps the historical J+1/J+3/J+6/J+9 template (byte-identical)', () => {
      const pattern = cadencePatternForState('froid')
      expect(pattern.template).toBe('standard')
      expect(pattern.touches.map(t => [t.key, t.offsetDays])).toEqual([
        ['initial', 1],
        ['relance', 3],
        ['preuve_sociale', 6],
        ['close_loop', 9],
      ])
      expect(pattern.touches.filter(t => t.isInitial)).toHaveLength(1)
    })

    it('a simply-known account also stays on the standard template', () => {
      expect(cadencePatternForState('connu').template).toBe('standard')
    })

    // #4418.1 — décision Louis 23/10 : la série par défaut est J+3/J+6/J+9 ; la relation la DÉCALE, ne la remplace pas.
    it('#4418.1 — chaque patron garde les trois relances, seules leurs dates se décalent', () => {
      for (const state of [
        'linkedin',
        'refere',
        'dormant',
        'ancien_client',
        'rang2',
        'client_actif',
        'besoin_ouvert',
        'partenaire_actif',
      ] as const) {
        const keys = cadencePatternForState(state)
          .touches.filter(t => !t.isInitial)
          .map(t => t.key)
        expect(keys).toEqual(['relance', 'preuve_sociale', 'close_loop'])
      }
    })

    it('#4418.1 — le décalage est le même pour les trois relances (J+3/6/9 décalées)', () => {
      const gaps = (state: Parameters<typeof cadencePatternForState>[0]) =>
        cadencePatternForState(state)
          .touches.filter(t => !t.isInitial)
          .map(t => t.offsetDays)
      expect(gaps('froid')).toEqual([3, 6, 9])
      expect(gaps('linkedin')).toEqual([4, 7, 10])
      expect(gaps('dormant')).toEqual([7, 10, 13])
      expect(gaps('besoin_ouvert')).toEqual([2, 5, 8])
    })

    it('an accepted LinkedIn connection resolves to its own template', () => {
      expect(cadencePatternForState('linkedin').template).toBe('linkedin_3_touches')
    })

    it('an open need is worked on a tighter rhythm than a cold account', () => {
      const need = cadencePatternForState('besoin_ouvert')
      const cold = cadencePatternForState('froid')
      const needMax = Math.max(...need.touches.map(t => t.offsetDays))
      const coldMax = Math.max(...cold.touches.map(t => t.offsetDays))
      expect(needMax).toBeLessThan(coldMax)
    })

    it('a rang-2 partner is spaced out (respecter le partenaire en place)', () => {
      const rang2 = cadencePatternForState('rang2')
      const cold = cadencePatternForState('froid')
      const rang2Max = Math.max(...rang2.touches.map(t => t.offsetDays))
      const coldMax = Math.max(...cold.touches.map(t => t.offsetDays))
      expect(rang2Max).toBeGreaterThan(coldMax)
    })

    it('an active client is an expansion rhythm', () => {
      expect(cadencePatternForState('client_actif').template).toBe('client_expansion')
    })

    it('every pattern opens with exactly one initial touch', () => {
      const states = [
        'froid',
        'connu',
        'linkedin',
        'dormant',
        'refere',
        'ancien_client',
        'rang2',
        'client_actif',
        'besoin_ouvert',
      ] as const
      for (const state of states) {
        const pattern = cadencePatternForState(state)
        expect(pattern.touches.filter(t => t.isInitial)).toHaveLength(1)
        expect(pattern.touches[0]?.isInitial).toBe(true)
        expect(pattern.ruleId.length).toBeGreaterThan(0)
      }
    })
  })

  describe('resolveRelationshipEvidence', () => {
    it('reads salesContext.relationship from the dossier when present', () => {
      const resolved = resolveRelationshipEvidence(
        account({
          raw_analysis: {
            salesContext: { relationship: { state: 'client_actif', evidence: ['kanban: customer'] } },
          } as never,
        }),
      )
      expect(resolved.state).toBe('client_actif')
      expect(resolved.evidence).toEqual(['kanban: customer'])
    })

    it('falls back to the kanban commercial_status when the dossier has no salesContext', () => {
      const resolved = resolveRelationshipEvidence(account({ commercial_status: 'customer', raw_analysis: {} }))
      expect(resolved.state).toBe('client_actif')
      expect(resolved.evidence).toEqual(['kanban: customer'])
    })

    it('maps every kanban column to its relationship state', () => {
      expect(resolveRelationshipEvidence(account({ commercial_status: 'opportunity' })).state).toBe('besoin_ouvert')
      expect(resolveRelationshipEvidence(account({ commercial_status: 'watching' })).state).toBe('connu')
      expect(resolveRelationshipEvidence(account({ commercial_status: 'archived' })).state).toBe('dormant')
    })

    it('an untriaged (inbox) account with no salesContext is cold, with no invented evidence', () => {
      const resolved = resolveRelationshipEvidence(account({ commercial_status: 'inbox', raw_analysis: {} }))
      expect(resolved.state).toBe('froid')
      expect(resolved.evidence).toEqual([])
    })

    it('ignores a salesContext state outside the taxonomy and falls back to kanban', () => {
      const resolved = resolveRelationshipEvidence(
        account({
          commercial_status: 'watching',
          raw_analysis: { salesContext: { relationship: { state: 'bogus' } } } as never,
        }),
      )
      expect(resolved.state).toBe('connu')
    })
  })

  describe('resolveCadenceScenario', () => {
    it('assembles state + template + a cited rule from the account', () => {
      const scenario = resolveCadenceScenario(
        account({
          raw_analysis: {
            salesContext: { relationship: { state: 'refere', evidence: ['contexte: référé (déclaré)'] } },
          } as never,
        }),
      )
      expect(scenario.state).toBe('refere')
      expect(scenario.template).toBe('referral_short')
      expect(scenario.citation.rule).toContain('refere')
      expect(scenario.citation.evidence).toEqual(['contexte: référé (déclaré)'])
    })

    it('a cold default carries the rule with empty evidence (never fabricated)', () => {
      const scenario = resolveCadenceScenario(account())
      expect(scenario.state).toBe('froid')
      expect(scenario.template).toBe('standard')
      expect(scenario.citation.evidence).toEqual([])
    })
  })

  /**
   * #2645.2 — le MODÈLE DE REVENU est le second consommateur tranché par Louis
   * le 20/09 (l'autre est l'angle). Un revenu ponctuel veut une relance plus
   * serrée et une reprise APRÈS livraison ; un revenu récurrent veut un suivi
   * long. Le patron (`template`) ne change pas — ce sont ses ÉCHÉANCES qui
   * bougent, donc aucune clé d'étape neuve, aucune migration.
   */
  describe('#2645.2 — la cadence suit le modèle de revenu', () => {
    const offsets = (state: Parameters<typeof cadencePatternForState>[0], model?: EsnRevenueModel) =>
      cadencePatternForState(state, model).touches.map(t => [t.key, t.offsetDays])

    it('un modèle non déclaré ne change RIEN — à l’octet près', () => {
      expect(offsets('froid', 'inconnu')).toEqual(offsets('froid'))
      expect(offsets('froid', 'mixte')).toEqual(offsets('froid'))
      expect(offsets('froid')).toEqual([
        ['initial', 1],
        ['relance', 3],
        ['preuve_sociale', 6],
        ['close_loop', 9],
      ])
    })

    it('un revenu PONCTUEL resserre les relances et repousse la dernière touche après livraison', () => {
      expect(offsets('froid', 'ponctuel')).toEqual([
        ['initial', 1], // l'ouverture ne bouge jamais : ce n'est pas une relance
        ['relance', 2], // ceil(3 × 0,6)
        ['preuve_sociale', 4], // ceil(6 × 0,6)
        ['close_loop', 34], // dernière touche resserrée (ceil(9 × 0,6) = 6) + 28 j de livraison
      ])
    })

    it('un revenu RÉCURRENT étire les relances — le suivi long, la dernière touche comprise', () => {
      expect(offsets('froid', 'recurrent')).toEqual([
        ['initial', 1],
        ['relance', 5], // ceil(3 × 1,5)
        ['preuve_sociale', 9], // ceil(6 × 1,5)
        ['close_loop', 14], // ceil(9 × 1,5)
      ])
    })

    it('les échéances restent strictement croissantes, même sur le patron le plus resserré', () => {
      for (const model of ['ponctuel', 'recurrent', 'mixte', 'inconnu'] as const) {
        for (const state of ['froid', 'linkedin', 'refere', 'dormant', 'besoin_ouvert', 'rang2'] as const) {
          const days = cadencePatternForState(state, model).touches.map(t => t.offsetDays)
          expect(days.every((d, i) => i === 0 || d > days[i - 1]!)).toBe(true)
        }
      }
    })

    it('#4418.1 — un référé garde ses trois relances, la dernière part après livraison', () => {
      expect(offsets('refere', 'ponctuel')).toEqual([
        ['initial', 1],
        ['relance', 3], // ceil(4 × 0,6)
        ['preuve_sociale', 5], // ceil(7 × 0,6)
        ['close_loop', 34], // ceil(10 × 0,6) = 6, puis + 28 j : c'est la DERNIÈRE touche
      ])
    })
  })

  describe('#2645.2 — le modèle de revenu se lit sur le dossier du compte', () => {
    it('lit `salesContext.esnProfile.businessModel.revenueModel`', () => {
      expect(
        resolveRevenueModel(
          account({
            raw_analysis: { salesContext: { esnProfile: { businessModel: { revenueModel: 'ponctuel' } } } } as never,
          }),
        ),
      ).toBe('ponctuel')
    })

    it('un dossier sans salesContext vaut « inconnu » — jamais « récurrent » deviné', () => {
      expect(resolveRevenueModel(account())).toBe('inconnu')
    })

    it('une valeur hors taxonomie ne conclut rien', () => {
      expect(
        resolveRevenueModel(
          account({
            raw_analysis: { salesContext: { esnProfile: { businessModel: { revenueModel: 'abonnement' } } } } as never,
          }),
        ),
      ).toBe('inconnu')
    })
  })
})
