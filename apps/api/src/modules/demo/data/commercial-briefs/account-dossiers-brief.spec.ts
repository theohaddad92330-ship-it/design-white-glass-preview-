import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

/**
 * Briefs des QUATRE dossiers de compte déposés par Théo le 15/10/2026 (Crédit Agricole, VINCI, Enedis, Safran) — les
 * JSON versionnés, convertis par `pnpm --filter @bellum/api convert:account-dossier` (cœur partagé
 * `scripts/commercial-brief/account-dossier.ts`, un mapping par compte dans `dossiers/`). Les packs sont hors dépôt :
 * ce spec fige ce que la conversion a MESURÉ, pour qu'un régénéré qui dérive fasse échouer la CI. Les nombres sont des
 * mesures des packs, pas des cibles choisies.
 */

type Expected = {
  slug: string
  account: string
  /** L'ESN prospect de la démo et son interlocuteur : jamais lisibles (décision Louis 15/10). */
  prospect: RegExp
  people: number
  roles: Record<string, number>
  withEmail: number
  domain: RegExp
  sections: string[]
  hq: { city: string }
}

const EXPECTED: readonly Expected[] = [
  {
    slug: 'credit-agricole',
    account: 'Crédit Agricole',
    prospect: /soluxan|\balan\b|dervoet/i,
    people: 403,
    roles: { decision_maker: 18, contact: 155, external: 12, alumni: 218 },
    withEmail: 103,
    domain:
      /@(?:[\w-]+\.)*(?:credit-agricole(?:-sa)?\.(?:com|fr)|ca-[\w-]+\.(?:com|fr)|lcl\.fr|amundi\.(?:com|fr)|caceis\.com)$/i,
    sections: [
      'fiche-compte',
      'marche',
      'projets-2026-2027',
      'achats-avant-d-appeler',
      'besoins-en-base',
      'presence-sur-site',
      'dirigeants-publics',
      'decideurs',
      'partenaires',
      'consultants-par-zone',
      'villes-consultants',
      'sites-officiels',
      'sources',
    ],
    hq: { city: 'Montrouge' },
  },
  {
    slug: 'vinci',
    account: 'VINCI',
    prospect: /\bmk4|technova|\bkhey\b|soo ?it|hamadache/i,
    people: 255,
    roles: { decision_maker: 83, contact: 56, external: 7, alumni: 109 },
    withEmail: 98,
    domain:
      /@(?:[\w-]+\.)*(?:vinci(?:-[\w-]+)?\.(?:com|fr)|axians\.(?:com|fr)|actemium\.(?:com|fr)|omexom\.(?:com|fr)|cofiroute\.fr|escota\.fr|asf\.fr)$/i,
    sections: [
      'fiche-compte',
      'marche',
      'marche-par-metier',
      'projets-2026-2027',
      'postes-ouverts',
      'achats-avant-d-appeler',
      'besoins-en-base',
      'dirigeants-publics',
      'decideurs',
      'prestataires-publics',
      'consultants-par-entite',
      'villes-consultants',
      'sites-officiels',
      'sources',
    ],
    hq: { city: 'Nanterre' },
  },
  {
    slug: 'enedis',
    account: 'Enedis',
    prospect: /experis|mourao/i,
    people: 1598,
    roles: { decision_maker: 23, manager: 132, contact: 1442, alumni: 1 },
    withEmail: 54,
    domain: /@(?:[\w-]+\.)*enedis\.fr$/i,
    sections: [
      'fiche-compte',
      'marche',
      'marche-lecture',
      'projets-2026-2027',
      'achats-avant-d-appeler',
      'marche-referencement',
      'panels-groupe-edf',
      'organisation-dsi',
      'territoires',
      'lots-achats',
      'applications',
      'presence-sur-site',
      'prestataires-publics',
      'sources',
    ],
    hq: { city: 'Puteaux' },
  },
  {
    slug: 'safran',
    account: 'Safran',
    prospect: /\bjems\b|\bsadji\b|benhamou/i,
    people: 105,
    roles: { decision_maker: 2, manager: 28, contact: 58, external: 17 },
    withEmail: 0,
    domain: /@(?:[\w-]+\.)*safrangroup\.com$/i,
    sections: [
      'fiche-compte',
      'marche',
      'marche-lecture',
      'societes-du-groupe',
      'it-si-data',
      'double-erp',
      'projets-2026-2027',
      'achats-avant-d-appeler',
      'prestataires-publics',
      'sources',
    ],
    hq: { city: 'Paris' },
  },
]

const EMAIL = /[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g

describe.each(EXPECTED)('brief du dossier de compte « $account » (15/10/2026)', expected => {
  const raw = readFileSync(join(__dirname, `${expected.slug}.json`), 'utf8')
  const parsed = commercialBriefSchema.safeParse(JSON.parse(raw))
  const brief = parsed.success ? (parsed.data as CommercialBrief) : undefined
  /** Ce qui se LIT à l'écran : tout sauf les noms et coordonnées des personnes (des faits recopiés). */
  const visible = JSON.stringify({
    ...brief,
    people: (brief?.people ?? []).map(({ name: _n, email: _e, linkedin: _l, ...rest }) => rest),
  })

  it('passe le schéma du contrat ET ne porte AUCUNE violation métier', () => {
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([])
    expect(brief?.account_name).toBe(expected.account)
    expect(brief?.scope).toBe('france')
    expect(brief ? checkCommercialBrief(brief) : ['brief illisible']).toEqual([])
  })

  it('porte ses blocs mesurés, des KPI, des rubriques « ce que je sais » et des garde-fous', () => {
    expect(brief?.sections.map(section => section.key)).toEqual(expected.sections)
    expect(brief?.kpis).toHaveLength(6)
    expect(brief?.what_i_know.length).toBeGreaterThanOrEqual(7)
    expect(brief?.guardrails.length).toBeGreaterThanOrEqual(9)
    expect(brief?.headquarters.city).toBe(expected.hq.city)
    // les projets / signaux alimentent la Veille : la section porte la colonne lue par `briefRecentSignals`
    const projects = brief?.sections.find(section => section.key === 'projets-2026-2027')
    expect(projects?.rows.length).toBeGreaterThan(5)
    expect(projects?.rows.every(row => typeof row['projet_tendance'] === 'string')).toBe(true)
  })

  it('les personnes du fichier, décideurs en tête ; rôles mesurés', () => {
    expect(brief?.people).toHaveLength(expected.people)
    const counts: Record<string, number> = {}
    for (const person of brief?.people ?? []) counts[person.role ?? '—'] = (counts[person.role ?? '—'] ?? 0) + 1
    expect(counts).toEqual(expected.roles)
    const firstOther = (brief?.people ?? []).findIndex(person => person.role !== 'decision_maker')
    expect((brief?.people ?? []).slice(firstOther).some(person => person.role === 'decision_maker')).toBe(false)
    const names = (brief?.people ?? []).map(person => person.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  // Recette prod 16/10 : tuile CONTACTS 396 / onglet Personnes 403 (CA), 250 / 255 (VINCI) ; « 11 décideurs » / 18.
  // Un chiffre qui décrit les personnes semées ÉGALE ce que l'écran en compte.
  it('les chiffres de contacts et de décideurs affichés égalent le décompte des personnes semées', () => {
    const people = brief?.people ?? []
    const tile = brief?.kpis.find(kpi => kpi.label === 'CONTACTS')
    if (tile) {
      expect(Number(tile.value)).toBe(people.length)
      expect(tile.caption).toContain(`${people.filter(person => person.email).length} avec e-mail`)
      expect(tile.caption).toContain(`${people.filter(person => person.mobile).length} avec mobile`)
    }
    const known = brief?.what_i_know.find(entry => entry.rubric === 'CONTACTS')?.known
    if (known) {
      expect(known).toMatch(new RegExp(`^${people.length} contacts`))
      const deciders = people.filter(person => person.role === 'decision_maker').length
      expect(known).toContain(`${deciders} décideurs`)
    }
  })

  it('coordonnées PROFESSIONNELLES en clair : seules des adresses du domaine du groupe, jamais de boîte personnelle', () => {
    const withEmail = (brief?.people ?? []).filter(person => person.email)
    expect(withEmail).toHaveLength(expected.withEmail)
    for (const person of withEmail) {
      for (const email of (person.email ?? '').split(' | ')) expect(email).toMatch(expected.domain)
    }
    expect(raw).not.toMatch(/@(gmail|hotmail|yahoo|outlook|live|icloud|free|wanadoo|sfr|laposte|orange\.fr)\./i)
    expect(raw).not.toMatch(/"https?:\/(?!\/)/)
  })

  it('l’ESN prospect de la démo et son interlocuteur ne se lisent nulle part', () => {
    expect(visible.replace(EMAIL, '')).not.toMatch(expected.prospect)
  })

  it('aucun nom de source interne, aucun fournisseur de données, aucune probabilité, aucune donnée de notre activité', () => {
    expect(visible).not.toMatch(/market\s*memory|\borion\b|dataforge|belloum|\bbellum|\bBM-[AN]-/i)
    expect(visible).not.toMatch(/pappers|societe\.com|\bapollo\b|firecrawl|theirstack|lusha|kaspr|dropcontact/i)
    expect(visible).not.toMatch(/probabilit|chance de|taux de closing/i)
    expect(visible).not.toMatch(/Contactabilit|statut_CRM|nb_actions_crm|vente \d+ € · achat/i)
    expect(raw).not.toMatch(/<\/?(?:b|span|br)\b/)
  })

  it('« non trouvé » reste « non trouvé » ; aucune ESN n’est dite référencée (jamais « confirmed »)', () => {
    expect(brief?.esn.length).toBeGreaterThan(20)
    expect(brief?.esn.every(esn => esn.evidence_level !== 'confirmed')).toBe(true)
    expect(visible).toContain('non trouvé')
    expect(visible).not.toMatch(/"(?:nt|fich|li)"/)
  })

  it('périmètre France : aucun site ni entité hors FR, un seul siège au plus', () => {
    expect((brief?.sites ?? []).every(site => site.country === 'FR')).toBe(true)
    expect((brief?.entities ?? []).every(entity => entity.country === undefined || entity.country === 'FR')).toBe(true)
    expect((brief?.sites ?? []).filter(site => site.kind === 'headquarters').length).toBeLessThanOrEqual(1)
  })
})

describe('règles propres à chaque dossier (15/10/2026)', () => {
  const load = (slug: string): CommercialBrief => JSON.parse(readFileSync(join(__dirname, `${slug}.json`), 'utf8'))

  it('Crédit Agricole : les contacts « blacklist » du CRM ne sont pas semés ; besoins sans TJM ni statut', () => {
    const readme = readFileSync(join(__dirname, 'README.md'), 'utf8')
    expect(readme).toContain('3 × contact marqué « blacklist » au CRM : non semé')
    const needs = load('credit-agricole').sections.find(section => section.key === 'besoins-en-base')
    expect(needs?.columns.map(c => c.key)).toEqual([
      'besoin',
      'date',
      'entite',
      'lieu',
      'appel_d_offres',
      'sur_site',
      'contact',
    ])
  })

  it('VINCI : aucune offre de STAGE dans les postes ouverts (Louis 12/10)', () => {
    const jobs = load('vinci').sections.find(section => section.key === 'postes-ouverts')
    expect(jobs?.rows.length).toBeGreaterThan(10)
    expect(jobs?.rows.some(row => /stage/i.test(String(row['contrat'])))).toBe(false)
  })

  it('Enedis : l’ancien DSI n’est jamais présenté comme DSI actuel ; une adresse qui ne porte pas le nom n’est pas semée', () => {
    const brief = load('enedis')
    const former = brief.people.find(person => person.name === 'Jean-Claude Laroche')
    expect(former?.role).toBe('alumni')
    expect(former?.hook).toContain('ne jamais le citer comme DSI actuel')
    expect(brief.people.find(person => person.name === 'Gautier LAROCHE')?.email).toBeUndefined()
    expect(JSON.stringify(brief)).not.toMatch(/nb_actions_crm|129 actions commerciales/)
    // 15/10/2026 — une ligne qui n'est pas une personne (intitulé de formation) n'est pas semée ; le README la compte.
    expect(brief.people.some(person => /PETRAet Formation/i.test(person.name))).toBe(false)
    expect(readFileSync(join(__dirname, 'README.md'), 'utf8')).toContain(
      '1 × ligne du fichier de contacts qui n’est pas une personne (intitulé de formation) : non semée',
    )
  })

  it('Safran : les statuts et priorités de l’ESN prospect par société sont écartés ; aucune société hors France en entité', () => {
    const brief = load('safran')
    const companies = brief.sections.find(section => section.key === 'societes-du-groupe')
    expect(companies?.columns.map(c => c.key)).toEqual(['societe', 'metier_sites', 'si'])
    expect(brief.entities.some(entity => entity.name === 'Safran Aero Boosters')).toBe(false)
  })

  it('le README des briefs porte la ligne et la section de chaque compte, et dit ce qui est écarté', () => {
    const readme = readFileSync(join(__dirname, 'README.md'), 'utf8')
    for (const [name, slug] of [
      ['Crédit Agricole', 'credit-agricole'],
      ['VINCI', 'vinci'],
      ['Enedis', 'enedis'],
      ['Safran', 'safran'],
    ]) {
      expect(readme).toContain(`| ${name} | \`${slug}.json\` |`)
      expect(readme).toContain(`## ${name} — `)
    }
    expect(readme).toContain('stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)')
  })
})
