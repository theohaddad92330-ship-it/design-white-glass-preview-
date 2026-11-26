import { discoverResponseSchema, readSkillSearch } from '@bellum/contracts'
import { DEMO_DISCOVER_SKILL_SEARCH_COVERAGE } from './demo-coverage'
import { demoSkillSearchResponse } from './demo-discover-skill'
import { withDemoWidening } from './demo-criteria-widening'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — craft rule n°9 : une recherche par compétence se voit PLEINE en
 * démo. « SAP » rend des comptes fictifs qui recrutent dessus (preuve : N offres + la plus récente) et,
 * à part, des cabinets et ESN fictifs. Sans compétence, la salle garde sa liste scriptée d'avant.
 */
describe('COMPETENCE-TROUVE — la recherche par compétence en démo', () => {
  it('est classée seedée, avec son appelant', () => {
    expect(DEMO_DISCOVER_SKILL_SEARCH_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SKILL_SEARCH_COVERAGE.reason).toContain('demo-discover-skill-coverage.spec.ts')
  })

  it('« SAP » rend des comptes prouvés par offres, puis des intermédiaires à part — contrat respecté', () => {
    const response = demoSkillSearchResponse({ keywords: ['SAP'], technologiesObserved: ['SAP'] })
    expect(response).not.toBeNull()
    const parsed = discoverResponseSchema.parse(response)
    expect(parsed.candidates.length).toBeGreaterThanOrEqual(2)
    for (const candidate of parsed.candidates) {
      expect(candidate.skillEvidence?.skill).toBe('SAP')
      expect(candidate.skillEvidence?.offerCount).toBeGreaterThan(0)
      expect(candidate.skillEvidence?.latestOffer.title).toMatch(/SAP/)
      expect(candidate.skillEvidence?.latestOffer.url ?? '').toMatch(/^https:\/\/[a-z.]*example\.org\//)
    }
    const counts = parsed.candidates.map(c => c.skillEvidence?.offerCount ?? 0)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    const kinds = new Set((parsed.skillIntermediaries ?? []).map(i => i.kind))
    expect(kinds).toEqual(new Set(['recruiter', 'esn']))
    const mainSirens = new Set(parsed.candidates.map(c => c.siren))
    expect((parsed.skillIntermediaries ?? []).every(i => !mainSirens.has(i.siren))).toBe(true)
  })

  it('#4674 — un employeur prouvé par une offre sort « identité en cours » : sans SIREN, jamais parmi les comptes', () => {
    const parsed = discoverResponseSchema.parse(demoSkillSearchResponse({ keywords: ['SAP'] }))
    const pending = parsed.skillPendingEmployers ?? []
    expect(pending).toHaveLength(1)
    expect(pending[0]?.identity).toBe('ambiguous')
    expect(pending[0]?.skillEvidence.latestOffer.url ?? '').toMatch(/^https:\/\/[a-z.]*example\.org\//)
    // Sait dire NON : aucun SIREN, et il n'est ni un compte ni un intermédiaire.
    expect(pending[0]).not.toHaveProperty('siren')
    const names = [...parsed.candidates, ...(parsed.skillIntermediaries ?? [])].map(c => c.name)
    expect(names).not.toContain(pending[0]?.name)
    expect((parsed.query as { skillSearch: { unresolvedRendered: number } }).skillSearch.unresolvedRendered).toBe(1)
  })

  it('#4515 — une offre hors du siège porte sa ville : la carte dit où le compte recrute', () => {
    const parsed = demoSkillSearchResponse({ keywords: ['SAP'] })!
    const rhenalp = parsed.candidates.find(c => c.name.startsWith('Rhénalp'))
    expect(rhenalp?.city).toBe('Bartenheim')
    expect(rhenalp?.skillEvidence?.latestOffer.city).toBe('Mulhouse')
    // Sait dire NON : les autres comptes n'inventent aucune ville d'offre.
    expect(parsed.candidates.filter(c => c.skillEvidence?.latestOffer.city).map(c => c.name)).toHaveLength(1)
  })

  it('#4664 — chaque compte porte le détail de TOUTES ses offres, chacune avec le lien de son annonce', () => {
    const parsed = discoverResponseSchema.parse(demoSkillSearchResponse({ keywords: ['SAP'] }))
    const multi = parsed.candidates.filter(c => (c.skillEvidence?.offerCount ?? 0) > 1)
    expect(multi.length).toBeGreaterThanOrEqual(1)
    for (const candidate of parsed.candidates) {
      const evidence = candidate.skillEvidence
      expect(evidence?.offers?.length).toBe(evidence?.offerCount)
      for (const offer of evidence?.offers ?? []) {
        expect(offer.title).toMatch(/SAP/)
        expect(offer.url ?? '').toMatch(/^https:\/\/[a-z.]*example\.org\//)
      }
      expect(evidence?.offers?.[0]?.url).toBe(evidence?.latestOffer.url)
    }
  })

  it('la compétence tapée est celle qu’on prouve (pas « SAP » en dur)', () => {
    const parsed = discoverResponseSchema.parse(demoSkillSearchResponse({ keywords: ['Kubernetes'] }))
    expect(parsed.candidates.every(c => c.skillEvidence?.skill === 'Kubernetes')).toBe(true)
    expect(parsed.candidates.every(c => (c.skillEvidence?.latestOffer.title ?? '').includes('Kubernetes'))).toBe(true)
  })

  it('sait dire NON : sans compétence, rien — la liste scriptée d’avant reste la réponse', () => {
    expect(demoSkillSearchResponse({})).toBeNull()
    expect(demoSkillSearchResponse({ keywords: ['  '] })).toBeNull()
  })

  it('aucun SIREN fictif ne ressemble à un SIREN officiel (clé de Luhn fausse)', () => {
    const response = discoverResponseSchema.parse(demoSkillSearchResponse({ keywords: ['SAP'] }))
    const luhn = (digits: string): boolean =>
      [...digits].reverse().reduce((sum, ch, i) => {
        let d = Number(ch)
        if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
        return sum + d
      }, 0) %
        10 ===
      0
    for (const siren of [
      ...response.candidates.map(c => c.siren),
      ...(response.skillIntermediaries ?? []).map(i => i.siren),
    ]) {
      expect(luhn(siren)).toBe(false)
    }
  })

  it('#4419.1 — les compteurs par étape sont semés et COHÉRENTS avec la liste rendue', () => {
    const response = demoSkillSearchResponse({ keywords: ['Java', 'Vue'] })
    const parsed = discoverResponseSchema.parse(response)
    const search = readSkillSearch(parsed.query)
    expect(search).not.toBeNull()
    const intermediaries = parsed.skillIntermediaries ?? []
    const offers = [...parsed.candidates, ...intermediaries].reduce((n, a) => n + (a.skillEvidence?.offerCount ?? 0), 0)
    expect(search?.offersSeen).toBe(offers)
    expect(search?.accountsFound).toBe(parsed.candidates.length)
    expect(search?.intermediaries).toBe(intermediaries.length)
    expect(search?.employersFound).toBe(parsed.candidates.length + intermediaries.length)
    const failures = Object.values(search?.resolutionFailures ?? {}).reduce((n, v) => n + (v ?? 0), 0)
    expect(search?.employerGroups).toBe(
      (search?.employersFound ?? 0) + failures + (search?.notAttempted ?? 0) + (search?.outsideZone ?? 0),
    )
    expect(search?.unresolvedEmployers).toBeGreaterThan(0)
    expect(search?.deadlineCut).toBe(false)
    // La salle ne nomme aucune source, même dans la donnée.
    expect(search?.offersBySource).toBeUndefined()
  })
})

/**
 * #4115.5 (recette R8 du 03/11/2026) — la recherche d'exemple « cybersécurité » rendait des comptes et ZÉRO signal :
 * l'onglet « Besoins et signaux » disait « aucun signal daté ». Les comptes de la salle portent leurs signaux datés,
 * rangés par la grille (`strong` ≤ 5 par carte, `context` ≤ 10).
 */
describe('#4115.5 — la recherche d’exemple porte des signaux datés', () => {
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

  it('« cybersécurité » : chaque compte rendu porte au moins un signal fort daté, et la salle en sème ~5 forts / ~10 de contexte', () => {
    const response = withDemoWidening(
      demoSkillSearchResponse({ keywords: ['cybersécurité'] }),
      { keywords: ['cybersécurité'] },
      undefined,
    )
    const parsed = discoverResponseSchema.parse(response)
    const signals = parsed.candidates.flatMap(candidate => candidate.signals)
    expect(parsed.candidates.length).toBeGreaterThanOrEqual(3)
    for (const candidate of parsed.candidates.filter(c => !c.widenedBy)) {
      expect(candidate.signals.some(s => s.tier === 'strong')).toBe(true)
    }
    expect(signals.filter(s => s.tier === 'strong').length).toBeGreaterThanOrEqual(3)
    expect(signals.filter(s => s.tier === 'context').length).toBeGreaterThanOrEqual(6)
    for (const candidate of parsed.candidates) {
      expect(candidate.signals.filter(s => s.tier === 'strong').length).toBeLessThanOrEqual(5)
      expect(candidate.signals.filter(s => s.tier === 'context').length).toBeLessThanOrEqual(10)
    }
  })

  it('les dates des signaux sont FIGÉES (jours ISO écrits en dur) : la même réponse à deux instants différents', () => {
    const at = (iso: string) => {
      jest.useFakeTimers().setSystemTime(new Date(iso))
      try {
        return (demoSkillSearchResponse({ keywords: ['cybersécurité'] })?.candidates ?? []).map(c =>
          c.signals.map(s => s.date),
        )
      } finally {
        jest.useRealTimers()
      }
    }
    const first = at('2026-11-03T10:00:00Z')
    expect(first.flat().length).toBeGreaterThan(0)
    for (const date of first.flat()) expect(date).toMatch(ISO_DAY)
    expect(at('2027-03-15T10:00:00Z')).toEqual(first)
  })

  it('un signal ne cite que la compétence TAPÉE (jamais « cybersécurité » en dur) et aucune source nommée', () => {
    const labels = (demoSkillSearchResponse({ keywords: ['Kubernetes'] })?.candidates ?? []).flatMap(c =>
      c.signals.filter(s => s.type === 'hiring').map(s => s.label),
    )
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label).toMatch(/Kubernetes/)
      expect(label).not.toMatch(/cybers/i)
    }
  })
})
