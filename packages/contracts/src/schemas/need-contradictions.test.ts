import { describe, expect, it } from 'vitest'
import { needContradictions, type NeedContradictionsInput } from './need-contradictions.js'

/**
 * #2323.38-.45 — SIX CONTRADICTIONS DÉTECTABLES, CHACUNE NOMMÉE, CHACUNE SON
 * ARBITRAGE — jamais appliqué automatiquement (#2323.44/.45).
 *
 * Doctrine UNKNOWN ≠ ZERO : un champ manquant ne dit JAMAIS « pas de
 * contradiction », il sort en `notEvaluable`, nommé — sauf pour une LISTE
 * vide (`clearances`), qui ne produit AUCUNE ligne (« on n'affiche pas ce
 * qu'on n'a pas »).
 */
const NOW = new Date('2026-09-25T00:00:00.000Z')

function baseline(): NeedContradictionsInput {
  return {
    start_on: '2026-12-01',
    interview_rounds: 2,
    seniority: 'confirme',
    target_tjm_cents: 55000,
    medianJuniorTjmCents: 30000,
    remote: 'hybride',
    onsite_days_per_week: 2,
    freelance_excluded: false,
    workspaceFreelanceOnly: null,
    duration_months: 3,
    budget_validated: true,
    clearances: [],
    clearanceAvailable: null,
    now: NOW,
  }
}

describe('needContradictions — rien à signaler', () => {
  it('ne rend aucune contradiction ni aucun non-évaluable sur un besoin cohérent et complet', () => {
    const result = needContradictions(baseline())
    expect(result.contradictions).toEqual([])
    expect(result.notEvaluable).toEqual([])
  })
})

describe('#2323.38 — démarrage immédiat + processus à 4 entretiens', () => {
  it('détecte la contradiction sous 14 jours avec 4 entretiens ou plus', () => {
    const result = needContradictions({ ...baseline(), start_on: '2026-10-01', interview_rounds: 4 })
    expect(result.contradictions.map(c => c.key)).toContain('interview_process')
  })

  it('ne détecte rien avec un démarrage lointain', () => {
    const result = needContradictions({ ...baseline(), start_on: '2027-01-01', interview_rounds: 5 })
    expect(result.contradictions).toEqual([])
  })

  it('sort en non-évaluable quand le nombre d’entretiens est absent', () => {
    const result = needContradictions({ ...baseline(), start_on: '2026-10-01', interview_rounds: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('interview_process')
    expect(result.contradictions).toEqual([])
  })

  it('sort en non-évaluable quand la date de démarrage est absente', () => {
    const result = needContradictions({ ...baseline(), start_on: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('interview_process')
  })
})

describe('#2323.39 — séniorité senior/expert + budget ≤ médiane junior', () => {
  it('détecte la contradiction quand le budget ne dépasse pas la médiane junior', () => {
    const result = needContradictions({
      ...baseline(),
      seniority: 'senior',
      target_tjm_cents: 28000,
      medianJuniorTjmCents: 30000,
    })
    expect(result.contradictions.map(c => c.key)).toContain('seniority_budget')
  })

  it('ne détecte rien pour une séniorité junior — le détecteur ne s’applique pas', () => {
    const result = needContradictions({ ...baseline(), seniority: 'junior', target_tjm_cents: 20000 })
    expect(result.contradictions).toEqual([])
    expect(result.notEvaluable).toEqual([])
  })

  it('sort en non-évaluable sans au moins 3 juniors avec TJM connu', () => {
    const result = needContradictions({ ...baseline(), seniority: 'expert', medianJuniorTjmCents: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('seniority_budget')
  })
})

describe('#2323.40 — full remote + présence exigée', () => {
  it('détecte la contradiction dès un jour de présence exigé', () => {
    const result = needContradictions({ ...baseline(), remote: 'full_remote', onsite_days_per_week: 1 })
    expect(result.contradictions.map(c => c.key)).toContain('remote_onsite')
  })

  it('détecte la contradiction même à cinq jours — le cas le plus fort suit la même règle', () => {
    const result = needContradictions({ ...baseline(), remote: 'full_remote', onsite_days_per_week: 5 })
    expect(result.contradictions.map(c => c.key)).toContain('remote_onsite')
  })

  it('ne s’applique pas hors full remote', () => {
    const result = needContradictions({ ...baseline(), remote: 'hybride', onsite_days_per_week: 5 })
    expect(result.contradictions).toEqual([])
  })
})

describe('#2323.41 — freelance exclu + espace freelance-only', () => {
  it('détecte la contradiction quand l’espace ne place que des freelances', () => {
    const result = needContradictions({ ...baseline(), freelance_excluded: true, workspaceFreelanceOnly: true })
    expect(result.contradictions.map(c => c.key)).toContain('freelance_only')
  })

  it('sort en non-évaluable si le statut freelance-only de l’espace ne peut pas être déterminé', () => {
    const result = needContradictions({ ...baseline(), freelance_excluded: true, workspaceFreelanceOnly: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('freelance_only')
  })

  it('ne s’applique pas quand freelance n’est pas exclu', () => {
    const result = needContradictions({ ...baseline(), freelance_excluded: false, workspaceFreelanceOnly: true })
    expect(result.contradictions).toEqual([])
    expect(result.notEvaluable).toEqual([])
  })
})

describe('#2323.42 — mission longue + budget non validé', () => {
  it('détecte la contradiction à partir de six mois', () => {
    const result = needContradictions({ ...baseline(), duration_months: 6, budget_validated: false })
    expect(result.contradictions.map(c => c.key)).toContain('long_mission_budget')
  })

  it('ne s’applique pas sous six mois', () => {
    const result = needContradictions({ ...baseline(), duration_months: 5, budget_validated: false })
    expect(result.contradictions).toEqual([])
  })

  it('sort en non-évaluable quand la validation du budget est inconnue', () => {
    const result = needContradictions({ ...baseline(), duration_months: 9, budget_validated: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('long_mission_budget')
  })
})

describe('#2323.43 — habilitation exigée indisponible dans le vivier', () => {
  it('détecte la contradiction quand aucun consultant actif ne la détient', () => {
    const result = needContradictions({
      ...baseline(),
      clearances: ['Confidentiel Défense'],
      clearanceAvailable: false,
    })
    expect(result.contradictions.map(c => c.key)).toContain('clearance_availability')
  })

  it('ne produit AUCUNE ligne sans habilitation exigée — une liste vide ne s’affiche jamais', () => {
    const result = needContradictions({ ...baseline(), clearances: [], clearanceAvailable: null })
    expect(result.contradictions.map(c => c.key)).not.toContain('clearance_availability')
    expect(result.notEvaluable.map(n => n.key)).not.toContain('clearance_availability')
  })

  it('sort en non-évaluable quand la disponibilité n’a pas pu être vérifiée', () => {
    const result = needContradictions({ ...baseline(), clearances: ['SNCF'], clearanceAvailable: null })
    expect(result.notEvaluable.map(n => n.key)).toContain('clearance_availability')
  })
})

describe('#2323.44/.45 — chaque contradiction nomme et propose un arbitrage, jamais appliqué', () => {
  it('porte un libellé et un arbitrage FR+EN', () => {
    const result = needContradictions({ ...baseline(), start_on: '2026-10-01', interview_rounds: 4 })
    const contradiction = result.contradictions.find(c => c.key === 'interview_process')
    expect(contradiction?.label.fr).toBeTruthy()
    expect(contradiction?.label.en).toBeTruthy()
    expect(contradiction?.arbitration.fr).toBeTruthy()
    expect(contradiction?.arbitration.en).toBeTruthy()
  })

  it('ne porte aucun champ de statut « appliqué » — l’arbitrage reste une proposition', () => {
    const result = needContradictions({ ...baseline(), start_on: '2026-10-01', interview_rounds: 4 })
    const contradiction = result.contradictions.find(c => c.key === 'interview_process')
    expect(Object.keys(contradiction ?? {}).sort()).toEqual(['arbitration', 'key', 'label'])
  })
})
