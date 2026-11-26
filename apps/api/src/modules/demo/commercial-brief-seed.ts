import { computeContactLifecycleState } from '@bellum/contracts'
import { proposeContactDuplicates } from '../contacts/contact-duplicate-proposals'
import type { CommercialBrief, ItChallenge, OrgGraph, PlanPhase, RecentSignal, SiteFrance } from '@bellum/contracts'
import adeoBrief from './data/commercial-briefs/adeo-leroy-merlin.json'
import abbSuisseBrief from './data/commercial-briefs/abb-suisse.json'
import airbusBrief from './data/commercial-briefs/airbus.json'
import alstomBrief from './data/commercial-briefs/alstom.json'
import edfBrief from './data/commercial-briefs/edf.json'
import renaultBrief from './data/commercial-briefs/renault.json'
import thalesBrief from './data/commercial-briefs/thales.json'
import bnpParibasBrief from './data/commercial-briefs/bnp-paribas.json'
import bpceBrief from './data/commercial-briefs/bpce.json'
import chantiersAtlantiqueBrief from './data/commercial-briefs/chantiers-atlantique.json'
import bpifranceBrief from './data/commercial-briefs/bpifrance.json'
import engieBrief from './data/commercial-briefs/engie.json'
import navalGroupBrief from './data/commercial-briefs/naval-group.json'
import orangeBrief from './data/commercial-briefs/orange.json'
import creditAgricoleBrief from './data/commercial-briefs/credit-agricole.json'
import enedisBrief from './data/commercial-briefs/enedis.json'
import safranBrief from './data/commercial-briefs/safran.json'
import vinciBrief from './data/commercial-briefs/vinci.json'
import kiabiBrief from './data/commercial-briefs/kiabi.json'
import sanofiBrief from './data/commercial-briefs/sanofi.json'
import societeGeneraleBrief from './data/commercial-briefs/societe-generale.json'
import totalEnergiesBrief from './data/commercial-briefs/totalenergies.json'
import { familyFromTitle, seniorityOf } from './bpce-csv-mapping'
import type { CsvPartner } from './compte-csv-writes'
import { buildDemoOrgGraph } from './demo-org-graph'
import { enrichOrangeBrief } from './orange-public-reading'

/**
 * Les BRIEFS COMMERCIAUX de la salle de démonstration (chantier « briefs
 * comptes », 01/10/2026) : ce qui fait passer cinq classeurs écrits à la main
 * par le CEO (`data/commercial-briefs/*.json`, générés, jamais édités) dans les
 * comptes semés — contacts, siège, sites, signaux de Veille, ESN présentes,
 * organigramme.
 *
 * ⚠️ RIEN n'est recopié à la main : tout ce que ce fichier rend est CALCULÉ
 * depuis le JSON du brief, par des fonctions pures. Le brief lui-même voyage
 * tel quel dans `raw_analysis.commercial_brief` (l'écran « Ce que je sais » le
 * relit avec le même schéma).
 *
 * Renversement assumé, daté du 01/10/2026 (décision Louis, « coordonnées en
 * clair ») : les personnes de ces cinq comptes sont des personnes RÉELLES,
 * nommées, avec e-mail, téléphone et LinkedIn quand le classeur les porte —
 * jamais une coordonnée inventée. Les gardes de `demo-dataset.spec.ts` qui
 * tiennent la règle inverse pour les autres dossiers (SNCF) portent une
 * exemption NOMMÉE : {@link DEMO_REAL_CONTACTS_COMPANIES}, jamais une suppression.
 */

/** Les briefs, par nom de COMPTE tel que le jeu de données le porte. */
export const COMMERCIAL_BRIEF_BY_COMPANY: Readonly<Record<string, CommercialBrief>> = {
  'Société Générale': societeGeneraleBrief as unknown as CommercialBrief,
  'Groupe BPCE': bpceBrief as unknown as CommercialBrief,
  ENGIE: engieBrief as unknown as CommercialBrief,
  TotalEnergies: totalEnergiesBrief as unknown as CommercialBrief,
  Alstom: alstomBrief as unknown as CommercialBrief,
  // Démo ESN Nantes (05/10/2026) : site de Nantes-Indret et Saint-Nazaire.
  'Naval Group': navalGroupBrief as unknown as CommercialBrief,
  "Chantiers de l'Atlantique": chantiersAtlantiqueBrief as unknown as CommercialBrief,
  // Démo clients du 04/10/2026 : QuickSort (mardi 06/10) et Meedz (mercredi 07/10).
  'BNP Paribas': bnpParibasBrief as unknown as CommercialBrief,
  Bpifrance: bpifranceBrief as unknown as CommercialBrief,
  Sanofi: sanofiBrief as unknown as CommercialBrief,
  'ADEO - Leroy Merlin': adeoBrief as unknown as CommercialBrief,
  Kiabi: kiabiBrief as unknown as CommercialBrief,
  // Démos clients (04/10/2026) : ABB Suisse, périmètre « suisse » (décision Louis, D4) — sites et entités en CH.
  'ABB Suisse': abbSuisseBrief as unknown as CommercialBrief,
}

/**
 * 12/10/2026 — le brief d'un compte d'EXTENSION (`DEMO_EXTENSION_ACCOUNTS`, pas un dossier de `DEMO_DOSSIERS`) : Orange,
 * dont Théo a déposé le dossier de compte complet (`convert:orange-dossier`). Un registre À PART du précédent, pour que
 * les gardes qui lisent « un brief = un dossier » (marchés locaux, ESN citées) ne cherchent pas un dossier Orange qui
 * n'existe pas ; {@link commercialBriefOf} les lit tous les deux.
 */
export const COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY: Readonly<Record<string, CommercialBrief>> = {
  // 13/10/2026 — parité avec Groupe BPCE : postes ouverts, technos, plan d'action, projets et rubriques ajoutés AU-DESSUS du
  // JSON généré (jamais édité) — voir `orange-public-reading.ts`.
  Orange: enrichOrangeBrief(orangeBrief as unknown as CommercialBrief),
  // 13/10/2026 (décision Louis) — les quatre comptes ANALYSÉS : leur fiche s'ouvre sur « Ce que je sais ». Briefs générés
  // par `scripts/generate-demo-analysed-briefs.mjs` depuis le JSON analysé du compte (rien d'inventé).
  Airbus: airbusBrief as unknown as CommercialBrief,
  EDF: edfBrief as unknown as CommercialBrief,
  Renault: renaultBrief as unknown as CommercialBrief,
  Thales: thalesBrief as unknown as CommercialBrief,
  // 15/10/2026 — les quatre dossiers de compte déposés par Théo (démos Soluxan, MK4 Technova, Experis, JEMS), convertis par
  // `convert:account-dossier` (cœur partagé `account-dossier.ts`). Safran et VINCI, retirés MINCES le 12/10, reviennent
  // RICHES ; Crédit Agricole n'était qu'une suggestion d'onboarding (laissée telle quelle) ; Enedis est neuf.
  'Crédit Agricole': creditAgricoleBrief as unknown as CommercialBrief,
  VINCI: vinciBrief as unknown as CommercialBrief,
  Enedis: enedisBrief as unknown as CommercialBrief,
  Safran: safranBrief as unknown as CommercialBrief,
}

/** Le brief d'un compte de la salle, qu'il soit un dossier ou un compte d'extension. */
export function commercialBriefOf(company: string): CommercialBrief | undefined {
  return COMMERCIAL_BRIEF_BY_COMPANY[company] ?? COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[company]
}

/** Les comptes dont les personnes sont réelles et portent leurs coordonnées. */
export const DEMO_REAL_CONTACTS_COMPANIES: ReadonlySet<string> = new Set([
  ...Object.keys(COMMERCIAL_BRIEF_BY_COMPANY),
  ...Object.keys(COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY),
])

/**
 * Les comptes dont l'organigramme est DÉRIVÉ du seul brief (`briefOrgGraph`) : ni
 * lien vérifié, ni influence, ni chemin — Société Générale garde son graphe écrit
 * à la main, Groupe BPCE le sien (CSV).
 */
export const DEMO_BRIEF_DERIVED_GRAPH_COMPANIES: readonly string[] = [
  'ENGIE',
  'TotalEnergies',
  'Alstom',
  'Naval Group',
  "Chantiers de l'Atlantique",
  'BNP Paribas',
  'Bpifrance',
  'Sanofi',
  'ADEO - Leroy Merlin',
  'Kiabi',
  'ABB Suisse',
]

/**
 * EXEMPTION NOMMÉE (04/10/2026, démo ESN Nantes) — les comptes dont le classeur nomme PEU de personnes : Naval Group
 * Indret (1 personne nommée au COMEX + 16 profils en poste) et Chantiers de l'Atlantique (compte vierge : 3 personnes
 * nommées, aucun profil). Les planchers de cartographie de `demo-org-graphs.spec.ts` (8 personnes, 9 contacts) ne
 * s'appliquent pas : les atteindre obligerait à inventer des personnes. Le classeur le dit lui-même au garde-fou
 * (« Compte vierge », « Indret peu couvert en interne »). Un plancher réduit reste exigé, jamais une suppression.
 */
export const DEMO_BRIEF_THIN_COMPANIES: readonly string[] = ['Naval Group', "Chantiers de l'Atlantique", 'Kiabi']

/** Le nom, comparé sans accent, sans casse ni ponctuation — la clé de dédoublonnage. */
export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

type PersonRole = NonNullable<CommercialBrief['people'][number]['role']>

const ROLE_ORDER: Record<PersonRole, number> = { decision_maker: 0, manager: 1, contact: 2, external: 3, alumni: 4 }

const hasCoordinates = (person: { email?: string; mobile?: string; phone?: string }): boolean =>
  Boolean(person.email || person.mobile || person.phone)

const ROLE_META: Record<PersonRole, { tag: string; label: string; score: number; priority: number }> = {
  decision_maker: { tag: 'Décideur', label: 'Décideur identifié sur le compte', score: 50, priority: 1 },
  manager: { tag: 'Manager', label: 'Manager identifié sur le compte', score: 40, priority: 2 },
  contact: { tag: 'Contact', label: 'Contact identifié sur le compte', score: 30, priority: 3 },
  external: {
    tag: 'Prestataire externe',
    label: 'Prestataire externe en poste chez le compte',
    score: 30,
    priority: 3,
  },
  alumni: {
    tag: 'Ancien du compte',
    label: 'Profil ayant exercé chez le compte, aujourd’hui ailleurs',
    score: 20,
    priority: 3,
  },
}

/** `33622809193` → `+33 6 22 80 91 93`. Une valeur illisible reste telle que le classeur la porte. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (/^33\d{9}$/.test(digits)) {
    return `+33 ${digits[2]} ${digits.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ')}`
  }
  if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, '$1 ')
  return value
}

/** « 33387617489\n 33762295200 » → deux numéros ; vide ou absent → aucun. */
function splitNumbers(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[\n;/]/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

type BriefContactSeed = {
  full_name: string
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  email: string | null
  phone: string | null
  linkedin_url: string | null
  profile_summary: string
  why_contact: string
  contact_score: number
  seniority: string
  lifecycle_state: string
  key_points: string[]
  tags: string[]
}

function joinDefined(parts: readonly (string | null | undefined | false)[], separator = ' '): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(separator)
}

/**
 * Les personnes du brief, prêtes à devenir des contacts du compte.
 *
 * - `exited: true` (périmètre sorti du groupe — Equans chez ENGIE…) : PAS semée
 *   comme contact du compte — elle reste dans le brief, marquée ;
 * - une personne dont le nom (normalisé) est déjà dans `knownNames` n'est jamais
 *   redoublée ; deux lignes du brief pour la même personne ne font qu'un contact
 *   (les noms sont uniques par compte en base) ;
 * - le téléphone du contact est le `mobile` du classeur (c'est lui que le brief
 *   annonce — « 196 mobiles »), à défaut son `phone` ; l'autre numéro se lit dans
 *   le résumé — jamais perdu, jamais inventé. Un mobile multiple (« a\n b ») ne
 *   garde que le premier en `phone`, les suivants vont au résumé ;
 * - `lifecycle_state` est CALCULÉ (même fonction que la liste) : l'état persisté bat
 *   le calcul, un `detecte` écrit en dur faisait compter 0 « coordonnées trouvées ».
 */
/**
 * Un classeur nomme parfois la même personne deux fois (« Nom Prénom » / « Prénom NOM », « Prénom N. ») : semées
 * telles quelles, ces fiches font afficher de FAUX doublons au prospect. On garde la première fiche du brief (rôle puis
 * coordonnées, l'ordre de `briefContactSeeds`) et on écarte celles qui forment une paire probable avec une fiche
 * déjà gardée — `existing` (les contacts déjà semés) ne perd jamais rien. La MÊME règle de proposition que l'écran.
 */
export function withoutProbableDuplicates<T extends { full_name: string; title: string }>(
  seeds: readonly T[],
  existing: readonly { full_name: string; title: string | null }[],
): T[] {
  // UNE passe de comparaison (quadratique par compte) : une fiche du brief est écartée si elle forme une paire avec une
  // fiche qui la PRÉCÈDE (contacts déjà semés, puis fiches du brief plus haut classées).
  const rows = [...existing, ...seeds].map((c, i) => ({
    id: String(i),
    accountId: 'a',
    fullName: c.full_name,
    email: null,
    phone: null,
    linkedinUrl: null,
    title: c.title,
  }))
  const dropped = new Set<number>()
  for (const pair of proposeContactDuplicates(rows)) {
    const later = Math.max(Number(pair.leftId), Number(pair.rightId))
    if (later >= existing.length) dropped.add(later - existing.length)
  }
  return seeds.filter((_, index) => !dropped.has(index))
}

export function briefContactSeeds(brief: CommercialBrief, knownNames: ReadonlySet<string>): BriefContactSeed[] {
  const seen = new Set(knownNames)
  const seeds: BriefContactSeed[] = []
  const ordered = brief.people
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => person.exited !== true)
    // Louis 16/10/2026 : à rôle égal, la personne joignable (e-mail ou téléphone) avant celle sans coordonnée, puis
    // l'ordre du brief. L'ordre change, jamais le contenu.
    .sort(
      (a, b) =>
        ROLE_ORDER[a.person.role ?? 'contact'] - ROLE_ORDER[b.person.role ?? 'contact'] ||
        Number(hasCoordinates(b.person)) - Number(hasCoordinates(a.person)) ||
        a.index - b.index,
    )

  for (const { person } of ordered) {
    const fullName = person.name.trim()
    const key = normalizePersonName(fullName)
    if (!key || seen.has(key)) continue
    seen.add(key)

    const role: PersonRole = person.role ?? 'contact'
    const meta = ROLE_META[role]
    const contactRole = role === 'decision_maker' ? 'economic' : 'unknown'
    const title = person.function ?? ''
    // Voir l'en-tête : le mobile d'abord, les numéros en plus vont au résumé.
    const mobiles = splitNumbers(person.mobile)
    const phone = mobiles[0] ?? splitNumbers(person.phone)[0] ?? null
    const otherNumbers = [...mobiles.slice(1), ...splitNumbers(person.phone)].filter(
      (number, position, all) => number !== phone && all.indexOf(number) === position,
    )
    const entity = person.entity ?? person.department ?? brief.account_name

    seeds.push({
      full_name: fullName,
      title,
      entity,
      family: familyFromTitle(title),
      // 15/10/2026 (recette R24) — le brief dit « Décideur » : `economic`, le rôle que lit le badge. Les autres : rien deviné.
      decision_role: contactRole,
      priority: meta.priority,
      email: person.email ?? null,
      phone: phone ? formatPhone(phone) : null,
      linkedin_url: person.linkedin ?? null,
      profile_summary: joinDefined([
        `${meta.label}.`,
        person.department && `Département : ${person.department}.`,
        person.city && `Ville : ${person.city}.`,
        person.manager && `Rattachement : ${person.manager}.`,
        otherNumbers.length > 0 &&
          `Autre numéro relevé : ${otherNumbers.map(number => formatPhone(number)).join(', ')}.`,
        `${isAccountDossier(brief) ? `Dossier de compte du ${dossierDate(brief)}` : 'Brief commercial du compte du 01/10/2026'}${person.reliability ? ` (fiabilité : ${person.reliability})` : ''}.`,
      ]),
      why_contact: person.hook ?? 'Personne relevée sur le compte.',
      contact_score: meta.score,
      seniority: seniorityOf(title, role === 'manager' || role === 'decision_maker' ? 'manager' : 'operationnel'),
      lifecycle_state: computeContactLifecycleState({
        fullName,
        title,
        entity,
        role: contactRole,
        email: person.email ?? null,
        phone,
        linkedinUrl: person.linkedin ?? null,
      }),
      key_points: [person.hook, person.manager && `Rattaché à : ${person.manager}`, person.reliability].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ),
      tags: [meta.tag],
    })
  }
  return seeds
}

/* ------------------------------------------------------------------ */
/* Siège et sites                                                      */
/* ------------------------------------------------------------------ */

/**
 * Un score n'est jamais nu : les quatre axes du dossier, chacun nommé par ce que
 * le brief en COMPTE (mêmes axes et mêmes poids que les autres dossiers de la
 * salle). Un axe que le brief ne documente pas le dit — il ne prend pas un chiffre.
 */
export function briefScoreFactors(
  brief: CommercialBrief,
): { label: string; proof_type: 'profile' | 'signal' | 'contact' | 'source'; weight: number }[] {
  const rowsOf = (pattern: RegExp) =>
    brief.sections
      .filter(section => pattern.test(section.key))
      .reduce((total, section) => total + section.rows.length, 0)
  const sellable = rowsOf(/^(technos|competences)-a-vendre$/)
  const timing = rowsOf(/^(projets-|dynamique-|programmes$|postes-ouverts(-suisse)?$|besoins-)/)
  const purchasing = rowsOf(/^achats-avant-d-appeler$/)
  return [
    {
      label:
        sellable > 0
          ? `Fit — ${sellable} compétences à vendre relevées`
          : 'Fit — aucune compétence à vendre relevée par le brief',
      proof_type: 'profile',
      weight: 4,
    },
    {
      label:
        timing > 0
          ? `Timing — ${timing} projets, programmes, besoins ou postes relevés`
          : 'Timing — aucun projet relevé par le brief',
      proof_type: 'signal',
      weight: 4,
    },
    {
      label:
        purchasing > 0
          ? `Accessibilité — ${purchasing} points d'achat à connaître avant d'appeler`
          : 'Accessibilité — circuit d’achat non documenté par le brief',
      proof_type: 'contact',
      weight: 3,
    },
    {
      label:
        brief.esn.length > 0
          ? `Concurrence — ${brief.esn.length} prestataires en place`
          : 'Concurrence — aucun prestataire cité par le brief',
      proof_type: 'source',
      weight: 2,
    },
  ]
}

/** Le siège tel que le brief le dit : l'adresse quand il en porte une, sinon « libellé, ville ». */
export function briefHeadquarters(brief: CommercialBrief): string {
  const { address, label, city } = brief.headquarters
  return address ?? (label === city ? city : `${label}, ${city}`)
}

/** Centre-ville public des communes du brief — la carte a besoin d'un point, le classeur n'en publie pas. */
const CITY_POINTS: Readonly<Record<string, { region: string; latitude: number; longitude: number }>> = {
  'paris la défense': { region: 'Île-de-France', latitude: 48.8924, longitude: 2.2386 },
  courbevoie: { region: 'Île-de-France', latitude: 48.8975, longitude: 2.2569 },
  puteaux: { region: 'Île-de-France', latitude: 48.8847, longitude: 2.2381 },
  'bois-colombes': { region: 'Île-de-France', latitude: 48.9167, longitude: 2.2681 },
  'paris 9e': { region: 'Île-de-France', latitude: 48.8738, longitude: 2.3312 },
  'paris 13e': { region: 'Île-de-France', latitude: 48.8282, longitude: 2.3558 },
  'saint-ouen-sur-seine': { region: 'Île-de-France', latitude: 48.9117, longitude: 2.3339 },
  feyzin: { region: 'Auvergne-Rhône-Alpes', latitude: 45.6706, longitude: 4.8586 },
  solaize: { region: 'Auvergne-Rhône-Alpes', latitude: 45.6125, longitude: 4.8317 },
  villeurbanne: { region: 'Auvergne-Rhône-Alpes', latitude: 45.7676, longitude: 4.8797 },
  donges: { region: 'Pays de la Loire', latitude: 47.3178, longitude: -2.0742 },
  "gonfreville-l'orcher": { region: 'Normandie', latitude: 49.4936, longitude: 0.2331 },
  grandpuits: { region: 'Île-de-France', latitude: 48.6006, longitude: 2.9167 },
  'châteauneuf-les-martigues': { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.3892, longitude: 5.1522 },
  'saint-avold': { region: 'Grand Est', latitude: 49.1033, longitude: 6.7094 },
  belfort: { region: 'Bourgogne-Franche-Comté', latitude: 47.6397, longitude: 6.8639 },
  ornans: { region: 'Bourgogne-Franche-Comté', latitude: 47.1017, longitude: 6.1417 },
  aytré: { region: 'Nouvelle-Aquitaine', latitude: 46.1311, longitude: -1.1019 },
  'petite-forêt': { region: 'Hauts-de-France', latitude: 50.3597, longitude: 3.4817 },
  'le creusot': { region: 'Bourgogne-Franche-Comté', latitude: 46.8, longitude: 4.4333 },
  tarbes: { region: 'Occitanie', latitude: 43.2327, longitude: 0.0781 },
  // Démo ESN Nantes (04/10/2026) : siège groupe Naval Group, site d'Indret, Saint-Nazaire.
  paris: { region: 'Île-de-France', latitude: 48.8566, longitude: 2.3522 },
  'la montagne': { region: 'Pays de la Loire', latitude: 47.1836, longitude: -1.6753 },
  'saint-nazaire': { region: 'Pays de la Loire', latitude: 47.2733, longitude: -2.2137 },
  // Démos clients (04/10/2026) : ABB Suisse — la « région » est le canton (périmètre suisse, décision Louis D4).
  zurich: { region: 'Zurich', latitude: 47.3769, longitude: 8.5417 },
  uster: { region: 'Zurich', latitude: 47.3472, longitude: 8.7206 },
  zuzwil: { region: 'Saint-Gall', latitude: 47.4667, longitude: 9.1167 },
  quartino: { region: 'Tessin', latitude: 46.1583, longitude: 8.8692 },
  untersiggenthal: { region: 'Argovie', latitude: 47.5072, longitude: 8.2639 },
  'baden-dättwil': { region: 'Argovie', latitude: 47.4533, longitude: 8.305 },
  baden: { region: 'Argovie', latitude: 47.4731, longitude: 8.3069 },
  turgi: { region: 'Argovie', latitude: 47.4903, longitude: 8.2528 },
  schaffhouse: { region: 'Schaffhouse', latitude: 47.697, longitude: 8.6349 },
  biel: { region: 'Berne', latitude: 47.1368, longitude: 7.2468 },
}

/**
 * Démo clients du 04/10/2026 (BNP Paribas, Bpifrance, Sanofi — 19 sites —, ADEO, Kiabi) : les communes de LEURS briefs
 * seulement. Réservées à ces cinq comptes : « Paris » ou « Lyon » sur la carte d'ENGIE, de BPCE ou de SG changerait un
 * dossier déjà recetté, sans que son brief ait bougé.
 */
const DEMO_CLIENTS_ACCOUNTS: ReadonlySet<string> = new Set([
  'BNP Paribas',
  'Bpifrance',
  'Sanofi',
  'ADEO - Leroy Merlin',
  'Kiabi',
  'Orange',
  // 15/10/2026 — les quatre dossiers de compte déposés par Théo.
  'Crédit Agricole',
  'VINCI',
  'Enedis',
  'Safran',
])
const DEMO_CLIENTS_CITY_POINTS: Readonly<Record<string, { region: string; latitude: number; longitude: number }>> = {
  paris: { region: 'Île-de-France', latitude: 48.8566, longitude: 2.3522 },
  'maisons-alfort': { region: 'Île-de-France', latitude: 48.8061, longitude: 2.4394 },
  'vitry-sur-seine': { region: 'Île-de-France', latitude: 48.7872, longitude: 2.3928 },
  gentilly: { region: 'Île-de-France', latitude: 48.8133, longitude: 2.3447 },
  montreuil: { region: 'Île-de-France', latitude: 48.8638, longitude: 2.4484 },
  lille: { region: 'Hauts-de-France', latitude: 50.6292, longitude: 3.0573 },
  'villeneuve-d’ascq': { region: 'Hauts-de-France', latitude: 50.6221, longitude: 3.147 },
  ronchin: { region: 'Hauts-de-France', latitude: 50.6064, longitude: 3.0953 },
  lezennes: { region: 'Hauts-de-France', latitude: 50.6153, longitude: 3.113 },
  montpellier: { region: 'Occitanie', latitude: 43.6108, longitude: 3.8767 },
  aramon: { region: 'Occitanie', latitude: 43.8903, longitude: 4.6847 },
  bordeaux: { region: 'Nouvelle-Aquitaine', latitude: 44.8378, longitude: -0.5792 },
  mourenx: { region: 'Nouvelle-Aquitaine', latitude: 43.3731, longitude: -0.6256 },
  ambarès: { region: 'Nouvelle-Aquitaine', latitude: 44.91, longitude: -0.48 },
  'val-de-reuil': { region: 'Normandie', latitude: 49.2681, longitude: 1.213 },
  'le trait': { region: 'Normandie', latitude: 49.4742, longitude: 0.8111 },
  lyon: { region: 'Auvergne-Rhône-Alpes', latitude: 45.764, longitude: 4.8357 },
  "marcy-l'étoile": { region: 'Auvergne-Rhône-Alpes', latitude: 45.7817, longitude: 4.7034 },
  'neuville-sur-saône': { region: 'Auvergne-Rhône-Alpes', latitude: 45.871, longitude: 4.8461 },
  sisteron: { region: 'Provence-Alpes-Côte d’Azur', latitude: 44.195, longitude: 5.9429 },
  tours: { region: 'Centre-Val de Loire', latitude: 47.3941, longitude: 0.6848 },
  ploërmel: { region: 'Bretagne', latitude: 47.9317, longitude: -2.3978 },
  // Orange (12/10/2026) : les sept sites du dossier de compte — centre-ville public, jamais une adresse.
  'chevilly-larue': { region: 'Île-de-France', latitude: 48.7647, longitude: 2.3489 },
  aubervilliers: { region: 'Île-de-France', latitude: 48.9136, longitude: 2.3814 },
  chartres: { region: 'Centre-Val de Loire', latitude: 48.4469, longitude: 1.4891 },
  'val de reuil': { region: 'Normandie', latitude: 49.2681, longitude: 1.213 },
  lannion: { region: 'Bretagne', latitude: 48.7326, longitude: -3.4597 },
  'sophia antipolis': { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.6163, longitude: 7.0553 },
  'cesson-sévigné': { region: 'Bretagne', latitude: 48.1219, longitude: -1.6036 },
  // 15/10/2026 — Crédit Agricole, VINCI, Enedis, Safran : les communes de leurs dossiers (centre-ville public, jamais une
  // adresse). Lyon, Paris, Bordeaux, Montpellier, Puteaux, Courbevoie et Gonfreville-l'Orcher ont déjà leur point.
  'saint-quentin-en-yvelines': { region: 'Île-de-France', latitude: 48.7756, longitude: 2.0436 },
  annecy: { region: 'Auvergne-Rhône-Alpes', latitude: 45.8992, longitude: 6.1294 },
  nantes: { region: 'Pays de la Loire', latitude: 47.2184, longitude: -1.5536 },
  rodez: { region: 'Occitanie', latitude: 44.3506, longitude: 2.575 },
  'vaison-la-romaine': { region: 'Provence-Alpes-Côte d’Azur', latitude: 44.2408, longitude: 5.0739 },
  vannes: { region: 'Bretagne', latitude: 47.6582, longitude: -2.7608 },
  nanterre: { region: 'Île-de-France', latitude: 48.8924, longitude: 2.2069 },
  rennes: { region: 'Bretagne', latitude: 48.1173, longitude: -1.6778 },
  dinard: { region: 'Bretagne', latitude: 48.6325, longitude: -2.0617 },
  toulon: { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.1242, longitude: 5.928 },
  grenoble: { region: 'Auvergne-Rhône-Alpes', latitude: 45.1885, longitude: 5.7245 },
  chambéry: { region: 'Auvergne-Rhône-Alpes', latitude: 45.5646, longitude: 5.9178 },
  'clermont-ferrand': { region: 'Auvergne-Rhône-Alpes', latitude: 45.7772, longitude: 3.087 },
  'rueil-malmaison': { region: 'Île-de-France', latitude: 48.8778, longitude: 2.1802 },
  mandelieu: { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.5464, longitude: 6.9381 },
  vedène: { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.9775, longitude: 4.9039 },
  marseille: { region: 'Provence-Alpes-Côte d’Azur', latitude: 43.2965, longitude: 5.3698 },
  'paris 17e': { region: 'Île-de-France', latitude: 48.8835, longitude: 2.3219 },
  'paris 18e': { region: 'Île-de-France', latitude: 48.8925, longitude: 2.3444 },
  'évry-courcouronnes': { region: 'Île-de-France', latitude: 48.629, longitude: 2.44 },
  'montigny-le-bretonneux': { region: 'Île-de-France', latitude: 48.7711, longitude: 2.0333 },
  'savigny-le-temple': { region: 'Île-de-France', latitude: 48.5744, longitude: 2.5828 },
  'corbeil-essonnes': { region: 'Île-de-France', latitude: 48.6139, longitude: 2.482 },
  villaroche: { region: 'Île-de-France', latitude: 48.6047, longitude: 2.6711 },
  gennevilliers: { region: 'Île-de-France', latitude: 48.9333, longitude: 2.3 },
  massy: { region: 'Île-de-France', latitude: 48.7309, longitude: 2.2713 },
  éragny: { region: 'Île-de-France', latitude: 49.0167, longitude: 2.0917 },
  fougères: { region: 'Bretagne', latitude: 48.3525, longitude: -1.1986 },
  vélizy: { region: 'Île-de-France', latitude: 48.7836, longitude: 2.1922 },
  bidos: { region: 'Nouvelle-Aquitaine', latitude: 43.1764, longitude: -0.6047 },
  molsheim: { region: 'Grand Est', latitude: 48.5417, longitude: 7.4925 },
  'le havre': { region: 'Normandie', latitude: 49.4944, longitude: 0.1079 },
  blagnac: { region: 'Occitanie', latitude: 43.6372, longitude: 1.3906 },
  niort: { region: 'Nouvelle-Aquitaine', latitude: 46.3237, longitude: -0.4588 },
  villemur: { region: 'Occitanie', latitude: 43.8667, longitude: 1.5028 },
  issoudun: { region: 'Centre-Val de Loire', latitude: 46.9481, longitude: 1.9933 },
  plaisir: { region: 'Île-de-France', latitude: 48.8231, longitude: 1.9478 },
  colombes: { region: 'Île-de-France', latitude: 48.9226, longitude: 2.2522 },
  bordes: { region: 'Nouvelle-Aquitaine', latitude: 43.2981, longitude: -0.2797 },
  tarnos: { region: 'Nouvelle-Aquitaine', latitude: 43.5406, longitude: -1.4614 },
}

const SITE_TYPE: Record<CommercialBrief['sites'][number]['kind'], string> = {
  headquarters: 'siège social',
  secondary: 'établissement',
  industrial: 'site industriel',
  other: 'établissement',
}

/**
 * Les sites du brief qui se posent sur une carte. Une « ville » qui n'en est pas
 * (« Île-de-France », « Multi-sites », « Régions ») n'a pas de point : elle reste
 * dans le brief, jamais sur la carte avec une coordonnée devinée.
 */
export function briefSitesFrance(brief: CommercialBrief): SiteFrance[] {
  const sites: SiteFrance[] = []
  const seen = new Set<string>()
  for (const site of brief.sites) {
    const cityKey = site.city.trim().toLowerCase()
    const point =
      CITY_POINTS[cityKey] ??
      (DEMO_CLIENTS_ACCOUNTS.has(brief.account_name) ? DEMO_CLIENTS_CITY_POINTS[cityKey] : undefined)
    if (!point || seen.has(site.city)) continue
    seen.add(site.city)
    sites.push({
      city: site.city,
      region: point.region,
      type: SITE_TYPE[site.kind],
      priority: null,
      importance: null,
      latitude: point.latitude,
      longitude: point.longitude,
      is_headquarters: site.kind === 'headquarters',
    })
  }
  return sites
}

/* ------------------------------------------------------------------ */
/* Veille — projets et postes ouverts                                  */
/* ------------------------------------------------------------------ */

const BRIEF_SOURCE = 'Brief commercial du compte (01/10/2026)'
/** « 2026-10-15T… » → « 15/10/2026 » : la date du dossier de compte, celle que la source affiche. */
function dossierDate(brief: CommercialBrief): string {
  const [year, month, day] = brief.generated_at.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/**
 * 12/10/2026 — le dossier de compte déposé par le CEO (Orange) n'est pas un classeur du 01/10 : ses signaux, ses ESN et
 * son organigramme ne se disent pas « brief du 01/10/2026 ». Les briefs xlsx sont tous antérieurs au 12/10.
 */
function isAccountDossier(brief: CommercialBrief): boolean {
  return brief.generated_at.slice(0, 10) >= '2026-10-12'
}

function briefSource(brief: CommercialBrief): string {
  // 15/10/2026 — la date est celle du DOSSIER (Orange : 12/10 ; Crédit Agricole, VINCI, Enedis, Safran : 15/10).
  return isAccountDossier(brief) ? `Dossier de compte (${dossierDate(brief)})` : BRIEF_SOURCE
}

function cell(row: Record<string, string | number | boolean | null>, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * La Veille du compte (« projets 2026-2027 et postes ouverts », CEO 01/10/2026) :
 * les sections `projets-*` et `postes-ouverts` du brief, et à défaut de
 * `projets-*` la section `programmes` (TotalEnergies, Alstom — aucune offre n'y
 * est promise, la `limite` du classeur voyage avec le signal). Sans date : le
 * classeur n'en porte pas, jamais une date inventée (`freshness: 'undated'`).
 */
export function briefRecentSignals(brief: CommercialBrief): RecentSignal[] {
  const signals: RecentSignal[] = []
  const push = (signal: Omit<RecentSignal, 'id' | 'date' | 'freshness' | 'source'>): void => {
    signals.push({
      id: `brief-s${signals.length + 1}`,
      date: null,
      freshness: 'undated',
      source: briefSource(brief),
      ...signal,
    })
  }
  // `projets-*` (ENGIE, BPCE, SG, Sanofi, ADEO, Kiabi) et `dynamique-*` (BNP Paribas, Bpifrance — « Dynamique 2027+ »).
  const isProjects = (key: string): boolean => key.startsWith('projets') || key.startsWith('dynamique')
  const hasProjects = brief.sections.some(section => isProjects(section.key))

  for (const section of brief.sections) {
    if (isProjects(section.key)) {
      for (const row of section.rows) {
        // Trois formes de classeur : « projet / tendance » (ENGIE…), « chantier » (démo clients : BNP, Bpifrance, ADEO,
        // Kiabi), « programme » (Sanofi : site, montant, période, besoin SI).
        const tendance = cell(row, 'projet_tendance')
        if (tendance) {
          push({
            signal: tendance,
            type: 'projet',
            impact: joinDefined([
              cell(row, 'horizon') && `Horizon : ${cell(row, 'horizon')}.`,
              cell(row, 'ce_qui_est_public'),
            ]),
            sales_implication: joinDefined([cell(row, 'ce_que_ca_change'), cell(row, 'offre_a_monter')]) || null,
          })
          continue
        }
        const label = cell(row, 'chantier') ?? cell(row, 'programme')
        if (!label) continue
        push({
          signal: label,
          type: 'projet',
          impact:
            joinDefined([
              cell(row, 'horizon') && `Horizon : ${cell(row, 'horizon')}.`,
              cell(row, 'periode') && `Période : ${cell(row, 'periode')}.`,
              cell(row, 'site') && `Site : ${cell(row, 'site')}.`,
              cell(row, 'montant') && `Montant : ${cell(row, 'montant')}.`,
              cell(row, 'ce_qui_est_public'),
              cell(row, 'ce_que_je_sais'),
            ]) || null,
          sales_implication:
            joinDefined([
              cell(row, 'offre_a_monter'),
              cell(row, 'besoin_si') && `Besoin SI : ${cell(row, 'besoin_si')}`,
              cell(row, 'lecture'),
            ]) || null,
        })
      }
    } else if (section.key === 'postes-ouverts' || section.key === 'postes-ouverts-suisse') {
      // `postes-ouverts-suisse` : onglet POSTES OUVERTS SUISSE d'ABB (démo Alpineo, 04/10/2026) — mêmes colonnes (poste, site, métier, lecture).
      for (const row of section.rows) {
        const label = cell(row, 'poste_ouvert')
        if (!label) continue
        const place = cell(row, 'ville') ?? cell(row, 'site')
        push({
          signal: label,
          type: 'recrutement',
          impact:
            joinDefined([
              place && `Lieu : ${place}.`,
              cell(row, 'metier') && `Métier : ${cell(row, 'metier')}.`,
              cell(row, 'detail'),
            ]) || null,
          sales_implication: cell(row, 'lecture'),
        })
      }
    } else if (section.key === 'programmes' && !hasProjects) {
      for (const row of section.rows) {
        const label = cell(row, 'programme')
        if (!label) continue
        push({
          signal: label,
          type: 'projet',
          impact:
            joinDefined([
              cell(row, 'periode') && `Période : ${cell(row, 'periode')}.`,
              // Briefs de la démo ESN Nantes (04/10/2026) : le programme porte un segment et un horizon.
              cell(row, 'segment') && `Segment : ${cell(row, 'segment')}.`,
              cell(row, 'horizon') && `Horizon : ${cell(row, 'horizon')}.`,
              cell(row, 'site') && `Site : ${cell(row, 'site')}.`,
              cell(row, 'ce_que_je_sais'),
              cell(row, 'limite') && `Limite : ${cell(row, 'limite')}`,
            ]) || null,
          // …et le besoin d'ingénierie sous-jacent tient lieu de « lecture » (ce que ça change pour le vendeur).
          sales_implication: cell(row, 'lecture') ?? cell(row, 'besoin_d_ingenierie_sous_jacent'),
        })
      }
    }
  }
  return signals
}

/** Ajoute les signaux du brief à ceux du compte, sans jamais redoubler un libellé déjà là. */
export function mergeBriefSignals(existing: readonly RecentSignal[], brief: CommercialBrief): RecentSignal[] {
  const seen = new Set(existing.map(signal => normalizePersonName(signal.signal ?? '')))
  const fresh = briefRecentSignals(brief).filter(signal => {
    const key = normalizePersonName(signal.signal ?? '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...existing, ...fresh]
}

/* ------------------------------------------------------------------ */
/* ESN présentes (`account_partners`)                                  */
/* ------------------------------------------------------------------ */

const EVIDENCE_LABEL = { confirmed: 'confirmé', observed: 'observé', hint: 'indice' } as const
const EVIDENCE_CERTAINTY = { confirmed: 'forte', observed: 'moyenne', hint: 'faible' } as const

/**
 * `esn` du brief → les lignes que lit `TabPartners` (« ESN présentes »). Le niveau
 * de preuve du classeur (confirmé / observé / indice) est conservé : dans la
 * certitude de la ligne ET en toutes lettres dans sa note. `skipNames` : les ESN
 * déjà semées par le relevé du compte (SG, BPCE) — comparées par inclusion de nom
 * normalisé, pour ne pas faire deux lignes « Capgemini ».
 */
export function briefPartners(brief: CommercialBrief, skipNames: readonly string[] = []): CsvPartner[] {
  const skip = skipNames.map(normalizePersonName).filter(Boolean)
  const partners: CsvPartner[] = []
  const seen = new Set<string>()
  for (const esn of brief.esn) {
    const key = normalizePersonName(esn.name)
    if (!key || seen.has(key)) continue
    if (skip.some(other => other === key || other.includes(key) || key.includes(other))) continue
    seen.add(key)
    partners.push({
      name: esn.name,
      profiles: 0,
      rank: 'unknown',
      relationship: 'unknown',
      partnerSource: 'analysis',
      certainty: EVIDENCE_CERTAINTY[esn.evidence_level],
      scope: esn.perimeter ?? '',
      note: joinDefined([
        `Niveau de preuve : ${EVIDENCE_LABEL[esn.evidence_level]}.`,
        esn.proof,
        `${briefSource(brief)}.`,
      ]),
      detectedAt: brief.generated_at,
    })
  }
  return partners
}

/* ------------------------------------------------------------------ */
/* Plan d'action et organigramme                                       */
/* ------------------------------------------------------------------ */

/** La section `plan-d-action` du brief, regroupée par échéance (« Semaine 1 », « Semaine 2 »…). */
export function briefActionPlanWeeks(brief: CommercialBrief): PlanPhase[] {
  const section = brief.sections.find(candidate => candidate.key === 'plan-d-action')
  const byWhen = new Map<string, PlanPhase>()
  for (const row of section?.rows ?? []) {
    const when = cell(row, 'quand') ?? 'À planifier'
    const action = cell(row, 'action')
    if (!action) continue
    const phase =
      byWhen.get(when) ??
      ({
        name: normalizePersonName(when).replace(/ /g, '_') || 'a_planifier',
        title: when,
        objective: null,
        actions: [],
      } satisfies PlanPhase)
    phase.actions = [
      ...(phase.actions ?? []),
      {
        action_id: `brief-${normalizePersonName(brief.account_name).replace(/ /g, '-')}-${(phase.actions ?? []).length + 1}-${byWhen.size + 1}`,
        action: joinDefined([action, cell(row, 'quoi_faire') && `— ${cell(row, 'quoi_faire')}`]),
        contact: null,
        channel: null,
        deadline: when,
        expected_outcome: cell(row, 'pourquoi'),
        kpi: null,
      },
    ]
    byWhen.set(when, phase)
  }
  return [...byWhen.values()]
}

/**
 * Les enjeux du compte : la section `besoins-et-tendances` du brief, ligne à
 * ligne — ce que la donnée dit et ce que cela veut dire pour le vendeur, tels
 * que le classeur l'écrit. Sans gravité ni horizon : il n'en publie pas.
 */
export function briefItChallenges(brief: CommercialBrief): ItChallenge[] {
  const section = brief.sections.find(candidate => candidate.key === 'besoins-et-tendances')
  if (!section) return briefDemoClientsChallenges(brief)
  return section.rows.flatMap((row): ItChallenge[] => {
    const title = cell(row, 'tendance')
    if (!title) return []
    return [
      {
        title,
        description:
          joinDefined([cell(row, 'ce_que_dit_la_donnee'), cell(row, 'ce_que_ca_veut_dire_pour_toi')]) || null,
        severity: null,
        timeframe: null,
      },
    ]
  })
}

/**
 * Les enjeux des briefs des démos clients (04/10/2026), qui n'ont pas de section `besoins-et-tendances` : Sanofi lit son
 * onglet « IT SI DATA » (élément, ce que je sais, ce que ça change) ; BNP Paribas, Bpifrance, ADEO et Kiabi lisent leurs
 * chantiers (« Dynamique », « Projets » : chantier, ce qui est public, offre à monter, horizon). Les mots sont ceux du
 * classeur, sans gravité : il n'en publie pas.
 */
function briefDemoClientsChallenges(brief: CommercialBrief): ItChallenge[] {
  // Briefs de la démo ESN Nantes (Naval Group, Chantiers de l'Atlantique) : l'enjeu du compte est le besoin
  // d'ingénierie sous-jacent à chaque programme, tel que le classeur l'écrit (jamais reformulé).
  const programmes = brief.sections.find(candidate => candidate.key === 'programmes')
  if (programmes) {
    return programmes.rows.flatMap((row): ItChallenge[] => {
      const title = cell(row, 'programme')
      if (!title) return []
      return [
        {
          title,
          description:
            joinDefined([
              cell(row, 'ce_que_je_sais'),
              cell(row, 'besoin_d_ingenierie_sous_jacent') &&
                `Besoin d’ingénierie sous-jacent : ${cell(row, 'besoin_d_ingenierie_sous_jacent')}`,
            ]) || null,
          severity: null,
          // l'horizon du classeur est un libellé libre (« 2026-2032 »), pas un des paliers du contrat : il reste dans le brief
          timeframe: null,
        },
      ]
    })
  }
  // ABB Suisse (démos clients, 04/10/2026) : ni besoins-et-tendances ni programmes — l'onglet DOMAINES (« onze axes
  // déduits ») dit ce que le compte permet de proposer : le domaine, ce que le classeur en sait, et sa lecture. Avant
  // `it-si-data` : ABB en a un aussi, mais ses colonnes ne sont pas celles de Sanofi.
  // Réservé au périmètre suisse : l'onglet « domaines » de Sanofi et de BNP Paribas n'a pas ces colonnes.
  const domaines = brief.scope === 'suisse' ? brief.sections.find(candidate => candidate.key === 'domaines') : undefined
  if (domaines) {
    return domaines.rows.flatMap((row): ItChallenge[] => {
      const title = cell(row, 'domaine')
      if (!title) return []
      return [
        {
          title,
          description: joinDefined([cell(row, 'ce_que_je_sais'), cell(row, 'lecture')]) || null,
          severity: null,
          timeframe: null,
        },
      ]
    })
  }
  const itData = brief.sections.find(candidate => candidate.key === 'it-si-data')
  if (itData) {
    return itData.rows.flatMap((row): ItChallenge[] => {
      const title = cell(row, 'element')
      if (!title) return []
      return [
        {
          title,
          description: joinDefined([cell(row, 'ce_que_je_sais'), cell(row, 'ce_que_ca_change')]) || null,
          severity: null,
          timeframe: null,
        },
      ]
    })
  }
  const projects = brief.sections.find(
    candidate => candidate.key.startsWith('dynamique') || candidate.key.startsWith('projets'),
  )
  return (projects?.rows ?? []).flatMap((row): ItChallenge[] => {
    const title = cell(row, 'chantier')
    if (!title) return []
    return [
      {
        title,
        description:
          joinDefined([
            cell(row, 'ce_qui_est_public'),
            cell(row, 'offre_a_monter') && `Offre à monter : ${cell(row, 'offre_a_monter')}`,
          ]) || null,
        severity: null,
        timeframe: cell(row, 'horizon'),
      },
    ]
  })
}

const ATTACK_ANGLE_COUNT = 3

/**
 * Les pistes d'approche : les premières lignes du `plan-d-action` du classeur —
 * la première est la recommandée, comme le classeur les ordonne. Rien n'est
 * inventé : titre = l'action, description = ce qu'il y a à faire et pourquoi,
 * point d'entrée = l'échéance du classeur.
 */
export function briefAttackAngles(
  brief: CommercialBrief,
): { title: string; description: string; entry_point: string; is_recommended: boolean; rank: number }[] {
  const section = brief.sections.find(candidate => candidate.key === 'plan-d-action')
  return (section?.rows ?? [])
    .flatMap(row => {
      const title = cell(row, 'action')
      return title
        ? [
            {
              title,
              description: joinDefined([cell(row, 'quoi_faire'), cell(row, 'pourquoi')]),
              entry_point: cell(row, 'quand') ?? 'À planifier',
            },
          ]
        : []
    })
    .slice(0, ATTACK_ANGLE_COUNT)
    .map((angle, index) => ({ ...angle, is_recommended: index === 0, rank: index + 1 }))
}

const GRAPH_PEOPLE_CAP = 60
const GRAPH_UNIT_CAP = 12
const COMMITTEE_SIZE = 5

function managerName(manager: string): string {
  return manager.replace(/\s*\(.*\)\s*$/, '').trim()
}

/**
 * L'organigramme du compte, lu du brief : l'entité racine et les entités ACTIVES
 * du brief (une entité sortie n'y figure pas), puis les décideurs et managers du
 * classeur (au plus {@link GRAPH_PEOPLE_CAP} — les autres personnes restent des
 * contacts du compte, pas des nœuds), reliés par leur colonne `manager` quand
 * elle nomme quelqu'un du graphe. Un lien déclaré dans un classeur n'est pas une
 * preuve : l'arête est NON vérifiée (trait pointillé). Comité d'achat : les cinq
 * premiers décideurs, en `influencer` — le classeur ne dit pas qui tient le budget.
 */
export function briefOrgGraph(
  brief: CommercialBrief,
  rootId: string,
  seeds: readonly BriefContactSeed[],
  options: {
    /**
     * Recette 12/10/2026 (Orange) — après les décideurs, les contacts EN POSTE du classeur entrent aussi au graphe,
     * répartis entre leurs entités (un à la fois, par entité) jusqu'au plafond : sans eux chaque entité s'affichait
     * « 0 dans le périmètre ». Absent : décideurs et managers seulement, comme avant.
     */
    withCurrentContacts?: boolean
    /** Recette 12/10/2026 — le chemin d'accès recommandé part des décideurs du dossier (voir `path` plus bas). */
    pathFromDecisionMakers?: boolean
    /** Entités du relevé SANS personne au graphe, avec leur pays (code ISO) — les filiales étrangères y sont lisibles. */
    extraEntities?: readonly { name: string; country: string }[]
  } = {},
): OrgGraph {
  const date = brief.generated_at.slice(0, 10)
  const evidence = (reliability: string | undefined, ref: string) => ({
    kind: 'workspace_import' as const,
    grounding: /^confirmé/i.test(reliability ?? '') ? ('B' as const) : ('C' as const),
    date,
    ref,
  })

  const briefEntities = brief.entities
    .filter(
      entity =>
        entity.status === 'active' && normalizePersonName(entity.name) !== normalizePersonName(brief.account_name),
    )
    .map((entity, index) => ({
      id: `${rootId}-${index + 1}`,
      name: entity.name,
      type: 'filiale' as const,
      parentId: rootId,
      confidence: 70,
      evidence: evidence(
        entity.reliability,
        `${briefSource(brief)} — entité${entity.nature ? ` (${entity.nature})` : ''}`,
      ),
    }))

  const byName = new Map(brief.people.map(person => [normalizePersonName(person.name), person]))
  const graphSeeds: { seed: BriefContactSeed; role: PersonRole }[] = []
  const slugs = new Set<string>()
  for (const seed of seeds) {
    const person = byName.get(normalizePersonName(seed.full_name))
    const role = person?.role ?? 'contact'
    if (role !== 'decision_maker' && role !== 'manager') continue
    if (slugs.has(normalizePersonName(seed.full_name))) continue
    slugs.add(normalizePersonName(seed.full_name))
    graphSeeds.push({ seed, role })
    if (graphSeeds.length >= GRAPH_PEOPLE_CAP) break
  }
  if (options.withCurrentContacts) {
    const queues = new Map<string, BriefContactSeed[]>()
    for (const seed of seeds) {
      if ((byName.get(normalizePersonName(seed.full_name))?.role ?? 'contact') !== 'contact') continue
      if (slugs.has(normalizePersonName(seed.full_name))) continue
      queues.set(seed.entity, [...(queues.get(seed.entity) ?? []), seed])
    }
    while (graphSeeds.length < GRAPH_PEOPLE_CAP && [...queues.values()].some(queue => queue.length > 0)) {
      for (const queue of queues.values()) {
        const seed = queue.shift()
        if (!seed || graphSeeds.length >= GRAPH_PEOPLE_CAP) continue
        slugs.add(normalizePersonName(seed.full_name))
        graphSeeds.push({ seed, role: 'contact' })
      }
    }
  }

  // Les directions du classeur (colonne département / entité des personnes) qui ne
  // sont pas déjà une entité du brief : les plus citées deviennent des unités du
  // graphe — c'est là que les personnes se rattachent, jamais à un nœud deviné.
  const briefEntityNames = new Set(briefEntities.map(entity => normalizePersonName(entity.name)))
  const unitCounts = new Map<string, { label: string; count: number }>()
  for (const { seed } of graphSeeds) {
    const key = normalizePersonName(seed.entity)
    if (!key || key === normalizePersonName(brief.account_name) || briefEntityNames.has(key)) continue
    unitCounts.set(key, { label: seed.entity, count: (unitCounts.get(key)?.count ?? 0) + 1 })
  }
  const unitEntities = [...unitCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, GRAPH_UNIT_CAP)
    .map(([key, unit], index) => ({
      key,
      id: `${rootId}-unit-${index + 1}`,
      name: unit.label,
      type: 'bu' as const,
      parentId: rootId,
      ...(() => {
        const country = options.extraEntities?.find(extra => normalizePersonName(extra.name) === key)?.country
        return country ? { country } : {}
      })(),
      confidence: 55,
      evidence: evidence(undefined, `${briefSource(brief)} — direction citée par ${unit.count} personne(s)`),
    }))
  const activeEntities = [...briefEntities, ...unitEntities.map(({ key: _key, ...entity }) => entity)]
  const entityByName = new Map<string, string>([
    ...briefEntities.map(entity => [normalizePersonName(entity.name), entity.id] as const),
    ...unitEntities.map(unit => [unit.key, unit.id] as const),
  ])

  const people = graphSeeds.map(({ seed, role }) => ({
    name: seed.full_name,
    title: seed.title || 'Fonction non renseignée',
    entityId: entityByName.get(normalizePersonName(seed.entity)) ?? rootId,
    family: seed.family,
    level:
      seed.seniority === 'c_suite'
        ? ('L1' as const)
        : seed.seniority === 'director'
          ? ('L2' as const)
          : ('L3' as const),
    roles: [role === 'decision_maker' ? ('influencer' as const) : ('unknown' as const)],
    confidence: 55,
    evidence: evidence(
      byName.get(normalizePersonName(seed.full_name))?.reliability,
      `${briefSource(brief)} — ${ROLE_META[role].label}`,
    ),
  }))

  const inGraph = new Map(people.map(person => [normalizePersonName(person.name), person.name]))
  const edges = graphSeeds.flatMap(({ seed }) => {
    const manager = byName.get(normalizePersonName(seed.full_name))?.manager
    const target = manager ? inGraph.get(normalizePersonName(managerName(manager))) : undefined
    if (!target || target === seed.full_name) return []
    return [{ from: seed.full_name, to: target, confidence: 50, verified: false }]
  })

  return buildDemoOrgGraph({
    entities: [
      {
        id: rootId,
        name: brief.account_name,
        type: 'groupe',
        parentId: null,
        confidence: 90,
        evidence: evidence('Confirmé', `${briefSource(brief)} — fiche du compte`),
      },
      ...activeEntities,
      ...(options.extraEntities ?? [])
        .filter(extra => !entityByName.has(normalizePersonName(extra.name)))
        .map((extra, index) => ({
          id: `${rootId}-ext-${index + 1}`,
          name: extra.name,
          type: 'filiale' as const,
          parentId: rootId,
          country: extra.country,
          confidence: 55,
          evidence: evidence(undefined, `${briefSource(brief)} — entité citée par le relevé`),
        })),
    ],
    people,
    edges,
    influences: [],
    committee: graphSeeds
      .filter(({ role }) => role === 'decision_maker')
      .slice(0, COMMITTEE_SIZE)
      .map(({ seed }) => ({
        name: seed.full_name,
        role: 'influencer' as const,
        reason: seed.why_contact,
        accessScore: seed.contact_score,
      })),
    // Recette 12/10/2026 (Louis, « carré ») — le « Chemin d'accès recommandé » de l'organigramme part des décideurs du
    // dossier, dans l'ordre du dossier : le levier que l'écran lit déjà (`recommendedPath`), sans rôle inventé. Ni canal
    // ni débouché : le dossier ne les dit pas. Absent : chemin vide, comme avant.
    path: options.pathFromDecisionMakers
      ? graphSeeds
          .filter(({ role }) => role === 'decision_maker')
          .slice(0, COMMITTEE_SIZE)
          .map(({ seed }) => ({ name: seed.full_name, objective: seed.why_contact }))
      : [],
  })
}
