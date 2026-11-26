import { describe, expect, it } from 'vitest'
import { accountAnalysisSchema, parseAccountAnalysis } from './account-analysis.js'

describe('parseAccountAnalysis plan output', () => {
  it('normalizes offers and competitive strategy from the IA camelCase payload', () => {
    const analysis = parseAccountAnalysis({
      plan: {
        offersToPropose: [
          {
            title: 'Audit DevOps/MLOps',
            estimatedTeamSize: '1-2 consultants seniors',
          },
        ],
        competitiveStrategy: {
          positioningStatement: 'Une expertise senior sans rotation.',
          vsCompetitors: [{ competitor: 'Sopra Steria', talkingPoint: 'Livrer en quatre semaines.' }],
        },
      },
    })

    expect(analysis.plan).toEqual({
      offers_to_propose: [
        {
          title: 'Audit DevOps/MLOps',
          estimated_team_size: '1-2 consultants seniors',
        },
      ],
      competitive_strategy: {
        positioning_statement: 'Une expertise senior sans rotation.',
        vs_competitors: [{ competitor: 'Sopra Steria', talking_point: 'Livrer en quatre semaines.' }],
      },
    })
  })

  it('normalizes the ESN implications from the research payload', () => {
    const analysis = parseAccountAnalysis({
      itImplicationsForEsn: 'Modernisation cloud et renforcement cybersécurité.',
    })

    expect(analysis.it_implications_for_esn).toBe('Modernisation cloud et renforcement cybersécurité.')
  })

  it('surfaces the collected public-data blocks (financials, tenders, jobs, github, tech, owners)', () => {
    const analysis = parseAccountAnalysis({
      legalForm: 'SA',
      capital: 1500000,
      pappersUrl: 'https://pappers.fr/entreprise/x',
      financialsHistory: [{ year: 2023, revenue: 100, netResult: 5, headcount: 12 }],
      beneficialOwners: [{ name: 'Jean Dupont', detentionPart: 55, detentionVote: 55 }],
      detectedTechStack: ['React', 'AWS'],
      githubSignals: { org: 'acme', url: 'https://github.com/acme', publicRepos: 40, topLanguages: ['Go', 'TS'] },
      publicTenders: [
        { title: 'Refonte SI', buyer: 'Ville de X', publishedDate: '2026-05-01', url: 'https://boamp/x' },
      ],
      awardedContracts: [{ title: 'TMA', buyer: 'Région Y', winner: 'Capgemini', amount: 500000 }],
      itJobSignals: [{ title: 'Dev Java', company: 'Acme', contractType: 'CDI', skills: ['Java'], source: 'apec' }],
    })

    expect(analysis.legal_form).toBe('SA')
    expect(analysis.capital).toBe(1500000)
    expect(analysis.financials_history).toEqual([{ year: 2023, revenue: 100, net_result: 5, headcount: 12 }])
    expect(analysis.beneficial_owners?.[0]).toEqual({ name: 'Jean Dupont', detention_part: 55, detention_vote: 55 })
    expect(analysis.detected_tech_stack).toEqual(['React', 'AWS'])
    expect(analysis.github_signals?.top_languages).toEqual(['Go', 'TS'])
    expect(analysis.public_tenders?.[0]?.published_date).toBe('2026-05-01')
    expect(analysis.awarded_contracts?.[0]?.winner).toBe('Capgemini')
    expect(analysis.it_job_signals?.[0]?.contract_type).toBe('CDI')
  })

  it('#2322.70 — une offre porte sa « tension » quand la source la signale, et rien sinon', () => {
    const analysis = parseAccountAnalysis({
      itJobSignals: [
        { title: 'Architecte cloud', source: 'France Travail', tension: true },
        { title: 'Dev Java', source: 'apec' },
      ],
    })
    expect(analysis.it_job_signals?.[0]?.tension).toBe(true)
    // Contrat ADDITIF : une offre sans le champ reste valide, et le champ reste absent.
    expect(analysis.it_job_signals?.[1]).not.toHaveProperty('tension')
  })

  it('#2322.70 — rôle, équipe et raison de la tension traversent le contrat, absents sinon', () => {
    const analysis = parseAccountAnalysis({
      itJobSignals: [
        {
          title: 'Data Engineer',
          role: 'data_ia',
          team: 'plateforme data',
          tension: true,
          tension_reason: 'online_long',
          tension_days: 75,
        },
        { title: 'Dev' },
      ],
    })
    expect(analysis.it_job_signals?.[0]).toMatchObject({
      role: 'data_ia',
      team: 'plateforme data',
      tension_reason: 'online_long',
      tension_days: 75,
    })
    for (const key of ['role', 'team', 'tension_reason', 'tension_days']) {
      expect(analysis.it_job_signals?.[1]).not.toHaveProperty(key)
    }
  })

  it('#3916 — keeps the BODACC legal notices, and tolerates their absence', () => {
    const analysis = parseAccountAnalysis({
      legalSignals: [
        {
          type: 'Procédure collective',
          label: 'ACME',
          date: '2026-06-17',
          url: 'https://www.bodacc.fr/x',
          severity: 'risk',
        },
        { type: 'Dépôts des comptes', date: null, url: null },
      ],
    })
    expect(analysis.legal_signals?.[0]?.severity).toBe('risk')
    expect(analysis.legal_signals?.[0]?.url).toBe('https://www.bodacc.fr/x')
    expect(analysis.legal_signals?.[1]?.url).toBeNull()
    expect(parseAccountAnalysis({})).not.toHaveProperty('legal_signals')
  })

  it('keeps the US SEC/EDGAR financial snapshot (camelCase → snake_case)', () => {
    const analysis = parseAccountAnalysis({
      usSecFinancials: {
        cik: '0001352010',
        filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010&type=10-K',
        detailUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010',
        revenues: [{ end: '2025-12-31', val: 5457056000, filed: '2026-02-26' }],
        netIncome: [{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }],
        sharesOutstanding: { end: '2026-04-30', val: 52244451, filed: '2026-02-26' },
        filings: [
          {
            form: '10-K',
            date: '2026-02-26',
            title: 'SEC 10-K du 2026-02-26',
            url: 'https://www.sec.gov/Archives/edgar/data/1352010/x.htm',
          },
        ],
      },
    })

    expect(analysis.us_sec_financials?.cik).toBe('0001352010')
    expect(analysis.us_sec_financials?.filing_url).toContain('type=10-K')
    expect(analysis.us_sec_financials?.revenues?.[0]).toEqual({
      end: '2025-12-31',
      val: 5457056000,
      filed: '2026-02-26',
    })
    expect(analysis.us_sec_financials?.net_income?.[0]?.val).toBe(377678000)
    expect(analysis.us_sec_financials?.shares_outstanding?.val).toBe(52244451)
    expect(analysis.us_sec_financials?.filings?.[0]?.url).toContain('/Archives/edgar/data/1352010/')
  })

  // #2291.2 (lot R, 19/09/2026) — le modèle de contrat OBSERVÉ survit à la
  // recherche : sans ce champ déclaré, `parseAccountAnalysis` (qui ne copie
  // QUE les clés de `accountAnalysisShape`, jamais un passthrough) jetterait
  // silencieusement `contract_model` — l'écran ne verrait jamais rien.
  it('keeps the observed contract model (camelCase → snake_case, nested included)', () => {
    const analysis = parseAccountAnalysis({
      contractModel: {
        observedAt: '2026-09-19',
        jobOffers: {
          source: 'France Travail',
          total: 3,
          counts: { permanent: 2, fixedTerm: 0, interim: 0, freelance: 1, other: 0 },
          since: '2026-08-01',
          until: '2026-09-15',
        },
        publicContracts: null,
      },
    })

    expect(analysis.contract_model?.observed_at).toBe('2026-09-19')
    expect(analysis.contract_model?.job_offers?.source).toBe('France Travail')
    expect(analysis.contract_model?.job_offers?.counts).toEqual({
      permanent: 2,
      fixed_term: 0,
      interim: 0,
      freelance: 1,
      other: 0,
    })
    expect(analysis.contract_model?.public_contracts).toBeNull()
  })

  it('keeps a searched-but-not-observed contract model as null, never dropping the key', () => {
    const analysis = parseAccountAnalysis({ contractModel: null })
    expect(analysis.contract_model).toBeNull()
  })

  it('names contract_model at the contract, next to us_sec_financials', () => {
    expect(Object.keys(accountAnalysisSchema.shape)).toContain('contract_model')
  })

  // `raw_analysis.addressability` est écrit en production depuis le 06/09
  // (`phase1_research.py:1535` → `addressability_for_company`) mais absente du
  // contrat : la garde de parité démo (`demo-coverage.spec.ts`) lit
  // `accountAnalysisSchema.shape`, donc une clé qui n'y est pas ne peut jamais
  // manquer. Personne ne peut garder ce qui n'a pas de nom.
  it('names addressability at the contract, next to access_barrier', () => {
    expect(Object.keys(accountAnalysisSchema.shape)).toContain('addressability')
  })

  it('parses a well-formed addressability block — score, max, unmeasured axes, factors', () => {
    const analysis = parseAccountAnalysis({
      addressability: {
        score: 2,
        max: 6,
        unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
        factors: [
          {
            label: 'Semi-ouvert — estimation de registre',
            points: 2,
            evidence: 'barrière estimée 5.7/10 sur 5 proxies publics (classe C)',
            axis: 'lock',
            block: 'accessibility',
          },
        ],
      },
    })

    expect(analysis.addressability?.score).toBe(2)
    expect(analysis.addressability?.max).toBe(6)
    expect(analysis.addressability?.unmeasured).toContain('relation')
    expect(analysis.addressability?.factors).toHaveLength(1)
  })

  it('accepts an absent addressability — thousands of analyses predate the producer', () => {
    const analysis = parseAccountAnalysis({ business_description: 'x' })
    expect(analysis.addressability).toBeUndefined()
  })

  // #3677 (réfuté prod 07/10) — l'IA écrit `programNames: list[str]` ; un tableau de chaînes faisait
  // jeter TOUT le champ, donc la carte « Projets et transformations » n'existait pour aucun compte.
  it('#3677 — des programmes écrits en chaînes se lisent comme { name }, sans rien inventer', () => {
    const analysis = parseAccountAnalysis({
      programNames: ['Plan stratégique Ambition 2026', { name: 'Refonte SI Paiements', horizon: '2027' }],
    })
    expect(analysis.program_names).toEqual([
      { name: 'Plan stratégique Ambition 2026' },
      { name: 'Refonte SI Paiements', horizon: '2027' },
    ])
  })

  it('#3677 — sait dire NON : une entrée illisible est écartée, pas fabriquée', () => {
    const analysis = parseAccountAnalysis({ programNames: [42] })
    expect(analysis.program_names).toBeUndefined()
  })
})
