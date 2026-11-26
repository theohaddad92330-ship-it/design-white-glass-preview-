import { describe, expect, it } from 'vitest'
import cases from '../fixtures/discover-card-facts.json' with { type: 'json' }
import {
  DISCOVER_CARD_CONTEXT_MAX,
  DISCOVER_CARD_STRONG_MAX,
  classifyCardFact,
  isSameCardFact,
  selectCardFacts,
  type DiscoverCardFactInput,
} from './discover-card-facts.js'

const now = new Date(`${cases.now}T12:00:00Z`)
const company = cases.company

describe('#4068 — classifyCardFact (jeu de cas partagé TS/Python)', () => {
  it.each(cases.cases.map(c => [c.fact.label, c] as const))('%s', (_label, c) => {
    const verdict = classifyCardFact(c.fact as DiscoverCardFactInput, { now, companyName: company })
    expect(verdict.tier).toBe(c.tier)
    if ('nature' in c) expect(verdict.nature).toBe(c.nature)
    if ('reason' in c) expect(verdict.reason).toBe(c.reason)
  })

  it('dit NON sur chaque catégorie hors carte nommée par Louis', () => {
    const reasons = new Set(cases.cases.filter(c => c.tier === 'off').map(c => ('reason' in c ? c.reason : null)))
    expect([...reasons].sort()).toEqual(['contentless', 'internship', 'legal_admin', 'too_old'])
  })
})

describe('#4068 — isSameCardFact (un fait repris par plusieurs sources = UNE ligne)', () => {
  it.each(cases.duplicates.map(d => [`${d.a.label} ↔ ${d.b.label}`, d] as const))('%s', (_label, d) => {
    expect(isSameCardFact(d.a as DiscoverCardFactInput, d.b as DiscoverCardFactInput, company)).toBe(d.same)
  })
})

const fact = (
  overrides: Partial<DiscoverCardFactInput> & Pick<DiscoverCardFactInput, 'label'>,
): DiscoverCardFactInput => ({
  type: 'business',
  date: '2026-10-01',
  ...overrides,
})

const NEEDS = [
  'Tierce maintenance applicative',
  'Refonte du portail fournisseurs',
  'Migration cloud des usines',
  'Cybersécurité des lignes industrielles',
  'Pilotage des données qualité',
  'Support utilisateurs bureautique',
  'Développement du jumeau numérique',
  'Intégration SAP achats',
]
const PLACES = [
  'Toulouse',
  'Colomiers',
  'Blagnac',
  'Bordeaux',
  'Mérignac',
  'Marignane',
  'Nantes',
  'Saint-Nazaire',
  'Méaulte',
  'Rochefort',
  'Figeac',
  'Tarbes',
  'Pau',
  'Bourges',
]

describe('#4068 — selectCardFacts (5 forts, 10 de contexte, le reste hors carte)', () => {
  it('plafonne les forts à 5 et le contexte à 10, du plus récent au plus ancien', () => {
    // #4068.1 — 5 forts (Louis 13/10), jumeau de MAX_STRONG côté IA : les deux plafonds ne divergent pas.
    expect(DISCOVER_CARD_STRONG_MAX).toBe(5)
    const strong = NEEDS.slice(0, 8).map((label, i) =>
      fact({ type: 'tender', label, date: `2026-09-${String(10 + i)}` }),
    )
    const context = PLACES.map((place, i) =>
      fact({ label: `Activité aéronautique soutenue à ${place}`, date: `2026-08-${String(10 + i)}` }),
    )
    const selected = selectCardFacts([...context, ...strong], { now, companyName: company })
    expect(selected.strong).toHaveLength(DISCOVER_CARD_STRONG_MAX)
    expect(selected.context).toHaveLength(DISCOVER_CARD_CONTEXT_MAX)
    expect(selected.strong[0]?.date).toBe('2026-09-17')
    expect(selected.context[0]?.date).toBe('2026-08-23')
  })

  it('garde le recrutement le plus récent dans les forts, même s’il est plus ancien que 5 autres forts', () => {
    const tenders = NEEDS.slice(0, 6).map((label, i) => fact({ type: 'tender', label, date: `2026-10-0${i + 1}` }))
    const hiring = fact({ type: 'hiring', label: 'Ingénieur systèmes embarqués H/F', date: '2026-09-01' })
    const selected = selectCardFacts([...tenders, hiring], { now, companyName: company })
    expect(selected.strong).toHaveLength(5)
    expect(selected.strong.map(f => f.nature)).toContain('hiring')
  })

  // #4067 (reste) — « 100 % des faits sont RECRUTEMENT » : cinq offres récentes ne chassent plus
  // la nomination, le projet ou le contrat plus anciens du même compte.
  it('la variété : les natures fortes présentes dans le fond prennent la place des recrutements en trop', () => {
    const hirings = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
      'Data engineer',
    ].map((label, i) => fact({ type: 'hiring', label: `${label} H/F`, date: `2026-10-0${i + 1}` }))
    const leader = fact({
      label: "Latécoère nomme Marie Durand directrice des systèmes d'information",
      date: '2026-09-10',
    })
    const project = fact({
      label: 'Latécoère lance un programme de transformation numérique de ses usines',
      date: '2026-07-01',
    })
    const selected = selectCardFacts([...hirings, leader, project], { now, companyName: company })
    // #4067.9 (R47) — au plus DEUX recrutements dès qu'une autre nature existe : 7 cartes sur 10
    // ne portaient que du recrutement. Rien n'est inventé : la carte compte moins de faits.
    expect(selected.strong).toHaveLength(4)
    const natures = selected.strong.map(f => f.nature)
    expect(natures).toContain('leader')
    expect(natures).toContain('project')
    expect(natures.filter(n => n === 'hiring')).toHaveLength(2)
    // du plus récent au plus ancien, toujours
    const dates = selected.strong.map(f => f.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  // #4067.9 (R47) — la donnée qui ressemble à la prod : 5 offres récentes, UN seul autre fait.
  it('cinq recrutements et un seul autre fait daté : deux recrutements, l’autre fait reste', () => {
    const hirings = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
    ].map((label, i) => fact({ type: 'hiring', label: `${label} H/F`, date: `2026-10-0${i + 1}` }))
    const project = fact({
      label: 'Latécoère lance un programme de transformation numérique de ses usines',
      date: '2026-07-01',
    })
    const natures = selectCardFacts([...hirings, project], { now, companyName: company }).strong.map(f => f.nature)
    expect(natures.filter(n => n === 'hiring')).toHaveLength(2)
    expect(natures).toContain('project')
  })

  it('un fait de contexte daté (autre nature) suffit aussi à plafonner le recrutement à deux', () => {
    const hirings = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
    ].map((label, i) => fact({ type: 'hiring', label: `${label} H/F`, date: `2026-10-0${i + 1}` }))
    const legal = fact({
      type: 'legal',
      label: 'Modification des statuts : objet social étendu au conseil',
      date: '2026-09-20',
    })
    const selected = selectCardFacts([...hirings, legal], { now, companyName: company })
    const hiringCount = selected.strong.filter(f => f.nature === 'hiring').length
    const otherCount = selected.strong.length + selected.context.length - hiringCount
    if (otherCount > 0) expect(hiringCount).toBeLessThanOrEqual(2)
  })

  it('la variété ne retire jamais le seul fait de sa nature et n’invente rien', () => {
    const hirings = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
      'Data engineer',
    ].map((label, i) => fact({ type: 'hiring', label: `${label} H/F`, date: `2026-10-0${i + 1}` }))
    const selected = selectCardFacts(hirings, { now, companyName: company })
    expect(selected.strong.every(f => f.nature === 'hiring')).toBe(true)
    expect(selected.strong).toHaveLength(5)
  })

  // #4115 (Louis 13/10) — l'alternance se voit (contexte), elle ne prend jamais une place de fort.
  it('l’alternance est un fait de contexte : elle ne prend aucune des places fortes', () => {
    const hirings = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
    ].map((label, i) => fact({ type: 'hiring', label: `${label} H/F`, date: `2026-09-0${i + 1}` }))
    const workStudy = fact({ type: 'hiring', label: 'Alternance – Développeur web H/F', date: '2026-10-05' })
    const selected = selectCardFacts([workStudy, ...hirings], { now, companyName: company })
    expect(selected.strong).toHaveLength(5)
    expect(selected.strong.map(f => f.label)).not.toContain(workStudy.label)
    expect(selected.context.map(f => f.nature)).toEqual(['work_study'])
  })

  it('un besoin connu de l’espace figure dans les forts (« N besoins connus » n’est jamais seul)', () => {
    const projects = NEEDS.slice(0, 6).map((label, i) =>
      fact({ label: `Programme : ${label}`, date: `2026-10-0${i + 1}` }),
    )
    const need = fact({
      type: 'tender',
      label: 'Refonte du MES des usines',
      date: '2026-06-01',
      fromSpace: true,
      nature: 'need',
    })
    const selected = selectCardFacts([...projects, need], { now, companyName: company })
    expect(selected.strong.map(f => f.label)).toContain('Refonte du MES des usines')
  })

  it('dédoublonne : trois sources du même chiffre d’affaires = une ligne, qui garde un lien', () => {
    const selected = selectCardFacts(
      [
        fact({ label: "Latécoère : chiffre d'affaires S1 2026 en hausse de 15 %", date: '2026-09-25' }),
        fact({
          label: 'Latecoere affiche un CA semestriel de +15% sur S1 2026',
          date: '2026-09-26',
          url: 'https://example.org/a',
        }),
        fact({ label: "Latécoère publie un chiffre d'affaires S1 2026 en hausse de 15 %", date: '2026-09-27' }),
      ],
      { now, companyName: company },
    )
    expect(selected.context).toHaveLength(1)
    expect(selected.context[0]?.url).toBe('https://example.org/a')
  })

  it('aucun acte de capital, aucun titre vide, aucun fait de plus de 180 j ne passe', () => {
    const selected = selectCardFacts(
      [
        fact({ type: 'legal', label: 'Modification survenue sur le capital', date: '2026-09-01' }),
        fact({ label: 'Lerevenu', date: '2026-09-30' }),
        fact({ type: 'tender', label: 'Maintenance applicative du SI achats', date: '2026-01-20' }),
      ],
      { now, companyName: company },
    )
    expect(selected.strong).toEqual([])
    expect(selected.context).toEqual([])
  })

  it('un fait fort ne se répète jamais dans le contexte', () => {
    const selected = selectCardFacts(
      [
        fact({ type: 'hiring', label: 'Ingénieur systèmes embarqués H/F' }),
        fact({ label: 'Latécoère expose au salon du Bourget' }),
      ],
      { now, companyName: company },
    )
    expect(selected.strong).toHaveLength(1)
    expect(selected.context).toHaveLength(1)
    expect(selected.context[0]?.nature).toBe('event')
  })
})

// G-FIX #4294.10 — recette PROD 20/10 (Veolia) : deux signaux « après 20 % de baisse » datés 10/10 et 11/10 faisaient
// deux cartes. Un même fait ne s'affiche qu'une fois, même quand la 2e source le range sous une autre nature ; la
// date la plus ANCIENNE reste affichée (première vue).
describe('G-FIX #4294.10 — les jumeaux d’un même fait', () => {
  const first = fact({
    label: 'Veolia : le titre perd 20 % de sa valeur, un programme de rachat d’actions est annoncé',
    date: '2026-10-10',
  })
  const second = fact({ label: 'Après 20 % de baisse, le titre Veolia perd de sa valeur', date: '2026-10-11' })

  it('même chiffre + mots du titre en commun ⇒ un seul fait, quelle que soit la nature rangée', () => {
    expect(isSameCardFact(first, second, company)).toBe(true)
  })

  it('une seule carte, datée de la PREMIÈRE vue (la plus ancienne)', () => {
    const selected = selectCardFacts([first, second], { now, companyName: company })
    const all = [...selected.strong, ...selected.context]
    expect(all).toHaveLength(1)
    expect(all[0]?.date).toBe('2026-10-10')
  })

  it('dit NON : deux faits qui partagent seulement un chiffre restent deux faits', () => {
    const other = fact({
      label: 'Veolia ouvre 20 postes de techniciens à Lyon pour un nouveau centre',
      date: '2026-10-11',
    })
    expect(isSameCardFact(first, other, company)).toBe(false)
  })

  it('dit NON : un même titre à plus de sept jours d’écart n’est pas le même fait', () => {
    expect(isSameCardFact(first, { ...second, date: '2026-10-19' }, company)).toBe(false)
  })
})
