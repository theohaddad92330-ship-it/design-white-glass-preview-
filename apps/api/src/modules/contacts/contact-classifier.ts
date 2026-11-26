/**
 * Deterministic contact classifier — "Ingestion liste perso" (Drive backlog #10,
 * GPT-Mapping-décideurs method).
 *
 * A rep pastes a raw contact list (CSV / LinkedIn export). Each row is cleaned and
 * classified into the knowledge-pack taxonomy:
 *   - `family`         — functional decision-maker domain (IT / Cyber / Data / IA /
 *                        Infra / Dev / PMO / Finance / C-Level / Achat / RH), or
 *                        `null` when no rule fires.
 *   - `decision_level` — hierarchy level (c_level / direction / management / expert
 *                        / operationnel / unknown).
 *   - `relevance_score`— 1..5, how worth-contacting the row is for an ESN.
 *   - `exclusion_reason` — the load-bearing field. **We never silently drop a
 *                        low-value row.** When a row looks like noise we KEEP it and
 *                        set a human-readable reason instead (⚠ en cas de doute,
 *                        conserver). `null` ⇒ a clean, high-value contact.
 *
 * Pure + deterministic + free: this is keyword matching on the job title (same
 * approach as the pipeline's `decision_role.py` / coverage-gaps heuristics). It
 * deliberately does NOT call the LLM, so a paste of 500 rows classifies instantly
 * and offline, and the output is stable and unit-testable.
 */

import {
  type ClassifiedContact,
  type ClassifyContactInput,
  type ClassifyContactsResponse,
  type ContactDecisionLevel,
  type ContactFamily,
  LEGACY_FAMILY_CONTACT_FAMILY,
  lookupTitle,
  normalizeTitleKey,
  type OfferDomain,
} from '@bellum/contracts'

/**
 * Deaccent + lower-case + collapse whitespace, so the regexes below can be
 * written in plain ASCII and match "Développeur", "DÉVELOPPEUR", "developpeur"
 * alike. Keeps spaces (word-boundaried patterns rely on them).
 *
 * ⚠️ La forme n'est PAS redéfinie ici — garde GA-55. C'est celle sous laquelle
 * `title-taxonomy.ts` indexe ses 298 clés, et ce fichier interroge cette table
 * (`lookupTitle`). Deux normalisations côte à côte sur la même chaîne ne
 * divergent pas bruyamment : le jour où l'une apprend un caractère de plus, le
 * classifieur cherche une clé que la table n'a pas et le titre devient
 * « famille inconnue ».
 */
const normalize = normalizeTitleKey

/** Trim a raw cell to a non-empty string, else `null` (so a blank title stores
 *  as NULL and the UI renders "—" rather than an empty badge). */
function clean(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  return t.length > 0 ? t : null
}

/**
 * Family patterns, ordered most-specific → most-general. The FIRST match wins,
 * which is why order matters:
 *   - The support-function families (Achat / Finance / RH / PMO) are checked
 *     BEFORE IT so "Responsable Achats IT" reads as its purchasing function, not
 *     as IT — the bare "IT" scope tag would otherwise steal it.
 *   - IT is checked BEFORE Infra so "Directeur des Systèmes d'Information" (DSI)
 *     resolves to IT, not Infra (a bare "Ingénieur Système" still falls to Infra).
 *   - Every functional family is checked BEFORE the generic C-Level bucket so a
 *     CFO reads as Finance and a DSI as IT — C-Level only catches domain-less top
 *     execs (CEO / DG / PDG / Président).
 * Word boundaries guard the short tokens ('ia', 'rh', 'bi', 'it') so they never
 * match mid-word.
 */
const FAMILY_RULES: readonly { family: ContactFamily; re: RegExp }[] = [
  {
    family: 'Cyber',
    re: /\brssi\b|\bciso\b|cyber|\bsoc\b|securite|infosec|pentest|\bssi\b|chief information security officer/,
  },
  {
    family: 'IA',
    re: /intelligence artificielle|machine learning|\bml\b|\bia\b|\bai\b|data scientist|deep learning|\bllm\b|\bmlops\b|\bnlp\b/,
  },
  {
    family: 'Data',
    re: /\bdata\b|donnees|analytics|\bbi\b|business intelligence|datawarehouse|\bdwh\b|\bdba\b|\betl\b|dataviz|\bcdo\b|chief data officer/,
  },
  {
    family: 'Dev',
    re: /developp|software|engineering|\bdev\b|full.?stack|back.?end|front.?end|programmeur|\betudes\b|\bqa\b/,
  },
  {
    family: 'Achat',
    re: /\bachat|procurement|purchasing|sourcing|fournisseur|\bcpo\b|vendor manager|supplier|category manager/,
  },
  { family: 'Finance', re: /\bdaf\b|\bcfo\b|financ|comptab|controle de gestion|tresor|controleur de gestion/ },
  { family: 'RH', re: /ressources humaines|\brh\b|\bdrh\b|\bhr\b|talent|recrutement|recruitment|\bpeople\b|\bpaie\b/ },
  {
    family: 'PMO',
    re: /\bpmo\b|chef de projet|gestion de projet|programme|delivery|scrum|\bpo\b|product owner|coordinateur/,
  },
  {
    family: 'IT',
    re: /\bdsi\b|\bcio\b|\bcto\b|\bit\b|\bict\b|informatique|systemes? d|information technology|\bmoa\b|\bmoe\b|chief (information|technology|technical|digital) officer/,
  },
  {
    family: 'Infra',
    re: /infrastructure|\bcloud\b|reseau|\bsre\b|\bops\b|devops|systeme|sysadmin|datacenter|virtualisation|vmware|kubernetes|\bk8s\b|hebergement|exploitation/,
  },
  {
    family: 'C-Level',
    re: /\bceo\b|\bcoo\b|\bcxo\b|\bpdg\b|\bp-?dg\b|\bdg\b|\bdga\b|president|directeur general|directrice generale|direction generale|managing director|chief executive|country manager|\bgerant\b|fondateur|founder/,
  },
]

/**
 * Hierarchy-level patterns, ordered top → bottom (first match wins). A DSI/CIO/…
 * abbreviation reads as C-Level; a generic "Directeur X" as direction; "Manager /
 * Responsable / Lead" as management; "Architecte / Expert / Senior" as expert; the
 * hands-on roles as operationnel. Unmatched ⇒ 'unknown'.
 */
const LEVEL_RULES: readonly { level: Exclude<ContactDecisionLevel, 'unknown'>; re: RegExp }[] = [
  {
    level: 'c_level',
    re: /\b(ceo|cio|cto|cdo|ciso|cfo|coo|cmo|cxo|dg|dga|pdg|drh|daf|dsi)\b|chief \w+ officer|directeur general|directrice generale|direction generale|\bp-?dg\b|president|managing director|comex|\bc-?level\b|country manager/,
  },
  { level: 'direction', re: /directeur|directrice|director|\bvp\b|vice.?president|head of|\bhead\b|\brssi\b|\bdpo\b/ },
  { level: 'management', re: /manager|\blead\b|responsable|chef de|encadr|superviseur/ },
  { level: 'expert', re: /architect|expert|principal|\bstaff\b|senior|referent|specialiste/ },
  {
    level: 'operationnel',
    re: /developpeur|developer|ingenieur|engineer|analyste|analyst|technicien|\bpo\b|product owner|scrum|consultant|charge de|assistant|operateur|gestionnaire|programmeur|administrateur/,
  },
]

/** Interns / apprentices / trainees — never decision-makers and not sellable-to.
 *  Flagged as noise (kept, never dropped), like `decision_role.py::is_out_of_scope`.
 *  `\bintern(ship)?\b` deliberately does NOT match the French "interne" (=internal)
 *  nor "international". */
const OUT_OF_SCOPE_RE =
  /\bstagiaire\b|\balternan(t|te)\b|\bapprenti(e|ssage)?\b|\bintern(ship)?\b|work.?study|\btrainee\b/

/** Target tech + top-exec families score higher than support functions. C'est le
 *  périmètre HISTORIQUE, celui d'une ESN informatique — il reste le défaut. */
const TARGET_FAMILIES: ReadonlySet<ContactFamily> = new Set<ContactFamily>([
  'IT',
  'Cyber',
  'Data',
  'IA',
  'Infra',
  'Dev',
  'C-Level',
])

/**
 * Les familles que le domaine vendu AJOUTE au périmètre.
 *
 * ⚠️ `RH` et `Finance` étaient exclues **par construction** : quel que soit ce
 * que vend l'espace, un DRH recevait « Fonction RH hors périmètre IT ». Pour une
 * ESN qui vend de la transformation RH ou du conseil finance — deux domaines
 * d'offre qui EXISTENT dans `OFFER_DOMAINS` — c'est précisément son décideur
 * qu'on écartait, avec un motif qui parlait d'informatique à quelqu'un qui n'en
 * vend pas. Même correction que le dé-silo du pipeline, au même endroit du
 * raisonnement : le prisme vient du vendeur, jamais d'un défaut informatique.
 *
 * Un domaine absent de cette table n'ajoute rien : le périmètre historique
 * s'applique, et le chemin est byte-identique pour toutes les ESN existantes.
 */
const DOMAIN_EXTRA_FAMILIES: Readonly<Partial<Record<OfferDomain, readonly ContactFamily[]>>> = {
  rh: ['RH'],
  finance: ['Finance'],
  pmo: ['PMO'],
}

/** Le périmètre effectif pour un vendeur. Sans domaine ⇒ le périmètre historique. */
function targetFamiliesForDomain(domain: OfferDomain | null | undefined): ReadonlySet<ContactFamily> {
  const extra = domain ? DOMAIN_EXTRA_FAMILIES[domain] : undefined
  if (!extra || extra.length === 0) return TARGET_FAMILIES
  return new Set<ContactFamily>([...TARGET_FAMILIES, ...extra])
}

/** Base relevance per family before the hierarchy bonus. */
function familyBaseScore(family: ContactFamily | null, targets: ReadonlySet<ContactFamily>): number {
  if (family === null) return 1
  if (targets.has(family)) return 3
  if (family === 'PMO' || family === 'Achat') return 2
  return 1 // RH / Finance hors périmètre vendu
}

/** How much the hierarchy level lifts the score (senior deciders are worth more). */
function levelBonus(level: ContactDecisionLevel): number {
  switch (level) {
    case 'c_level':
    case 'direction':
      return 2
    case 'management':
    case 'expert':
      return 1
    default:
      return 0 // operationnel / unknown
  }
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, value))
}

function detectFamily(normalizedTitle: string): ContactFamily | null {
  for (const rule of FAMILY_RULES) {
    if (rule.re.test(normalizedTitle)) return rule.family
  }
  return null
}

function detectLevel(normalizedTitle: string): ContactDecisionLevel {
  for (const rule of LEVEL_RULES) {
    if (rule.re.test(normalizedTitle)) return rule.level
  }
  return 'unknown'
}

/**
 * Decide WHY a row would normally be excluded — or `null` when it's a clean,
 * high-value contact. Never returns a "drop it" signal: every reason is advisory,
 * the row is always kept for the rep to review.
 */
function exclusionReason(args: {
  rawTitle: string | null
  normalizedTitle: string
  family: ContactFamily | null
  score: number
  outOfScope: boolean
  targets: ReadonlySet<ContactFamily>
  knownTitle: boolean
}): string | null {
  const { rawTitle, normalizedTitle, family, score, outOfScope, targets, knownTitle } = args
  if (outOfScope) {
    return 'Stagiaire / alternant — pas un décideur (conservé pour vérification)'
  }
  if (family === null) {
    if (normalizedTitle.length === 0) return 'Titre manquant — impossible de classer (à vérifier)'
    // Un titre RECONNU du référentiel mais sans famille produit n'est pas un
    // libellé douteux : c'est le produit qui n'a pas de famille pour lui
    // (industrie, commerce, conduite du changement). Le dire ainsi évite
    // d'envoyer quelqu'un vérifier un intitulé parfaitement clair.
    if (knownTitle) {
      return `Intitulé reconnu mais sans famille cible dans Bellum — à rattacher manuellement`
    }
    return `Fonction « ${rawTitle} » hors des 11 familles cibles — à vérifier manuellement`
  }
  // ⚠️ Le motif ne parle plus d'informatique : il parle du PÉRIMÈTRE VENDU. Une
  // ESN qui vend du conseil RH ne doit pas lire « hors périmètre IT » au-dessus
  // de son propre décideur.
  if (!targets.has(family) && family !== 'PMO' && family !== 'Achat') {
    return `Fonction ${family} hors du périmètre vendu — conservée comme relais potentiel`
  }
  if (score < 3) {
    return `Pertinence faible (${score}/5) — conservée par prudence`
  }
  return null
}

/** Classify a single pasted/imported row. Pure — same input always yields the
 *  same output. */
export function classifyContact(input: ClassifyContactInput, sellerDomain?: OfferDomain | null): ClassifiedContact {
  const rawTitle = clean(input.title)
  const normalizedTitle = normalize(rawTitle)
  const targets = targetFamiliesForDomain(sellerDomain)

  const outOfScope = OUT_OF_SCOPE_RE.test(normalizedTitle)
  const decision_level = detectLevel(normalizedTitle)

  // Le référentiel d'intitulés est consulté APRÈS les règles et seulement quand
  // elles n'ont rien trouvé : une règle qui a reconnu « Responsable Achats IT »
  // en sait plus sur ce libellé que la table, qui ignore les compositions. Le
  // référentiel n'écrase JAMAIS une famille détectée — il comble un trou.
  const detected = detectFamily(normalizedTitle)
  const known = lookupTitle(rawTitle, sellerDomain)
  const family = detected ?? (known?.legacyFamily ? LEGACY_FAMILY_CONTACT_FAMILY[known.legacyFamily] : null)

  // Interns are forced to the floor score regardless of a fancy title
  // ("Stagiaire DSI" is still an intern), matching the pipeline's guard.
  const score = outOfScope ? 1 : clampScore(familyBaseScore(family, targets) + levelBonus(decision_level))

  return {
    full_name: input.full_name.trim(),
    title: rawTitle,
    entity: clean(input.entity),
    email: clean(input.email),
    phone: clean(input.phone),
    linkedin_url: clean(input.linkedin_url),
    family,
    decision_level,
    relevance_score: score,
    exclusion_reason: exclusionReason({
      rawTitle,
      normalizedTitle,
      family,
      score,
      outOfScope,
      targets,
      knownTitle: known !== null,
    }),
    canonical_title: known?.canonical ?? null,
  }
}

/** Classify a whole pasted list and tally kept (clean) vs flagged (kept-with-reason)
 *  rows for the review header. `sellerDomain` — le domaine dominant de l'espace ;
 *  absent, le périmètre historique s'applique et la sortie est byte-identique. */
export function classifyContacts(
  inputs: readonly ClassifyContactInput[],
  sellerDomain?: OfferDomain | null,
): ClassifyContactsResponse {
  const contacts = inputs.map(input => classifyContact(input, sellerDomain))
  const flagged = contacts.filter(c => c.exclusion_reason !== null).length
  return { contacts, kept: contacts.length - flagged, flagged }
}
