import { NotFoundException } from '@nestjs/common'
import { NeedContradictionsService } from './need-contradictions.service'

/**
 * #2323.32/.34/.35/.36 / #2323.38-.45, côté serveur.
 *
 * Ce que ce fichier tient, et qui n'est PAS le calcul (il vit au contrat —
 * `need-qualification-questions.ts` et `need-contradictions.ts`, chacun ses
 * tests) : que les TROIS agrégations croisées (médiane TJM junior, statut
 * freelance-only de l'espace, disponibilité d'une habilitation) lisent la
 * BONNE requête et respectent leur SEUIL — le même défaut que
 * `need-verdict.service.spec.ts` décrit : une agrégation vide doit devenir
 * `null` (non évaluable), jamais un zéro fabriqué.
 */
describe('NeedContradictionsService', () => {
  const WORKSPACE = 'w-1'
  const NEED_ID = '11111111-1111-4111-8111-111111111111'
  const NOW = new Date('2026-09-25T00:00:00.000Z')

  const NEED_ROW = {
    skills: [{ term: 'React' }],
    seniority: 'senior',
    stack: ['TypeScript'],
    languages: [{ code: 'fr', level: null }],
    clearances: [],
    location: 'Paris',
    remote: null,
    start_on: '2026-12-01',
    duration_months: 3,
    budget_cents: null,
    target_tjm_cents: '55000',
    profile_type_agreement: 'agreed',
    presentation_process: 'Deux entretiens.',
    deadline_at: '2026-10-15',
    urgency: 'haute',
    interview_rounds: 2,
    onsite_days_per_week: 2,
    freelance_excluded: false,
    budget_validated: true,
  }

  function build(over: {
    need?: Record<string, unknown> | null
    juniors?: { tjm: number }[]
    submissions?: { contract_type: string | null }[]
    clearanceAvailable?: boolean
  }) {
    const query = jest.fn(async (sql: string) => {
      const lowered = sql.toLowerCase()
      if (lowered.includes('from project_needs')) {
        return over.need === null ? [] : [over.need ?? NEED_ROW]
      }
      if (lowered.includes("seniority = 'junior'")) return over.juniors ?? []
      if (lowered.includes('from submissions')) return over.submissions ?? []
      if (lowered.includes('clearances &&')) return [{ available: over.clearanceAvailable ?? false }]
      return []
    })
    const needs = { manager: { query } }
    return { service: new NeedContradictionsService(needs as never), query }
  }

  it('refuse un besoin hors de l’espace', async () => {
    const { service } = build({ need: null })
    await expect(service.forNeed(WORKSPACE, NEED_ID, NOW)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('sous trois juniors avec TJM connu, la médiane est NON ÉVALUABLE — pas zéro', async () => {
    const { service } = build({ juniors: [{ tjm: 300 }, { tjm: 350 }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.notEvaluable.map(n => n.key)).toContain('seniority_budget')
  })

  it('avec trois juniors ou plus, la médiane est calculée EN CENTIMES', async () => {
    // Médiane de 300/350/400 = 350€ → 35000 centimes. Le besoin cible 55000 >
    // 35000 : pas de contradiction.
    const { service } = build({ juniors: [{ tjm: 300 }, { tjm: 350 }, { tjm: 400 }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.contradictions.map(c => c.key)).not.toContain('seniority_budget')
    expect(response.notEvaluable.map(n => n.key)).not.toContain('seniority_budget')
  })

  it('détecte la contradiction quand le budget senior ne dépasse pas la médiane junior', async () => {
    const { service } = build({
      need: { ...NEED_ROW, target_tjm_cents: '30000' },
      juniors: [{ tjm: 320 }, { tjm: 330 }, { tjm: 340 }],
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.contradictions.map(c => c.key)).toContain('seniority_budget')
  })

  it('sous cinq positionnements sur douze mois, le statut freelance-only est NON DÉTERMINABLE', async () => {
    const { service } = build({
      need: { ...NEED_ROW, freelance_excluded: true },
      submissions: [{ contract_type: 'freelance' }, { contract_type: 'freelance' }],
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.notEvaluable.map(n => n.key)).toContain('freelance_only')
  })

  it('cinq positionnements et 100 % freelance ⇒ l’espace est freelance-only', async () => {
    const { service } = build({
      need: { ...NEED_ROW, freelance_excluded: true },
      submissions: Array.from({ length: 5 }, () => ({ contract_type: 'freelance' })),
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.contradictions.map(c => c.key)).toContain('freelance_only')
  })

  it('une habilitation exigée absente du vivier détecte la contradiction', async () => {
    const { service } = build({
      need: { ...NEED_ROW, clearances: ['Confidentiel Défense'] },
      clearanceAvailable: false,
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.contradictions.map(c => c.key)).toContain('clearance_availability')
  })

  it('aucune habilitation exigée ⇒ la question n’est même pas posée au vivier', async () => {
    const { service, query } = build({ need: { ...NEED_ROW, clearances: [] } })
    await service.forNeed(WORKSPACE, NEED_ID, NOW)
    const calls = query.mock.calls.map(call => String(call[0]).toLowerCase())
    expect(calls.some(sql => sql.includes('clearances &&'))).toBe(false)
  })

  it('rend aussi les questions prioritaires — même besoin, même lecture', async () => {
    const { service } = build({ need: { ...NEED_ROW, seniority: null } })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.questions.find(q => q.axis === 'matching')?.field).toBe('seniority')
  })
})
