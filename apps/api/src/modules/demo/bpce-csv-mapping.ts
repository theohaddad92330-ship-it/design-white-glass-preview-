import { computeContactLifecycleState, TO_REVALIDATE_TAG } from '@bellum/contracts'
import type {
  EntityNode,
  ItChallenge,
  KeyNote,
  PainPoint,
  ProgramName,
  RecentSignal,
  SiteFrance,
  TechnologyEntry,
} from '@bellum/contracts'
import type { CompteCsvRow } from './compte-csv-parser'
import { isNonTechnologyLabel, technologyTags, type CsvNeedAnnotation, type CsvPartner } from './compte-csv-writes'

/**
 * Le compte « Groupe BPCE », semé depuis `data/bpce-compte-complet.csv`
 * (1 073 lignes, 25 blocs, importé le 30/09/2026).
 *
 * Exigence de Louis (30/09/2026) : TOUT le fichier apparaît dans le compte,
 * « aucune ligne perdue ». La garantie est STRUCTURELLE : `routeBpceRows`
 * envoie chaque ligne au mappeur de son bloc, et rend la liste des `id`
 * consommés ET des `id` non consommés — `bpce-csv-mapping.spec.ts` exige que
 * la seconde soit vide et que le compteur de chaque bloc égale son nombre de
 * lignes. Un bloc ajouté plus tard au CSV sans mappeur sort en « non consommé »
 * au lieu de disparaître en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONTACTS NOMMÉS AVEC COORDONNÉES — RENVERSEMENT ASSUMÉ, DATÉ, POUR CE SEUL COMPTE
 * ─────────────────────────────────────────────────────────────────────────
 * Décision Louis (propriétaire du produit) du 30/09/2026, prise APRÈS avoir été
 * averti du risque RGPD (question posée, réponse « Tout, coordonnées incluses »,
 * confirmée deux fois) : les blocs `09_CONTACTS_OPERATIONNELS` (295),
 * `09B_MANAGERS_OPERATIONNELS_FILIALE_IT` (9), `10_PRESTATAIRES_EXTERNES_EN_POSTE`
 * (58) et `11_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE` (48), plus `04_GOUVERNANCE`
 * (49), sont semés comme contacts NOMMÉS avec email, email professionnel,
 * téléphone, mobile et LinkedIn.
 *
 * Cela RENVERSE, pour le dossier Groupe BPCE seulement, la règle « zéro
 * coordonnée sur une personne réelle » du 12/08/2026 (docblock de
 * `demo-dataset.ts`, règles 1 et 3) et le choix fait pour Société Générale le
 * 27/09/2026 (`sg-csv-mapping.ts` : sièges anonymes). La règle RESTE EN VIGUEUR
 * pour tous les autres dossiers ; les gardes qui la tiennent portent une
 * exemption NOMMÉE pour ce dossier (`DEMO_BPCE_REAL_CONTACTS_COMPANY`), avec
 * cette raison, jamais une suppression.
 *
 * Aucune coordonnée n'est inventée : une ligne sans email n'en reçoit pas.
 * Le champ `email` de la fiche prend l'adresse professionnelle quand elle
 * existe ; les AUTRES adresses et numéros relevés restent lisibles dans le
 * résumé de la fiche (la fiche n'a qu'un champ email et un champ téléphone).
 *
 * Les faits sont datés du 30/09/2026 (date d'import). Rien n'est ajouté au
 * CSV : ce qu'il ne dit pas (siège, effectif, SIREN…) reste non renseigné.
 */

export const BPCE_IMPORT_DATE = '30/09/2026'

/** Le nom du dossier, et la clé des exemptions nommées des gardes de démo. */
export const DEMO_BPCE_REAL_CONTACTS_COMPANY = 'Groupe BPCE'

const BLOC = {
  lecture: '01_LECTURE_STRUCTURELLE',
  structure: '02_STRUCTURE_GROUPE',
  banques: '03_BANQUES_COOPERATIVES',
  gouvernance: '04_GOUVERNANCE',
  sites: '05_SITES',
  achats: '06_CHAINE_ACHATS',
  referencement: '06B_REFERENCEMENT_DETAIL',
  prestatairesEnPlace: '07_PRESTATAIRES_EN_PLACE',
  routes: '07B_ROUTES_ET_INTERMEDIAIRES',
  besoins: '08_BESOINS_OBSERVES',
  prix: '08B_NIVEAUX_DE_PRIX_OBSERVES',
  recrutement: '08C_SIGNAUX_DE_RECRUTEMENT',
  contacts: '09_CONTACTS_OPERATIONNELS',
  managers: '09B_MANAGERS_OPERATIONNELS_FILIALE_IT',
  externes: '10_PRESTATAIRES_EXTERNES_EN_POSTE',
  makeOrBuy: '10B_MAKE_OR_BUY',
  anciens: '11_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE',
  entites: '12_ENTITES_JURIDIQUES',
  projection: '12B_PROJECTION_2027',
  programmes: '13_PROGRAMMES',
  hypotheses: '14_HYPOTHESES_DE_BESOIN',
  technologies: '15_TECHNOLOGIES',
  domaines: '16_DOMAINES_OPPORTUNITE',
  indicateurs: '17_INDICATEURS',
  garde: '18_GARDE_FOUS',
} as const

/* ------------------------------------------------------------------ */
/* Petits outils de lecture                                            */
/* ------------------------------------------------------------------ */

function splitPipe(value: string | undefined): string[] {
  return value
    ? value
        .split('|')
        .map(part => part.trim())
        .filter(Boolean)
    : []
}

function reliabilityOf(row: CompteCsvRow): string {
  return row.fiabilite ?? 'non précisée'
}

/** « relevé importé le 30/09/2026, ligne BPCE-0001 (fiabilité : Confirmé) » */
function lineSource(row: CompteCsvRow): string {
  return `relevé importé le ${BPCE_IMPORT_DATE}, ligne ${row.id ?? '?'} (fiabilité : ${reliabilityOf(row)})`
}

function readingOf(row: CompteCsvRow): string {
  return [
    row.constat ? `Constat : ${row.constat}` : null,
    row.interpretation ? `Lecture : ${row.interpretation}` : null,
    row.implication ? `Implication : ${row.implication}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function keyNote(row: CompteCsvRow, extra: { label?: string; constat?: string | null } = {}): KeyNote {
  return {
    label: extra.label ?? row.objet ?? null,
    constat: extra.constat !== undefined ? extra.constat : (row.constat ?? null),
    interpretation: row.interpretation ?? null,
    implication: row.implication ?? null,
    reliability: row.fiabilite ?? null,
    amount: null,
    currency: null,
    period: null,
  }
}

/** #5107.7 — le `niveau` d'un prestataire du CSV BPCE, en français lisible. */
const PARTNER_LEVEL_LABELS: Record<string, string> = {
  ESN: 'ESN',
  ESN_et_conseil: 'ESN et conseil',
  cabinet_conseil: 'Cabinet de conseil',
  cabinet_conseil_technologie: 'Cabinet de conseil en technologie',
  conseil_formation_changement: 'Conseil, formation et conduite du changement',
}

/** #5107.7 — la nature de la preuve d'un prestataire (`statut`), en une phrase. */
const PARTNER_EVIDENCE_LABELS: Record<string, string> = {
  rapporte_par_presse: 'Rapporté par la presse.',
  preuves_de_portee_distincte: 'Preuves de portées distinctes.',
}

/** Un jeton inconnu se lit quand même : soulignés en espaces, jamais affiché brut. */
function readableToken(value: string): string {
  const text = value.replace(/_/g, ' ').trim()
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1)
}

function partnerLevelLabel(niveau: string | null | undefined): string {
  if (!niveau) return ''
  return PARTNER_LEVEL_LABELS[niveau] ?? readableToken(niveau)
}

function partnerEvidenceLabel(statut: string | null | undefined): string | null {
  if (!statut) return null
  return PARTNER_EVIDENCE_LABELS[statut] ?? `${readableToken(statut)}.`
}

/** #5107.7 (famille) — le `statut` d'une entité juridique du CSV BPCE, lisible. */
function entityStatusLabel(statut: string): string {
  if (statut === 'IDENTIFIE_DANS_PERIMETRE_COMPTABLE_2025') return 'identifiée dans le périmètre comptable 2025'
  return statut.includes('_') ? readableToken(statut.toLocaleLowerCase('fr')).toLocaleLowerCase('fr') : statut
}

function joinDefined(parts: readonly (string | null | undefined | false)[], separator = ' · '): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(separator)
}

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

export type BpceContactKind = 'gouvernance' | 'manager' | 'operationnel' | 'externe' | 'ancien'

const KIND_ORDER: Record<BpceContactKind, number> = {
  gouvernance: 0,
  manager: 1,
  operationnel: 2,
  externe: 3,
  ancien: 4,
}

const KIND_TAG: Record<BpceContactKind, string> = {
  gouvernance: 'Gouvernance',
  manager: 'Manager opérationnel',
  operationnel: 'Contact opérationnel',
  externe: 'Prestataire externe',
  ancien: 'Ancien du compte',
}

const KIND_LABEL: Record<BpceContactKind, string> = {
  gouvernance: 'Gouvernance du groupe',
  manager: 'Manager opérationnel ayant exprimé un besoin de prestation',
  operationnel: 'Contact opérationnel identifié sur le compte',
  externe: 'Prestataire externe en poste chez le compte',
  ancien: 'Profil ayant exercé chez le compte, aujourd’hui ailleurs',
}

const KIND_SCORE: Record<BpceContactKind, number> = {
  gouvernance: 40,
  manager: 40,
  operationnel: 30,
  externe: 30,
  ancien: 20,
}

/** La famille métier du CSV vers les onze familles de `contactFamilySchema`.
 *  Une famille sans bucket (marketing, design, commerce…) reste VIDE : jamais
 *  rabattue sur une voisine qui lui ferait dire autre chose. */
const FAMILY_MAP: Record<string, string> = {
  'Développement logiciel': 'Dev',
  'Data / IA': 'Data',
  'Data et réglementaire': 'Data',
  'Gestion de projet / PMO': 'PMO',
  'Infrastructure / Cloud / SRE': 'Infra',
  'Infrastructure, production et sécurité': 'Infra',
  Cloud: 'Infra',
  'Finance / Juridique': 'Finance',
  'Finance métier': 'Finance',
  'Risque et pilotage': 'Finance',
  Cybersécurité: 'Cyber',
}

export function familyFromTitle(title: string): string {
  const t = title.toLowerCase()
  if (/cyber|sécurité des systèmes|rssi/.test(t)) return 'Cyber'
  if (/data|donn[ée]es|analytics|intelligence artificielle|\bia\b/.test(t)) return 'Data'
  if (/financ|cfo|comptab|risque/.test(t)) return 'Finance'
  if (/ressources humaines|\brh\b|chro|talent/.test(t)) return 'RH'
  if (/achat|procurement|fournisseur/.test(t)) return 'Achat'
  if (/infrastructure|production|cloud|réseau/.test(t)) return 'Infra'
  if (/projet|pmo|programme/.test(t)) return 'PMO'
  if (/développ|developer|software|architecte/.test(t)) return 'Dev'
  if (/système|\bsi\b|\bit\b|informatique|digital|technolog|cio|dsi|cto/.test(t)) return 'IT'
  return ''
}

export function seniorityOf(title: string, kind: BpceContactKind): string {
  if (/président|directeur général|chief|\bceo\b|\bcfo\b|\bcio\b|\bcto\b|membre du comité exécutif/i.test(title)) {
    return 'c_suite'
  }
  if (/directeur|directrice|director|\bhead\b|responsable de la/i.test(title)) return 'director'
  if (kind === 'manager' || /manager|chef|responsable|lead/i.test(title)) return 'manager'
  return 'senior'
}

const GOVERNANCE_ROLE: Record<string, string> = {
  'Responsable de périmètre / prescripteur potentiel': 'influencer',
  'Relais produit / livraison potentiel': 'champion',
}

/**
 * 15/10/2026 (recette R24, Louis 12/10 « contacts démo = décideurs ») — un prescripteur de rang C-level (président du
 * directoire, directeur général…) tient le budget de son périmètre : `economic`, le rôle que lit le badge « Décideur ».
 * Un directeur reste `influencer` : le relevé ne dit pas qu'il décide seul.
 */
function governanceRole(roleDecision: string | undefined, title: string, kind: BpceContactKind): string {
  const role = GOVERNANCE_ROLE[roleDecision ?? ''] ?? 'unknown'
  return role === 'influencer' && seniorityOf(title, kind) === 'c_suite' ? 'economic' : role
}

const GOVERNANCE_PRIORITY: Record<string, number> = {
  P1_QUALIFICATION_DOMAINE: 1,
  P2_QUALIFICATION_TERRAIN: 2,
  CONTEXTE_GOUVERNANCE: 3,
}

type BpceContact = {
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
  /** Les `id` du CSV que cette fiche porte (plusieurs si des homonymes ont été fusionnés). */
  csvIds: string[]
}

function buildContact(row: CompteCsvRow, kind: BpceContactKind): BpceContact {
  const emails = [...splitPipe(row.email_pro), ...splitPipe(row.email)]
  const phones = splitPipe(row.telephone)
  const mobiles = splitPipe(row.mobile)
  const email = emails[0] ?? null
  const phone = phones[0] ?? mobiles[0] ?? null
  const otherEmails = [...new Set(emails.slice(1).filter(value => value !== email))]
  const otherPhones = [
    ...phones.filter(value => value !== phone).map(value => `tél. ${value}`),
    ...mobiles.filter(value => value !== phone).map(value => `mobile ${value}`),
  ]

  const title = row.fonction ?? ''
  const isGovernance = kind === 'gouvernance'
  const priority = isGovernance ? (GOVERNANCE_PRIORITY[row.priorite ?? ''] ?? 3) : 3
  const family = FAMILY_MAP[row.famille_metier ?? ''] ?? familyFromTitle(title) ?? ''
  const technologies = row.technologies ? technologyTags(row.technologies).join(' · ') : null

  const coordinates = joinDefined([
    otherEmails.length > 0 && `Autres adresses relevées : ${otherEmails.join(', ')}`,
    otherPhones.length > 0 && `Autres numéros relevés : ${otherPhones.join(', ')}`,
  ])

  return {
    full_name: (row.objet ?? '').trim(),
    title,
    entity: row.entite ?? DEMO_BPCE_REAL_CONTACTS_COMPANY,
    family: isGovernance && !family ? 'C-Level' : family,
    decision_role: isGovernance ? governanceRole(row.role_decision, title, kind) : 'unknown',
    priority,
    email,
    phone,
    linkedin_url: row.linkedin ?? null,
    profile_summary: joinDefined(
      [
        `${KIND_LABEL[kind]}.`,
        row.constat,
        row.fonction_passee && `Fonction passée : ${row.fonction_passee}.`,
        row.statut && `Statut de prospection : ${row.statut}.`,
        row.ville && `Ville : ${row.ville}.`,
        row.famille_metier && `Famille métier : ${row.famille_metier}.`,
        technologies && `Technologies : ${technologies}.`,
        coordinates && `${coordinates}.`,
        `Relevé importé le ${BPCE_IMPORT_DATE} — ligne ${row.id ?? '?'} (fiabilité : ${reliabilityOf(row)}).`,
      ],
      ' ',
    ),
    why_contact: row.implication ?? row.interpretation ?? 'Personne relevée sur le compte.',
    contact_score: isGovernance ? 60 - priority * 10 : KIND_SCORE[kind],
    seniority: seniorityOf(title, kind),
    lifecycle_state: isGovernance ? 'identite_verifiee' : 'detecte',
    key_points: [
      row.interpretation,
      row.fonction_passee && `Précédemment : ${row.fonction_passee}`,
      row.statut && `Statut de prospection : ${row.statut}`,
      row.role_decision,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0),
    // Théo A comptes-fiche-reference.N5 — une identité de gouvernance que le relevé donne « À revalider » en porte l'étiquette
    // (la mention de rattachement qui l'accompagne ne vaut que pour la gouvernance).
    tags: [
      KIND_TAG[kind],
      ...(row.statut ? [`Statut : ${row.statut}`] : []),
      ...(isGovernance && row.fiabilite === TO_REVALIDATE_TAG ? [TO_REVALIDATE_TAG] : []),
    ],
    csvIds: [row.id ?? ''],
  }
}

/** Deux lignes pour la MÊME personne (les noms sont uniques par compte en base) :
 *  la seconde est FUSIONNÉE dans la première, jamais écartée — son `id` reste
 *  consommé et sa ligne se lit dans le résumé. */
function mergeHomonym(into: BpceContact, extra: BpceContact): void {
  into.tags = [...new Set([...into.tags, ...extra.tags])]
  into.csvIds.push(...extra.csvIds)
  into.email ??= extra.email
  into.phone ??= extra.phone
  into.linkedin_url ??= extra.linkedin_url
  into.title = into.title || extra.title
  into.profile_summary = `${into.profile_summary} Même personne relevée une seconde fois (${extra.tags.join(', ')}) : ${extra.profile_summary}`
}

/* ------------------------------------------------------------------ */
/* Sites                                                               */
/* ------------------------------------------------------------------ */

/**
 * Coordonnées publiques du CENTRE-VILLE (même pratique que les sites de Société
 * Générale : « la carte a besoin d'un point, et le relevé ne publie pas de
 * latitude »). Limité aux villes RÉELLEMENT présentes dans les lignes
 * françaises du bloc `05_SITES`.
 */
const FRENCH_CITY_CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
  Strasbourg: { latitude: 48.5734, longitude: 7.7521 },
  Mérignac: { latitude: 44.8387, longitude: -0.6436 },
  Villeurbanne: { latitude: 45.7676, longitude: 4.8797 },
  'Aix-en-Provence': { latitude: 43.5297, longitude: 5.4474 },
  Dijon: { latitude: 47.322, longitude: 5.0415 },
  'Saint-Estève': { latitude: 42.7125, longitude: 2.8367 },
  'Saint-Herblain': { latitude: 47.2122, longitude: -1.6493 },
  Balma: { latitude: 43.6105, longitude: 1.4998 },
  'Montigny-le-Bretonneux': { latitude: 48.7686, longitude: 2.0308 },
  Paris: { latitude: 48.8566, longitude: 2.3522 },
  'Charenton-le-Pont': { latitude: 48.8225, longitude: 2.4122 },
  'Saint-Ouen-l’Aumône': { latitude: 49.0453, longitude: 2.1214 },
  Nantes: { latitude: 47.2184, longitude: -1.5536 },
  Caen: { latitude: 49.1829, longitude: -0.3707 },
  'Saint-Jacques-de-la-Lande': { latitude: 48.0897, longitude: -1.7125 },
  'Saint-Jean-de-la-Ruelle': { latitude: 47.9108, longitude: 1.8652 },
  Bruges: { latitude: 44.8861, longitude: -0.6095 },
  Martillac: { latitude: 44.7358, longitude: -0.4244 },
  'Villeneuve-d’Ascq': { latitude: 50.6233, longitude: 3.1447 },
  Reims: { latitude: 49.2583, longitude: 4.0317 },
  'Bois-Guillaume': { latitude: 49.4686, longitude: 1.1191 },
}

/* ------------------------------------------------------------------ */
/* Le routage                                                          */
/* ------------------------------------------------------------------ */

type BpceAttackAngle = {
  title: string
  description: string
  entry_point: string
  is_recommended: boolean
  rank: number
}

type BpceOrgUnit = { entity: string; level: string | null; contacts: string[]; missingRoles: string[] }

type Accumulator = {
  consumed: Set<string>
  contactRows: { row: CompteCsvRow; kind: BpceContactKind }[]
  entitiesExhaustive: EntityNode[]
  sitesFrance: SiteFrance[]
  siteAddresses: string[]
  programNames: ProgramName[]
  competences: TechnologyEntry[]
  needTechTags: string[]
  detectedTechStack: string[]
  orgUnits: BpceOrgUnit[]
  decisionSteps: { step: string; actors: string[]; duration: string | null }[]
  decisionDescription: string[]
  structuralReadingAxes: KeyNote[]
  ecosystemThirdParties: KeyNote[]
  opportunityDomains: { note: KeyNote; score: number; id: string; row: CompteCsvRow }[]
  financialIndicators: KeyNote[]
  dataReliabilityNotes: KeyNote[]
  recentSignals: RecentSignal[]
  itChallenges: ItChallenge[]
  pains: PainPoint[]
  partners: CsvPartner[]
  needAnnotations: CsvNeedAnnotation[]
  businessDescription: string | null
  itImplications: string | null
}

type Handler = (row: CompteCsvRow, acc: Accumulator) => void

function noRole(detail: string): string {
  return `Rôles concernés : ${detail}`
}

const HANDLERS: Record<string, Handler> = {
  [BLOC.lecture]: (row, acc) => {
    acc.structuralReadingAxes.push(keyNote(row))
    if (row.id === 'BPCE-0001' && row.constat) acc.businessDescription = row.constat
  },
  [BLOC.structure]: (row, acc) => {
    acc.orgUnits.push({ entity: row.objet ?? '', level: row.niveau ?? null, contacts: [], missingRoles: [] })
  },
  [BLOC.banques]: (row, acc) => {
    acc.orgUnits.push({ entity: row.objet ?? '', level: 'Banque coopérative', contacts: [], missingRoles: [] })
  },
  [BLOC.gouvernance]: (row, acc) => acc.contactRows.push({ row, kind: 'gouvernance' }),
  [BLOC.managers]: (row, acc) => acc.contactRows.push({ row, kind: 'manager' }),
  [BLOC.contacts]: (row, acc) => acc.contactRows.push({ row, kind: 'operationnel' }),
  [BLOC.externes]: (row, acc) => acc.contactRows.push({ row, kind: 'externe' }),
  [BLOC.anciens]: (row, acc) => acc.contactRows.push({ row, kind: 'ancien' }),
  [BLOC.sites]: (row, acc) => {
    if (row.pays) {
      // Implantation hors France : pas de champ d'accueil « site » — elle se lit
      // parmi les entités du compte, sous un nom qui ne se confond jamais avec
      // l'entité juridique homonyme du bloc 12.
      acc.entitiesExhaustive.push({
        name: `${row.objet ?? ''} (implantation)`,
        type: 'implantation',
        parent: null,
        region: row.pays,
        estimated_headcount: null,
        it_autonomy: null,
        relevance: null,
        relevanceReason: joinDefined([row.niveau, row.constat, row.interpretation, row.implication]),
        is_active: null,
        actionable: null,
      })
      return
    }
    const city = row.ville ?? row.objet ?? ''
    const centroid = FRENCH_CITY_CENTROIDS[city]
    const isCampus = (row.objet ?? '').startsWith('Campus')
    acc.sitesFrance.push({
      city,
      region: null,
      type: isCampus ? 'datacenter' : null,
      priority: null,
      importance: null,
      latitude: centroid?.latitude ?? null,
      longitude: centroid?.longitude ?? null,
      is_headquarters: false,
    })
    if (row.constat) acc.siteAddresses.push(`${row.objet ?? city} : ${row.constat}`)
  },
  [BLOC.achats]: (row, acc) => {
    acc.decisionSteps.push({ step: row.objet ?? '', actors: [], duration: null })
    acc.decisionDescription.push(joinDefined([`${row.objet ?? ''} :`, row.constat, row.implication], ' '))
  },
  [BLOC.referencement]: (row, acc) => acc.structuralReadingAxes.push(keyNote(row)),
  [BLOC.makeOrBuy]: (row, acc) => {
    acc.structuralReadingAxes.push(keyNote(row))
    if (row.id === 'BPCE-U0044') acc.itImplications = joinDefined([row.constat, row.implication], ' ')
  },
  [BLOC.routes]: (row, acc) => acc.ecosystemThirdParties.push(keyNote(row)),
  [BLOC.garde]: (row, acc) => acc.dataReliabilityNotes.push(keyNote(row)),
  [BLOC.prestatairesEnPlace]: (row, acc) => {
    acc.partners.push({
      name: row.objet ?? '',
      profiles: 0,
      rank: 'unknown',
      relationship: 'unknown',
      partnerSource: 'analysis',
      certainty: (row.fiabilite ?? '').startsWith('Confirmé') ? 'forte' : 'moyenne',
      // #5107.7 — la carte Écosystème affiche `scope` comme PÉRIMÈTRE : un libellé, jamais
      // un jeton du CSV (« ESN_et_conseil — rapporte_par_presse » s'affichait tel quel).
      // La nature de la preuve (`statut`) n'est pas un périmètre : elle va dans la note.
      scope: partnerLevelLabel(row.niveau),
      note: joinDefined(
        [
          row.constat,
          row.interpretation,
          partnerEvidenceLabel(row.statut),
          `Relevé importé le ${BPCE_IMPORT_DATE}, ligne ${row.id ?? '?'}.`,
        ],
        ' ',
      ),
      detectedAt: '2026-09-30T00:00:00.000Z',
    })
  },
  [BLOC.besoins]: (row, acc) => {
    if ((row.objet ?? '').startsWith('Stack observée')) {
      // Pas un besoin : la stack observée sur les appels d'offres de la filiale informatique.
      acc.detectedTechStack.push(...splitPipe(row.stack), ...splitPipe(row.technologies))
      return
    }
    const manager = row.manager_operationnel
    const prescripteur = row.prescripteur?.trim()
    const reference = row.reference_ao && row.reference_ao !== '-' ? row.reference_ao.trim() : null
    const label = joinDefined([row.objet, row.entite], ' — ')
    acc.pains.push({
      pain: label,
      business_impact: joinDefined([
        row.constat,
        row.prix_observe && `Prix observé : ${row.prix_observe}`,
        row.seniorite && `Séniorité : ${row.seniorite}`,
        row.duree && `Durée : ${row.duree}`,
        row.presence_site && `Présence sur site : ${row.presence_site}`,
        row.frequence && `Fréquence : ${row.frequence}`,
        row.canal && `Canal : ${row.canal}`,
        row.periode && `Période : ${row.periode}`,
        row.ville && `Lieu : ${row.ville}`,
        row.famille_metier && `Famille métier : ${row.famille_metier}`,
        row.stack && `Stack : ${splitPipe(row.stack).join(', ')}`,
        row.technologies && `Technologies : ${row.technologies}`,
        prescripteur && `Prescripteur : ${prescripteur}`,
        manager && `Manager opérationnel : ${manager}`,
        reference && `Référence de l'appel d'offres : ${reference}`,
        row.interpretation && `Lecture : ${row.interpretation}`,
      ]),
      esn_offer: row.implication ?? null,
      urgency: null,
    })
    acc.needTechTags.push(...splitPipe(row.stack), ...splitPipe(row.technologies).flatMap(technologyTags))
    acc.needAnnotations.push({
      kind: 'pain',
      label,
      csvId: row.id ?? '',
      source: `Besoin de prestation observé — ${lineSource(row)}`,
      perimeter: joinDefined([row.entite, row.ville], ' — ') || 'Groupe BPCE',
      role: noRole(
        joinDefined([prescripteur && `prescripteur ${prescripteur}`, manager && `manager ${manager}`], ' · ') ||
          'non publiés par la source',
      ),
      detail: readingOf(row),
    })
  },
  [BLOC.prix]: (row, acc) => {
    acc.financialIndicators.push(
      keyNote(row, {
        constat: joinDefined([
          row.prix_observe && `Prix observé : ${row.prix_observe}`,
          row.canal && `Canal : ${row.canal}`,
          row.constat,
        ]),
      }),
    )
  },
  [BLOC.recrutement]: (row, acc) => {
    const signal = row.objet ?? ''
    acc.recentSignals.push({
      id: `bpce-s${acc.recentSignals.length + 1}`,
      signal,
      source: `Relevé du compte — ${lineSource(row)}`,
      type: 'recrutement',
      date: null,
      sales_implication: row.implication ?? null,
      impact: joinDefined([row.ville && `Lieu : ${row.ville}`, row.constat, row.interpretation]),
      freshness: 'undated',
    })
    acc.needAnnotations.push(signalAnnotation(row, signal, 'Signal de recrutement'))
  },
  [BLOC.projection]: (row, acc) => {
    const signal = row.objet ?? ''
    acc.recentSignals.push({
      id: `bpce-s${acc.recentSignals.length + 1}`,
      signal,
      source: `Relevé du compte — ${lineSource(row)}`,
      type: 'projet',
      date: null,
      sales_implication: row.implication ?? null,
      impact: joinDefined([row.horizon && `Horizon : ${row.horizon}`, row.constat, row.interpretation]),
      freshness: 'undated',
    })
    acc.needAnnotations.push(signalAnnotation(row, signal, 'Projection'))
  },
  [BLOC.entites]: (row, acc) => {
    const parent = row.societe_mere && row.societe_mere !== 'NON_ETABLIE' ? row.societe_mere : null
    acc.entitiesExhaustive.push({
      name: row.objet ?? '',
      type: row.niveau === 'Entité juridique' ? 'filiale' : row.niveau === 'Succursale' ? 'succursale' : null,
      parent,
      region: row.pays ?? null,
      estimated_headcount: null,
      it_autonomy: null,
      relevance: null,
      relevanceReason: joinDefined([
        row.niveau,
        row.detention && `Détention Groupe : ${row.detention} %${row.methode ? ` (méthode ${row.methode})` : ''}`,
        // #5107.7 (famille) — le statut d'une entité se lit, jamais le jeton du CSV.
        row.statut && `Statut : ${entityStatusLabel(row.statut)}`,
        row.constat,
      ]),
      is_active: row.statut === 'IDENTIFIE_DANS_PERIMETRE_COMPTABLE_2025' ? true : null,
      actionable: null,
    })
  },
  [BLOC.programmes]: (row, acc) => {
    const name = row.objet ?? ''
    acc.programNames.push({
      name,
      entity: null,
      budget: null,
      description: joinDefined([row.constat, row.implication], ' — ') || null,
    })
    acc.needAnnotations.push({
      kind: 'program',
      label: name,
      csvId: row.id ?? '',
      source: `Programme déclaré par le compte — ${lineSource(row)}`,
      perimeter: name,
      role: noRole('non publiés par la source'),
      detail: readingOf(row),
    })
  },
  [BLOC.hypotheses]: (row, acc) => {
    const title = row.objet ?? ''
    acc.itChallenges.push({
      title,
      description: joinDefined(
        [
          'Hypothèse commerciale, sans demande externe ni budget ouvert confirmé.',
          row.domaine && `Domaine : ${row.domaine}.`,
          row.processus && `Processus : ${row.processus}.`,
          row.livrable && `Livrable : ${row.livrable}.`,
          row.modele && `Modèle : ${row.modele}.`,
          row.question && `Question de qualification : ${row.question}`,
          row.constat,
          row.implication && `Implication : ${row.implication}`,
        ],
        ' ',
      ),
      severity: null,
      timeframe: null,
    })
    acc.needAnnotations.push({
      kind: 'challenge',
      label: title,
      csvId: row.id ?? '',
      source: `Hypothèse de besoin — ${lineSource(row)}`,
      perimeter: row.domaine ?? 'Groupe BPCE',
      role: noRole('non publiés par la source (hypothèse à qualifier)'),
      detail: readingOf(row),
    })
  },
  [BLOC.technologies]: (row, acc) => {
    const entries = splitPipe(row.technologies)
    if ((row.objet ?? '').startsWith('Compétences')) {
      for (const entry of entries) {
        const match = /^(.+?)\s*\((\d+)\)$/.exec(entry)
        if (!match || isNonTechnologyLabel(match[1])) continue
        acc.competences.push({
          name: match[1],
          usage: `Pondération ${match[2]} sur les profils en poste (relevé importé le ${BPCE_IMPORT_DATE})`,
          maturity: null,
        })
      }
      return
    }
    acc.structuralReadingAxes.push(keyNote(row, { constat: joinDefined([row.constat, entries.join(' · ')], ' — ') }))
  },
  [BLOC.domaines]: (row, acc) => {
    const score = Number(row.score)
    acc.opportunityDomains.push({
      id: row.id ?? '',
      row,
      score: Number.isFinite(score) ? score : 0,
      note: keyNote(row, {
        constat: joinDefined(
          [
            row.score &&
              `Note analytique du relevé : ${row.score}/100 (une note d'attrait du domaine, jamais une probabilité).`,
            row.constat,
            row.personas && `Personas : ${row.personas}.`,
            row.canal_achat && `Canaux d'achat : ${row.canal_achat}.`,
            row.modele_contrat && `Modèles de contrat : ${row.modele_contrat}.`,
            row.barriere && `Barrière : ${row.barriere}.`,
          ],
          ' ',
        ),
      }),
    })
  },
  [BLOC.indicateurs]: (row, acc) => {
    acc.financialIndicators.push(
      keyNote(row, {
        constat: joinDefined(
          [
            row.constat,
            row.montant &&
              `Montant tel que publié au relevé : ${row.montant}${row.devise ? ` ${row.devise}` : ''} — unité non précisée par la source, jamais recalculé.`,
            row.nature && `Nature : ${row.nature}.`,
          ],
          ' ',
        ),
      }),
    )
    // `period` porte la période SANS montant chiffré : « non mesuré » n'est jamais 0.
    const note = acc.financialIndicators[acc.financialIndicators.length - 1]
    if (note) note.period = row.periode ?? null
  },
}

function signalAnnotation(row: CompteCsvRow, signal: string, kindLabel: string): CsvNeedAnnotation {
  return {
    kind: 'signal',
    label: signal,
    csvId: row.id ?? '',
    source: `${kindLabel} — ${lineSource(row)}`,
    perimeter: row.ville ?? 'Groupe BPCE',
    role: noRole('non publiés par la source'),
    detail: readingOf(row),
  }
}

/**
 * Tout ce que le CSV BPCE alimente dans le dossier, ligne par ligne. Pure.
 */
export function routeBpceRows(rows: readonly CompteCsvRow[]) {
  const acc: Accumulator = {
    consumed: new Set(),
    contactRows: [],
    entitiesExhaustive: [],
    sitesFrance: [],
    siteAddresses: [],
    programNames: [],
    competences: [],
    needTechTags: [],
    detectedTechStack: [],
    orgUnits: [],
    decisionSteps: [],
    decisionDescription: [],
    structuralReadingAxes: [],
    ecosystemThirdParties: [],
    opportunityDomains: [],
    financialIndicators: [],
    dataReliabilityNotes: [],
    recentSignals: [],
    itChallenges: [],
    pains: [],
    partners: [],
    needAnnotations: [],
    businessDescription: null,
    itImplications: null,
  }
  const unconsumedIds: string[] = []
  const consumedIds: string[] = []
  const blocConsumption: Record<string, number> = {}

  for (const row of rows) {
    const id = row.id ?? ''
    const handler = row.bloc ? HANDLERS[row.bloc] : undefined
    if (!handler) {
      unconsumedIds.push(id)
      continue
    }
    handler(row, acc)
    consumedIds.push(id)
    blocConsumption[row.bloc ?? ''] = (blocConsumption[row.bloc ?? ''] ?? 0) + 1
  }

  // Contacts : gouvernance d'abord, homonymes fusionnés (un nom par compte en base).
  const contacts: BpceContact[] = []
  const byName = new Map<string, BpceContact>()
  const ordered = [...acc.contactRows].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind])
  for (const { row, kind } of ordered) {
    const contact = buildContact(row, kind)
    const key = contact.full_name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      mergeHomonym(existing, contact)
      continue
    }
    byName.set(key, contact)
    contacts.push(contact)
  }
  // Recette démo 05/10/2026 : « 0 coordonnées trouvées » sur Groupe BPCE. L'état persisté bat le calcul
  // de la liste : `detecte` écrit en dur faisait compter 0 à l'étape « enrichi » de l'entonnoir /contacts.
  // On le calcule ICI, après la fusion des homonymes (qui peut apporter l'e-mail ou le téléphone).
  for (const contact of contacts) {
    contact.lifecycle_state = computeContactLifecycleState({
      fullName: contact.full_name,
      title: contact.title,
      entity: contact.entity,
      role: contact.decision_role,
      email: contact.email,
      phone: contact.phone,
      linkedinUrl: contact.linkedin_url,
    })
  }

  // Les adresses des sites : le champ « site » n'a pas de ligne d'adresse.
  const structuralReadingAxes = [...acc.structuralReadingAxes]
  if (acc.siteAddresses.length > 0) {
    structuralReadingAxes.push({
      label: 'Adresses des sites en France',
      constat: acc.siteAddresses.join(' ; '),
      interpretation: 'Sites de la filiale informatique et campus datacenter relevés au bloc 05_SITES.',
      implication: "Porte d'entrée régionale : besoins d'infrastructure, de production et de sécurité localisés.",
      reliability: 'Confirmé',
      amount: null,
      currency: null,
      period: null,
    })
  }

  // La stack : pondération du relevé, puis besoins observés, puis profils en poste.
  const need = new Map<string, number>()
  for (const tag of acc.needTechTags.filter(label => !isNonTechnologyLabel(label)))
    need.set(tag, (need.get(tag) ?? 0) + 1)
  const inPost = new Map<string, number>()
  for (const { row } of acc.contactRows.filter(entry => entry.kind === 'operationnel' || entry.kind === 'externe')) {
    for (const tag of technologyTags(row.technologies ?? '')) {
      if (!isNonTechnologyLabel(tag)) inPost.set(tag, (inPost.get(tag) ?? 0) + 1)
    }
  }
  const counted = (map: Map<string, number>, what: string, limit: number): TechnologyEntry[] =>
    [...map]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .map(([name, count]) => ({
        name,
        usage: `Citée sur ${count} ${what} (relevé importé le ${BPCE_IMPORT_DATE})`,
        maturity: null,
      }))
  const technologyStack: TechnologyEntry[] = []
  const seenTech = new Set<string>()
  for (const entry of [
    ...acc.competences,
    ...counted(need, 'besoin(s) de prestation observé(s)', 30),
    ...counted(inPost, 'profil(s) en poste', 15),
  ]) {
    const key = (entry.name ?? '').toLowerCase()
    if (!key || seenTech.has(key)) continue
    seenTech.add(key)
    technologyStack.push(entry)
  }

  // Les angles : les domaines d'opportunité, du mieux noté au moins bien noté.
  const domains = [...acc.opportunityDomains].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  )
  const attackAngles: BpceAttackAngle[] = domains.map(({ row, score }, index) => ({
    title: row.objet ?? '',
    description: joinDefined(
      [
        row.constat,
        row.implication,
        row.barriere && `Barrière : ${row.barriere}.`,
        score > 0 && `Note analytique du relevé : ${score}/100.`,
      ],
      ' ',
    ),
    entry_point: (row.personas ?? '').split(';')[0]?.trim() || 'Persona non publié par la source',
    is_recommended: index === 0,
    rank: index + 1,
  }))

  return {
    consumedIds,
    unconsumedIds,
    blocConsumption,
    contacts,
    entitiesExhaustive: acc.entitiesExhaustive,
    sitesFrance: acc.sitesFrance,
    programNames: acc.programNames,
    technologyStack,
    detectedTechStack: [...new Set(acc.detectedTechStack)],
    orgUnits: acc.orgUnits,
    decisionChain: {
      description: acc.decisionDescription.length > 0 ? acc.decisionDescription.join(' ¶ ') : null,
      steps: acc.decisionSteps,
    },
    structuralReadingAxes,
    ecosystemThirdParties: acc.ecosystemThirdParties,
    opportunityDomains: domains.map(({ note }) => note),
    financialIndicators: acc.financialIndicators,
    dataReliabilityNotes: acc.dataReliabilityNotes,
    recentSignals: acc.recentSignals,
    itChallenges: acc.itChallenges,
    pains: acc.pains,
    partners: acc.partners,
    needAnnotations: acc.needAnnotations,
    attackAngles,
    businessDescription: acc.businessDescription,
    itImplications: acc.itImplications,
  }
}

/** Comptage brut par bloc — la base du test « chaque bloc est entièrement consommé ». */
export function bpceCsvBlocCounts(rows: readonly CompteCsvRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.bloc) continue
    counts[row.bloc] = (counts[row.bloc] ?? 0) + 1
  }
  return counts
}
