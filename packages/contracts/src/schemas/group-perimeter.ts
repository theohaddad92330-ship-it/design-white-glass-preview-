import { z } from 'zod'
import type { AnalysisScopeSelection } from './analysis.js'

/**
 * Lot 757 — CONTACTS 3/6 : le PÉRIMÈTRE groupe/filiales voyage de la saisie jusqu'à la collecte de contacts.
 *
 * Arbitrage Louis 31/10/2026 : taper « Decathlon » ouvre un sélecteur groupe + filiales (taille, siège,
 * région), le commercial COCHE le périmètre, et les contacts sont cherchés sur l'entité analysée ET sur
 * chaque entité cochée. Appels qui l'ont fait naître : Decathlon vs Decathlon France, Servier SAS vs
 * Institut Servier mélangés, offres rattachées à la mauvaise filiale, décision prise au groupe.
 *
 * Trois règles :
 *  - une entité vient du REGISTRE (graphe capitalistique, SIREN à neuf chiffres) — jamais d'un
 *    rapprochement de noms (#2284 : « ne pas déduire une relation uniquement depuis la proximité du nom ») ;
 *  - une absence reste `null` (« non mesuré »), jamais « 0 » (GA-18 / GA-19) ;
 *  - cocher une filiale ÉLARGIT la recherche de contacts, rien d'autre : aucune fusion de comptes, aucune
 *    donnée filiale remontée au groupe (« on PROPOSE une fusion, on ne fusionne jamais »).
 *
 * Sans case cochée, la collecte est celle d'avant, à l'octet près.
 */

/** Décision du 10/10/2026 : au-delà de seize filiales, on ne déroule plus le groupe entier. */
export const GROUP_PERIMETER_MAX_ENTITIES = 16

const sirenSchema = z.string().regex(/^\d{9}$/)

export const groupPerimeterEntitySchema = z.object({
  siren: sirenSchema,
  name: z.string().trim().min(1).max(200),
  role: z.enum(['groupe', 'filiale']),
  /** La tranche d'effectif telle que le registre la publie ; `null` = non publiée. */
  headcountLabel: z.string().max(80).nullable(),
  /** Commune du siège ; `null` = non lue. */
  city: z.string().max(120).nullable(),
  /** Région du siège ; `null` = non lue. */
  region: z.string().max(120).nullable(),
  /** `false` = cessée au registre ; `null` = non lue. */
  isActive: z.boolean().nullable(),
})
export type GroupPerimeterEntity = z.infer<typeof groupPerimeterEntitySchema>

export const groupPerimeterSchema = z.object({
  /** L'entité tapée et analysée. */
  rootSiren: sirenSchema,
  /** La tête de groupe confirmée ; `null` quand le registre ne rattache l'entité à aucun groupe. */
  headSiren: sirenSchema.nullable(),
  entities: z.array(groupPerimeterEntitySchema).max(GROUP_PERIMETER_MAX_ENTITIES),
  /** Le groupe compte plus d'entités que celles montrées (seuil de seize). */
  truncated: z.boolean(),
})
export type GroupPerimeter = z.infer<typeof groupPerimeterSchema>

/** Une entité cochée, telle qu'elle voyage dans le cadrage du run (`AnalysisScopeSelection.contact_entities`). */
export const contactEntitySchema = z.object({
  siren: sirenSchema,
  name: z.string().trim().min(1).max(200),
})
export type ContactEntity = z.infer<typeof contactEntitySchema>

/**
 * Les entités sur lesquelles chercher des contacts : l'entité analysée d'abord, puis les cochées, sans doublon
 * de SIREN. Un seul calcul, lu par l'API (corps du graphe) et par l'écran (ce qui sera cherché).
 */
export function contactSearchEntities(
  selection: Pick<AnalysisScopeSelection, 'contact_entities'> | null | undefined,
  root: ContactEntity | null | undefined,
): ContactEntity[] {
  const out: ContactEntity[] = []
  const seen = new Set<string>()
  for (const entity of [...(root ? [root] : []), ...(selection?.contact_entities ?? [])]) {
    if (seen.has(entity.siren)) continue
    seen.add(entity.siren)
    out.push({ siren: entity.siren, name: entity.name })
  }
  return out
}

/** Coche ou décoche une entité ; une sélection vidée retire la clé (le corps de requête redevient celui d'avant). */
export function toggleContactEntity<T extends Pick<AnalysisScopeSelection, 'contact_entities'>>(
  selection: T,
  entity: Pick<GroupPerimeterEntity, 'siren' | 'name'>,
): T {
  const current = selection.contact_entities ?? []
  const next = current.some(e => e.siren === entity.siren)
    ? current.filter(e => e.siren !== entity.siren)
    : [...current, { siren: entity.siren, name: entity.name }]
  const { contact_entities: _drop, ...rest } = selection
  return (next.length > 0 ? { ...rest, contact_entities: next } : rest) as T
}
