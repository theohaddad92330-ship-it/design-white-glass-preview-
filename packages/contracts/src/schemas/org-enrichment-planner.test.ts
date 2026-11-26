import { describe, expect, it } from 'vitest'
import {
  ORG_ENRICHMENT_JOB_STATUSES,
  ORG_ENRICHMENT_PROMPT_VERSION,
  ORG_ENRICHMENT_TARGET_MODES,
  ORG_ENRICHMENT_WAVE_SIZE,
  deriveOrgEnrichmentJobStatus,
  nextOrgEnrichmentWave,
  orgEnrichEntityRequestSchema,
  orgEnrichGapsRequestSchema,
  orgEnrichNextRequestSchema,
  orgEnrichmentJobSchema,
  orgEnrichmentJobStatusSchema,
  orgEnrichmentTargetModeSchema,
  orgEnrichmentTargetParamsSchema,
  sumOrgEnrichmentActualCredits,
  type OrgEnrichmentWave,
} from './org-enrichment-planner.js'

describe('orgEnrichmentTargetModeSchema', () => {
  it('accepte les cinq modes de la maquette (D810)', () => {
    for (const mode of ORG_ENRICHMENT_TARGET_MODES) {
      expect(orgEnrichmentTargetModeSchema.safeParse(mode).success).toBe(true)
    }
    expect(ORG_ENRICHMENT_TARGET_MODES).toEqual([
      'next_batch',
      'direction',
      'missing_roles',
      'hierarchy_level',
      'full_account',
    ])
  })

  it('refuse un mode inventé', () => {
    expect(orgEnrichmentTargetModeSchema.safeParse('everything_now').success).toBe(false)
  })
})

describe('orgEnrichmentTargetParamsSchema', () => {
  it('accepte next_batch et full_account sans paramètre', () => {
    expect(orgEnrichmentTargetParamsSchema.safeParse({ mode: 'next_batch' }).success).toBe(true)
    expect(orgEnrichmentTargetParamsSchema.safeParse({ mode: 'full_account' }).success).toBe(true)
  })

  it('accepte direction avec une entité', () => {
    const result = orgEnrichmentTargetParamsSchema.safeParse({ mode: 'direction', entity: 'Engineering' })
    expect(result.success).toBe(true)
  })

  it('accepte hierarchy_level avec des niveaux L0-L5', () => {
    const result = orgEnrichmentTargetParamsSchema.safeParse({
      mode: 'hierarchy_level',
      hierarchyLevels: ['L2', 'L3'],
    })
    expect(result.success).toBe(true)
  })

  it('refuse un niveau hors énumération', () => {
    const result = orgEnrichmentTargetParamsSchema.safeParse({
      mode: 'hierarchy_level',
      hierarchyLevels: ['L9'],
    })
    expect(result.success).toBe(false)
  })

  it('refuse une entité vide', () => {
    const result = orgEnrichmentTargetParamsSchema.safeParse({ mode: 'direction', entity: '' })
    expect(result.success).toBe(false)
  })
})

describe('orgEnrichmentJobStatusSchema', () => {
  it('couvre les cinq statuts attendus', () => {
    expect(ORG_ENRICHMENT_JOB_STATUSES).toEqual(['pending', 'running', 'completed', 'failed', 'partial'])
    for (const status of ORG_ENRICHMENT_JOB_STATUSES) {
      expect(orgEnrichmentJobStatusSchema.safeParse(status).success).toBe(true)
    }
  })
})

describe('ORG_ENRICHMENT_WAVE_SIZE', () => {
  it('vaut 50 — le CTA produit du §11 FINAL, distinct du réglage IA CONTACTS_ENRICH_MAX', () => {
    expect(ORG_ENRICHMENT_WAVE_SIZE).toBe(50)
  })
})

/* ------------------------------------------------------------------ */
/*  Le JOB PERSISTANT — état dérivé, coût estimé ≠ coût réel, reprise  */
/* ------------------------------------------------------------------ */

function wave(
  index: number,
  status: OrgEnrichmentWave['status'],
  actualCredits: number | null = null,
): OrgEnrichmentWave {
  return { index, contactIds: [`c${index}`], status, actualCredits, matched: null, error: null }
}

describe('deriveOrgEnrichmentJobStatus — l’état vit à UN seul endroit', () => {
  it('un job sans vague est `pending`, pas `completed`', () => {
    expect(deriveOrgEnrichmentJobStatus([])).toBe('pending')
  })

  it('toutes les vagues en attente ⇒ `pending`', () => {
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'pending'), wave(1, 'pending')])).toBe('pending')
  })

  it('au moins une lancée ET au moins une en attente ⇒ `running`', () => {
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'done', 2), wave(1, 'pending')])).toBe('running')
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'failed'), wave(1, 'pending')])).toBe('running')
  })

  it('toutes faites ⇒ `completed`', () => {
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'done', 2), wave(1, 'done', 1)])).toBe('completed')
  })

  it('plus rien en attente, au moins une acquise et au moins une tombée ⇒ `partial`', () => {
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'done', 2), wave(1, 'failed')])).toBe('partial')
  })

  it('la toute première vague tombe, rien d’acquis ⇒ `failed`, pas `partial`', () => {
    expect(deriveOrgEnrichmentJobStatus([wave(0, 'failed')])).toBe('failed')
  })
})

describe('sumOrgEnrichmentActualCredits — une vague non mesurée n’est pas une vague gratuite', () => {
  it('rend `null` tant que rien n’a abouti — jamais 0', () => {
    expect(sumOrgEnrichmentActualCredits([wave(0, 'pending'), wave(1, 'pending')])).toEqual({
      credits: null,
      unmeasuredWaves: 0,
    })
  })

  it('additionne les vagues MESURÉES et compte les autres à part', () => {
    expect(sumOrgEnrichmentActualCredits([wave(0, 'done', 3), wave(1, 'failed'), wave(2, 'done', 2)])).toEqual({
      credits: 5,
      unmeasuredWaves: 1,
    })
  })

  it('un `0` AUTHENTIQUE reste un 0 mesuré, pas une absence', () => {
    expect(sumOrgEnrichmentActualCredits([wave(0, 'done', 0)])).toEqual({ credits: 0, unmeasuredWaves: 0 })
  })

  it('rien que des échecs ⇒ aucun total, et le compte des vagues non mesurées', () => {
    expect(sumOrgEnrichmentActualCredits([wave(0, 'failed'), wave(1, 'failed')])).toEqual({
      credits: null,
      unmeasuredWaves: 2,
    })
  })
})

describe('nextOrgEnrichmentWave — la reprise après erreur', () => {
  it('reprend la première vague ENCORE EN ATTENTE, pas la première du job', () => {
    const waves = [wave(0, 'done', 2), wave(1, 'pending'), wave(2, 'pending')]
    expect(nextOrgEnrichmentWave(waves)?.index).toBe(1)
  })

  it('avance sur les vagues neuves AVANT de rejouer celle qui est tombée', () => {
    const waves = [wave(0, 'failed'), wave(1, 'pending')]
    expect(nextOrgEnrichmentWave(waves)?.index).toBe(1)
  })

  it('rejoue une vague tombée quand il ne reste rien de neuf', () => {
    const waves = [wave(0, 'done', 2), wave(1, 'failed')]
    expect(nextOrgEnrichmentWave(waves)?.index).toBe(1)
  })

  it('rend `null` sur un job terminé — jamais une vague inventée', () => {
    expect(nextOrgEnrichmentWave([wave(0, 'done', 1)])).toBeNull()
  })
})

describe('le job persisté — coût estimé et coût réel sont deux champs distincts', () => {
  const baseJob = {
    id: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    mode: 'next_batch' as const,
    targetParams: { mode: 'next_batch' as const },
    status: 'pending' as const,
    promptVersion: ORG_ENRICHMENT_PROMPT_VERSION,
    waveSize: 50,
    estimatedCredits: 6,
    actualCredits: null,
    waves: [wave(0, 'pending')],
    error: null,
    createdAt: '2026-08-31T08:00:00.000Z',
    updatedAt: '2026-08-31T08:00:00.000Z',
  }

  it('accepte un coût réel ABSENT (rien n’a encore abouti)', () => {
    expect(orgEnrichmentJobSchema.safeParse(baseJob).success).toBe(true)
  })

  it('garde l’estimé ET le réel — l’écart est ce qu’on veut voir', () => {
    const parsed = orgEnrichmentJobSchema.parse({ ...baseJob, status: 'completed', actualCredits: 11, waves: [] })
    expect(parsed.estimatedCredits).toBe(6)
    expect(parsed.actualCredits).toBe(11)
  })

  it('refuse une vague plus grosse que le plafond produit', () => {
    expect(orgEnrichmentJobSchema.safeParse({ ...baseJob, waveSize: ORG_ENRICHMENT_WAVE_SIZE + 1 }).success).toBe(false)
  })
})

describe('les corps de requête des trois portes', () => {
  it('une taille de lot absente est légitime — le CTA produit décide', () => {
    expect(orgEnrichNextRequestSchema.parse({})).toEqual({})
    expect(orgEnrichGapsRequestSchema.parse({})).toEqual({})
  })

  it('une taille de lot au-delà du plafond, ou nulle, est refusée', () => {
    expect(orgEnrichNextRequestSchema.safeParse({ batchSize: ORG_ENRICHMENT_WAVE_SIZE + 1 }).success).toBe(false)
    expect(orgEnrichNextRequestSchema.safeParse({ batchSize: 0 }).success).toBe(false)
  })

  it('« cette direction » EXIGE son entité — sans elle la vague n’a pas de périmètre', () => {
    expect(orgEnrichEntityRequestSchema.safeParse({}).success).toBe(false)
    expect(orgEnrichEntityRequestSchema.safeParse({ entity: 'Engineering' }).success).toBe(true)
  })
})
