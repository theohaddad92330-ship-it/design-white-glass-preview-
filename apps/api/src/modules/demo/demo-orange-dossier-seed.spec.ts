import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkCommercialBrief,
  commercialBriefSchema,
  normalizeTags,
  orgGraphSchema,
  recentSignalSchema,
} from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import {
  COMMERCIAL_BRIEF_BY_COMPANY,
  COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY,
  DEMO_REAL_CONTACTS_COMPANIES,
  briefPartners,
  briefRecentSignals,
  commercialBriefOf,
} from './commercial-brief-seed'
import { DEMO_COMMERCIAL_BRIEF_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'
import { ORANGE_COLLECTED_JOBS } from './orange-jobs-collected-13-10'
import { ORANGE_OFFERS, resolveOrangeRelativeDates } from './orange-public-complement'
import { ORANGE_SEED } from './orange-seed'

/**
 * 12/10/2026 — le dossier de compte Orange (JSON + contacts + sources, déposé par Théo) est CONSOMMÉ : un fichier que
 * personne ne lit n'est pas livré. Ce spec PROUVE, sur les données de la salle, que le compte Orange porte le brief et
 * que chaque consommateur le lit (onglet « Ce que je sais », Veille, ESN présentes, organigramme, contacts).
 */
const orange = DEMO_EXTENSION_ACCOUNTS.find(account => account.company_name === 'Orange')
const brief = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY['Orange']
const raw = (orange?.raw_analysis ?? {}) as Record<string, unknown>

describe('compte Orange de la salle — le dossier de compte est lu', () => {
  it('le brief est un registre à part : Orange n’est PAS un dossier de brief (aucun dossier Orange à chercher)', () => {
    expect(brief).toBeDefined()
    expect(COMMERCIAL_BRIEF_BY_COMPANY['Orange']).toBeUndefined()
    expect(commercialBriefOf('Orange')).toBe(brief)
    expect(commercialBriefOf('ENGIE')).toBe(COMMERCIAL_BRIEF_BY_COMPANY['ENGIE'])
    expect(DEMO_REAL_CONTACTS_COMPANIES.has('Orange')).toBe(true)
  })

  it('raw_analysis.commercial_brief porte le brief, valide pour le schéma ET les contrôles métier', () => {
    const parsed = commercialBriefSchema.safeParse(raw['commercial_brief'])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(checkCommercialBrief(parsed.data)).toEqual([])
    expect(parsed.data.account_name).toBe('Orange')
    expect(parsed.data).toEqual(brief)
  })

  it('la Veille lit les projets du dossier (sept d’origine + trois faits publics), sans date inventée, source « dossier de compte »', () => {
    // 13/10/2026 : le brief complété porte DIX projets (sept du dossier + Bleu, Live Intelligence, extinction du cuivre).
    const fromBrief = briefRecentSignals(brief!).filter(signal => signal.type === 'projet')
    expect(fromBrief).toHaveLength(10)
    expect(raw['recent_signals']).toEqual(orange?.recent_signals)
    const dossierProjects = (orange?.recent_signals ?? []).filter(
      signal => signal.source === 'Dossier de compte (12/10/2026)',
    )
    expect(dossierProjects).toHaveLength(7)
    for (const signal of dossierProjects) {
      expect(signal.freshness).toBe('undated')
      expect(signal.date).toBeNull()
    }
    const labels = (orange?.recent_signals ?? []).map(signal => signal.signal)
    expect(labels).toContain("Signature du rachat d'une part de SFR")
    expect(labels).toContain('Coentreprise datacenters souverains avec Morrison')
    const sfr = dossierProjects.find(signal => signal.signal?.includes('SFR'))
    expect(sfr?.impact).toContain('Horizon : 2026-S2')
    expect(sfr?.impact).toContain('Confiance : fort')
  })

  it('« ESN présentes » lit les 18 ESN du dossier, jamais au-dessus de « observée »', () => {
    const partners = briefPartners(brief!)
    expect(partners).toHaveLength(18)
    expect(partners.map(partner => partner.certainty).every(certainty => certainty !== 'forte')).toBe(true)
    expect(partners.find(partner => partner.name === 'Capgemini')?.note).toContain('Dossier de compte (12/10/2026)')
    // Le semis des extensions écrit ces lignes (même porte que les dossiers de brief) — voir `seedExtensionAccounts`.
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const start = seed.indexOf('private async seedExtensionAccounts(')
    const body = seed.slice(start, seed.indexOf('\n  }\n', start))
    expect(body).toContain('this.seedBriefPartners(')
    expect(seed).toContain('commercialBriefOf(companyName)')
  })

  it('l’organigramme est lu du dossier : les décideurs sont des contacts semés, aucun lien donné pour vérifié', () => {
    const graph = orgGraphSchema.parse((raw['org'] as { orgGraph?: unknown } | undefined)?.orgGraph)
    const slugs = new Set((orange?.contacts ?? []).map(contact => orgPersonSlug(contact.full_name)))
    // Les sept décideurs ET les contacts en poste du dossier (recette 12/10 : « 0 dans le périmètre » sur chaque entité).
    expect(graph.people.length).toBeGreaterThan(7)
    expect(graph.people.filter(person => !slugs.has(person.id))).toEqual([])
    expect(graph.hierarchyEdges.filter(edge => edge.verified)).toEqual([])
    expect(graph.influenceEdges).toEqual([])
    // Recette 12/10 : le chemin d'accès part des décideurs du dossier (voir demo-orange-decision-makers-first.spec.ts).
    expect(graph.recommendedPath.length).toBeGreaterThan(0)
    expect(graph.recommendedPath.every(step => step.channel === undefined)).toBe(true)
    expect(graph.entities.map(entity => entity.name)).toEqual(
      expect.arrayContaining(['Orange', 'Orange Business', 'Orange Cyberdefense']),
    )
    expect(graph.coverage?.discovered).toBe(orange?.contacts.length)
  })

  it('recette 12/10 — les entités du brief portent des personnes ; seules les filiales étrangères restent sans personne', () => {
    const graph = orgGraphSchema.parse((raw['org'] as { orgGraph?: unknown } | undefined)?.orgGraph)
    const peopleByEntity = new Map<string, number>()
    for (const person of graph.people) {
      const key = person.entityId ?? ''
      peopleByEntity.set(key, (peopleByEntity.get(key) ?? 0) + 1)
    }
    for (const name of ['Orange', 'Orange Business', 'Orange Cyberdefense', 'Orange Bank']) {
      const entity = graph.entities.find(candidate => candidate.name === name)
      expect(entity).toBeDefined()
      expect(peopleByEntity.get(entity?.id ?? '') ?? 0).toBeGreaterThan(0)
    }
  })

  it('recette 12/10 — « Hors France » : l’entité étrangère porte son pays, au graphe, aux entités et au libellé', () => {
    const graph = orgGraphSchema.parse((raw['org'] as { orgGraph?: unknown } | undefined)?.orgGraph)
    const countryOf = (name: string) => graph.entities.find(entity => entity.name === name)?.country
    expect(countryOf("Orange Côte d'Ivoire (hors France)")).toBe('CI')
    expect(countryOf('Orange Tunisie (hors France)')).toBe('TN')
    expect(countryOf('Orange Cameroun (hors France)')).toBe('CM')
    expect(countryOf('Orange Business Maroc (hors France)')).toBe('MA')
    expect(countryOf('Orange Jordan (hors France)')).toBe('JO')
    expect(countryOf('Orange Egypt (hors France)')).toBe('EG')
    expect(countryOf('Orange Polska (hors France)')).toBe('PL')
    expect(countryOf('Orange Communications SA (hors France)')).toBe('CH')
    // La France reste la France, DOM compris.
    expect(countryOf('Orange Business')).toBe('FR')
    const exhaustive = raw['entities_exhaustive'] as { name: string; region: string | null }[]
    expect(exhaustive.find(entity => entity.name === 'Orange Tunisie (hors France)')?.region).toBe('TN')
    expect(exhaustive.find(entity => entity.name === 'Orange Business')?.region).toBe('FR')
    for (const entity of exhaustive.filter(candidate => /hors France/.test(candidate.name))) {
      expect(entity.region).not.toBe('FR')
    }
  })

  it('les entités, les sites et les facteurs de score viennent du brief ; rien n’est inventé', () => {
    // 9 entités du brief + les entités étrangères du relevé (« hors France »).
    expect(raw['entities_exhaustive']).toHaveLength(9 + ORANGE_SEED.foreignEntities.length)
    expect(raw['score_factors']).toEqual(expect.any(Array))
    // 13/10/2026 (parité BPCE) : les besoins sont des HYPOTHÈSES commerciales datées du dossier — voir le bloc « parité ».
    expect(orange?.it_challenges.length).toBeGreaterThan(0)
    expect(orange?.siren).toBeNull()
  })

  it('recette 12/10 — l’onglet Périmètres lit les 7 sites du dossier (communes publiques, point au centre-ville)', () => {
    const sites = raw['sites_france'] as { city: string; latitude: number; longitude: number }[]
    expect(sites.map(site => site.city).sort()).toEqual(
      [
        'Aubervilliers',
        'Cesson-Sévigné',
        'Chartres',
        'Chevilly-Larue',
        'Lannion',
        'Sophia Antipolis',
        'Val de Reuil',
      ].sort(),
    )
    for (const site of sites) {
      expect(site.latitude).toBeGreaterThan(41)
      expect(site.latitude).toBeLessThan(51.5)
    }
    expect(sites).toHaveLength(brief?.sites.length ?? -1)
  })

  it('les fiches : 478 contacts, les décideurs en tête, valeurs compatibles avec les CHECK SQL', () => {
    const contacts = orange?.contacts ?? []
    expect(contacts).toHaveLength(478)
    expect(contacts.slice(0, 7).every(contact => contact.tags?.includes('Décideur'))).toBe(true)
    for (const [index, contact] of contacts.entries()) {
      // Les sept décideurs portent un rôle que l'écran classe ; les autres : aucun rôle deviné.
      expect(contact.decision_role).toBe(index < 7 ? 'economic' : 'unknown')
      expect(normalizeTags(contact.tags ?? [])).toEqual(contact.tags)
    }
    const names = contacts.map(contact => contact.full_name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('aucun nom de source interne ne se lit à l’écran (doctrine : nos fournisseurs ne se nomment jamais)', () => {
    const everything = JSON.stringify({
      brief: raw['commercial_brief'],
      reading: orange?.priority_justification,
      signals: orange?.recent_signals,
      contacts: (orange?.contacts ?? []).map(contact => [
        contact.profile_summary,
        contact.why_contact,
        contact.key_points,
      ]),
    })
    expect(everything).not.toMatch(/market\s*memory|\borion\b|dataforge/i)
  })

  it('le compte Orange reste un compte ouvert à plusieurs contacts : le diagnostic « non étendus » ne le compte pas', () => {
    expect(orange?.commercial_status).toBe('watching')
    expect(orange?.contacts.length).toBeGreaterThan(1)
  })

  it('classé SEEDÉ avec sa raison (craft rule 9) : le dossier d’Orange, ses consommateurs, ses limites', () => {
    expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.state).toBe('seede')
    expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.reason).toContain('Orange')
    expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.reason).toContain('convert:orange-dossier')
    expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.reason).toContain('compte d’extension')
  })
})

/**
 * PARITÉ ORANGE / GROUPE BPCE (Louis, 13/10/2026) — Orange doit être au niveau de remplissage de BPCE, catégorie par
 * catégorie : besoins, signaux de recrutement (datés, IT/ingénierie, sans stage), vision et plans stratégiques (jamais
 * « appel d'offres »), projets, et tout ce que le dossier BPCE remplit. Les volumes se COMPARENT au jeu BPCE lui-même.
 */
const bpce = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Groupe BPCE')
const bpceRaw = (bpce?.account.raw_analysis ?? {}) as Record<string, unknown>
const length = (value: unknown): number => (Array.isArray(value) ? value.length : 0)
const typeCount = (signals: readonly { type?: string | null }[] | undefined, type: string): number =>
  (signals ?? []).filter(signal => signal.type === type).length

describe('compte Orange — parité de remplissage avec Groupe BPCE (13/10/2026)', () => {
  it('BPCE est bien le témoin : il est rempli, sinon la comparaison ne prouverait rien', () => {
    expect(bpce).toBeDefined()
    expect(length(bpceRaw['it_challenges'])).toBeGreaterThan(40)
    expect(typeCount(bpce?.account.recent_signals, 'recrutement')).toBeGreaterThan(5)
  })

  it('besoins : au moins autant d’hypothèses de besoin et de besoins observés que BPCE', () => {
    expect(orange?.it_challenges.length).toBeGreaterThanOrEqual(bpce?.account.it_challenges.length ?? Infinity)
    expect(length(raw['it_challenges'])).toBe(orange?.it_challenges.length)
    // 13/10/2026 : les besoins tirés des offres d'emploi sont absents (aucune offre réelle collectée) — plancher = ceux du dossier.
    expect(length(raw['pains'])).toBeGreaterThanOrEqual(5)
    for (const challenge of orange?.it_challenges ?? []) {
      expect(challenge.description).toContain('Hypothèse commerciale, sans demande externe ni budget ouvert confirmé.')
    }
  })

  it('recrutement : offres RÉELLES collectées par le pipe produit, jamais inventées — aucun example.org, aucun stage, datées RELATIVEMENT', () => {
    const signals = orange?.recent_signals ?? []
    const offers = signals.filter(signal => signal.type === 'recrutement')
    // Parité BPCE (14/10/2026) : la collecte réelle (Adzuna + TheirStack ; APEC coupée par DataDome, France Travail = un
    // seul stage écarté) a retenu ≥ 11 offres IT hors stage ; le semis dérive de la fixture et n'invente RIEN.
    expect(ORANGE_COLLECTED_JOBS.offers.length).toBeGreaterThanOrEqual(11)
    expect(offers).toHaveLength(ORANGE_COLLECTED_JOBS.offers.length)
    expect(offers.length).toBeGreaterThanOrEqual(typeCount(bpce?.account.recent_signals, 'recrutement'))
    expect(ORANGE_OFFERS).toHaveLength(ORANGE_COLLECTED_JOBS.offers.length)
    // Dans le jeu de données : pas de date figée (l'empreinte du jeu ne doit pas changer à chaque démarrage)…
    for (const offer of offers) expect(offer.date).toBeNull()
    // …et au semis : la date est NOW − posted_days_ago, jamais dans le futur.
    const now = Date.parse('2026-11-02T10:00:00.000Z')
    const dated = resolveOrangeRelativeDates(signals, now).filter(signal => signal.type === 'recrutement')
    expect(dated).toHaveLength(offers.length)
    for (const offer of dated) {
      expect(offer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Date.parse(offer.date as string)).toBeLessThanOrEqual(now)
      expect(JSON.stringify(offer)).not.toContain('posted_days_ago')
    }
    // La fixture : date de collecte posée, chaque offre a une URL https RÉELLE et une date de publication.
    expect(ORANGE_COLLECTED_JOBS.collected_on).toBe('2026-10-14')
    for (const job of ORANGE_COLLECTED_JOBS.offers) {
      expect(job.url).toMatch(/^https:\/\//)
      expect(job.url).not.toMatch(/example\.(org|com)/)
      expect(job.published_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(job.title).not.toMatch(/stage|stagiaire|alternan|apprenti|intern\b/i)
    }
    // Aucune URL example.org nulle part dans les signaux d'Orange.
    expect(JSON.stringify(signals)).not.toMatch(/example\.org/)
    // Les offres écartées par la collecte ne se sèment pas.
    for (const rejected of ORANGE_COLLECTED_JOBS.rejected) {
      expect(signals.map(signal => signal.signal)).not.toContain(rejected.title)
    }
    // Le brief ne parle plus d'offres « de démonstration ».
    expect(JSON.stringify(brief)).not.toMatch(/offres? d.emploi de démonstration/i)
  })

  it('projets et vision : au moins autant de projets que BPCE, et les plans stratégiques ne sont JAMAIS des appels d’offres', () => {
    const signals = orange?.recent_signals ?? []
    expect(typeCount(signals, 'projet')).toBeGreaterThanOrEqual(typeCount(bpce?.account.recent_signals, 'projet'))
    expect(typeCount(signals, 'appel_offres')).toBe(0)
    const plans = signals.filter(signal => /plan|vision|trajectoire|stratég/i.test(signal.signal ?? ''))
    expect(plans.length).toBeGreaterThanOrEqual(3)
    for (const plan of plans) expect(['transformation', 'projet']).toContain(plan.type)
    expect(signals.filter(signal => signal.type === 'transformation').length).toBeGreaterThanOrEqual(3)
    expect(length(raw['structural_reading_axes'])).toBeGreaterThanOrEqual(length(bpceRaw['structural_reading_axes']))
    const axes = JSON.stringify(raw['structural_reading_axes'])
    expect(axes).toContain('Trust the Future')
    expect(axes).toContain('Lead the Future')
  })

  it('chaque signal est valide pour le contrat, sans doublon de libellé', () => {
    const signals = orange?.recent_signals ?? []
    for (const signal of resolveOrangeRelativeDates(signals, Date.parse('2026-11-02T10:00:00.000Z'))) {
      expect({ signal: signal.signal, valid: recentSignalSchema.safeParse(signal).success }).toEqual({
        signal: signal.signal,
        valid: true,
      })
    }
    const labels = signals.map(signal => (signal.signal ?? '').toLowerCase())
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('tout ce que BPCE remplit dans `raw_analysis`, Orange le remplit aussi — au moins autant, sauf exception NOMMÉE', () => {
    // Exceptions nommées, avec leur raison (jamais une suppression silencieuse) :
    //  - `recommendedRoute` : la route « partenaire » suppose un partenaire DÉCLARÉ ; Orange n'en a aucun confirmé ;
    //  - `entity_resolution` : état « non résolue » commun ; `demo_seed` / `score_unarbitrated` : drapeaux ;
    //  - `entities_exhaustive`, `sites_france` : les entités et sites viennent du dossier (9 / 7), pas d'un relevé de 291 lignes ;
    //  - `financial_indicators` : voir ci-dessous (volume du dossier, aucun prix inventé) ;
    //  - `pains` (13/10/2026) : chez BPCE une partie vient des offres d'emploi ; la collecte réelle d'Orange n'a retenu AUCUNE
    //    offre (voir `orange-jobs-collected-13-10.ts`) et on n'invente pas de besoin pour combler. Plancher : ceux du dossier ;
    //  - `technology_stack` (13/10/2026) : chez BPCE elle se lit dans les offres ; les piles d'Orange étaient celles des 12 offres
    //    inventées, retirées. `detected_tech_stack` (observé au dossier) reste exigé par la boucle.
    //  - `data_reliability_notes` (14/10/2026) : les garde-fous ne s'affichent plus nulle part (Louis 13/10) ; plus de parité à tenir.
    const exceptions = new Set([
      'recommendedRoute',
      'entity_resolution',
      'demo_seed',
      'score_unarbitrated',
      'entities_exhaustive',
      'sites_france',
      'commercial_brief',
      'org',
      'recent_signals',
      'it_challenges',
      'pains',
      'technology_stack',
      'data_reliability_notes',
    ])
    const gaps: string[] = []
    for (const [key, value] of Object.entries(bpceRaw)) {
      if (exceptions.has(key)) continue
      if (Array.isArray(value)) {
        if (length(raw[key]) < value.length) gaps.push(`${key}: ${length(raw[key])} < ${value.length}`)
      } else if (typeof value === 'string' && value.length > 0) {
        if (typeof raw[key] !== 'string' || (raw[key] as string).length === 0) gaps.push(`${key}: vide`)
      }
    }
    expect(gaps).toEqual([])
    expect(length(raw['pains'])).toBeGreaterThanOrEqual(5)
    const org = raw['org'] as { units?: unknown[]; decisionChain?: { steps?: unknown[] } }
    expect(length(org.units)).toBeGreaterThanOrEqual(length((bpceRaw['org'] as { units?: unknown[] }).units))
    expect(length(org.decisionChain?.steps)).toBeGreaterThan(0)
  })

  it('pistes d’approche et plan d’action : au moins autant d’angles que BPCE, un plan en au moins deux phases', () => {
    expect(orange?.attackAngles?.length).toBeGreaterThanOrEqual(bpce?.attackAngles?.length ?? Infinity)
    expect(orange?.attackAngles?.filter(angle => angle.is_recommended)).toHaveLength(1)
    expect(orange?.actionPlan?.weeks.length).toBeGreaterThanOrEqual(2)
    expect((orange?.actionPlan?.weeks ?? []).flatMap(week => week.actions ?? []).length).toBeGreaterThanOrEqual(9)
  })

  it('le brief « Ce que je sais » porte les sections de BPCE qui parlent de besoins : postes ouverts, technos, plan', () => {
    const keys = brief?.sections.map(section => section.key) ?? []
    // « Postes ouverts » : des offres RÉELLES collectées (14/10/2026) ⇒ l'onglet est rétabli, comme chez BPCE ;
    // 14/10/2026 : « technos » et « besoins » reviennent, lus de sources RÉELLES (titres des offres collectées, titres des
    // profils du relevé) — voir le test suivant. L'ancienne pile, tirée des offres inventées, reste retirée.
    expect(keys).toEqual(
      expect.arrayContaining(['plan-d-action', 'postes-ouverts', 'besoins-recents', 'technos-a-vendre']),
    )
    const rows = (key: string) => brief?.sections.find(section => section.key === key)?.rows ?? []
    expect(rows('plan-d-action').length).toBeGreaterThanOrEqual(9)
    const bpceBrief = COMMERCIAL_BRIEF_BY_COMPANY['Groupe BPCE']
    // Parité complète depuis la collecte du 14/10/2026 : la rubrique RECRUTEMENT et le graphique « postes ouverts par
    // métier » se lisent dans les offres réelles.
    const missing = 0
    expect(brief?.what_i_know.length).toBeGreaterThanOrEqual((bpceBrief?.what_i_know.length ?? Infinity) - missing)
    expect(brief?.charts.length).toBeGreaterThanOrEqual((bpceBrief?.charts.length ?? Infinity) - missing)
    expect(checkCommercialBrief(brief!)).toEqual([])
    expect(commercialBriefSchema.safeParse(brief).success).toBe(true)
  })

  it('14/10 — BESOINS : au moins 15 besoins en base, un par offre réelle, aucune cellule vide, aucune mission sans date', () => {
    const rows = (key: string) => brief?.sections.find(section => section.key === key)?.rows ?? []
    const needs = rows('besoins-recents')
    const inBase = rows('besoins-en-base')
    expect(needs.length + inBase.length).toBeGreaterThanOrEqual(15)
    expect(needs).toHaveLength(ORANGE_OFFERS.length)
    for (const row of needs) {
      expect(Object.values(row).every(value => value !== null && value !== '')).toBe(true)
      expect(String(row['url'])).toMatch(/^https:\/\//)
      expect(String(row['periode'])).toMatch(/^2026-\d{2}$/)
    }
    // Les besoins ajoutés viennent d'offres : aucune « mission terminée » nouvelle (les deux du dossier restent sans date).
    expect(needs.some(row => /terminée/i.test(String(row['canal'])))).toBe(false)
    expect(brief?.what_i_know.find(row => row.rubric === 'BESOINS')?.known).toContain(String(ORANGE_OFFERS.length))
  })

  it('14/10 — TECHNOS : des lignes, chacune sourcée (offre réelle ou profil du relevé), aucune pile inventée', () => {
    const technos = brief?.sections.find(section => section.key === 'technos-a-vendre')?.rows ?? []
    expect(technos.length).toBeGreaterThan(0)
    for (const row of technos) {
      expect(String(row['signaux'])).toMatch(/besoin\(s\) exprimé\(s\)|profil\(s\) observé\(s\) au relevé/)
      expect(String(row['pourquoi']).length).toBeGreaterThan(0)
    }
    // Une techno « à vendre en priorité » est citée dans le titre d'au moins une offre réelle.
    const titles = ORANGE_OFFERS.map(offer => offer.title.toLowerCase()).join(' | ')
    const python = technos.find(row => row['competence_techno'] === 'Python')
    expect(python?.['verdict']).toBe('À VENDRE EN PRIORITÉ')
    expect(titles).toContain('python')
    expect(technos.some(row => row['competence_techno'] === 'Java')).toBe(true)
  })

  it('14/10 — POSTES OUVERTS : plus de colonne VILLE vide ; la ville, quand la source la rend, ouvre le détail', () => {
    const postes = brief?.sections.find(section => section.key === 'postes-ouverts')
    expect(postes?.columns.map(column => column.key)).not.toContain('ville')
    for (const row of postes?.rows ?? []) expect(String(row['detail']).length).toBeGreaterThan(0)
    const withCity = ORANGE_OFFERS.filter(offer => offer.city)
    expect(withCity.length).toBeGreaterThan(0)
    for (const offer of withCity) {
      const row = postes?.rows.find(candidate => candidate['poste_ouvert'] === offer.title)
      expect(String(row?.['detail'])).toContain(`Lieu : ${offer.city}`)
    }
  })

  // 14/10/2026 (recette démo) — Orange au niveau de Groupe BPCE, sans bandeau « antérieure… » ni « Non mesuré ».
  it('14/10 — la lecture en sept axes et la fiabilité du dossier sont SEMÉES (plus de bandeau « antérieure à… »)', () => {
    const evaluation = raw['evaluation'] as { dossier_read?: { axes?: { key: string; state: string }[] } } | undefined
    const axes = evaluation?.dossier_read?.axes ?? []
    expect(axes.map(axis => axis.key).sort()).toEqual(
      [
        'accessibilite',
        'adequation_offre',
        'capacite_achat_externe',
        'concurrence',
        'fraicheur',
        'potentiel_commercial',
        'qualite_preuves',
      ].sort(),
    )
    // Un axe non évaluable reste NOMMÉ (doctrine), jamais retiré ni mis à 0.
    expect(axes.some(axis => axis.state === 'unknown')).toBe(true)
    expect(axes.some(axis => axis.state === 'measured')).toBe(true)
    expect(typeof raw['data_confidence']).toBe('number')
  })

  it('14/10 — les technologies en place sont branchées (technology_stack), une ligne par techno sourcée', () => {
    const stack = (raw['technology_stack'] ?? []) as { name: string; usage: string }[]
    expect(stack.length).toBeGreaterThan(0)
    for (const entry of stack) expect(entry.usage).toMatch(/offre|profil/)
  })

  it('14/10 — aucun texte interne de démo dans les notes de fiabilité (« ouverture de la salle », « démonstration »)', () => {
    const notes = JSON.stringify(raw['data_reliability_notes'] ?? [])
    expect(notes).not.toMatch(/ouverture de la salle|de démonstration/i)
  })

  it('14/10 — « ESN déjà en place » : les ESN du dossier sont lues au contexte du compte (raw_analysis.competitors)', () => {
    const competitors = (raw['competitors'] ?? []) as { name?: string; strengths?: unknown; weaknesses?: unknown }[]
    const names = new Set((brief?.esn ?? []).map(esn => esn.name))
    expect(names.size).toBeGreaterThanOrEqual(15)
    expect(new Set(competitors.map(competitor => competitor.name))).toEqual(names)
    // Aucune force ni faiblesse inventée : le dossier ne les porte pas.
    for (const competitor of competitors) {
      expect(competitor.strengths ?? null).toBeNull()
      expect(competitor.weaknesses ?? null).toBeNull()
    }
  })

  it('« la Veille » lit les offres : chaque offre du brief est aussi un signal du compte (aucun doublon)', () => {
    const labels = (orange?.recent_signals ?? []).map(signal => signal.signal)
    for (const offer of ORANGE_OFFERS) expect(labels.filter(label => label === offer.title)).toHaveLength(1)
  })
})
