import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema, discoverRegistryRequestSchema } from './discover.js'
import { APPLICATION_SECTOR_CODES } from './application-sectors.js'
import {
  CRITERIA_WIDEN_MIN_RESULTS,
  SECTOR_NEIGHBOURS,
  SKILLS,
  SKILL_FAMILIES,
  SKILL_WRITTEN_FORMS,
  canonicalSkill,
  candidateWidenedBySkill,
  criteriaWidenedBySchema,
  sectorWideningTiers,
  sizeBandOf,
  sizeBandOfRange,
  sizeWideningTiers,
  skillDistance,
  skillWideningTiers,
  widenedByLabel,
} from './criteria-referential.js'

// #4434 / #4435 / #4436 (épopée #4433) — UN référentiel, trois axes, des paliers.

describe('#4434 — compétences : alias → famille → domaine', () => {
  it('couvre au moins les 60 compétences les plus citées du dépôt', () => {
    expect(Object.keys(SKILLS).length).toBeGreaterThanOrEqual(60)
    // Les plus citées dans les fixtures, la démo, les tests IA et les offres (relevé du 21/10).
    for (const term of [
      'Java',
      'SQL',
      'Python',
      'DevOps',
      'SAP',
      'TypeScript',
      'JavaScript',
      'Kubernetes',
      'PHP',
      'Symfony',
      'Angular',
      'AWS',
      'React',
      '.NET',
      'C#',
      'Docker',
      'Node',
      'C++',
      'Salesforce',
      'Agile',
      'Azure',
      'Kotlin',
      'GCP',
      'Flutter',
      'Swift',
      'LLM',
      'Vue',
      'Scrum',
      'Redis',
      'Spring',
      'MLOps',
      'Oracle',
      'Terraform',
      'Kafka',
      'iOS',
      'Machine Learning',
      'Power BI',
      'PostgreSQL',
      'Spark',
      'Android',
      'Snowflake',
      'ServiceNow',
      'Rust',
      'MongoDB',
      'Talend',
      'Tableau',
      'SAFe',
      'MySQL',
      'Databricks',
      'Airflow',
      'Scala',
      'Next.js',
      'HTML',
      'Hadoop',
      'Ansible',
      'dbt',
      'Linux',
      'CSS',
      'Ruby',
      'Django',
      'GraphQL',
      'Elasticsearch',
    ]) {
      expect(canonicalSkill(term), term).not.toBeNull()
    }
  })

  it('chaque compétence a une famille, chaque famille un domaine', () => {
    const families = SKILL_FAMILIES as Record<string, { domain: string }>
    for (const [key, entry] of Object.entries(SKILLS)) {
      expect(families[entry.family], key).toBeDefined()
    }
  })

  it('un intitulé non normé se rattache au référentiel (« dev front React/Next »)', () => {
    expect(canonicalSkill('dev front React/Next')).toBe('react')
    expect(canonicalSkill('Développeur Ruby on Rails')).toBe('ruby')
    expect(canonicalSkill('Permis B')).toBeNull()
  })

  it('React → palier 1 JavaScript d’abord (famille), palier 2 le développement web (domaine)', () => {
    const tiers = skillWideningTiers('React')
    expect(tiers.map(t => t.tier)).toEqual([1, 2])
    expect(tiers[0]?.items[0]).toEqual({ code: 'javascript', search: 'JavaScript' })
    expect(tiers[0]?.items.map(i => i.code)).toContain('typescript')
    expect(tiers[0]?.items.map(i => i.code)).not.toContain('react')
    expect(tiers[1]?.items.every(i => i.code === 'web')).toBe(true)
  })

  // #4433.2 — « Clojure » à zéro tentait AUCUN palier : « tout s'élargit, jamais zéro » (c125/c126).
  it('Clojure, Elixir, Haskell… ont une famille : leurs voisins sont les autres langages fonctionnels', () => {
    for (const name of ['Clojure', 'Elixir', 'Haskell', 'OCaml', 'Erlang', 'F#']) {
      const tiers = skillWideningTiers(name)
      expect(
        tiers.map(t => t.tier),
        name,
      ).toEqual([1, 2])
      expect(
        tiers[0]?.items.map(i => i.code),
        name,
      ).not.toContain(canonicalSkill(name))
      expect(tiers[1]?.items.every(i => i.code === 'web')).toBe(true)
    }
    expect(canonicalSkill('fsharp')).toBe('f#')
  })

  it('une compétence inconnue tombe au palier 2, le domaine « développement web » — jamais zéro palier', () => {
    const tiers = skillWideningTiers('Outil maison Zephyr')
    expect(tiers.map(t => t.tier)).toEqual([2])
    expect(tiers[0]?.items.every(i => i.code === 'web')).toBe(true)
    expect(skillWideningTiers('   ')).toEqual([])
  })

  it('distance : 0 alias, 1 famille, 2 domaine, null ailleurs', () => {
    expect(skillDistance('k8s', 'Kubernetes')).toBe(0)
    expect(skillDistance('React', 'JavaScript')).toBe(1)
    expect(skillDistance('React', 'Java')).toBe(2)
    expect(skillDistance('React', 'SAP')).toBeNull()
    expect(skillDistance('React', 'Permis B')).toBeNull()
  })
})

describe('#4435 — secteurs voisins', () => {
  it('chaque secteur partagé a des voisins, tous connus', () => {
    for (const code of APPLICATION_SECTOR_CODES) {
      expect(SECTOR_NEIGHBOURS[code]?.length ?? 0, code).toBeGreaterThan(0)
      for (const neighbour of SECTOR_NEIGHBOURS[code] ?? []) expect(APPLICATION_SECTOR_CODES).toContain(neighbour)
    }
  })

  it('aéronautique → défense au palier 1, le reste de l’industrie au palier 2, jamais deux fois', () => {
    const tiers = sectorWideningTiers(['aerospace'])
    expect(tiers[0]?.items).toEqual(['defense', 'air_transport', 'naval', 'electronics_semiconductor'])
    expect(tiers[1]?.items).toContain('automotive')
    expect(tiers[1]?.items).not.toContain('defense')
    expect(tiers[1]?.items).not.toContain('aerospace')
  })

  it('banque ↔ assurance, fintech', () => {
    expect(sectorWideningTiers(['retail_banking'])[0]?.items.slice(0, 2)).toEqual(['insurance', 'fintech'])
  })

  it('un secteur inconnu n’élargit rien', () => {
    expect(sectorWideningTiers(['inconnu'])).toEqual([])
  })
})

describe('#4436 — tailles voisines', () => {
  it('les tailles maison : TPE < 10 · PME 10-249 · ETI 250-999 · GC ≥ 1000', () => {
    expect(sizeBandOf(9)).toBe('TPE')
    expect(sizeBandOf(10)).toBe('PME')
    expect(sizeBandOf(999)).toBe('ETI')
    expect(sizeBandOf(1000)).toBe('GC')
    expect(sizeBandOfRange({ min: 250, max: 499 })).toBe('ETI')
  })

  it('une taille non publiée n’a aucune tranche — jamais « 0 »', () => {
    expect(sizeBandOf(null)).toBeNull()
    expect(sizeBandOf(undefined)).toBeNull()
  })

  it('ETI → PME et GC au palier 1, TPE au palier 2', () => {
    expect(sizeWideningTiers([{ min: 250, max: 999 }])).toEqual([
      { tier: 1, items: ['PME', 'GC'] },
      { tier: 2, items: ['TPE'] },
    ])
  })

  it('GC seule → ETI puis PME', () => {
    expect(sizeWideningTiers([{ min: 1000, max: null }])).toEqual([
      { tier: 1, items: ['ETI'] },
      { tier: 2, items: ['PME'] },
    ])
  })
})

describe('#4433 — l’étiquette d’un résultat élargi', () => {
  it('le seuil est unique : 25 (#4673)', () => {
    expect(CRITERIA_WIDEN_MIN_RESULTS).toBe(25)
  })

  it('nomme ce qui a fait remonter le résultat, en français et en anglais', () => {
    expect(widenedByLabel({ axis: 'skill', tier: 1, code: 'javascript' }, 'fr')).toBe('JavaScript')
    expect(widenedByLabel({ axis: 'skill', tier: 2, code: 'web' }, 'fr')).toBe('développement web')
    expect(widenedByLabel({ axis: 'skill', tier: 2, code: 'web' }, 'en')).toBe('web development')
    expect(widenedByLabel({ axis: 'sector', tier: 1, code: 'defense' }, 'fr')).toBe('défense')
    expect(widenedByLabel({ axis: 'size', tier: 1, code: 'GC' }, 'fr')).toBe('GC')
    expect(widenedByLabel({ axis: 'size', tier: 1, code: null }, 'fr')).toBeNull()
  })

  it('le schéma refuse un palier 0 ou 3 (un résultat exact ne porte pas d’étiquette)', () => {
    expect(criteriaWidenedBySchema.safeParse({ axis: 'skill', tier: 0, code: 'x' }).success).toBe(false)
    expect(criteriaWidenedBySchema.safeParse({ axis: 'skill', tier: 3, code: 'x' }).success).toBe(false)
  })

  it('un compte élargi par compétence est prouvé par son offre ; un compte exact sans élargissement ne l’est pas ici', () => {
    const evidence = { offerCount: 2 }
    expect(
      candidateWidenedBySkill({ widenedBy: { axis: 'skill', tier: 1, code: 'javascript' }, skillEvidence: evidence }),
    ).toBe(true)
    expect(
      candidateWidenedBySkill({ widenedBy: { axis: 'sector', tier: 1, code: 'defense' }, skillEvidence: evidence }),
    ).toBe(false)
    expect(candidateWidenedBySkill({ skillEvidence: evidence })).toBe(false)
    expect(candidateWidenedBySkill({ widenedBy: { axis: 'skill', tier: 1, code: 'javascript' } })).toBe(false)
  })
})

describe('#4433 — le contrat Découvrir porte l’élargissement', () => {
  it('un candidat garde `widenedBy`, la requête accepte `strictCriteria`', () => {
    const candidate = discoverCandidateSchema.parse({
      name: 'ACME WEB',
      siren: '552100554',
      nafCode: '62.01Z',
      sector: null,
      city: 'PARIS',
      department: '75',
      headcountRange: null,
      creationDate: null,
      score: null,
      scoreFactors: [],
      signals: [],
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [],
      widenedBy: { axis: 'skill', tier: 1, code: 'javascript' },
    })
    expect(candidate.widenedBy).toEqual({ axis: 'skill', tier: 1, code: 'javascript' })
    expect(discoverRegistryRequestSchema.parse({ strictCriteria: true }).strictCriteria).toBe(true)
  })
})

describe('#4579 — les écritures d’une compétence (déclinaisons d’écriture SEULEMENT)', () => {
  it('chaque clé est une compétence canonique du référentiel', () => {
    for (const key of Object.keys(SKILL_WRITTEN_FORMS)) expect(Object.keys(SKILLS)).toContain(key)
  })

  it('« vue » et « java » sont déclinés comme décidé', () => {
    expect(SKILL_WRITTEN_FORMS['vue.js']).toEqual(['vue', 'vue.js', 'vuejs', 'vue 3', 'nuxt', 'nuxt.js'])
    expect(SKILL_WRITTEN_FORMS.java).toEqual(['java', 'java 17', 'j2ee', 'jee', 'spring', 'spring boot', 'jakarta ee'])
  })

  it('aucune écriture ne désigne une AUTRE compétence (ni écosystème, ni proximité)', () => {
    const family = (code: string): string | undefined =>
      (SKILLS as Readonly<Record<string, { family: string }>>)[code]?.family
    for (const [key, forms] of Object.entries(SKILL_WRITTEN_FORMS)) {
      for (const form of forms) {
        // #4579 L5 : nuxt / spring sont des écritures d'annonce de leur famille ; jamais une autre famille.
        const canonical = canonicalSkill(form)
        expect(canonical === null || family(canonical) === family(key), `${key} ⇒ ${form}`).toBe(true)
      }
    }
    const all = Object.values(SKILL_WRITTEN_FORMS).flat() as string[]
    for (const forbidden of ['pinia', 'javascript']) expect(all).not.toContain(forbidden)
  })

  it('toute écriture se lit comme la compétence de sa clé', () => {
    for (const [key, forms] of Object.entries(SKILL_WRITTEN_FORMS)) {
      for (const form of forms) {
        // #4579 L5 : une écriture peut être une AUTRE canonique (spring), mais seulement de la MÊME famille.
        const canonical = canonicalSkill(form)
        const sameFamily =
          canonical !== null &&
          (SKILLS as Readonly<Record<string, { family: string }>>)[canonical]?.family ===
            (SKILLS as Readonly<Record<string, { family: string }>>)[key]?.family
        expect(canonical === null || canonical === key || sameFamily, `${key} ⇒ ${form}`).toBe(true)
      }
    }
  })
})

describe('lot R (#4519) — expertiseTradeTerms', () => {
  it('« Data & IA » se traduit en métiers, quelle que soit l’écriture', async () => {
    const { expertiseTradeTerms } = await import('./criteria-referential.js')
    expect(expertiseTradeTerms('Data & IA')).toContain('data scientist')
    expect(expertiseTradeTerms('  data et ia ')).toContain('data engineer')
  })

  it('une compétence ou une expertise inconnue n’est pas traduite (jamais devinée)', async () => {
    const { expertiseTradeTerms } = await import('./criteria-referential.js')
    expect(expertiseTradeTerms('Vue')).toBeNull()
    expect(expertiseTradeTerms('')).toBeNull()
  })
})
