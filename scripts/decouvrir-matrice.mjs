#!/usr/bin/env node
/**
 * # #4420 — la matrice de couverture de Découvrir, rejouable.
 *
 * Pour chaque façon de chercher (compétence seule, + région, secteur + région, secteur + taille, ville,
 * « Toute la France », signaux), combien de comptes Découvrir RENDEZ, et — quand c'est zéro, ou maigre —
 * la raison que l'écran afficherait. La lecture est celle de l'écran : `POST /ia/discover/registry` et
 * `POST /ia/discover/signals` (`apps/web/src/features/discover/api/discover-api.ts`). Mode LISTE seulement :
 * aucune analyse n'est lancée, aucun compte n'est créé, rien n'est écrit.
 *
 * Utilisation
 *   BELLUM_API_URL=https://<api>  BELLUM_TOKEN=<jeton de l'utilisateur>  node scripts/decouvrir-matrice.mjs
 *
 * Le jeton vient de l'ENVIRONNEMENT, jamais d'un argument (il resterait dans l'historique du shell et la liste
 * des processus), et il n'est jamais affiché : ni en-tête, ni URL, ni message d'erreur.
 *
 * Options
 *   --only <regex>   ne jouer que les cas dont l'identifiant ou le libellé correspond
 *   --limit <n>      taille demandée (défaut 100 ; l'API plafonne à 200)
 *   --pause <ms>     pause entre deux recherches (défaut 6500 : l'API tolère 10 recherches par minute)
 *   --cible <json>   les critères que « Appliquer ma cible » pose pour cet espace, en JSON (filtres du registre) :
 *                    ajoute le cas « cible » ; sans lui, le cas est sauté et dit qu'il l'est
 *   --marche         ajoute la colonne « marché » : le nombre d'établissements que le registre public compte pour les
 *                    critères du cas (`total_results`, API ouverte sans clé, un appel par cas registre ; secteur, zone,
 *                    effectif ; pas la ville ni les compétences, dont le marché est celui des offres, non comptable ici)
 *   --out <fichier>  écrit aussi le tableau dans ce fichier
 *   --dry-run        liste les cas et leurs corps de requête, sans aucun appel réseau
 *
 * Sortie : un tableau markdown « cas · rendu · raison », puis les lignes sans raison lisible (code de sortie 1).
 *
 * Les clés de réponse lues ici sont celles du contrat (`packages/contracts/src/schemas/discover*.ts`).
 * Aucun fournisseur n'est nommé dans le tableau : une source tombée se lit « une source » (doctrine).
 */

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ── Les zones et les secteurs (codes INSEE de région ; NAF des secteurs du rail) ───────────────────────────────
const HDF = '32'
const IDF = '11'
const CORSE = '94' // la région la moins dense de la métropole : le cas « marché étroit »

/** Les codes NAF des secteurs du rail — `packages/contracts/src/schemas/application-sector-naf.ts`. */
const NAF = {
  software_tech: '58.21Z,58.29A,58.29B,58.29C,62.01Z,62.02A,62.02B,62.03Z,62.09Z,63.11Z,63.12Z',
  fintech: '64.20Z,64.91Z,64.99Z,66.19A,66.19B',
  automotive: '29.10Z,29.20Z,29.31Z,29.32Z',
  healthcare:
    '86.10Z,86.21Z,86.22A,86.22B,86.22C,86.23Z,86.90A,86.90B,86.90C,86.90D,86.90E,86.90F,87.10A,87.10B,87.10C',
}

const SKILLS = {
  java: ['Java'],
  vue: ['Vue'],
  python: ['Python'],
  data: ['data'],
  cyber: ['cybersécurité'],
  sap: ['SAP'],
  cloud: ['Azure'],
  nonIt: ['comptable'], // un métier non IT du profil
}

const registry = (id, label, filters, extra = {}) => ({ id, label, route: '/ia/discover/registry', filters, extra })
const signals = (id, label, body) => ({ id, label, route: '/ia/discover/signals', body })
const skill = (terms, region) => ({ keywords: terms, ...(region ? { region, regions: [region] } : {}) })

/** Les cas, dans l'ordre de la matrice (A compétence · B + région · C secteur + région · D secteur + taille · E ville · F France · G signaux · H cible). */
export function buildCases({ cible } = {}) {
  const cases = [
    // A — compétence seule (toute la France)
    ...Object.entries(SKILLS).map(([key, terms]) =>
      registry(`A-${key}`, `${terms[0]} · toute la France`, skill(terms)),
    ),
    // B — compétence + région
    registry('B-java-hdf', 'Java · Hauts-de-France', skill(SKILLS.java, HDF)),
    registry('B-java-idf', 'Java · Île-de-France', skill(SKILLS.java, IDF)),
    registry('B-java-corse', 'Java · Corse (région peu dense)', skill(SKILLS.java, CORSE)),
    registry('B-vue-hdf', 'Vue · Hauts-de-France', skill(SKILLS.vue, HDF)),
    registry('B-javavue-hdf', 'Java + Vue · Hauts-de-France', skill(['Java', 'Vue'], HDF)),
    registry('B-python-idf', 'Python · Île-de-France', skill(SKILLS.python, IDF)),
    registry('B-data-hdf', 'data · Hauts-de-France', skill(SKILLS.data, HDF)),
    registry('B-cyber-corse', 'cybersécurité · Corse', skill(SKILLS.cyber, CORSE)),
    registry('B-sap-hdf', 'SAP · Hauts-de-France', skill(SKILLS.sap, HDF)),
    registry('B-cloud-idf', 'Azure · Île-de-France', skill(SKILLS.cloud, IDF)),
    registry('B-nonit-hdf', 'comptable · Hauts-de-France', skill(SKILLS.nonIt, HDF)),
    // B' — la même recherche en mode strict : mesure ce que l'élargissement automatique ajoute
    registry('B-java-hdf-strict', 'Java · Hauts-de-France · strict', skill(SKILLS.java, HDF), { strictCriteria: true }),
    // C — secteur + région
    registry('C-tech-hdf', 'Logiciel/IT · Hauts-de-France', {
      nafCode: NAF.software_tech,
      region: HDF,
      regions: [HDF],
    }),
    registry('C-java-fintech-idf', 'Java + Fintech · Île-de-France', {
      ...skill(SKILLS.java, IDF),
      nafCode: NAF.fintech,
    }),
    registry('C-fintech-idf', 'Fintech · Île-de-France', { nafCode: NAF.fintech, region: IDF, regions: [IDF] }),
    registry('C-auto-hdf', 'Automobile · Hauts-de-France', { nafCode: NAF.automotive, region: HDF, regions: [HDF] }),
    registry('C-sante-corse', 'Santé · Corse', { nafCode: NAF.healthcare, region: CORSE, regions: [CORSE] }),
    // D — secteur + taille
    registry('D-tech-50-249', 'Logiciel/IT · 50 à 249 · toute la France', {
      nafCode: NAF.software_tech,
      headcountMin: 50,
      headcountMax: 249,
    }),
    registry('D-auto-250-999', 'Automobile · 250 à 999 · toute la France', {
      nafCode: NAF.automotive,
      headcountMin: 250,
      headcountMax: 999,
    }),
    registry('D-fintech-middle', 'Fintech · middle market (250–4 999, sans cotées)', {
      nafCode: NAF.fintech,
      headcountMin: 250,
      headcountMax: 4999,
      excludeListed: true,
    }),
    registry('D-java-hdf-1000', 'Java · Hauts-de-France · 1 000 et plus', {
      ...skill(SKILLS.java, HDF),
      headcountMin: 1000,
    }),
    // E — ville
    registry('E-tech-lille', 'Logiciel/IT · Lille', { nafCode: NAF.software_tech, city: 'Lille' }),
    registry('E-tech-toulouse-30', 'Logiciel/IT · Toulouse + 30 km', {
      nafCode: NAF.software_tech,
      city: 'Toulouse',
      radiusKm: 30,
    }),
    registry('E-java-lille', 'Java · Lille', { keywords: ['Java'], city: 'Lille' }),
    // Lot DÉCOUVRIR-ZONE (27/10) — la mesure de référence : ce que le web envoie par défaut (100 km). Le 27/10 en
    // production, 24 comptes dont Saint-Jean-de-Luz (64), Montpellier (34), Nevers (58), Arcachon (33), Calvi (2B) :
    // la colonne détail nomme le palier atteint et les départements rendus, pour qu'un rayon non appliqué se VOIE.
    registry('E-lille-100', 'Lille · 100 km (défaut)', { city: 'Lille', radiusKm: 100 }),
    // F — « Toute la France » : aucune zone du tout
    registry('F-tech-france', 'Logiciel/IT · toute la France', { nafCode: NAF.software_tech }),
    registry('F-fintech-france', 'Fintech · toute la France', { nafCode: NAF.fintech }),
    // G — signaux seuls
    signals('G-hiring-java-hdf', 'Signaux · recrute « java » · Hauts-de-France', {
      sources: ['hiring'],
      keywords: 'java',
      region: HDF,
    }),
    signals('G-tender-hdf', 'Signaux · appels d’offres · Hauts-de-France', { sources: ['tender'], region: HDF }),
    signals('G-all-idf', 'Signaux · trois sources · Île-de-France', { region: IDF }),
    // H — la cible du profil : le serveur la lit seul quand aucun secteur n'est coché
    registry('H-zone-seule-hdf', 'Zone seule Hauts-de-France (la cible du profil filtre)', {
      region: HDF,
      regions: [HDF],
    }),
    registry(
      'H-zone-seule-hdf-hors-cible',
      'Zone seule Hauts-de-France · hors de ma cible',
      { region: HDF, regions: [HDF] },
      { includeOutOfTarget: true },
    ),
  ]
  if (cible && typeof cible === 'object') {
    cases.push(registry('H-appliquer-cible', '« Appliquer ma cible » (critères fournis)', cible))
  }
  return cases
}

/** Le corps de requête d'un cas — exactement la forme que l'écran envoie. */
export function bodyOf(entry, limit) {
  if (entry.body) return { ...entry.body, limit }
  return { filters: entry.filters, limit, ...entry.extra }
}

// ── Lire une réponse comme l'écran la lit ────────────────────────────────────────────────────────────────────

/** Le `{ success, data }` éventuel du proxy (`unwrapEnvelope`, discover-api.ts). */
export function unwrap(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && !('candidates' in payload) && payload.data) {
    return payload.data
  }
  return payload
}

const EMPTY_CAUSES = {
  no_offers: 'aucune offre récente ne cite la compétence dans la zone',
  no_offers_in_city: 'des offres dans le département, aucune dans la ville',
  only_intermediaries: 'seuls cabinets et ESN recrutent (listés à part)',
  no_employer_identified: 'des offres, mais aucun employeur identifié au registre',
  sources_unavailable: 'les offres ne sont pas lisibles (source tombée ou coupée par le délai)',
  outside_headcount: 'des comptes existent, aucun dans la tranche d’effectif',
}

/** Ce que l'écran donnerait comme raison à un zéro (ou `null` : AUCUNE raison lisible — c'est un défaut). */
export function explainZero(data) {
  const query = (data && typeof data.query === 'object' && data.query) || {}
  const reasons = []
  const skillSearch = query.skillSearch
  if (skillSearch && typeof skillSearch === 'object' && skillSearch.emptyCause) {
    reasons.push(`compétence : ${EMPTY_CAUSES[skillSearch.emptyCause] ?? skillSearch.emptyCause}`)
  }
  if (query.reading && typeof query.reading === 'object' && query.reading.unreadable) {
    reasons.push('demande illisible')
  }
  const target = data?.targetSectorFilter
  if (target && target.applied && target.excludedCount > 0) {
    reasons.push(`${target.excludedCount} hors des secteurs de la cible`)
  }
  const listing = data?.listingFilter
  if (listing && listing.excludedCount > 0) reasons.push(`${listing.excludedCount} cotées retirées`)
  for (const entry of Array.isArray(data?.degraded) ? data.degraded : []) {
    if (!entry || typeof entry !== 'object') continue
    const what = entry.kind ?? entry.reason ?? 'dégradé'
    // Une source n'est jamais nommée : « une source ».
    reasons.push(`une source : ${what}${entry.fields?.length ? ` (${entry.fields.join(', ')})` : ''}`)
  }
  if (query.placeResolution) reasons.push('lieu : voir placeResolution')
  if (query.widening) reasons.push('élargissement tenté')
  return reasons.length > 0 ? [...new Set(reasons)].join(' ; ') : null
}

/** Les compteurs d'étape qui situent OÙ la récolte se perd (recherche par compétence). */
export function funnelOf(data) {
  const s = data?.query?.skillSearch
  if (!s || typeof s !== 'object') return ''
  const parts = []
  const sum = o => (o && typeof o === 'object' ? Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0) : 0)
  parts.push(`offres reçues ${sum(s.offersBySource)}`)
  parts.push(`retenues ${s.offersSeen ?? 0}`)
  parts.push(`employeurs ${s.employerGroups ?? 0}`)
  if (s.beyondCap) parts.push(`au-delà du plafond ${s.beyondCap}`)
  if (s.unresolvedEmployers) parts.push(`non résolus ${s.unresolvedEmployers}`)
  if (s.notAttempted) parts.push(`non tentés (délai) ${s.notAttempted}`)
  if (s.outsideZone) parts.push(`hors zone ${s.outsideZone}`)
  if (s.intermediaries) parts.push(`cabinets/ESN ${s.intermediaries}`)
  if (s.outsideHeadcount) parts.push(`hors effectif ${s.outsideHeadcount}`)
  if (s.sourcesCut) parts.push(`sources coupées ${s.sourcesCut}`)
  if (s.deadlineCut) parts.push('coupé par le délai')
  return parts.join(' · ')
}

export function widenedOf(data) {
  const w = data?.query?.widening
  if (!w || typeof w !== 'object') return ''
  if (Array.isArray(w.steps)) {
    const added = w.steps.reduce((sum, step) => sum + (Number(step?.added) || 0), 0)
    const axes = [...new Set(w.steps.map(step => step?.axis).filter(Boolean))].join('+')
    return `élargi +${added} (${axes || 'paliers'}; ${w.exactCount ?? '?'} exacts)`
  }
  return 'élargi (zone)'
}

/** Lot DÉCOUVRIR-ZONE (27/10) — le palier de zone atteint et les départements rendus d'une recherche par ville. */
export function zoneOf(data, entry) {
  if (!entry?.filters?.city) return ''
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const departments = [...new Set(candidates.map(c => c?.department).filter(Boolean))]
  const shown = departments.length > 8 ? `${departments.slice(0, 8).join(', ')}…` : departments.join(', ')
  const w = data?.zoneWidening
  const palier = w?.tier ? `palier ${(w.steps ?? [w.tier]).join(' → ')}` : 'sans palier'
  return shown ? `zone : ${palier} · dépts ${shown}` : `zone : ${palier}`
}

/** La ligne d'un cas : `{ id, label, count, note, missingReason }`. */
export function rowOf(entry, outcome) {
  if (outcome.error) {
    return {
      id: entry.id,
      label: entry.label,
      count: '—',
      note: `ERREUR ${outcome.error}`,
      missingReason: false,
      ms: outcome.ms,
    }
  }
  const data = unwrap(outcome.data)
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const funnel = funnelOf(data)
  const widened = widenedOf(data)
  if (candidates.length > 0) {
    const note = [funnel, widened, zoneOf(data, entry)].filter(Boolean).join(' · ')
    return { id: entry.id, label: entry.label, count: candidates.length, note, missingReason: false, ms: outcome.ms }
  }
  const reason = explainZero(data)
  return {
    id: entry.id,
    label: entry.label,
    count: 0,
    note: [reason ?? '⚠ AUCUNE RAISON LISIBLE', funnel].filter(Boolean).join(' · '),
    missingReason: reason === null,
    ms: outcome.ms,
  }
}

export function renderTable(rows) {
  const cell = text => String(text).replaceAll('|', '/').replaceAll('\n', ' ')
  const withMarket = rows.some(row => row.market !== undefined)
  const lines = [
    `| Cas |${withMarket ? ' Marché |' : ''} Rendu | Raison / détail | ms |`,
    `|---|${withMarket ? '---:|' : ''}---:|---|---:|`,
  ]
  for (const row of rows) {
    const marketCell = withMarket ? ` ${row.market ?? '—'} |` : ''
    lines.push(`| ${cell(row.label)} |${marketCell} ${row.count} | ${cell(row.note)} | ${row.ms ?? ''} |`)
  }
  return lines.join('\n')
}

// ── Le marché : ce que le registre public compte pour les mêmes critères ──────────────────────────────────

/** Les codes de tranche INSEE (`apps/ia/app/services/company_filters.py`) qui recoupent [min, max]. */
const TRANCHES = [
  ['11', 10, 19],
  ['12', 20, 49],
  ['21', 50, 99],
  ['22', 100, 199],
  ['31', 200, 249],
  ['32', 250, 499],
  ['41', 500, 999],
  ['42', 1000, 1999],
  ['51', 2000, 4999],
  ['52', 5000, 9999],
  ['53', 10000, Infinity],
]

/** Les paramètres du registre ouvert pour un cas, ou `null` quand le marché n'en est pas comptable ici. */
export function marketQuery(entry) {
  const f = entry.filters
  if (!f || f.keywords || f.city || f.freetext) return null // compétence / ville : pas un compte du registre
  const params = new URLSearchParams({ page: '1', per_page: '1' })
  if (f.nafCode) params.set('activite_principale', f.nafCode)
  if (f.regions?.length) params.set('region', f.regions.join(','))
  if (f.departments?.length) params.set('departement', f.departments.join(','))
  if (f.headcountMin !== undefined || f.headcountMax !== undefined) {
    const low = f.headcountMin ?? 0
    const high = f.headcountMax ?? Infinity
    params.set(
      'tranche_effectif_salarie',
      TRANCHES.filter(([, a, b]) => b >= low && a <= high)
        .map(([code]) => code)
        .join(','),
    )
  }
  return [...params.keys()].length > 2 ? params : null
}

async function market(entry) {
  const params = marketQuery(entry)
  if (!params) return null
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const total = (await res.json())?.total_results
    return Number.isFinite(total) ? total : null
  } catch {
    return null
  }
}

// ── Le réseau ────────────────────────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Une recherche. Le jeton ne sort jamais de cette fonction : ni dans l'erreur, ni dans le journal. */
async function search(base, token, entry, limit) {
  const started = Date.now()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${base}${entry.route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(bodyOf(entry, limit)),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 15
        await sleep(wait * 1000)
        continue
      }
      if (!res.ok) return { error: `HTTP ${res.status}`, ms: Date.now() - started }
      return { data: await res.json(), ms: Date.now() - started }
    } catch (error) {
      if (attempt === 2)
        return { error: error?.name === 'TimeoutError' ? 'délai de 60 s dépassé' : 'réseau', ms: Date.now() - started }
    }
  }
  return { error: 'HTTP 429 (limite de recherches par minute)', ms: Date.now() - started }
}

function parseArgs(argv) {
  const args = { limit: 100, pause: 6500, only: null, out: null, cible: null, dryRun: false, marche: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--dry-run') args.dryRun = true
    else if (flag === '--marche') args.marche = true
    else if (['--only', '--limit', '--pause', '--cible', '--out'].includes(flag)) {
      const value = argv[(i += 1)]
      if (value === undefined) throw new Error(`${flag} attend une valeur`)
      if (flag === '--limit' || flag === '--pause') args[flag.slice(2)] = Number(value)
      else args[flag.slice(2)] = value
    } else if (flag === '--token' || flag.startsWith('--token=')) {
      throw new Error('Le jeton se pose dans BELLUM_TOKEN, jamais en argument.')
    } else throw new Error(`argument inconnu : ${flag}`)
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200)
    throw new Error('--limit : entier de 1 à 200')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cible = args.cible ? JSON.parse(args.cible) : null
  let cases = buildCases({ cible })
  if (args.only) {
    const pattern = new RegExp(args.only, 'i')
    cases = cases.filter(entry => pattern.test(entry.id) || pattern.test(entry.label))
  }

  if (args.dryRun) {
    for (const entry of cases) console.log(`${entry.id}\t${entry.route}\t${JSON.stringify(bodyOf(entry, args.limit))}`)
    return 0
  }

  const base = (process.env.BELLUM_API_URL ?? '').replace(/\/+$/, '')
  const token = process.env.BELLUM_TOKEN ?? ''
  if (!base || !token) {
    console.error('BELLUM_API_URL et BELLUM_TOKEN (variables d’environnement) sont requis.')
    return 2
  }

  const rows = []
  for (const [index, entry] of cases.entries()) {
    if (index > 0) await sleep(args.pause)
    const row = rowOf(entry, await search(base, token, entry, args.limit))
    if (args.marche) row.market = await market(entry)
    rows.push(row)
    process.stderr.write(`${index + 1}/${cases.length} ${entry.id}\n`)
  }
  if (!cible) {
    rows.push({
      label: '« Appliquer ma cible »',
      count: '—',
      note: 'sauté : passer --cible \'{"nafCode":…}\' (les critères que le plan pose)',
      ms: '',
    })
  }

  const table = renderTable(rows)
  const silent = rows.filter(row => row.missingReason)
  const report = [
    `# Matrice de couverture Découvrir — ${new Date().toISOString().slice(0, 10)} — limite ${args.limit}`,
    '',
    table,
    '',
    silent.length === 0
      ? 'Aucune ligne sans raison lisible.'
      : `⚠ ${silent.length} ligne(s) à zéro SANS raison lisible : ${silent.map(row => row.id).join(', ')}`,
    '',
  ].join('\n')
  console.log(report)
  if (args.out) writeFileSync(args.out, report)
  return silent.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(error instanceof Error ? error.message : 'erreur')
      process.exit(2)
    },
  )
}
