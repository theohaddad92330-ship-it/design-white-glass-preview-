#!/usr/bin/env node
/**
 * Génère les données des COMPTES DÉMO ANALYSÉS (Airbus, EDF, Renault, Thales) à partir d'exports de vraies analyses
 * (Louis, 12/10/2026) — voir `apps/api/src/modules/demo/demo-analysed-accounts.ts` pour le chargement.
 *
 * Usage :
 *   node apps/api/scripts/generate-demo-analysed-accounts.mjs <dossier-des-exports>
 * où le dossier contient `demo-analyse-{airbus,edf,renault,thales}-12-10.json` (réponses brutes de
 * `GET /accounts/:id` et `GET /contacts/account/:id`, forme `{ account, contacts }`).
 * Écrit `apps/api/src/modules/demo/data/analysed-accounts/<compte>.json` — fichiers GÉNÉRÉS, jamais édités à la main.
 *
 * Ce que le script ÉPURE (décision Louis 12/10/2026) :
 *  - tout identifiant ou état propre au compte de Louis et à la prod (ids, user_id, workspace_id, account_id, assigned_to,
 *    crm_*, horodatages internes `*_at`, propriétaire, exécution) ;
 *  - tout ce qui NOMME un fournisseur (doctrine : nos fournisseurs ne se nomment jamais à l'écran) : clés et
 *    conteneurs entiers (`apollo_enrichment`, `sources.facts`, `grounding.citations`, télémétrie, coûts…), URL d'un
 *    fournisseur → `null`, mention dans un texte → « source publique » ;
 *  - le nom du profil ESN de Louis, remplacé par celui de l'ESN de la salle de démo ;
 *  - les contacts supprimés, anonymisés, fusionnés, masqués ou écartés ; les adresses de messagerie personnelle.
 *
 * Volume (décision Louis 12/10/2026, la démo purge en ~14 s) : TOUS les décideurs (`decision_role` posé) + les
 * mieux classés (`priority` 1 = meilleur, puis avancement du cycle de vie, joignabilité, intitulé), plafond
 * {@link CONTACT_CAP} contacts par compte. L'organigramme de `raw_analysis.org` est réduit aux personnes gardées.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTACT_CAP = 400
const ACCOUNTS = ['airbus', 'edf', 'renault', 'thales']
const ESN_PROFILE_NAME = /LouisESN/g
const DEMO_ESN_NAME = 'Bellum Conseil'

const PROVIDER =
  /pappers|apollo|firecrawl|brave(?!_news)|adzuna|theirstack|zenprospect|lusha|dropcontact|kaspr|hunter\.io|mistral|anthropic|openai|serper|tavily|societe\.com/i
const PROVIDER_GLOBAL = new RegExp(PROVIDER.source, 'gi')
const PERSONAL_MAIL = /@(gmail|yahoo|hotmail|outlook|icloud|free|orange|wanadoo|sfr|laposte|proton)\./i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Clés retirées à n'importe quelle profondeur. */
const DROP_KEYS = new Set([
  'user_id',
  'userId',
  'workspace_id',
  'workspaceId',
  'account_id',
  'accountId',
  'assigned_to',
  'assignedTo',
  'owner',
  'executionId',
  'execution_id',
  'crm_record_id',
  'crm_synced_at',
  'anonymized_at',
  'deleted_at',
  'api_cost_euros',
  'cost_usd',
  'company_logo_url',
  'logo_url',
])
const DROP_KEY_PATTERN = /(_at|At)$/

/** Clés de premier niveau de `raw_analysis` retirées en bloc (télémétrie, coûts, registres bruts de fournisseur). */
const DROP_TOP = new Set([
  '_api_metrics',
  'run_cost',
  'phase_telemetry',
  'apollo_enrichment',
  'registry_annuaire',
  'pappers_url',
  'official_directory',
  'judge',
  'token_usage',
])

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'modules', 'demo', 'data', 'analysed-accounts')

const stripAccents = value => value.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normalizeName = value =>
  stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Épure récursive : clés d'identité/état, fournisseurs, profil ESN. */
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, inner] of Object.entries(value)) {
      if (DROP_KEYS.has(key) || DROP_KEY_PATTERN.test(key) || PROVIDER.test(key)) continue
      if (typeof inner === 'string' && UUID.test(inner)) continue
      out[key] = scrub(inner)
    }
    return out
  }
  if (typeof value === 'string') {
    if (UUID.test(value)) return null
    if (/^https?:\/\//i.test(value) && PROVIDER.test(value)) return null
    return value.replace(ESN_PROFILE_NAME, DEMO_ESN_NAME).replace(PROVIDER_GLOBAL, 'source publique')
  }
  return value
}

/** « Developpement / Architecture » et « Développement / Architecture » sont UNE famille : on garde la forme accentuée. */
function familyCanon(contacts) {
  const best = new Map()
  for (const { family } of contacts) {
    if (!family) continue
    const key = normalizeName(family)
    const current = best.get(key)
    if (!current || stripAccents(family) !== family) best.set(key, family)
  }
  return family => (family ? (best.get(normalizeName(family)) ?? family) : '')
}

const LIFECYCLE_RANK = { identite_verifiee: 0, actionnable: 1, qualifie: 2, enrichi: 3, detecte: 4 }
const TITLE_WEIGHT = /\b(chief|cio|cto|ciso|cdo|vp|vice|directeur|directrice|director|head|responsable|manager|lead)\b/i

/** Nom complet = prénom + nom ; l'export masque souvent le nom de famille (`last_name_obfuscated`) : prénom seul. */
const isFullName = name =>
  String(name ?? '')
    .trim()
    .split(/\s+/).length >= 2

function rankKey(contact) {
  return [
    contact.priority ?? 99,
    // À rang égal, le nom complet passe avant le prénom seul (décision Louis 12/10/2026).
    isFullName(contact.full_name) ? 0 : 1,
    LIFECYCLE_RANK[contact.lifecycle_state] ?? 5,
    contact.email || contact.linkedin_url ? 0 : 1,
    TITLE_WEIGHT.test(contact.title ?? '') ? 0 : 1,
  ]
}

function compareRank(a, b) {
  const left = rankKey(a)
  const right = rankKey(b)
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return left[i] - right[i]
  return normalizeName(a.full_name).localeCompare(normalizeName(b.full_name))
}

function selectContacts(rows) {
  const live = rows.filter(
    row =>
      !row.deleted_at && !row.anonymized_at && !row.merged_into_id && !row.hidden && !row.excluded_at && row.full_name,
  )
  const seen = new Set()
  const unique = []
  for (const row of [...live].sort(compareRank)) {
    const key = normalizeName(row.full_name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  const deciders = unique.filter(row => row.decision_role)
  // Louis 12/10/2026 : UNIQUEMENT les noms complets + TOUS les décideurs (même à prénom seul) ; plus de prénom seul non décideur.
  const ranked = unique.filter(row => !row.decision_role && row.priority != null && isFullName(row.full_name))
  const rest = unique.filter(row => !row.decision_role && row.priority == null && isFullName(row.full_name))
  const chosen = [...deciders, ...ranked, ...rest].slice(0, Math.max(CONTACT_CAP, deciders.length))
  return { chosen: chosen.slice(0, CONTACT_CAP), deciders: deciders.length, live: unique.length }
}

function projectContact(row, canonFamily) {
  const email = row.email && !PERSONAL_MAIL.test(row.email) ? row.email : null
  return scrub({
    full_name: row.full_name.trim(),
    title: row.title ?? '',
    entity: row.entity ?? '',
    family: canonFamily(row.family),
    decision_role: row.decision_role ?? null,
    priority: row.priority ?? null,
    lifecycle_state: row.lifecycle_state ?? 'detecte',
    seniority: row.seniority ?? null,
    email,
    phone: row.phone || null,
    linkedin_url: row.linkedin_url || null,
    profile_summary: row.profile_summary ?? '',
    why_contact: row.why_contact ?? '',
    key_points: Array.isArray(row.key_points) ? row.key_points : [],
  })
}

/**
 * JAMAIS de personne fictive en démo (doctrine, Louis 12/10/2026). Une vraie analyse cite des contacts absents de la
 * liste (l'analyse les marquait elle-même « hallucinés ») ou écartés par le plafond. Tout ce qui cite une personne hors
 * des contacts semés disparaît — jamais remplacé, jamais inventé :
 *  - champs structurés (`contact`, `fullName`, listes `actors` / `contacts`) : l'élément qui nomme un absent est retiré ;
 *  - texte libre : l'élément (ligne d'un tableau) ou la clé qui contient le nom COMPLET d'un contact exporté non gardé,
 *    ou d'un contact « halluciné », est retiré.
 * Un nom est « semé » s'il est le nom complet d'un contact gardé, ou le prénom d'un contact gardé (l'organigramme
 * de l'analyse cite des prénoms).
 */
function makeCitationFilter(exportedContacts, hallucinated, keptNames) {
  const keptFirst = new Set([...keptNames].map(name => name.split(' ')[0]))
  const isKept = name => keptNames.has(normalizeName(name)) || keptFirst.has(normalizeName(name))
  const foreign = new Set()
  for (const row of exportedContacts) {
    const name = normalizeName(row.full_name)
    if (name.split(' ').length >= 2 && !keptNames.has(name)) foreign.add(name)
  }
  for (const raw of hallucinated) {
    const name = normalizeName(raw)
    if (name.split(' ').length >= 2 && !keptNames.has(name)) foreign.add(name)
  }
  const MAX_GRAM = 5
  const mentionsText = text => {
    const tokens = normalizeName(text).split(' ')
    for (let start = 0; start < tokens.length; start += 1)
      for (let size = 2; size <= MAX_GRAM && start + size <= tokens.length; size += 1)
        if (foreign.has(tokens.slice(start, start + size).join(' '))) return true
    return false
  }
  const mentions = value => {
    if (typeof value === 'string') return mentionsText(value)
    if (Array.isArray(value)) return value.some(mentions)
    if (value && typeof value === 'object') return Object.values(value).some(mentions)
    return false
  }
  /** Mention dans les champs DIRECTS d'une ligne (objets imbriqués compris, tableaux exclus : ils se nettoient seuls). */
  const directMentions = value => {
    if (typeof value === 'string') return mentionsText(value)
    if (Array.isArray(value)) return false
    if (value && typeof value === 'object') return Object.values(value).some(directMentions)
    return false
  }
  const DROP = Symbol('drop')
  const clean = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => {
          if (typeof item === 'string') return mentionsText(item) ? DROP : item
          const cleaned = clean(item)
          // Une ligne dont un champ direct nomme un absent est retirée EN ENTIER (jamais amputée d'un champ).
          return cleaned !== DROP && cleaned && typeof cleaned === 'object' && directMentions(item) ? DROP : cleaned
        })
        .filter(item => item !== DROP)
    }
    if (value && typeof value === 'object') {
      for (const key of ['contact', 'fullName']) {
        const cited = value[key]
        if (typeof cited === 'string' && cited.trim() !== '' && !isKept(cited)) return DROP
      }
      const out = {}
      for (const [key, inner] of Object.entries(value)) {
        if (
          (key === 'actors' || key === 'contacts') &&
          Array.isArray(inner) &&
          inner.every(x => typeof x === 'string')
        ) {
          out[key] = inner.filter(isKept)
        } else if (typeof inner === 'string') {
          if (!mentionsText(inner)) out[key] = inner
        } else {
          const next = clean(inner)
          if (next !== DROP) out[key] = next
        }
      }
      // Une étape de chaîne de décision sans acteur, ou une phase sans action, n'a plus de sens.
      if (Array.isArray(out.actors) && out.actors.length === 0 && 'step' in out) return DROP
      if (Array.isArray(out.actions) && out.actions.length === 0 && 'actions' in value && value.actions.length > 0)
        return DROP
      return out
    }
    return value
  }
  return {
    mentions,
    /** Nettoie un arbre ; un arbre entièrement retiré devient `null`. */
    apply: tree => {
      const next = clean(tree)
      return next === DROP ? null : next
    },
    foreignCount: foreign.size,
  }
}

/** Réduit l'organigramme aux personnes gardées (le reste pèse 600 Ko pour rien). */
function trimOrg(org, keptNames) {
  if (!org || typeof org !== 'object') return org
  const next = { ...org }
  const graph = org.orgGraph
  if (graph && Array.isArray(graph.people)) {
    const people = graph.people.filter(person => keptNames.has(normalizeName(person.fullName)))
    const ids = new Set(people.map(person => person.id))
    const entityIds = new Set((graph.entities ?? []).map(entity => entity.id))
    const known = id => ids.has(id) || entityIds.has(id)
    next.orgGraph = {
      ...graph,
      people,
      hierarchyEdges: (graph.hierarchyEdges ?? []).filter(edge => known(edge.fromId) && known(edge.toId)),
      influenceEdges: (graph.influenceEdges ?? []).filter(edge => known(edge.fromId) && known(edge.toId)),
      buyingCommittee: (graph.buyingCommittee ?? []).filter(member => ids.has(member.personId)),
    }
  }
  const committee = org.buyingCommittee
  if (committee && Array.isArray(committee.members)) {
    next.buyingCommittee = {
      ...committee,
      members: committee.members.filter(member => keptNames.has(normalizeName(member.fullName))),
    }
  }
  return next
}

function trimRawAnalysis(raw, keptNames) {
  const out = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (DROP_TOP.has(key)) continue
    if (key === 'sources') out[key] = { tags: value?.tags ?? {} }
    else if (key === 'grounding') out[key] = value?.kpi ? { kpi: value.kpi } : {}
    else if (key === 'org') out[key] = trimOrg(value, keptNames)
    else if (key === 'plan') {
      const { quality: _quality, _api_metrics: _metrics, ...plan } = value ?? {}
      out[key] = plan
    } else out[key] = value
  }
  return scrub(out)
}

function projectAccount(account, keptNames) {
  const website = String(account.website ?? '')
  const subsidiaries = (Array.isArray(account.subsidiaries) ? account.subsidiaries : [])
    .filter(entry => entry && typeof entry === 'object' && entry.type !== 'bruit' && entry.name)
    .map(entry => String(entry.name))
  return scrub({
    siren: account.siren ?? null,
    naf_code: account.naf_code ?? null,
    sector: account.sector ?? '',
    employees: account.employees ?? '',
    revenue: account.revenue ?? '',
    headquarters: account.headquarters ?? '',
    website: /^https?:\/\//i.test(website) ? website : `https://${website}`,
    subsidiaries: [...new Set(subsidiaries)],
    it_challenges: account.it_challenges ?? [],
    recent_signals: account.recent_signals ?? [],
    priority_score: account.priority_score ?? null,
    priority_justification: account.priority_justification ?? '',
    priority_gate: account.priority_gate ?? 'pending',
    gate_reason: account.gate_reason ?? null,
    commercial_status: account.commercial_status ?? 'watching',
    bet_horizon: account.bet_horizon ?? null,
    raw_analysis: trimRawAnalysis(account.raw_analysis, keptNames),
  })
}

function projectAngles(raw) {
  return (Array.isArray(raw?.angles) ? raw.angles : []).slice(0, 5).map((angle, index) =>
    scrub({
      title: String(angle.title ?? ''),
      description: String(angle.strategy ?? ''),
      entry_point: String(angle.entry_contact_persona ?? ''),
      is_recommended: index === 0,
      rank: index + 1,
    }),
  )
}

function projectActionPlan(raw) {
  const body = raw?.plan?.actionPlan
  const phases = Array.isArray(body?.phases) ? body.phases : []
  return scrub({ strategy_justification: String(body?.justification ?? ''), weeks: phases })
}

const input = process.argv[2]
if (!input) {
  console.error('Usage : node generate-demo-analysed-accounts.mjs <dossier-des-exports>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
for (const slug of ACCOUNTS) {
  const exported = JSON.parse(readFileSync(join(input, `demo-analyse-${slug}-12-10.json`), 'utf8'))
  const { chosen, deciders, live } = selectContacts(exported.contacts ?? [])
  const canon = familyCanon(chosen)
  const contacts = chosen.map(row => projectContact(row, canon))
  const keptNames = new Set(contacts.map(contact => normalizeName(contact.full_name)))
  const hallucinated = (exported.account.raw_analysis?.plan?.quality?.hallucinatedContacts ?? []).map(String)
  const citations = makeCitationFilter(exported.contacts ?? [], hallucinated, keptNames)
  const raw = citations.apply(exported.account.raw_analysis) ?? {}
  if (citations.mentions(exported.account.priority_justification))
    console.warn(`${slug}: priority_justification cite une personne absente — à traiter`)
  const account = {
    ...exported.account,
    raw_analysis: raw,
    it_challenges: citations.apply(exported.account.it_challenges ?? []) ?? [],
    recent_signals: citations.apply(exported.account.recent_signals ?? []) ?? [],
  }
  const data = {
    meta: {
      exported_contacts: (exported.contacts ?? []).length,
      usable_contacts: live,
      deciders,
      cap: CONTACT_CAP,
      single_name_contacts: contacts.filter(contact => !isFullName(contact.full_name)).length,
    },
    account: projectAccount(account, keptNames),
    attackAngles: projectAngles(raw),
    actionPlan: projectActionPlan(raw),
    contacts,
  }
  const file = join(outDir, `${slug}.json`)
  const text = JSON.stringify(data)
  writeFileSync(file, `${text}\n`)
  console.log(
    `${slug}: ${contacts.length} contacts (dont ${deciders} décideurs, ${data.meta.single_name_contacts} prénoms seuls), ${(text.length / 1024).toFixed(0)} Ko`,
  )
}
