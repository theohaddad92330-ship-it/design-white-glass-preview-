import { pipelineSummary, projectNature } from '@bellum/contracts'
import { DEMO_SIGNALS_AND_NEEDS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #3676 / #3714 — PARITÉ DÉMO DE « SIGNAUX ET BESOINS ».
 *
 * Recompte sur le JEU, avec la MÊME classification que l'écran, les compteurs et
 * Laura (`projectNature`, `@bellum/contracts`) : la salle porte une demande
 * confirmée, une affaire travaillée à titre générique (qui doit RESTER), une
 * généralité sans travail (qui doit SORTIR des compteurs) et un programme nommé.
 * Elle sait dire non : retirer l'un des quatre cas la fait rougir.
 */
const cases = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases
const natureOf = (c: (typeof cases)[number]) =>
  projectNature({ kind: c.kind, stage: c.stage, source: c.source, amount_cents: c.amount_cents })

describe('parité démo — Signaux et besoins', () => {
  it('LIT un jeu réel et classe la fonctionnalité', () => {
    expect(cases.length).toBeGreaterThanOrEqual(4)
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
    expect(DEMO_SIGNALS_AND_NEEDS_COVERAGE.state).toBe('seede')
  })

  it('porte une demande CONFIRMÉE (stage confirmed, ni signal ni déduction)', () => {
    expect(cases.some(c => c.stage === 'confirmed' && c.kind !== 'implication')).toBe(true)
  })

  it('porte une affaire travaillée à titre générique, qui RESTE « worked »', () => {
    const worked = cases.filter(c => c.kind === 'implication' && natureOf(c) === 'worked')
    expect(worked.length).toBeGreaterThanOrEqual(1)
  })

  it('porte une généralité sans travail, qui sort de `intake` sans rien perdre', () => {
    const generic = cases.filter(c => natureOf(c) === 'generic')
    expect(generic.length).toBeGreaterThanOrEqual(1)
    const summary = pipelineSummary(
      cases.map(c => ({ kind: c.kind, stage: c.stage, source: c.source, amount_cents: c.amount_cents })),
      {},
      'fr',
    )
    expect(summary.generic_deductions).toBe(generic.length)
  })

  it('porte un programme nommé et sourcé, documenté — jamais éliminé par son titre', () => {
    const program = cases.find(c => c.kind === 'program')
    expect(program).toBeDefined()
    expect(program && natureOf(program)).toBe('documented')
  })

  it('une déduction n’écrit jamais son propre nom de voie comme source', () => {
    for (const c of cases.filter(x => x.kind === 'implication')) expect(c.source).toBeNull()
  })

  // 06/10/2026 — deux déductions au MÊME libellé sur le compte de la salle violaient
  // `opportunities_account_kind_label_uniq` (compte, nature, md5(libellé)) : chaque
  // re-semis échouait, aucune salle prête, /demo tournait puis « Démo indisponible ».
  it('chaque opportunité du compte de la salle est unique par (nature, libellé) — la contrainte SQL', () => {
    const c = DEMO_DELIVERY_CLIENT
    const keys = [
      `besoin|${c.openProject.label}`,
      ...c.pipelineProjects.map(d => `besoin|${d.label}`),
      ...c.detectedSignals.map(s => `signal|${s.label}`),
      ...c.importedProjects.map(p => `imported|${p.label}`),
      ...cases.map(x => `${x.kind}|${x.label}`),
    ]
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  // #3678.7 — un signal hors cible, rapproché d'un domaine qui n'est PAS celui de l'offre.
  it('porte un signal HORS CIBLE : domaine connu, différent de celui de la salle', () => {
    const own = new Set(DEMO_DELIVERY_CLIENT.detectedSignals.filter(x => x.primary_domain_code === 'esn_it'))
    expect(own.size).toBeGreaterThanOrEqual(1)
    expect(DEMO_DELIVERY_CLIENT.detectedSignals.some(x => x.primary_domain_code === 'finance')).toBe(true)
  })

  // #3681 — l'annonce de recrutement interne ne se confond jamais avec une demande ouverte.
  it('porte une annonce de recrutement interne, à côté de vraies demandes ouvertes', () => {
    const hire = DEMO_DELIVERY_CLIENT.internalHireNeed
    expect(hire.title.length).toBeGreaterThan(0)
    expect(DEMO_DELIVERY_CLIENT.openNeeds.length).toBeGreaterThan(0)
    expect(DEMO_DELIVERY_CLIENT.openNeeds.every(need => (need.contract_kind as string) !== 'recrutement')).toBe(true)
  })
})
