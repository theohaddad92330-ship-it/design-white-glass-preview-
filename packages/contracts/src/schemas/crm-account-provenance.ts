import { z } from 'zod'
import type { AnalysisStatus } from './account.js'
import { CRM_TOOL_NAMES, crmProviderSchema } from './crm-adapter.js'
import { CRM_MIRROR_ACTIVITY_KINDS, CRM_MIRROR_DEAL_STATUSES } from './crm-mirror.js'

/**
 * #4459 — fiche d'un compte VENU DU CRM : ce qui y était déjà, ce que l'analyse a apporté, et compléter le CRM.
 *
 * Aucune colonne neuve : la provenance d'un contact est DÉJÀ écrite à trois endroits, lus ensemble par
 * `AccountCrmProvenanceService` (API) —
 *  - `contacts.source` : `import` (reprise de fichier) ou `crm` (fiche créée depuis le CRM branché) ;
 *  - `record_import_marks` / `sync_links` : la trace d'import et la référence externe (#4051, #4052.2) — un
 *    contact trouvé par l'analyse puis rapproché d'une fiche du CRM y était déjà ;
 *  - `contact_crm_exports` : ce que Bellum a déjà poussé dans le CRM (#3719.4) — jamais reproposé.
 * Le compte lui-même : `status: 'imported'`, ou une trace d'import / une référence externe de compte.
 *
 * Les règles vivent ICI, une fois (GA-26) : l'API classe, l'écran affiche.
 */

/** #4459.1 — les états qui veulent dire « jamais analysé » : versé depuis Découvrir, ou par un import. */
const NEVER_ANALYZED: readonly AnalysisStatus[] = ['prospect', 'imported']

export function isNeverAnalyzed(status: AnalysisStatus): boolean {
  return NEVER_ANALYZED.includes(status)
}

/**
 * #4459.1 — « Compléter le compte » : une analyse allée au bout, sur un compte venu du CRM, avec au moins un
 * contact apporté pas encore poussé (`contactsToComplete`). Rien à ajouter → pas de bouton : on n'affiche pas
 * un geste qui n'a rien à faire (et un compte complété le voit disparaître).
 */
export function canCompleteCrmAccount(input: {
  status: AnalysisStatus
  accountFromCrm: boolean
  toComplete: number
}): boolean {
  return input.status === 'completed' && input.accountFromCrm && input.toComplete > 0
}

/** #4459.2 — « Déjà dans ton CRM » (`crm`) ou « Apporté par Bellum » (`bellum`). */
export const CONTACT_CRM_ORIGINS = ['crm', 'bellum'] as const
type ContactCrmOrigin = (typeof CONTACT_CRM_ORIGINS)[number]

/**
 * #4678 — LE prédicat « contact CONNU » (GA-26 : une seule liste de valeurs de `contacts.source`). Un contact venu
 * d'un import (`import`) ou d'une ligne du CRM connecté (`crm`) est une RELATION que le commercial connaissait
 * déjà, pas une découverte (décision Louis, 28/10/2026). ⚠️ `csv_import` n'est PAS une source de contact : c'est
 * une source de besoin. Les écrans, l'API et l'axe relation appellent `isKnownContactSource`, jamais cette liste.
 */
export const KNOWN_CONTACT_SOURCES = ['import', 'crm'] as const
/** Les sources posées par l'utilisateur lui-même : ni son CRM, ni l'analyse — aucune mention. */
const USER_SOURCES: readonly string[] = ['manual', 'meeting']

export function isKnownContactSource(source: string | null | undefined): boolean {
  return typeof source === 'string' && (KNOWN_CONTACT_SOURCES as readonly string[]).includes(source)
}

/** #4678 — un contact est CONNU quand sa provenance l'est ; les contacts sans provenance n'en sont pas. */
export function isKnownContact(contact: { source?: string | null }): boolean {
  return isKnownContactSource(contact.source)
}

/**
 * #4459.2 — la provenance d'UN contact. `null` = ni l'un ni l'autre (saisi à la main, cité en rendez-vous,
 * source jamais écrite) : aucune mention plutôt qu'une provenance devinée.
 */
export function classifyContactCrmOrigin(input: {
  source: string | null
  importedFromCrm: boolean
}): ContactCrmOrigin | null {
  if (input.importedFromCrm || isKnownContactSource(input.source)) return 'crm'
  if (input.source === null || USER_SOURCES.includes(input.source)) return null
  return 'bellum'
}

export const contactCrmProvenanceSchema = z.object({
  contactId: z.string(),
  origin: z.enum(CONTACT_CRM_ORIGINS),
  /** Déjà poussé dans le CRM par Bellum (`contact_crm_exports`) : jamais reproposé. */
  pushed: z.boolean(),
})
export type ContactCrmProvenance = z.infer<typeof contactCrmProvenanceSchema>

/**
 * #4604 — les champs du COMPTE dont la provenance se lit à l'endroit où on lit la valeur. Ce sont ceux que
 * l'import CRM écrit (`crm-import.service.ts`) et dont il commet la provenance (`field_provenance`).
 */
export const CRM_SAID_FIELDS = ['company_name', 'siren'] as const
type CrmSaidField = (typeof CRM_SAID_FIELDS)[number]

/**
 * #4604 — « Ce que dit ton CRM » : ce que Bellum n'a pas retrouvé seul, lu dans le miroir du CRM DU CLIENT
 * (`crm_deals`, `crm_owners`, `crm_activities`) et dans la provenance par champ (`field_provenance`). Le
 * CORPS d'une activité ne sort jamais : son type et sa date seulement. `provider` est l'outil que l'espace a
 * BRANCHÉ (affiché par `CRM_TOOL_NAMES`), jamais un fournisseur de Bellum. `fusion` : la fiche venue du CRM
 * qui a rejoint celle-ci (#4603), quand c'est le cas.
 */
export const accountCrmSaysSchema = z.object({
  provider: crmProviderSchema,
  deals: z.array(
    z.object({
      title: z.string().nullable(),
      stage: z.string().nullable(),
      status: z.enum(CRM_MIRROR_DEAL_STATUSES).nullable(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      ownerName: z.string().nullable(),
      updatedAt: z.string().nullable(),
      /** #4604.4 — les champs personnalisés de l'affaire, tels que le CRM les rend (texte ou nombre, jamais un corps). */
      customFields: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
    }),
  ),
  activities: z.array(z.object({ kind: z.enum(CRM_MIRROR_ACTIVITY_KINDS), occurredAt: z.string() })),
  /** `crm` = la valeur vient du CRM ; `human` = corrigée à la main dans Bellum (elle gagne). Rien = inconnu. */
  fields: z.array(z.object({ field: z.enum(CRM_SAID_FIELDS), source: z.enum(['crm', 'human']) })),
  /** #4604.7 — la version du CRM d'un champ CORRIGÉ à la main dans Bellum : consultable, jamais écrasée en silence. */
  crmValues: z.array(z.object({ field: z.enum(CRM_SAID_FIELDS), value: z.string() })).optional(),
  /** #4295.23 — `id` : l'identifiant du journal, pour « Annuler la fusion » (`POST /accounts/crm-fusions/:id/undo`). */
  fusion: z.object({ id: z.string(), mergedAt: z.string(), absorbedName: z.string() }).nullable(),
})
export type AccountCrmSays = z.infer<typeof accountCrmSaysSchema>

/**
 * #4680 — les contacts CONNUS (`isKnownContactSource`) déjà rattachés au compte, lus EN BASE : la présence d'un
 * import ne dépend d'aucun connecteur live. `importedAt` = la date de l'import (`record_import_marks`), `null`
 * quand aucune trace n'en dit la date — jamais une date devinée. Absent de la réponse quand il n'y en a aucun.
 */
export const accountKnownContactsSchema = z.object({
  count: z.number().int().positive(),
  importedAt: z.string().nullable(),
})

/** #4680 — « importé le <date> depuis un fichier / un outil branché » : la trace d'import du COMPTE. */
export const accountImportSchema = z.object({
  kind: z.enum(['file', 'tool']),
  importedAt: z.string().nullable(),
})

/** `GET /accounts/:id/crm-provenance` — un contact sans provenance n'a pas de ligne. */
export const accountCrmProvenanceSchema = z.object({
  accountFromCrm: z.boolean(),
  contacts: z.array(contactCrmProvenanceSchema),
  /** #4680 — absent quand le compte ne porte aucun contact connu (la réponse d'avant ne change pas). */
  knownContacts: accountKnownContactsSchema.optional(),
  /** #4680 — absent quand le compte n'a jamais été importé. */
  accountImport: accountImportSchema.optional(),
  /** #4604 — `null`/absent : aucun CRM connu pour ce compte, donc aucun bloc (jamais un nom deviné). */
  crm: accountCrmSaysSchema.nullable().optional(),
})
export type AccountCrmProvenance = z.infer<typeof accountCrmProvenanceSchema>

/** #4459.2 — « N dans ton CRM · M trouvés par l'analyse » : une part absente vaut `null`, jamais 0 (GA-18/19). */
export function crmProvenanceCounts(contacts: readonly ContactCrmProvenance[]): {
  inCrm: number | null
  brought: number | null
} {
  const inCrm = contacts.filter(c => c.origin === 'crm').length
  const brought = contacts.filter(c => c.origin === 'bellum').length
  return { inCrm: inCrm > 0 ? inCrm : null, brought: brought > 0 ? brought : null }
}

/** #4459.3 — ce que « Compléter le compte » propose : les apportés pas encore poussés. */
export function contactsToComplete(contacts: readonly ContactCrmProvenance[]): string[] {
  return contacts.filter(c => c.origin === 'bellum' && !c.pushed).map(c => c.contactId)
}

/**
 * #4603 — le compte rendu du RATTRAPAGE des paires compte-CRM ↔ compte-analyse (`POST /accounts/crm-fusions/sweep`).
 * ⚠️ Renversement de doctrine daté (Louis, 26/10/2026, `c142_fusion_auto_compte_crm_compte_analyse`) : ces
 * paires se fusionnent sans demander. `dryRun` = simulation comptée, rien d'écrit.
 */
export const crmFusionPairSchema = z.object({
  keptId: z.string(),
  keptName: z.string(),
  absorbedId: z.string(),
  absorbedName: z.string(),
  /** La clé qui a décidé : le SIREN d'abord, sinon le nom normalisé partagé (`marketMatchKey`). */
  basis: z.enum(['siren', 'name']),
  key: z.string().min(1),
})

export const crmFusionReportSchema = z.object({
  dryRun: z.boolean(),
  found: z.number().int().nonnegative(),
  merged: z.number().int().nonnegative(),
  ambiguous: z.number().int().nonnegative(),
  humanDecided: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  pairs: z.array(crmFusionPairSchema),
})
export type CrmFusionReport = z.infer<typeof crmFusionReportSchema>

/**
 * #4604.2 — l'étiquette « vient de <CRM> » se pose aussi sur ce que le miroir du CRM dit de l'affaire en tête :
 * l'étape et le propriétaire. Pas de provenance par champ à lire ici (le miroir EST le CRM) : le champ est « crm »
 * s'il a une valeur dans `crmSaysSummary`, rien sinon.
 */
export type CrmTaggedField = CrmSaidField | 'stage' | 'owner'

/**
 * #4604 — la provenance d'UN champ du compte, lue à UN seul endroit (GA-26) : l'étiquette posée à côté de la
 * valeur ET le bloc « Ce que dit ton CRM » posent la même question ici. `null` = on ne sait pas d'où vient la
 * valeur : AUCUNE étiquette plutôt qu'une étiquette fausse.
 */
export function crmFieldSource(crm: AccountCrmSays | null | undefined, field: CrmTaggedField): 'crm' | 'human' | null {
  if (!crm) return null
  if (field === 'stage' || field === 'owner') return crmSaysSummary(crm)[field] === null ? null : 'crm'
  return crm.fields.find(entry => entry.field === field)?.source ?? null
}

/**
 * #4604.7 — la valeur corrigée à la main gagne et s'affiche ; la version du CRM reste CONSULTABLE à côté. Rendue
 * seulement quand le champ est `human` ET que le CRM a une valeur connue : sinon `null`, aucune ligne.
 */
export function crmFieldCrmVersion(crm: AccountCrmSays | null | undefined, field: CrmSaidField): string | null {
  if (crmFieldSource(crm, field) !== 'human') return null
  const value = crm?.crmValues?.find(entry => entry.field === field)?.value.trim()
  return value ? value : null
}

type CrmSaysSummary = {
  tool: string
  owner: string | null
  stage: string | null
  /** Nombre d'affaires et d'activités : `null` quand il n'y en a aucune — jamais « 0 » (GA-18/19). */
  deals: number | null
  activities: number | null
  lastActivityAt: string | null
  /** #4604.4 — les champs personnalisés de l'affaire en tête ; `[]` = aucune ligne. */
  customFields: { key: string; value: string }[]
}

function stamp(value: string | null): number {
  const ms = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * #4604 — ce que le bloc affiche. Propriétaire et étape : ceux de l'affaire OUVERTE la plus récente, sinon
 * de la plus récente — le CRM ne porte pas toujours de propriétaire de société dans le miroir, et on ne
 * l'invente pas. Chaque part absente vaut `null` : elle ne fait aucune ligne.
 */
export function crmSaysSummary(crm: AccountCrmSays): CrmSaysSummary {
  const byRecency = [...crm.deals].sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt))
  const lead = byRecency.find(deal => deal.status === 'open') ?? byRecency[0] ?? null
  const lastActivity = [...crm.activities].sort((a, b) => stamp(b.occurredAt) - stamp(a.occurredAt))[0] ?? null
  return {
    tool: CRM_TOOL_NAMES[crm.provider],
    owner: lead?.ownerName?.trim() || null,
    stage: lead?.stage?.trim() || null,
    deals: crm.deals.length > 0 ? crm.deals.length : null,
    activities: crm.activities.length > 0 ? crm.activities.length : null,
    lastActivityAt: lastActivity?.occurredAt ?? null,
    customFields: lead?.customFields ?? [],
  }
}

/** Rien à dire → pas de bloc du tout (on n'affiche pas un cadre vide sous le nom d'un CRM). */
export function isCrmSaysEmpty(summary: CrmSaysSummary): boolean {
  return (
    summary.owner === null &&
    summary.stage === null &&
    summary.deals === null &&
    summary.activities === null &&
    summary.customFields.length === 0
  )
}
