import { z } from 'zod'
import type { AccountEntityKind } from './account-entity.js'
import type { OrgEntity, OrgEntityType } from './org-graph.js'

/* ------------------------------------------------------------------ */
/*  #2284 — Entity Resolver P0 et Company Graph (tranche 1).          */
/*                                                                    */
/*  Le pipeline portait DÉJÀ trois verdicts d'identité, chacun dans   */
/*  son vocabulaire :                                                 */
/*   - `homonym_disambiguation.py` → raw_analysis.homonyms            */
/*     (locked/unique/selected/ambiguous/none) ;                      */
/*   - `identity_resolution.py` → raw_analysis.identity               */
/*     (verified/uncertain/homonyme/no_registry) ;                    */
/*   - `entity_type.py` → le type des entités du graphe légal.        */
/*  Plus `orgEntityTypeSchema` (org-graph) et `ACCOUNT_ENTITY_KINDS`. */
/*                                                                    */
/*  Ce contrat NE les remplace PAS (GA-26 : un réglage vit à un seul  */
/*  endroit) : il est la taxonomie COMMUNE sur laquelle chacun se     */
/*  projette. Le compositeur `apps/ia/app/services/entity_resolution.py` */
/*  lit les trois verdicts et écrit `raw_analysis.entity_resolution`. */
/*  Parité TS ↔ Python : `entity-resolution.test.ts`.                 */
/*                                                                    */
/*  Doctrine tenue au niveau du TYPE :                                */
/*   - le nom seul ne résout jamais (#2284.28) ;                      */
/*   - une ambiguïté se pose en QUESTION nommée (#2284.65) ;          */
/*   - « non mesuré » ≠ 0 : confiance absente = null ;                */
/*   - aucune fusion : le verdict décrit UN compte, il n'en écrit     */
/*     jamais un autre.                                               */
/* ------------------------------------------------------------------ */

/** Les 16 types d'entité (#2284.2 à #2284.17), ordre de l'issue. */
export const ENTITY_KINDS = [
  'group', //            #2284.2  — le groupe, ensemble économique
  'parent_company', //   #2284.3  — la maison mère, personne morale de tête
  'subsidiary', //       #2284.4
  'business_unit', //    #2284.5
  'brand', //            #2284.6
  'business_direction', // #2284.7 — direction métier
  'site', //             #2284.8
  'program', //          #2284.9
  'legal_entity', //     #2284.10 — personne morale sans rôle de groupe connu
  'holding', //          #2284.11
  'legal_vehicle', //    #2284.12 — SCI, SPV, véhicule de financement
  'inactive_company', // #2284.13 — cessée, radiée, dormante
  'homonym', //          #2284.14 — même nom, autre entreprise
  'platform', //         #2284.15
  'esn', //              #2284.16
  'end_client', //       #2284.17
] as const
export const entityKindSchema = z.enum(ENTITY_KINDS)
export type EntityKind = (typeof ENTITY_KINDS)[number]

/** Les 7 états de résolution (#2284.29 à #2284.35). */
export const ENTITY_RESOLUTION_STATES = [
  'resolved',
  'ambiguous',
  'unresolved',
  'manual_override',
  'historical',
  'inactive',
  'out_of_scope',
] as const
export const entityResolutionStateSchema = z.enum(ENTITY_RESOLUTION_STATES)
export type EntityResolutionState = (typeof ENTITY_RESOLUTION_STATES)[number]

/** Les 10 sources de résolution (#2284.18 à #2284.27), plus deux (#2265.2,
 *  #2265.11) : ``size`` (la taille, déjà croisée ailleurs pour trancher un
 *  homonyme, `identity_resolution.assess_identity`) et ``workspace_data``
 *  (un compte DÉJÀ dans le même espace — SIREN partagé, ou nom+domaine sans
 *  SIREN ni nom légal disponible, le cas Brave/Apollo). Des CATÉGORIES,
 *  jamais un nom de fournisseur : « on nomme ce que l'espace a branché,
 *  jamais ce qui nous sert ». */
export const ENTITY_RESOLUTION_SOURCES = [
  'legal_identifier',
  'registry_country',
  'official_domain',
  'external_company_id',
  'official_site',
  'group_graph',
  'public_company_profile',
  'normalized_name',
  'alias',
  'workspace_correction',
  'size',
  'workspace_data',
] as const
export const entityResolutionSourceSchema = z.enum(ENTITY_RESOLUTION_SOURCES)
export type EntityResolutionSource = (typeof ENTITY_RESOLUTION_SOURCES)[number]

/** Les états où l'entité est ANCRÉE sur une source vérifiable. */
const ANCHORED_STATES: ReadonlySet<EntityResolutionState> = new Set(['resolved', 'manual_override', 'inactive'])

/** #2307.2 (épopée #2789) — la dimension « scope résolu » de la confiance
 *  donnée (`coverage.service.ts`) se lit sur ce MÊME ensemble d'états, jamais
 *  une seconde liste dupliquée (GA-26). */
export function isEntityResolutionAnchored(state: EntityResolutionState): boolean {
  return ANCHORED_STATES.has(state)
}

/** #2284 — GA-26 : le type structurel de l'organigramme se projette sur la taxonomie. */
export const ORG_ENTITY_TYPE_TO_ENTITY_KIND: Readonly<Record<OrgEntityType, EntityKind>> = {
  groupe: 'group',
  filiale: 'subsidiary',
  bu: 'business_unit',
  departement: 'business_direction',
  programme: 'program',
  site: 'site',
  spv: 'legal_vehicle',
  factory: 'business_unit',
  data_office: 'business_direction',
  lab: 'business_unit',
  // #2310.2 (épopée #2919) — une équipe est une subdivision plus fine qu'une
  // `bu`/`departement`, même défaut que `factory`/`lab` ci-dessus.
  equipe: 'business_unit',
  // #2310.8 — la taxonomie fermée (#2284.2-.17) n'a pas de kind « partenaire
  // générique » : `esn` est le partenaire le plus fréquent pour une ESN qui
  // prospecte (co-traitance, sous-traitance) — un partenaire qui n'en est pas
  // une (éditeur, plateforme) reste NOMMABLE via `entityKind: 'platform'`,
  // écrit explicitement sur le nœud plutôt que sur ce défaut.
  partenaire: 'esn',
}

/** #2284.5-.9 — GA-26 : ce que l'organigramme AFFICHE d'un nœud. Le kind posé
 *  sur le nœud quand il affine le type (une marque rangée en « filiale »),
 *  sinon `null` : l'écran garde le libellé du type. Jamais les deux côte à
 *  côte — et un kind redondant (blob ancien) ne s'affiche pas en double. */
export function orgNodeRefinedKind(
  entity: Pick<OrgEntity, 'type'> & { entityKind?: EntityKind | undefined },
): EntityKind | null {
  const kind = entity.entityKind
  if (kind === undefined || kind === ORG_ENTITY_TYPE_TO_ENTITY_KIND[entity.type]) return null
  return kind
}

/** #2284 — GA-26 : le kind de l'entité de compte (CRM) se projette ; `unknown`
 *  ne devient RIEN — le ranger de force fabriquerait une information. */
export const ACCOUNT_ENTITY_KIND_TO_ENTITY_KIND: Readonly<Record<AccountEntityKind, EntityKind | null>> = {
  bu: 'business_unit',
  subsidiary: 'subsidiary',
  division: 'business_direction',
  unknown: null,
}

const candidateSchema = z.object({
  name: z.string().min(1),
  siren: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
})

export const entityResolutionSchema = z
  .object({
    state: entityResolutionStateSchema,
    /** null = type non déterminé (jamais deviné). */
    kind: entityKindSchema.nullable(),
    /** #2284.36 — clé stable cross-source, seulement sur une entité ancrée. */
    canonical_id: z.string().nullable(),
    /** #2284.37 */
    commercial_name: z.string().min(1),
    /** #2284.38 */
    legal_name: z.string().nullable(),
    /** #2284.40 — ISO 3166-1 alpha-2. */
    country: z.string().nullable(),
    /** #2284.41 */
    identifiers: z.record(z.string(), z.string()),
    /** #2284.42 */
    domain: z.string().nullable(),
    /** #2284.45 */
    naf_code: z.string().nullable(),
    naf_label: z.string().nullable(),
    /** #2284.46 */
    location: z.string().nullable(),
    /** #2284.43 */
    parent_names: z.array(z.string()),
    /** #2284.44 — null = non mesuré (pas de registre), jamais 0 par défaut. */
    children_count: z.number().int().nonnegative().nullable(),
    /**
     * #2284.58 — dénominations ANTÉRIEURES du même SIREN, registre légal
     * (INSEE Sirene), jamais une correction CRM. `.optional()`, comme
     * `observedZone` ailleurs (`market-memory.ts`) : un bloc écrit avant ce
     * champ ne le porte pas, et ce n'est pas la même chose qu'une liste vide
     * mesurée — tout lecteur traite absent et `[]` pareil.
     */
    former_legal_names: z.array(z.string()).optional(),
    /** #2284.48 */
    sources: z.array(entityResolutionSourceSchema).min(1),
    /** #2284.49 — 1-100 ; null = non mesuré. */
    confidence: z.number().int().min(1).max(100).nullable(),
    reasons: z.array(z.string()),
    /** #2284.65 — la question nommée d'une ambiguïté. */
    question: z.object({ candidates: z.array(candidateSchema) }).nullable(),
    /** #2284.50 — fraîcheur du verdict. */
    resolved_at: z.string(),
  })
  .superRefine((value, ctx) => {
    // #2284.28 — le nom seul ne résout jamais une entité.
    if (ANCHORED_STATES.has(value.state) && value.sources.every(source => source === 'normalized_name')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'name_alone_never_resolves' })
    }
    // #2284.65 — une ambiguïté se pose en question : au moins deux candidats nommés.
    if (value.state === 'ambiguous' && (value.question?.candidates.length ?? 0) < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['question'], message: 'ambiguity_needs_named_question' })
    }
    if (value.canonical_id !== null && !ANCHORED_STATES.has(value.state)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonical_id'], message: 'canonical_id_needs_anchor' })
    }
  })
export type EntityResolution = z.infer<typeof entityResolutionSchema>

/** Le verdict du dossier, ou `null` sur un dossier antérieur à #2284 ou un blob
 *  illisible — jamais un verdict à moitié deviné. */
export function readEntityResolution(rawAnalysis: Record<string, unknown> | null | undefined): EntityResolution | null {
  const parsed = entityResolutionSchema.safeParse(rawAnalysis?.['entity_resolution'])
  return parsed.success ? parsed.data : null
}
