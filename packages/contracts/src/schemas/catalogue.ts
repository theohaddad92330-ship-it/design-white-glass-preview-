import { z } from 'zod'

/**
 * Les catalogues d'un espace (PDF 2 §11.3, ticket BEL-CRM-105).
 *
 * Motifs et libellés étaient DISPERSÉS : les motifs de perte avaient une table
 * et un CRUD mais aucun écran, les libellés d'étapes un endpoint et aucun
 * écran, et quatre autres n'existaient pas. Résultat : un administrateur qui
 * voulait adapter le vocabulaire de son ESN n'avait nulle part où aller.
 *
 * Deux règles portent l'honnêteté de cet écran :
 *
 *  - **une valeur UTILISÉE ne se supprime pas**, elle se désactive. L'effacer
 *    emporterait l'explication de tous les enregistrements qui la portaient —
 *    et c'est justement ce qu'on relit six mois plus tard.
 *  - **l'usage se compte PAR VALEUR**. Sans ce chiffre, désactiver revient à
 *    tirer au sort : personne ne sait si « concurrent installé » sert deux fois
 *    ou deux cents.
 */
export const CATALOGUE_KEYS = [
  'loss_reasons',
  'pipeline_stage_labels',
  'account_park_reasons',
  'need_unstaffable_reasons',
  'submission_outcome_reasons',
  'normalised_skills',
  'offers',
  'custom_fields',
] as const
export const catalogueKeySchema = z.enum(CATALOGUE_KEYS)
export type CatalogueKey = (typeof CATALOGUE_KEYS)[number]

export const catalogueValueSchema = z.object({
  /** L'identifiant de la ligne, quand la valeur vit en base. `null` pour une
   *  liste fermée définie dans le code — on ne prétend pas pouvoir l'éditer. */
  id: z.string().nullable(),
  label: z.string(),
  /** Combien d'enregistrements portent cette valeur AUJOURD'HUI. */
  usage: z.number().int().min(0),
  archived: z.boolean(),
})
export type CatalogueValue = z.infer<typeof catalogueValueSchema>

export const catalogueSchema = z.object({
  key: catalogueKeySchema,
  /**
   * Ce que l'espace peut faire de ce catalogue.
   *
   * `closed` n'est pas un oubli : les motifs de fin de positionnement et les
   * compétences normalisées vivent dans le CODE, parce qu'ils traversent les
   * espaces (un indicateur comparable exige un vocabulaire commun). Les montrer
   * en lecture vaut mieux que les cacher — un utilisateur qui ne voit pas la
   * liste croit qu'elle n'existe pas et en réinvente une à côté.
   */
  editable: z.enum(['editable', 'closed']),
  values: z.array(catalogueValueSchema),
})
export type Catalogue = z.infer<typeof catalogueSchema>

export const cataloguesResponseSchema = z.object({ items: z.array(catalogueSchema) })
export type CataloguesResponse = z.infer<typeof cataloguesResponseSchema>

/** Les catalogues qu'un espace édite réellement. Les autres sont en lecture. */
export const EDITABLE_CATALOGUES: readonly CatalogueKey[] = [
  'loss_reasons',
  'account_park_reasons',
  'need_unstaffable_reasons',
]

export const addCatalogueValueSchema = z.object({
  key: catalogueKeySchema,
  label: z.string().trim().min(1).max(120),
})
export type AddCatalogueValue = z.infer<typeof addCatalogueValueSchema>

/**
 * Peut-on SUPPRIMER cette valeur, ou seulement la désactiver ?
 *
 * Pure, et la seule règle de tout l'écran qui mérite d'être testée sans base :
 * une valeur qui sert ne se supprime pas. La désactiver la retire des
 * sélecteurs sans effacer ce que portent les enregistrements existants.
 */
export function catalogueDeletion(value: Pick<CatalogueValue, 'usage'>): 'delete' | 'archive' {
  return value.usage > 0 ? 'archive' : 'delete'
}
