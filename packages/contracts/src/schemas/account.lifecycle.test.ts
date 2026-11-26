import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_LIFECYCLE_LABELS,
  COMMERCIAL_LIFECYCLE_VALUES,
  COMMERCIAL_OPPORTUNITY_SCORE_MIN,
  COMMERCIAL_STATUSES_HUMAN_ONLY,
  COMMERCIAL_STATUSES_REQUIRING_REASON,
  commercialLifecycleSchema,
  commercialStatusWriteRefusal,
  deriveCommercialStatusOnComplete,
  setCommercialStatusSchema,
} from './account.js'
import { ACCOUNT_SCORE_GO_MIN, accountVerdictFromScore } from './account-score.js'

describe('commercial lifecycle (Théo p.39)', () => {
  it('has a French label for every lifecycle value', () => {
    for (const value of commercialLifecycleSchema.options) {
      expect(COMMERCIAL_LIFECYCLE_LABELS[value]).toBeTruthy()
    }
  })

  it('pré-classe un run terminé selon le score, uniquement depuis inbox', () => {
    expect(deriveCommercialStatusOnComplete('inbox', 8)).toBe('opportunity')
    expect(deriveCommercialStatusOnComplete('inbox', 7.5)).toBe('opportunity')
    expect(deriveCommercialStatusOnComplete('inbox', 5)).toBe('watching')
    expect(deriveCommercialStatusOnComplete('inbox', null)).toBe('watching')
  })

  /**
   * D44 (Louis, 28/08/2026) — la coupure du tri commercial est la MÊME que
   * celle de la bande de score, parce que la bande est ce que l'utilisateur
   * VOIT. Un compte noté 7 s'affichait « GO » et se rangeait « À suivre ».
   */
  it('un compte noté 7 est GO ET rangé du côté GO — le cas limite exact', () => {
    expect(accountVerdictFromScore(7)).toBe('GO')
    expect(deriveCommercialStatusOnComplete('inbox', 7)).toBe('opportunity')
  })

  it('un compte noté 6,9 n’est ni GO ni opportunité', () => {
    expect(accountVerdictFromScore(6.9)).toBe('PRUDENT')
    expect(deriveCommercialStatusOnComplete('inbox', 6.9)).toBe('watching')
  })

  it('la coupure du tri commercial EST celle de la bande, pas une recopie', () => {
    expect(COMMERCIAL_OPPORTUNITY_SCORE_MIN).toBe(ACCOUNT_SCORE_GO_MIN)
  })

  it('ne réécrit jamais un tri commercial manuel', () => {
    expect(deriveCommercialStatusOnComplete('customer', 2)).toBe('customer')
    expect(deriveCommercialStatusOnComplete('archived', 9)).toBe('archived')
    expect(deriveCommercialStatusOnComplete('watching', 9)).toBe('watching')
  })

  it('rejette un statut commercial inconnu', () => {
    expect(setCommercialStatusSchema.safeParse({ status: 'inbox' }).success).toBe(true)
    expect(setCommercialStatusSchema.safeParse({ status: 'analyzing' }).success).toBe(false)
  })
})

/**
 * #2117.17 / #2117.19 / #2117.20 / #2117.21 — Louis, 15/09/2026.
 */
describe('les deux valeurs ajoutées le sont EN FIN, et les libellés disent le mot du jour', () => {
  it('#2117.19 / #2117.21 — `opening` puis `dormant` arrivent après les cinq d’avant', () => {
    // GA-08 : les cinq premières, dans cet ordre, sont ce que portent les
    // lignes déjà écrites. Insérer au milieu les décalerait toutes.
    expect(COMMERCIAL_LIFECYCLE_VALUES.slice(0, 5)).toEqual([
      'inbox',
      'watching',
      'opportunity',
      'customer',
      'archived',
    ])
    expect(COMMERCIAL_LIFECYCLE_VALUES.slice(5)).toEqual(['opening', 'dormant'])
    expect(commercialLifecycleSchema.options).toEqual([...COMMERCIAL_LIFECYCLE_VALUES])
  })

  it('#2117.17 / #2117.20 — « À qualifier » et « Client actif », plus jamais « À trier » ni « Client » nu', () => {
    expect(COMMERCIAL_LIFECYCLE_LABELS.inbox).toBe('À qualifier')
    expect(COMMERCIAL_LIFECYCLE_LABELS.customer).toBe('Client actif')
    expect(COMMERCIAL_LIFECYCLE_LABELS.opening).toBe("En cours d'ouverture")
    expect(COMMERCIAL_LIFECYCLE_LABELS.dormant).toBe('En veille')
    expect(Object.values(COMMERCIAL_LIFECYCLE_LABELS)).not.toContain('À trier')
    // « À trancher » vit sur la PORTE DE PRIORITÉ (#2117.16/.18), pas ici : un
    // libellé de statut commercial qui le dirait mélangerait les deux axes.
    expect(Object.values(COMMERCIAL_LIFECYCLE_LABELS)).not.toContain('À trancher')
  })
})

/**
 * #2117.21 — « En veille » n'est vraie que parce qu'un commercial l'a dite.
 */
describe('la porte d’écriture du statut commercial', () => {
  it('REFUSE `dormant` à tout chemin système, même avec un motif', () => {
    expect(commercialStatusWriteRefusal('dormant', 'system', 'sans nouvelles depuis 90 jours')).toBe('human_only')
    expect(COMMERCIAL_STATUSES_HUMAN_ONLY).toEqual(['dormant'])
  })

  it('REFUSE « En veille » et « Hors priorité » sans motif, même à un humain', () => {
    expect(commercialStatusWriteRefusal('dormant', 'human', undefined)).toBe('reason_required')
    expect(commercialStatusWriteRefusal('dormant', 'human', '   ')).toBe('reason_required')
    expect(commercialStatusWriteRefusal('archived', 'human', '')).toBe('reason_required')
    expect(COMMERCIAL_STATUSES_REQUIRING_REASON).toEqual(['archived', 'dormant'])
  })

  it('laisse passer le geste humain motivé, et les statuts du pipe sans motif', () => {
    expect(commercialStatusWriteRefusal('dormant', 'human', 'Budget gelé jusqu’au prochain exercice')).toBeNull()
    expect(commercialStatusWriteRefusal('opening', 'system', undefined)).toBeNull()
    expect(commercialStatusWriteRefusal('customer', 'human', undefined)).toBeNull()
  })

  it('aucun pré-classement d’un run ne peut produire « En veille » — et il ne la réécrit pas', () => {
    // Le pré-classement est le seul chemin SYSTÈME qui choisit une valeur : il
    // ne sort que `opportunity` / `watching`, et une correction humaine gagne.
    const derived = [10, 7, 6.9, 0, null].map(score => deriveCommercialStatusOnComplete('inbox', score))
    expect(derived).not.toContain('dormant')
    expect(derived).not.toContain('opening')
    expect(deriveCommercialStatusOnComplete('dormant', 9)).toBe('dormant')
    expect(deriveCommercialStatusOnComplete('opening', 2)).toBe('opening')
  })
})
