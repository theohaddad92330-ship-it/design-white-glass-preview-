import { z } from 'zod'
import { DATAFORGE_NEED_STATUSES } from './dataforge-needs.js'

/**
 * #4282 — le RADAR PAR TECHNOLOGIE (« radar SAP France »), contrat COMMUN
 * entre Laura et Découvrir (décision Louis 19/10 n°16).
 *
 * « Mêmes comptes, même ordre dans les deux surfaces » (#4282.8/.10) ne se
 * tient pas par deux implémentations alignées à la main : le radar est
 * construit UNE fois, côté IA (`apps/ia/app/services/technology_radar.py`),
 * et les deux surfaces lisent la MÊME sortie, dans l'ordre où elle arrive.
 * Ce fichier porte ce qui doit être identique des deux côtés : la liste
 * fermée des technologies (+ repli libre), la détection dans un texte, les
 * trois poches et la forme de la sortie. La fixture
 * `fixtures/technology-radar.json` est relue par le test TS ET par
 * `apps/ia/tests/test_technology_radar.py` — une divergence fait échouer l'un
 * des deux.
 *
 * Doctrine tenue par la forme : aucune probabilité (rang seulement), aucune
 * source nommée (pas de champ « source »), chaque preuve datée et liée.
 */

interface RadarTechnology {
  code: string
  label: string
  /** Repliés (minuscules, sans accent) — comparés mot entier. */
  aliases: string[]
}

/** Liste FERMÉE (décision n°16 : SAP, Salesforce, ServiceNow…). Ajouter à la fin seulement. */
export const RADAR_TECHNOLOGIES: readonly RadarTechnology[] = [
  {
    code: 'SAP',
    label: 'SAP',
    aliases: [
      'sap',
      's/4hana',
      's4hana',
      's/4',
      'sap ecc',
      'abap',
      'sap fiori',
      'sap hana',
      'successfactors',
      'sap ariba',
      'rise with sap',
      'bw/4hana',
    ],
  },
  { code: 'SALESFORCE', label: 'Salesforce', aliases: ['salesforce', 'sfdc', 'sales cloud', 'service cloud'] },
  { code: 'SERVICENOW', label: 'ServiceNow', aliases: ['servicenow', 'service now'] },
  { code: 'WORKDAY', label: 'Workday', aliases: ['workday'] },
  {
    code: 'ORACLE_ERP',
    label: 'Oracle ERP',
    aliases: [
      'oracle ebs',
      'oracle e-business suite',
      'oracle fusion',
      'jd edwards',
      'peoplesoft',
      'netsuite',
      'oracle erp',
    ],
  },
  {
    code: 'DYNAMICS',
    label: 'Microsoft Dynamics',
    aliases: ['dynamics 365', 'microsoft dynamics', 'd365', 'dynamics ax', 'navision', 'business central'],
  },
  { code: 'GUIDEWIRE', label: 'Guidewire', aliases: ['guidewire'] },
  { code: 'MUREX', label: 'Murex', aliases: ['murex'] },
  { code: 'PEGA', label: 'Pega', aliases: ['pega', 'pegasystems'] },
  { code: 'SNOWFLAKE', label: 'Snowflake', aliases: ['snowflake'] },
  { code: 'DATABRICKS', label: 'Databricks', aliases: ['databricks'] },
]

/** #4282.8 — l'ordre des trois poches : placement immédiat, programmes nommés, rang 2. */
export const RADAR_POCKETS = ['immediate', 'programs', 'rank_2'] as const

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function containsWord(haystack: string, needle: string): boolean {
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return false
    const before = haystack[at - 1] ?? ' '
    const after = haystack[at + needle.length] ?? ' '
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true
    from = at + 1
  }
}

/** Les codes de la liste fermée qu'un texte (offre, besoin) porte — dans l'ordre de la liste. */
export function detectRadarTechnologies(text: string | null | undefined): string[] {
  const folded = fold(text ?? '')
  if (!folded) return []
  return RADAR_TECHNOLOGIES.filter(tech => tech.aliases.some(alias => containsWord(folded, alias))).map(
    tech => tech.code,
  )
}

const radarTechnologyRefSchema = z
  .object({ kind: z.enum(['closed', 'free']), code: z.string().nullable(), label: z.string().min(1) })
  .strict()
export type RadarTechnologyRef = z.infer<typeof radarTechnologyRefSchema>

/**
 * Une saisie → une technologie de la liste fermée, sinon la saisie libre en
 * REPLI (décision n°16) : « Mainframe COBOL » reste cherchable, sans code.
 */
export function resolveRadarTechnology(input: string | null | undefined): RadarTechnologyRef | null {
  const raw = (input ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const [code] = detectRadarTechnologies(raw)
  const closed = RADAR_TECHNOLOGIES.find(tech => tech.code === code)
  if (closed) return { kind: 'closed', code: closed.code, label: closed.label }
  return { kind: 'free', code: null, label: raw }
}

/** #4282.10 — la demande de Découvrir : une technologie (fermée ou libre), rien d'autre. */
export const technologyRadarRequestSchema = z.object({ technology: z.string().max(80) }).strict()

/** Une preuve : toujours datée, liée quand un lien existe (un besoin historique n'a pas d'URL). */
const radarProofSchema = z
  .object({
    kind: z.enum(['offer', 'tender_open', 'tender_awarded', 'press', 'historical_need']),
    label: z.string().min(1),
    date: z.string().min(1),
    url: z.string().url().nullable(),
  })
  .strict()

const radarMissionSchema = z
  .object({
    title: z.string().min(1),
    /** Le publieur de l'annonce — la CIBLE quand le client final est masqué (#4282.2). */
    publisher: z.string().min(1),
    location: z.string().nullable(),
    /** Seulement si l'offre l'affiche — jamais estimé. */
    tjmEur: z.number().positive().nullable(),
    publishedAt: z.string().min(1),
    url: z.string().url(),
  })
  .strict()

const prescriberFreshnessSchema = z.union([
  z.object({ kind: z.literal('dated'), date: z.string() }).strict(),
  z.object({ kind: z.literal('to_revalidate'), date: z.string().nullable() }).strict(),
])

const radarAccountSchema = z
  .object({
    accountName: z.string().min(1),
    siren: z.string().nullable(),
    pocket: z.enum(RADAR_POCKETS),
    /** Priorité = RANG (1 = d'abord), jamais une probabilité ni un pourcentage. */
    rank: z.number().int().positive(),
    /** Programme nommé (« migration ECC vers S/4 ») — `null` quand aucune preuve ne le nomme. */
    program: z.string().nullable(),
    /** Vrai quand la cible est le publieur d'annonces à client masqué : aucun client final deviné. */
    targetIsPublisher: z.boolean(),
    /** Rang 2 : le titulaire d'un marché attribué, qui a besoin de capacité. */
    awardedTender: z.string().nullable(),
    missions: z.array(radarMissionSchema),
    proofs: z.array(radarProofSchema).min(1),
    profiles: z.array(z.string()),
    /** Une incohérence de rattachement de la donnée, dite « à vérifier » (#4281.4). */
    toVerify: z.string().nullable(),
  })
  .strict()

const radarHistoricalNeedSchema = z
  .object({
    accountName: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(DATAFORGE_NEED_STATUSES),
    date: z.string().nullable(),
    tjmEur: z.number().positive().nullable(),
    prescriberRole: z.string().nullable(),
  })
  .strict()

const radarPrescriberSchema = z
  .object({
    accountName: z.string().min(1),
    name: z.string().nullable(),
    role: z.string().nullable(),
    freshness: prescriberFreshnessSchema,
  })
  .strict()

/** #4282.7 — des PROFILS OBSERVÉS, jamais des missions ouvertes : le libellé le dit. */
const radarFootprintSchema = z
  .object({
    accountName: z.string().min(1),
    observedProfiles: z.number().int().nonnegative(),
    label: z.literal('profils observés'),
  })
  .strict()

/**
 * La sortie du radar, lue telle quelle par Laura et par Découvrir. `.strict()`
 * à chaque niveau : un champ `probability` ou `source` ajouté par mégarde est
 * REFUSÉ, pas ignoré.
 */
export const technologyRadarSchema = z
  .object({
    technology: radarTechnologyRefSchema,
    generatedAt: z.string(),
    /** Les trois poches, DÉJÀ ordonnées (poche, puis rang) — les surfaces n'y retouchent pas. */
    accounts: z.array(radarAccountSchema),
    historicalNeeds: z.array(radarHistoricalNeedSchema),
    prescribers: z.array(radarPrescriberSchema),
    footprints: z.array(radarFootprintSchema),
    /** Ce qui n'a pas pu être évalué, nommé (une passe web sans clé, un référentiel vide…). */
    notEvaluated: z.array(z.string()),
  })
  .strict()
export type TechnologyRadar = z.infer<typeof technologyRadarSchema>
