import { describe, expect, it } from 'vitest'
import { LOSS_REASON_CODES } from './loss-reason-codes.js'
import { updateProjectStageSchema } from './project.js'

/**
 * « Perdu » exige son motif — et le contrat le disait sans le faire.
 *
 * Le commentaire de `updateProjectStageSchema` annonçait « Obligatoire pour
 * `lost` » depuis l'origine, mais le champ était `nullish()` sans aucun
 * `refine`, et le contrôleur passait `body.loss_reason ?? null`. Un projet
 * pouvait donc être perdu sans que personne ne sache pourquoi — or c'est
 * exactement le seul moment où le pipe apprend quelque chose : les motifs de
 * perte sont la matière du `loss_reasons` que la migration a créé pour ça.
 *
 * Le motif n'est imposé QUE sur `lost`. Ni sur `dormant` (personne n'a perdu,
 * c'est un projet qui ne bouge plus), ni sur les retours en arrière — un
 * commercial qui corrige une étape mal saisie n'a rien à justifier, et le lui
 * demander l'apprendrait à ne plus corriger.
 */
describe('updateProjectStageSchema — le motif de perte', () => {
  it('refuse `lost` sans motif', () => {
    const result = updateProjectStageSchema.safeParse({ stage: 'lost' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['loss_reason_code'])
    }
  })

  // #3989.9 (Louis 15/10/2026) — liste FERMÉE commune + précision libre facultative.
  it('sait dire NON — un texte libre seul ne suffit plus, ni un code hors liste', () => {
    expect(updateProjectStageSchema.safeParse({ stage: 'lost', loss_reason: 'Budget gelé' }).success).toBe(false)
    expect(updateProjectStageSchema.safeParse({ stage: 'lost', loss_reason_code: null }).success).toBe(false)
    expect(updateProjectStageSchema.safeParse({ stage: 'lost', loss_reason_code: 'trop_cher' }).success).toBe(false)
  })

  it('accepte `lost` avec un motif de la liste, la précision est facultative', () => {
    const bare = updateProjectStageSchema.safeParse({ stage: 'lost', loss_reason_code: 'no_budget' })
    expect(bare.success).toBe(true)
    const result = updateProjectStageSchema.safeParse({
      stage: 'lost',
      loss_reason_code: 'competitor_won',
      loss_reason: 'Budget gelé côté client',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.loss_reason).toBe('Budget gelé côté client')
  })

  it('la liste est celle de Louis, dans l’ordre', () => {
    expect(LOSS_REASON_CODES).toEqual([
      'price',
      'competitor_won',
      'no_budget',
      'project_cancelled',
      'bad_timing',
      'no_profile_available',
      'other',
    ])
  })

  it('n’exige aucun motif sur `dormant` — personne n’a perdu, le projet ne bouge plus', () => {
    expect(updateProjectStageSchema.safeParse({ stage: 'dormant' }).success).toBe(true)
  })

  it('n’exige aucun motif sur un retour en arrière — corriger une étape n’est pas se justifier', () => {
    expect(updateProjectStageSchema.safeParse({ stage: 'qualified' }).success).toBe(true)
    expect(updateProjectStageSchema.safeParse({ stage: 'detected' }).success).toBe(true)
  })

  it('n’exige aucun motif sur `won`', () => {
    expect(updateProjectStageSchema.safeParse({ stage: 'won' }).success).toBe(true)
  })
})
