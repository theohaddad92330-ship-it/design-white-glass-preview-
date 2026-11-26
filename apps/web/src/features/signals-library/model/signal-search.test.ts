import { describe, expect, it } from 'vitest'
import {
  highlightParts,
  normalizeSearchText,
  parseSearch,
  scoreSearch,
  searchFieldsOf,
  type SearchFields,
  VARIANT_GROUPS,
} from './signal-search'

const NOW = Date.UTC(2026, 10, 1)
const fields = (over: Partial<SearchFields> = {}): SearchFields => ({
  title: '',
  skills: [],
  detail: '',
  account: 'Acme',
  dateMs: null,
  ...over,
})
const score = (query: string, over: Partial<SearchFields>) => {
  const parsed = parseSearch(query)
  return parsed ? (scoreSearch(parsed, fields(over), NOW)?.score ?? null) : null
}

describe('lot 768 — recherche par pertinence : normalisation', () => {
  it('plie accents, casse et ponctuation', () => {
    expect(normalizeSearchText('Ingénieur Data/BI — H/F')).toBe('ingenieur data bi h f')
  })
  it('une requête vide ou de ponctuation ne cherche rien', () => {
    expect(parseSearch('')).toBeNull()
    expect(parseSearch('  -- ')).toBeNull()
  })
})

describe('lot 768 — variantes métier', () => {
  it('« power bi » trouve PowerBI et Power-BI', () => {
    for (const title of ['Consultant PowerBI senior', 'Consultant Power-BI', 'Consultant Power BI']) {
      expect(score('power bi', { title })).not.toBeNull()
    }
    expect(score('powerbi', { title: 'Consultant Power BI' })).not.toBeNull()
    expect(score('pbi', { title: 'Consultant Power BI' })).not.toBeNull()
  })
  it('« po » trouve Product Owner, et l’inverse ; « po » ne trouve pas « port »', () => {
    expect(score('po', { title: 'Product Owner confirmé' })).not.toBeNull()
    expect(score('product owner', { title: 'PO data' })).not.toBeNull()
    expect(score('po', { title: 'Chef de port' })).toBeNull()
  })
  it('devops, scrum master, data engineer', () => {
    expect(score('devops', { title: 'Ingénieur Dev Ops' })).not.toBeNull()
    expect(score('dev ops', { title: 'Ingénieur DevOps' })).not.toBeNull()
    expect(score('scrum master', { title: 'ScrumMaster' })).not.toBeNull()
    expect(score('data engineer', { title: 'Ingénieur data' })).not.toBeNull()
  })
  it('chaque variante du dictionnaire se retrouve (garde du dictionnaire)', () => {
    for (const group of VARIANT_GROUPS) {
      for (const left of group) for (const right of group) expect(score(left, { title: right })).not.toBeNull()
    }
  })
})

describe('lot 768 — mots, expressions, pluriels', () => {
  it('tous les mots doivent apparaître, dans un champ ou un autre', () => {
    const f = { title: 'Product Owner', skills: ['Power BI'] }
    expect(score('product owner power bi', f)).not.toBeNull()
    expect(score('product owner kafka', f)).toBeNull()
  })
  it('une expression entre guillemets veut les mots d’un tenant', () => {
    expect(score('"owner product"', { title: 'Product Owner' })).toBeNull()
    expect(score('"product owner"', { title: 'Un Product Owner' })).not.toBeNull()
  })
  it('pluriel simple et début de mot', () => {
    expect(score('owners', { title: 'Product Owner' })).not.toBeNull()
    expect(score('analyst', { title: 'Data Analysts' })).not.toBeNull()
    expect(score('pow', { title: 'Power BI' })).not.toBeNull()
  })
  it('« java » ne trouve pas « javascript » en mot entier (seulement en début de mot, plus bas)', () => {
    const whole = score('java', { title: 'Développeur Java' })!
    const prefix = score('java', { title: 'Développeur JavaScript' })!
    expect(whole).toBeGreaterThan(prefix)
  })
})

describe('lot 768 — le rang', () => {
  it('le titre passe devant le détail, qui passe devant le seul nom du compte', () => {
    const inTitle = score('power bi', { title: 'Consultant Power BI' })!
    const inSkills = score('power bi', { title: 'Consultant', skills: ['Power BI'] })!
    const inDetail = score('power bi', { title: 'Consultant data', detail: 'Reporting Power BI' })!
    const inAccount = score('power bi', { title: 'Consultant data', account: 'Power BI France' })!
    expect(inTitle).toBeGreaterThan(inSkills)
    expect(inSkills).toBeGreaterThan(inDetail)
    expect(inDetail).toBeGreaterThan(inAccount)
  })
  it('l’expression exacte ajoute un bonus', () => {
    const together = score('kafka streaming', { title: 'Kafka Streaming' })!
    const apart = score('kafka streaming', { title: 'Streaming de Kafka' })!
    expect(together).toBeGreaterThan(apart)
  })
  it('la récence ne vaut qu’un point : jamais devant un meilleur champ', () => {
    const recentDetail = score('data', { detail: 'data', dateMs: NOW })!
    const oldTitle = score('data', { title: 'data', dateMs: NOW - 10 * 365 * 86_400_000 })!
    expect(oldTitle).toBeGreaterThan(recentDetail)
    const recent = score('data', { title: 'data', dateMs: NOW - 30 * 86_400_000 })!
    expect(recent).toBeGreaterThan(oldTitle)
  })
})

describe('lot 768 — surlignage', () => {
  const hits = (text: string, query: string) =>
    highlightParts(text, parseSearch(query))
      .filter(p => p.hit)
      .map(p => p.text)
  it('garde l’écriture d’origine (accents, casse, tiret)', () => {
    expect(hits('Chef de projet Power-BI à Lyon', 'power bi')).toEqual(['Power-BI'])
    expect(hits('Ingénieur DATA', 'ingenieur data')).toEqual(['Ingénieur DATA'])
  })
  it('surligne la variante trouvée', () => {
    expect(hits('Nouveau Product Owner', 'po')).toEqual(['Product Owner'])
  })
  it('rien à surligner sans requête ni correspondance', () => {
    expect(highlightParts('Texte', null)).toEqual([{ text: 'Texte', hit: false }])
    expect(hits('Texte', 'zzz')).toEqual([])
  })
  it('recompose le texte sans perte', () => {
    const parts = highlightParts('Dév. PowerBI & Data', parseSearch('power bi data'))
    expect(parts.map(p => p.text).join('')).toBe('Dév. PowerBI & Data')
  })
})

describe('lot 772 b) — le surlignage lit ce que le score compte : les débuts de mot aussi', () => {
  it('« product » trouve « Production » ET le surligne (début de mot), sans surligner le milieu d’un mot', () => {
    const search = parseSearch('product')!
    expect(highlightParts('Production de contenus', search)).toEqual([
      { text: 'Product', hit: true },
      { text: 'ion de contenus', hit: false },
    ])
    expect(highlightParts('Reproduction', search)).toEqual([{ text: 'Reproduction', hit: false }])
  })

  it('un mot entier reste surligné entier ; « po » (trop court pour un début de mot) ne surligne que le mot entier', () => {
    expect(highlightParts('Product Owner à Paris', parseSearch('po')!)).toEqual([
      { text: 'Product Owner', hit: true },
      { text: ' à Paris', hit: false },
    ])
    expect(highlightParts('Pôle data', parseSearch('po')!)).toEqual([{ text: 'Pôle data', hit: false }])
  })

  it('les titres rapprochés d’un besoin (lignes regroupées) sont cherchés aussi', () => {
    const fields = searchFieldsOf({
      companyName: 'Viveris',
      signalLabel: 'Offre de développeur',
      signalLine: { merged: [{ title: 'Développeur Java senior', date: '2026-05-01', url: null }] },
    } as never)
    expect(scoreSearch(parseSearch('java')!, fields)).not.toBeNull()
  })
})
