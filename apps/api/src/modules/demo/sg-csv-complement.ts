import type { KeyNote, OrgEntity, TechnologyEntry } from '@bellum/contracts'
import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { parseCompteCsvRows, type CompteCsvRow } from './compte-csv-parser'
import {
  isNonTechnologyLabel,
  technologyTags,
  writeCsvNeedAnnotations,
  writeCsvPartners,
  countOf,
  type CsvNeedAnnotation,
  type CsvPartner,
  type CsvSqlExecutor,
} from './compte-csv-writes'
import { mapSgAiApplications, mapSgDetectedTechStack, mapSgEntities, mapSgProgramNames } from './sg-csv-mapping'

/**
 * COMPLÉMENT SG DU 28/09/2026 — le retour de démonstration de Théo.
 *
 * Trois écrans du compte Société Générale restaient vides ou muets alors que
 * le CSV importé le 27/09 (`data/sg-compte-complet.csv`) portait la réponse :
 *
 * 1. « Organigramme du groupe » (`GroupOrgView`, lit `raw_analysis.org.orgGraph
 *    .entities`) : 4 entités écrites à la main. Le CSV en porte 55 (bloc 09) et
 *    31 unités (bloc 02) — `mapSgOrgGraphEntities`.
 * 2. « Les ESN présentes » (`TabPartners`, lit la table `account_partners` via
 *    `GET /accounts/:id/partners`) : aucune ligne. Le bloc 07 cite, dans le
 *    `constat` de chaque prestataire en poste, la SOCIÉTÉ qui l'emploie —
 *    `mapSgEsnPartners`.
 * 3. Les pistes « Besoin détecté » (`QualificationLeadsQueue`, lit la table
 *    `opportunities` via `GET /projects?account_id=`) : `source`, `offer`
 *    (périmètre) et `btmmp.management` (rôle) à NULL, donc « la source du fait
 *    n'est pas identifiée » sur chaque ligne — `mapSgNeedAnnotations`.
 *
 * ⚠️ LA RÈGLE DU 27/09 TIENT (voir le docblock de `sg-csv-mapping.ts`) : les
 * personnes des blocs 06/07/08 ne sont JAMAIS semées nom par nom sur le lien
 * public. Ce module n'en lit que ce qui n'est pas une donnée personnelle — le
 * nom d'une SOCIÉTÉ employeuse, un rattachement d'entité, un compte. Aucun
 * nom, e-mail, téléphone ni fonction individuelle ne sort d'ici
 * (`sg-csv-complement.spec.ts` le vérifie sur les ~1 900 noms réels).
 *
 * Les écritures SQL vivent ICI, une seule fois, pour deux appelants : le semis
 * des salles (`DemoSeedService`) et le script de rattrapage des salles déjà
 * semées (`apps/api/scripts/demo-sg-complement.ts`) — jamais deux copies qui
 * divergeraient.
 */

const CSV_IMPORT_DATE_LABEL = '27/09/2026'
const CSV_IMPORT_DATE_ISO = '2026-09-27T00:00:00.000Z'
const CSV_IMPORT_DATE_SHORT = '2026-09-27'

/** La racine du graphe écrit à la main (`demo-org-graphs.ts`). */
export const SG_ORG_GRAPH_ROOT_ID = 'e-sg'

function rowsOf(rows: readonly CompteCsvRow[], bloc: string): CompteCsvRow[] {
  return rows.filter(row => row.bloc === bloc)
}

/** Un identifiant stable dérivé de la LIGNE source (`SG-0036` → `…-0036`) :
 *  le rejeu du script retrouve le même nœud, jamais un doublon. */
function csvNodeId(bloc: '02' | '09', row: CompteCsvRow): string {
  return `e-sg-csv-${bloc}-${(row.id ?? '').replace(/^SG-/, '')}`
}

/* ------------------------------------------------------------------ */
/* 1. Organigramme du groupe — blocs 02 + 09 → orgGraph.entities       */
/* ------------------------------------------------------------------ */

/** Les lignes du bloc 09 qui DÉSIGNENT un nœud déjà écrit à la main : la
 *  maison mère et deux filiales. Comparaison exacte, jamais floue. */
const BLOC09_ALREADY_IN_GRAPH = new Set(['société générale s.a.', 'treezor sas', 'boursorama s.a. — marque boursobank'])

const BLOC02_TYPE: Record<string, OrgEntity['type']> = {
  'Pôle ou activité': 'bu',
  'Fonction centrale': 'bu',
  'Périmètre régional': 'bu',
  'Sous-unité': 'departement',
  "Périmètre d'audit": 'departement',
}

function csvSource(row: CompteCsvRow, grounding: 'B' | 'C'): OrgEntity['sources'][number] {
  const reliability = row.fiabilite ? `, fiabilité : ${row.fiabilite}` : ''
  return {
    id: `s-sg-csv-${row.id ?? ''}`,
    kind: 'workspace_import',
    ref: `Relevé du compte importé le ${CSV_IMPORT_DATE_LABEL} — ligne ${row.id ?? ''} (${row.niveau ?? 'niveau non précisé'}${reliability})`,
    grounding,
    date: CSV_IMPORT_DATE_SHORT,
  }
}

function isConfirmed(row: CompteCsvRow): boolean {
  return (row.fiabilite ?? '').startsWith('Confirmé')
}

/**
 * Les nœuds d'entité que le graphe du groupe n'avait pas.
 *
 * - bloc 02 : pôles, fonctions centrales, périmètres régionaux → `bu` ;
 *   sous-unités et périmètres d'audit → `departement`.
 * - bloc 09 : « Entité juridique actuelle » → `filiale`, `operating` ; les
 *   entités « historique — statut à vérifier » → `filiale`, statut `unknown` ;
 *   les « correspondances historiques » (codes de pôle, « BDDF — … ») → `bu`,
 *   statut `unknown`. Le CSV DIT « historique » : le graphe ne les affirme
 *   pas actives, il ne les efface pas non plus.
 *
 * Tous rattachés à la racine : le CSV ne publie pas de lien parent entre ces
 * lignes, et en déduire un d'une mise en page serait de la donnée inventée.
 */
export function mapSgOrgGraphEntities(rows: readonly CompteCsvRow[]): OrgEntity[] {
  const fromStructure = rowsOf(rows, '02_STRUCTURE_GROUPE').flatMap((row): OrgEntity[] => {
    if (!row.objet || !row.id) return []
    return [
      {
        id: csvNodeId('02', row),
        name: row.objet,
        type: BLOC02_TYPE[row.niveau ?? ''] ?? 'bu',
        parentId: SG_ORG_GRAPH_ROOT_ID,
        country: 'FR',
        status: 'operating',
        confidence: isConfirmed(row) ? 80 : 55,
        sources: [csvSource(row, isConfirmed(row) ? 'B' : 'C')],
      },
    ]
  })

  const fromPerimeter = rowsOf(rows, '09_ENTITES_ET_PERIMETRE').flatMap((row): OrgEntity[] => {
    if (!row.objet || !row.id) return []
    if (BLOC09_ALREADY_IN_GRAPH.has(row.objet.trim().toLowerCase())) return []
    const niveau = row.niveau ?? ''
    const isCurrentLegalEntity = niveau === 'Entité juridique actuelle'
    const isCorrespondence = niveau === 'Correspondance historique'
    return [
      {
        id: csvNodeId('09', row),
        name: row.objet,
        type: isCorrespondence ? 'bu' : 'filiale',
        parentId: SG_ORG_GRAPH_ROOT_ID,
        ...(row.pays ? { country: row.pays } : {}),
        status: isCurrentLegalEntity ? 'operating' : 'unknown',
        confidence: isConfirmed(row) ? 80 : 55,
        sources: [csvSource(row, isConfirmed(row) ? 'B' : 'C')],
      },
    ]
  })

  return [...fromStructure, ...fromPerimeter]
}

/* ------------------------------------------------------------------ */
/* 2. Les ESN présentes — bloc 07 → account_partners                   */
/* ------------------------------------------------------------------ */

/**
 * Les sociétés employeuses RÉELLEMENT citées dans le `constat` du bloc 07
 * (« Consultant at Awalee Consulting », « Software developer - Sogeti (FS) »…).
 * Une liste FERMÉE, relue ligne par ligne sur les 43 lignes du bloc : un
 * extracteur générique de « at X » prendrait « at SG AM » (le compte lui-même)
 * pour une ESN. Les ~17 indépendants (« Freelance ») ne sont pas une société
 * de services : ils ne font pas de ligne.
 */
const SG_ESN_EMPLOYERS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'ANGPOW Consultancy', pattern: /\bANGPOW Consultancy\b/i },
  { name: 'Awalee Consulting', pattern: /\bAwalee Consulting\b/i },
  { name: 'Nexialog Consulting', pattern: /\bNexialog Consulting\b/i },
  { name: 'mc2i', pattern: /\bmc2i\b/i },
  { name: 'Sogeti', pattern: /\bSogeti\b/i },
]

type SgEsnPartner = CsvPartner

export function mapSgEsnPartners(rows: readonly CompteCsvRow[]): SgEsnPartner[] {
  const bloc = rowsOf(rows, '07_PRESTATAIRES_EXTERNES_EN_POSTE')
  return SG_ESN_EMPLOYERS.flatMap(({ name, pattern }): SgEsnPartner[] => {
    const matches = bloc.filter(row => pattern.test(row.constat ?? ''))
    if (matches.length === 0) return []
    const entities = [
      ...new Set(matches.map(row => row.rattachement).filter((value): value is string => Boolean(value))),
    ]
    const allConfirmed = matches.every(isConfirmed)
    return [
      {
        name,
        profiles: matches.length,
        rank: 'unknown',
        relationship: 'unknown',
        partnerSource: 'analysis',
        certainty: allConfirmed ? 'forte' : 'moyenne',
        scope: `${matches.length} profil${matches.length > 1 ? 's' : ''} prestataire${matches.length > 1 ? 's' : ''} en poste — ${entities.join(', ') || 'Société Générale'}`,
        note: `Société employeuse citée dans le relevé du compte importé le ${CSV_IMPORT_DATE_LABEL} (bloc « prestataires externes en poste »). Aucun nom de personne n'est publié sur ce jeu de démonstration.`,
        detectedAt: CSV_IMPORT_DATE_ISO,
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* 3. Les pistes « Besoin détecté » — blocs 11/15 → opportunities      */
/* ------------------------------------------------------------------ */

/**
 * Chaque piste du compte, reliée au DOMAINE d'opportunité (bloc 15) qui la
 * porte — et, pour les cinq programmes du bloc 11, à sa propre ligne.
 *
 * Les libellés sont ceux que `ProjectsService.materialize` écrit depuis le
 * dossier (`demo-dataset.ts` : `it_challenges`, `pains`, `program_names`,
 * `it_implications_for_esn`) — `demo-dataset.spec` vérifie qu'ils y sont.
 * `label: null` = la seule ligne de sa nature sur le compte (l'implication).
 */
const SG_NEED_DOMAIN_LINKS: readonly { kind: string; label: string | null; domain: string }[] = [
  { kind: 'program', label: 'Plan stratégique à horizon 2029', domain: 'STRAT' },
  { kind: 'program', label: 'AI for IT — efficacité du développement et du support', domain: 'DATA_AI' },
  { kind: 'program', label: 'Simplification du patrimoine applicatif et technologique', domain: 'IT_APP' },
  { kind: 'program', label: 'Discipline des dépenses externes et consolidation fournisseurs', domain: 'STRAT' },
  { kind: 'program', label: 'Approche intégrée et segmentée SG / BoursoBank', domain: 'BANKING' },
  { kind: 'program', label: 'Optimisation du réseau et simplification du retail', domain: 'BANKING' },
  { kind: 'challenge', label: 'Plan stratégique 2029 à outiller techniquement', domain: 'STRAT' },
  { kind: 'challenge', label: 'Industrialisation des cas d’usage d’IA générative documentaire', domain: 'DATA_AI' },
  { kind: 'challenge', label: 'Surface d’attaque des parcours d’authentification', domain: 'CYBER' },
  { kind: 'challenge', label: 'Fragmentation héritée des rapprochements internes', domain: 'IT_APP' },
  {
    kind: 'pain',
    label: 'Écart entre le rythme trimestriel attendu par les marchés et la capacité de livraison interne',
    domain: 'CLOUD',
  },
  { kind: 'pain', label: 'Prototypes d’IA générative qui ne passent pas en production', domain: 'DATA_AI' },
  { kind: 'implication', label: null, domain: 'IT_APP' },
]

type SgNeedAnnotation = CsvNeedAnnotation

function readingOf(row: CompteCsvRow): string {
  return [
    row.constat ? `Constat : ${row.constat}` : null,
    row.interpretation ? `Lecture : ${row.interpretation}` : null,
    row.implication ? `Implication : ${row.implication}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function mapSgNeedAnnotations(rows: readonly CompteCsvRow[]): SgNeedAnnotation[] {
  const domains = new Map(rowsOf(rows, '15_DOMAINES_OPPORTUNITE').map(row => [row.code_domaine ?? '', row]))
  const programs = new Map(rowsOf(rows, '11_PROGRAMMES_TRANSFORMATION').map(row => [row.objet ?? '', row]))

  return SG_NEED_DOMAIN_LINKS.flatMap((link): SgNeedAnnotation[] => {
    const domain = domains.get(link.domain)
    if (!domain?.id || !domain.objet) return []
    const program = link.kind === 'program' && link.label ? programs.get(link.label) : undefined
    const sourceRow = program ?? domain
    const reliability = sourceRow.fiabilite ?? 'non précisée'
    const source = program
      ? `Programme déclaré par le compte — relevé importé le ${CSV_IMPORT_DATE_LABEL}, ligne ${sourceRow.id} (fiabilité : ${reliability})`
      : `Domaine d’opportunité « ${domain.objet} » — relevé importé le ${CSV_IMPORT_DATE_LABEL}, ligne ${sourceRow.id} (fiabilité : ${reliability})`
    const models = domain.modele_contrat ? ` · modèles : ${domain.modele_contrat}` : ''
    return [
      {
        kind: link.kind,
        label: link.label,
        csvId: sourceRow.id ?? '',
        source,
        perimeter: `${domain.objet}${models}`,
        role: `Rôles concernés : ${domain.personas ?? 'non publiés par la source'}`,
        detail: readingOf(sourceRow),
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* 4. Technologies et familles de métiers — AGRÉGATS comptés des        */
/*    contacts EN POSTE (blocs 06 + 07), jamais une ligne par personne  */
/* ------------------------------------------------------------------ */

/** Les profils EN POSTE : contacts opérationnels (06) + prestataires (07).
 *  Le bloc 08 (« ayant exercé chez le compte ») parle d'anciens : il ne dit
 *  pas ce que le compte emploie AUJOURD'HUI. C'est aussi le périmètre de la
 *  ligne agrégée du CSV lui-même (SG-2191/SG-2192 : « profils en poste »). */
function currentProfiles(rows: readonly CompteCsvRow[]): CompteCsvRow[] {
  return rows.filter(
    row => row.bloc === '06_CONTACTS_OPERATIONNELS' || row.bloc === '07_PRESTATAIRES_EXTERNES_EN_POSTE',
  )
}

const TECHNOLOGY_COUNT_LIMIT = 15

/** Les technologies des profils en poste, COMPTÉES (un profil compte une
 *  fois par technologie) → `technology_stack` (`TechStackCard`, onglet Vue
 *  d'ensemble). Le compte vit dans `usage` : le contrat n'a pas de champ
 *  numérique, et la carte affiche `usage` sous le nom. */
export function mapSgContactTechnologyCounts(rows: readonly CompteCsvRow[]): TechnologyEntry[] {
  const counts = new Map<string, number>()
  for (const row of currentProfiles(rows)) {
    if (!row.technologies) continue
    for (const tag of technologyTags(row.technologies)) {
      if (isNonTechnologyLabel(tag)) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TECHNOLOGY_COUNT_LIMIT)
    .map(([name, count]) => ({
      name,
      usage: `Citée sur ${count} profil${count > 1 ? 's' : ''} en poste (agrégat du relevé importé le ${CSV_IMPORT_DATE_LABEL}, aucun nom publié)`,
      maturity: null,
    }))
}

export const SG_JOB_FAMILY_NOTE_LABEL = 'Familles de métiers des profils en poste'

/** Les familles de métiers des profils en poste, COMPTÉES → une note de
 *  lecture (`structural_reading_axes`, `KeyNotesCard`). Un profil sans
 *  famille renseignée ne fait pas de ligne : « non classé » n'est pas une
 *  famille. */
export function mapSgJobFamilyNote(rows: readonly CompteCsvRow[]): KeyNote | null {
  const counts = new Map<string, number>()
  for (const row of currentProfiles(rows)) {
    const family = row.famille_metier?.trim()
    if (!family) continue
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  const parts = [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([family, count]) => `${family} (${count})`)
  return {
    label: SG_JOB_FAMILY_NOTE_LABEL,
    constat: `${total} profils identifiés en poste, par famille de métiers : ${parts.join(' · ')}.`,
    interpretation: `Agrégat compté sur la base de contacts du compte (relevé importé le ${CSV_IMPORT_DATE_LABEL}). Aucun nom individuel n'est publié sur ce jeu de démonstration.`,
    implication: null,
    reliability: 'Observé',
    amount: null,
    currency: null,
    period: null,
  }
}

/* ------------------------------------------------------------------ */
/* Les écritures — partagées par le semis et le script de rattrapage   */
/* ------------------------------------------------------------------ */

/** `manager.query` de TypeORM, ou tout exécuteur de même forme. */
export type SgSqlExecutor = CsvSqlExecutor

type SgWriteCounts = { partners: number; needs: number }

/**
 * `account_partners` (5 ESN) puis `opportunities` (les pistes reliées).
 *
 * Bornées au compte ET à son espace : chaque requête relit le compte par
 * `id = $2 AND workspace_id = $1` (ESN) ou `a.id = $1 AND a.workspace_id = $2`
 * (pistes) — un identifiant de compte d'un autre espace n'écrit RIEN.
 *
 * ⚠️ Une correction humaine gagne toujours : `ON CONFLICT DO NOTHING` sur une
 * ESN déjà déclarée ou corrigée, et `COALESCE(o.<champ>, $n)` sur une piste —
 * un champ déjà rempli (par l'utilisateur, par le pipeline) n'est jamais
 * écrasé.
 */
export async function applySgPartnersAndNeeds(
  exec: SgSqlExecutor,
  workspaceId: string,
  accountId: string,
  options: { dryRun: boolean; rows?: readonly CompteCsvRow[] },
): Promise<SgWriteCounts> {
  const rows = options.rows ?? sgRows()
  return {
    partners: await writeCsvPartners(exec, workspaceId, accountId, mapSgEsnPartners(rows), options.dryRun),
    needs: await writeCsvNeedAnnotations(exec, workspaceId, accountId, mapSgNeedAnnotations(rows), options.dryRun),
  }
}

/** Ce que la piste complète porte (`DEMO_SG_COMPLETE_LEAD`, passée en paramètre : pas d'import circulaire). */
export type SgCompleteLead = {
  label: string
  detail: string
  detected_days_ago: number
  source: string
  primary_domain_code: string
  offer: string
  management: string
}

/**
 * #3679 — LA PISTE COMPLÈTE du compte SG (« Préparer l'approche »), écrite par le semis ET rattrapée ici sur une
 * salle DÉJÀ semée (l'INSERT du semis ne rejoue pas : la salle de prod ne l'avait pas, le geste n'y apparaissait nulle
 * part). Idempotent : rien n'est écrit si une piste du même libellé existe déjà sur le compte ; bornée au couple
 * (compte, espace) ; jamais d'écrasement. Retourne le nombre de pistes écrites (dry-run : à écrire).
 */
export async function applySgCompleteLead(
  exec: SgSqlExecutor,
  workspaceId: string,
  accountId: string,
  lead: SgCompleteLead,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const found = await exec(
      `SELECT count(*)::int AS count FROM accounts a
        WHERE a.id = $2 AND a.workspace_id = $1
          AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = a.id AND o.label = $3)`,
      [workspaceId, accountId, lead.label],
    )
    return countOf(found)
  }
  const detectedAt = new Date(Date.now() - lead.detected_days_ago * 86_400_000).toISOString()
  const inserted = await exec(
    `INSERT INTO opportunities
       (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, source, confidence,
        primary_domain_code, first_detected_at, offer, btmmp)
     SELECT a.workspace_id, a.id, 'besoin', $3, $4, 'potential', $5, $6, 'medium', $7, $5, $8, $9::jsonb
       FROM accounts a
      WHERE a.id = $2 AND a.workspace_id = $1
        AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = a.id AND o.label = $3)
     RETURNING id`,
    [
      workspaceId,
      accountId,
      lead.label,
      lead.detail,
      detectedAt,
      lead.source,
      lead.primary_domain_code,
      lead.offer,
      JSON.stringify({ management: lead.management }),
    ],
  )
  return inserted.length
}

/* ------------------------------------------------------------------ */
/* raw_analysis — ce qu'une salle semée AVANT ce lot n'a pas            */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Ajoute à `current` les éléments de `extra` dont la clé manque — jamais un
 *  remplacement, jamais un doublon. */
function appendMissing<T>(current: unknown[], extra: readonly T[], keyOf: (item: unknown) => string | null) {
  const known = new Set(current.map(keyOf).filter((key): key is string => key !== null))
  const additions = extra.filter(item => {
    const key = keyOf(item)
    if (key === null || known.has(key)) return false
    known.add(key)
    return true
  })
  return { next: [...current, ...additions], added: additions.length }
}

const byName = (item: unknown): string | null => {
  const name = asRecord(item)['name']
  return typeof name === 'string' ? name.trim().toLowerCase() : null
}
const byId = (item: unknown): string | null => {
  const id = asRecord(item)['id']
  return typeof id === 'string' ? id : null
}
const byString = (item: unknown): string | null => (typeof item === 'string' ? item.trim().toLowerCase() : null)
const byLabel = (item: unknown): string | null => {
  const label = asRecord(item)['label']
  return typeof label === 'string' ? label.trim().toLowerCase() : null
}

/** Les clés que le semis porte déjà dans `demo-dataset.ts` depuis le 27/09 et
 *  ce lot, fusionnées dans un dossier Société Générale DÉJÀ en base. Pure :
 *  rend une copie, ne mute jamais son entrée. */
export function mergeSgRawAnalysis(
  raw: unknown,
  rows?: readonly CompteCsvRow[],
): { merged: Json; added: Record<string, number> } {
  const csvRows = rows ?? sgRows()
  const root = { ...asRecord(raw) }
  const added: Record<string, number> = {}

  const org = { ...asRecord(root['org']) }
  const graph = asRecord(org['orgGraph'])
  if (Object.keys(graph).length > 0) {
    const entities = asArray(graph['entities'])
    const rootId = entities.map(asRecord).find(entity => entity['type'] === 'groupe')?.['id']
    const extra = mapSgOrgGraphEntities(csvRows).map(entity =>
      typeof rootId === 'string' ? { ...entity, parentId: rootId } : { ...entity, parentId: null },
    )
    const { next, added: count } = appendMissing(entities, extra, byId)
    added['orgGraphEntities'] = count
    org['orgGraph'] = { ...graph, entities: next }
    root['org'] = org
  } else {
    added['orgGraphEntities'] = 0
  }

  const merges: [string, readonly unknown[], (item: unknown) => string | null][] = [
    ['entities_exhaustive', mapSgEntities(csvRows), byName],
    ['program_names', mapSgProgramNames(csvRows), byName],
    ['technology_stack', [...mapSgAiApplications(csvRows), ...mapSgContactTechnologyCounts(csvRows)], byName],
    ['detected_tech_stack', mapSgDetectedTechStack(csvRows), byString],
    ['structural_reading_axes', [mapSgJobFamilyNote(csvRows)].filter(Boolean), byLabel],
  ]

  const keyNames: Record<string, string> = {
    entities_exhaustive: 'entitiesExhaustive',
    program_names: 'programNames',
    technology_stack: 'technologyStack',
    detected_tech_stack: 'detectedTechStack',
    structural_reading_axes: 'jobFamilyNote',
  }
  for (const [key, extra, keyOf] of merges) {
    const { next, added: count } = appendMissing(asArray(root[key]), extra, keyOf)
    if (count > 0) root[key] = next
    added[keyNames[key] ?? key] = count
  }

  return { merged: root, added }
}

/** Le CSV n'est relu qu'une fois par processus (2 289 lignes). */
let sgRowsCache: CompteCsvRow[] | null = null
function sgRows(): CompteCsvRow[] {
  sgRowsCache ??= parseCompteCsvRows(SG_COMPTE_COMPLET_CSV)
  return sgRowsCache
}
