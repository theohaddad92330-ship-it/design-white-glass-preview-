import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

/**
 * GARDE des briefs commerciaux de la salle démo (chantier « briefs comptes »,
 * 01/10/2026) : les 5 JSON sont générés depuis les classeurs du CEO par
 * `pnpm --filter @bellum/api convert:commercial-brief`. Ce spec ne lit QUE les
 * JSON versionnés (les classeurs sont hors dépôt) : il fige ce que la
 * conversion a mesuré, pour qu'un régénéré qui dérive fasse échouer la CI.
 *
 * Les nombres de `people` sont des MESURES du classeur, pas des cibles
 * choisies : un changement de source se voit ici et se relit, il ne se
 * « corrige » pas en relevant le nombre.
 */

type Expected = {
  slug: string
  name: string
  headquarters: { label: string; city: string }
  /** Siège attendu en `sites` : un et un seul, dans cette ville. */
  headquartersSiteCity: string
  people: number
  roles: Record<string, number>
  exitedPeople: number
  exitedEntities: string[]
  /** Prix par canal : jamais moyennés, chacun sur SON canal. */
  pricesByChannel: Record<string, number>
  /** Nombre de sites attendu (mesuré) ; absent = non figé pour ce compte. */
  sites?: number
  /** Périmètre du brief : `france` (défaut) ; `suisse` pour ABB Suisse (décision Louis 04/10/2026 — sites en CH). */
  scope?: 'france' | 'suisse'
}

const ACCOUNTS: Expected[] = [
  {
    slug: 'engie',
    name: 'ENGIE',
    headquarters: { label: 'Tour T1', city: 'Paris La Défense' },
    headquartersSiteCity: 'Paris La Défense',
    // 388 (organigramme) + 28 managers hors organigramme + 77 Engie Home Services + 73 externes
    people: 566,
    roles: { contact: 339, decision_maker: 92, manager: 62, external: 73 },
    // Equans : 72 lignes de l'organigramme + managers + 9 externes, tous marqués
    exitedPeople: 103,
    exitedEntities: ['Equans (Cofely, Ineo, Axima, Endel)'],
    // les deux points observés (650 €, 750 €) sont qualifiés « référence sectorielle » par le GARDE-FOUS du classeur
    pricesByChannel: { sector_reference: 3 },
  },
  {
    slug: 'bpce',
    name: 'BPCE',
    headquarters: { label: 'Tours Duo', city: 'Paris' },
    headquartersSiteCity: 'Paris 13e',
    // 304 contacts (dont 9 managers opérationnels) + 46 décideurs hors contacts + 58 externes = 408 pour le groupe ;
    // + la couche Toulouse (démo Thélio, 06/10/2026) : 21 décideurs d'Occitanie et 8 profils, dont 10 déjà connus du
    // groupe (fusionnés, jamais redoublés) → 19 personnes ajoutées : 15 décideurs, 1 manager, 3 anciens
    people: 427,
    roles: { contact: 292, decision_maker: 64, manager: 10, external: 58, alumni: 3 },
    exitedPeople: 0,
    exitedEntities: [],
    // 9 prix via le MSP (avant marge), 7 en sourcing direct : jamais moyennés
    pricesByChannel: { msp: 9, direct: 7 },
  },
  {
    slug: 'societe-generale',
    name: 'Société Générale',
    headquarters: { label: 'Tours Société Générale', city: 'Puteaux' },
    headquartersSiteCity: 'Puteaux',
    // 1 781 contacts + 30 décideurs nommés hors contacts + 43 externes
    people: 1854,
    roles: { contact: 1779, decision_maker: 32, external: 43 },
    exitedPeople: 0,
    exitedEntities: ['Treezor'],
    pricesByChannel: { direct: 1, sector_reference: 5 },
  },
  {
    slug: 'totalenergies',
    name: 'TotalEnergies',
    headquarters: { label: 'La Défense', city: 'Courbevoie' },
    headquartersSiteCity: 'Courbevoie',
    // 82 fonctions de direction de branche + 9 personnes nommées + 12 contacts métier + 11 externes
    people: 114,
    roles: { decision_maker: 91, contact: 12, external: 11 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
  },
  {
    slug: 'alstom',
    name: 'Alstom',
    headquarters: { label: 'Saint-Ouen-sur-Seine', city: 'Saint-Ouen-sur-Seine' },
    headquartersSiteCity: 'Saint-Ouen-sur-Seine',
    people: 29,
    roles: { decision_maker: 17, external: 6, alumni: 6 },
    exitedPeople: 0,
    exitedEntities: ['Reichshoffen'],
    pricesByChannel: {},
  },
  {
    // Démo ESN Nantes (05/10/2026) : site de Nantes-Indret. 16 profils en poste (8 externes, 8 non) + 1 personne nommée + 3 anciens.
    slug: 'naval-group',
    name: 'Naval Group',
    headquarters: { label: 'Paris', city: 'Paris' },
    headquartersSiteCity: 'Paris',
    people: 20,
    roles: { contact: 8, external: 8, decision_maker: 1, alumni: 3 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
    // siège groupe (Paris) + site d'Indret (La Montagne), tous deux lus dans la FICHE COMPTE
    sites: 2,
  },
  {
    // Démo ESN Nantes (05/10/2026) : compte vierge côté contacts — 3 personnes nommées, 5 fonctions à rechercher (en section).
    slug: 'chantiers-atlantique',
    name: "Chantiers de l'Atlantique",
    headquarters: { label: 'Saint-Nazaire', city: 'Saint-Nazaire' },
    headquartersSiteCity: 'Saint-Nazaire',
    people: 3,
    roles: { decision_maker: 3 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
    sites: 1,
  },
  // ── Démo clients du 04/10/2026 : QuickSort (mardi 06/10) et Meedz (mercredi 07/10) ──
  {
    slug: 'bnp-paribas',
    name: 'BNP Paribas',
    headquarters: { label: '16 boulevard des Italiens', city: 'Paris' },
    headquartersSiteCity: 'Paris',
    // 126 contacts + 41 décideurs + 25 prescripteurs CIB + 60 externes + 87 anciens, aucun nom commun entre onglets
    people: 339,
    roles: { contact: 126, decision_maker: 41, manager: 25, external: 60, alumni: 87 },
    exitedPeople: 0,
    exitedEntities: [],
    // 13 besoins observés, tous en sourcing direct (médiane 766 €/j)
    pricesByChannel: { direct: 13 },
  },
  {
    slug: 'bpifrance',
    name: 'Bpifrance',
    headquarters: { label: '27-31 avenue du Général Leclerc', city: 'Maisons-Alfort' },
    headquartersSiteCity: 'Maisons-Alfort',
    // 128 contacts (130 lignes dont 2 boîtes DSI) + 30 profils + 11 prescripteurs + 22 décideurs + 6 anciens,
    // moins 16 personnes vues dans deux onglets (4 prescripteurs, 12 décideurs)
    people: 181,
    roles: { contact: 119, decision_maker: 22, external: 34, alumni: 6 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
  },
  {
    slug: 'sanofi',
    name: 'Sanofi',
    headquarters: { label: 'Paris', city: 'Paris' },
    headquartersSiteCity: 'Paris',
    // 102 décideurs + 26 contacts + 22 anciens ; le classeur Lyon n'ajoute aucune personne (onglets identiques)
    people: 150,
    roles: { contact: 12, decision_maker: 102, external: 14, alumni: 22 },
    // 3 personnes rattachées à EuroAPI (« SORTIE », compte à part)
    exitedPeople: 3,
    exitedEntities: ['Opella', 'EuroAPI'],
    pricesByChannel: {},
  },
  {
    slug: 'adeo-leroy-merlin',
    name: 'ADEO - Leroy Merlin',
    headquarters: { label: 'ADEO Services', city: 'Ronchin' },
    headquartersSiteCity: 'Ronchin',
    // 85 externes + 49 anciens + 45 contacts + 16 décideurs/prescripteurs, moins 1 personne vue deux fois
    people: 194,
    roles: { contact: 44, decision_maker: 7, manager: 9, external: 85, alumni: 49 },
    exitedPeople: 0,
    exitedEntities: [],
    // grille métier × séniorité : 13 médianes + 21 tranches chiffrées, toutes via le référencement dynamique OBMS
    pricesByChannel: { framework: 34 },
  },
  {
    slug: 'kiabi',
    name: 'Kiabi',
    headquarters: { label: 'Kiabi Village', city: 'Lezennes' },
    headquartersSiteCity: 'Lezennes',
    // 16 profils en poste (14 externes) + 10 anciens + 6 décideurs ; « aucun besoin chiffré Kiabi » : pas de prix
    people: 32,
    roles: { contact: 2, decision_maker: 6, external: 14, alumni: 10 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
  },
  {
    // Démo Alpineo (08/10/2026) : périmètre suisse. 33 cibles P1 + 44 cibles P2, aucune fusion. Le rôle suit la colonne
    // RÔLE du classeur, qui ne parle qu'au potentiel : 23 fonctions de sponsor / arbitrage / programme / direction
    // (`decision_maker`), 54 cibles techniques, produit ou achats (`contact`).
    slug: 'abb-suisse',
    name: 'ABB Suisse',
    scope: 'suisse',
    headquarters: { label: 'Zurich', city: 'Zurich' },
    headquartersSiteCity: 'Zurich',
    people: 77,
    roles: { contact: 54, decision_maker: 23 },
    exitedPeople: 0,
    exitedEntities: [],
    pricesByChannel: {},
    // 14 lignes de SITES SUISSES, dont 2 hors périmètre de site (futur siège annoncé, Cracovie)
    sites: 12,
  },
]

const load = (slug: string): { raw: string; json: unknown } => {
  const raw = readFileSync(join(__dirname, `${slug}.json`), 'utf8')
  return { raw, json: JSON.parse(raw) }
}

describe.each(ACCOUNTS)('brief commercial « $name »', account => {
  const { raw, json } = load(account.slug)
  const parsed = commercialBriefSchema.safeParse(json)
  const brief = parsed.success ? (parsed.data as CommercialBrief) : undefined

  it('passe le schéma du contrat', () => {
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([])
    expect(brief?.account_name).toBe(account.name)
    expect(brief?.scope).toBe(account.scope ?? 'france')
  })

  it('ne porte AUCUNE violation métier (checkCommercialBrief)', () => {
    expect(brief ? checkCommercialBrief(brief) : ['brief illisible']).toEqual([])
  })

  it('a le siège attendu, et un seul site siège dans la même ville', () => {
    expect(brief?.headquarters).toMatchObject(account.headquarters)
    const hqSites = (brief?.sites ?? []).filter(s => s.kind === 'headquarters')
    expect(hqSites).toHaveLength(1)
    expect(hqSites[0]?.city).toBe(account.headquartersSiteCity)
  })

  it('ne nomme plus « OneSide » (règle CEO : neutralisé)', () => {
    expect(raw).not.toMatch(/one\s?side/i)
  })

  it("ne nomme pas l'ESN prospect (règle CEO 04/10 : neutralisé comme OneSide)", () => {
    expect(raw).not.toMatch(/\bn\s?gen\b/i)
    // démos clients du 06 au 09/10/2026 : Thélio (BPCE Toulouse), Les Pertinents (BPCE), Alpineo (ABB Suisse)
    expect(raw).not.toMatch(/th[ée]lio|les\s+pertinents|alpineo/i)
  })

  it('porte le nombre de sites mesuré dans le classeur', () => {
    if (account.sites !== undefined) expect(brief?.sites).toHaveLength(account.sites)
  })

  it('ne nomme aucune ESN prospect (QuickSort, Meedz, Alpineo : neutralisées) — hors adresses e-mail, coordonnées en clair', () => {
    expect(raw.replace(/[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g, '')).not.toMatch(/quick\s?sort|meedz|alpineo/i)
  })

  it('ne porte aucune donnée de notre propre performance', () => {
    // colonnes STATUT RELATION / STATUT CRM et leurs valeurs, faux numéros, chiffre de tentatives
    expect(raw).not.toMatch(
      /Not Attempted|Auto Attempted|Faux num[ée]ro|RDV KO|RDV OK|Echanges tel|statuts de relation|STATUT RELATION/i,
    )
  })

  it('marque les périmètres sortis (entités `exited`, personnes `exited: true`)', () => {
    const exited = (brief?.entities ?? []).filter(e => e.status === 'exited').map(e => e.name)
    for (const name of account.exitedEntities) expect(exited).toContain(name)
    if (account.exitedEntities.length === 0) expect(exited).toEqual([])
    if (account.exitedPeople >= 0)
      expect((brief?.people ?? []).filter(p => p.exited === true)).toHaveLength(account.exitedPeople)
  })

  it('reste dans son périmètre : aucun site ni entité hors FR (CH pour le périmètre suisse)', () => {
    const country = account.scope === 'suisse' ? 'CH' : 'FR'
    expect((brief?.sites ?? []).every(s => s.country === country)).toBe(true)
    expect((brief?.entities ?? []).every(e => e.country === undefined || e.country === country)).toBe(true)
  })

  it('range chaque prix sur son canal (jamais moyenné, jamais sans canal)', () => {
    const counts: Record<string, number> = {}
    for (const price of brief?.prices ?? []) counts[price.channel] = (counts[price.channel] ?? 0) + 1
    expect(counts).toEqual(account.pricesByChannel)
  })

  it('porte le nombre de personnes mesuré dans le classeur', () => {
    expect(brief?.people).toHaveLength(account.people)
    const counts: Record<string, number> = {}
    for (const person of brief?.people ?? []) counts[person.role ?? '—'] = (counts[person.role ?? '—'] ?? 0) + 1
    expect(counts).toEqual(account.roles)
  })
})

describe('rapport de couverture (README.md généré)', () => {
  const readme = readFileSync(join(__dirname, 'README.md'), 'utf8')

  // Ces lignes sont les LIGNES DU CLASSEUR, avant fusion des onglets : elles fixent les nombres annoncés par le CEO.
  it.each([
    ['ENGIE — organigramme nominatif (388 personnes)', '| ORGANIGRAMME | people (role=contact) | 388 |'],
    ['Société Générale — contacts rattachés aux codes SI (1 781)', '| CONTACTS | people (role=contact) | 1781 |'],
    ['BPCE — contacts (304)', '| CONTACTS | people (role par ligne) | 304 |'],
    ['BNP Paribas — 126 contacts', '| CONTACTS | people (role=contact) | 126 | 126 ajoutée(s)'],
    ['BNP Paribas — 83 entités en France sur 429', '| FILIALES ET ENTITES | entities | 83 |'],
    [
      'BNP Paribas — 346 entités hors France gardées avec leur motif',
      '| FILIALES ET ENTITES | sections[filiales-et-entites-non-retenus] | 346 |',
    ],
    ['Bpifrance — 30 profils en poste', '| PROFILS EN POSTE | people (role par ligne) | 30 |'],
    ['Sanofi — le COCKPIT Lyon est gardé (41 lignes)', '| COCKPIT (second classeur) | sections[cockpit-lyon] | 41 |'],
    [
      'Sanofi — le plan d’action Lyon est gardé (7 lignes)',
      '| PLAN D ACTION (second classeur) | sections[plan-d-action-lyon] | 7 |',
    ],
    ['ADEO — 34 prix de la grille', '| GRILLE DE PRIX ADEO | prices | 34 |'],
    ['ADEO — 222 besoins détaillés gardés en section', '| BESOINS DETAILLES | sections[besoins-detailles] | 222 |'],
    ['Kiabi — 16 profils en poste', '| PROFILS EN POSTE | people (role par ligne) | 16 |'],
  ])('%s', (_label, line) => {
    expect(readme).toContain(line)
  })
})

describe('Sanofi — deux classeurs, un seul compte', () => {
  const brief = commercialBriefSchema.parse(load('sanofi').json)
  const section = (key: string): CommercialBrief['sections'][number] | undefined =>
    brief.sections.find(s => s.key === key)

  it('garde le plan d’action Lyon à côté de celui de QuickSort, sans les mélanger', () => {
    expect(section('plan-d-action')?.rows).toHaveLength(6)
    expect(section('plan-d-action-lyon')?.rows).toHaveLength(7)
  })

  it('garde le COCKPIT Lyon en section : indicateurs, rubriques, graphiques (les 6 KPI restent ceux de QuickSort)', () => {
    const rows = section('cockpit-lyon')?.rows ?? []
    expect(rows.filter(r => r.bloc === 'Indicateur')).toHaveLength(6)
    expect(rows.filter(r => r.bloc === 'Rubrique')).toHaveLength(10)
    expect(brief.kpis.map(k => k.label)).toEqual([
      'ACHATS',
      'DIGITAL FRANCE',
      'DIGITAL ET IA',
      'SIÈGE 2027',
      'DÉCIDEURS',
      'ANCIENS',
    ])
  })

  it('ne redouble aucune personne ni aucun projet : un seul onglet de chaque', () => {
    expect(brief.sections.filter(s => s.key === 'projets-2026-2027')).toHaveLength(1)
    expect(section('projets-2026-2027')?.rows).toHaveLength(52)
    const names = brief.people.map(p => p.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('ADEO — la grille de prix', () => {
  const brief = commercialBriefSchema.parse(load('adeo-leroy-merlin').json)

  it('porte une médiane par métier puis ses tranches de séniorité, toutes sur le canal du référencement', () => {
    const medians = brief.prices.filter(p => p.label.endsWith('médiane des besoins observés'))
    expect(medians).toHaveLength(13)
    expect(brief.prices.every(p => p.channel === 'framework')).toBe(true)
    expect(brief.prices).toContainEqual(
      expect.objectContaining({ label: 'Développement logiciel — junior (0-2 ans)', amount_eur_per_day: 435 }),
    )
    expect(brief.prices).toContainEqual(
      expect.objectContaining({ label: 'Architecture — senior (5-10 ans)', amount_eur_per_day: 635 }),
    )
  })
})

// D11 (Louis 05/10/2026) — la tuile « CONTACTS 304 » de BPCE (écrite à la main dans le classeur) contredit la liste
// des contacts (427 / 469 / 304) : le plan l'écarte, nommée, avec sa raison (`droppedKpis`, account-plans.ts).
describe('BPCE — tuile « CONTACTS 304 » écartée (D11)', () => {
  it('le bandeau ne porte plus la tuile CONTACTS, et garde les cinq autres', () => {
    const brief = JSON.parse(readFileSync(join(__dirname, 'bpce.json'), 'utf8')) as { kpis: { label: string }[] }
    expect(brief.kpis.map(k => k.label)).toEqual(['ACHATS', 'SIÈGE', 'BESOINS', 'ESN PRÉSENTES', '2027'])
  })
})
