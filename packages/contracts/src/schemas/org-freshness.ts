import { z } from 'zod'
import type { OrgGraph } from './org-graph.js'

/* ------------------------------------------------------------------ */
/*  La FRAÎCHEUR d'un fait d'organigramme                              */
/*  (OrgGraph FINAL §6 « une preuve a une date » ; doctrine « on       */
/*   archive, on ne supprime pas »)                                    */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE QUE CE FICHIER COMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le graphe savait dire qu'un lien était `verified` — il ne savait pas dire
 * QUAND. Un « N+1 confirmé » posé en février 2026 s'affichait en août 2026
 * exactement comme un lien vérifié la veille : plein, sourcé, ≥ 90. Or dans une
 * grande entreprise, un rattachement a une demi-vie de quelques mois.
 *
 * Trois règles, et chacune répond à un défaut déjà payé ailleurs dans ce dépôt :
 *
 * 1. **Une date non vérifiée s'affiche « jamais vérifié »** — jamais un tiret
 *    muet (que le lecteur comble tout seul, en général par « ça va »), jamais la
 *    date d'ÉCRITURE de la ligne (qui dirait « vérifié aujourd'hui » d'un fait
 *    que personne n'a regardé). C'est la déclinaison de « non mesuré n'est
 *    jamais mesuré à zéro » sur un axe de temps.
 *
 * 2. **Un fait périmé redevient INCONNU avec sa date**, il ne disparaît pas :
 *    « information de mars 2026, à revérifier ». {@link readVerifiedWithFreshness}
 *    est la seule dérivation qui applique cette bascule — le graphe STOCKÉ garde
 *    son `verified: true` et ses `sourceIds`, parce qu'effacer la preuve
 *    interdirait de dire de quoi on parle. On archive, on ne supprime pas.
 *
 * 3. **La file de revérification est DÉRIVÉE, pas stockée.** Une file persistée
 *    aurait deux propriétaires — la table et le graphe — et divergerait au
 *    premier run qui vérifie un lien sans dépiler la ligne correspondante.
 *    {@link orgRevalidationQueue} recalcule à chaque lecture ; elle ne peut donc
 *    pas mentir, et il n'y a rien à balayer.
 *
 * ⚠️ Le seuil vit ICI et nulle part ailleurs (GA-26). Un service qui recopierait
 * « 180 jours » créerait un second propriétaire du réglage, et les deux
 * divergeraient le jour où quelqu'un en change un.
 */

/**
 * Au-delà de combien de jours une vérification cesse de valoir.
 *
 * 180 jours — six mois. Le nombre n'est pas choisi au doigt mouillé : c'est
 * l'ordre de grandeur du cycle de réorganisation d'une direction dans une
 * grande entreprise, et c'est aussi le seuil que le graphe applique déjà à ses
 * SOURCES pour la confiance (« date < 12 mois → +10 », p14) — on est donc deux
 * fois plus exigeant sur une VÉRIFICATION humaine que sur une source publique,
 * ce qui est le bon sens : une vérification affirme, une source suggère.
 */
export const ORG_FRESHNESS_STALE_AFTER_DAYS = 180

/**
 * Les trois états possibles. L'ordre est figé (GA-08) et les ajouts vont en FIN.
 *
 * `never_verified` est un état À PART ENTIÈRE, pas l'absence des deux autres :
 * c'est ce qui l'empêche de se rendre à l'écran sous la forme d'un tiret.
 */
export const ORG_FRESHNESS_STATES = ['never_verified', 'fresh', 'stale'] as const
export const orgFreshnessStateSchema = z.enum(ORG_FRESHNESS_STATES)
export type OrgFreshnessState = z.infer<typeof orgFreshnessStateSchema>

/**
 * Ce qu'on sait du temps écoulé depuis la dernière vérification.
 *
 * `lastVerifiedAt` et `ageDays` sont `null` ENSEMBLE, et uniquement sur
 * `never_verified` : un âge sans date serait un chiffre sans provenance, une
 * date sans âge obligerait chaque écran à refaire la soustraction.
 */
export const orgFreshnessSchema = z.object({
  state: orgFreshnessStateSchema,
  /** La date TELLE QU'ELLE A ÉTÉ ÉCRITE — jamais reformatée, jamais inventée. */
  lastVerifiedAt: z.string().nullable(),
  /** Jours entiers écoulés. `null` = rien à compter, jamais `0`. */
  ageDays: z.number().int().min(0).nullable(),
})
export type OrgFreshness = z.infer<typeof orgFreshnessSchema>

const NEVER_VERIFIED: OrgFreshness = { state: 'never_verified', lastVerifiedAt: null, ageDays: null }

/**
 * L'état de fraîcheur d'UNE date de vérification. La seule lecture — tout le
 * reste de ce fichier, et tout écran, passe par elle.
 *
 * Une date illisible rend `never_verified`, pas une erreur ni un âge de 0 jour :
 * on ne sait pas quand ça a été vérifié, et c'est exactement ce que
 * `never_verified` dit. Une date FUTURE (horloge décalée, saisie fautive) rend
 * un âge de 0 — jamais un nombre négatif, qui ferait remonter la ligne en tête
 * d'une file triée par ancienneté.
 */
export function readOrgFreshness(lastVerifiedAt: string | null | undefined, now: Date): OrgFreshness {
  if (!lastVerifiedAt) return NEVER_VERIFIED
  const verifiedAt = Date.parse(lastVerifiedAt)
  if (Number.isNaN(verifiedAt)) return NEVER_VERIFIED

  const ageDays = Math.max(0, Math.floor((now.getTime() - verifiedAt) / 86_400_000))
  return {
    state: ageDays >= ORG_FRESHNESS_STALE_AFTER_DAYS ? 'stale' : 'fresh',
    lastVerifiedAt,
    ageDays,
  }
}

/**
 * La bascule « un fait périmé redevient inconnu AVEC SA DATE ».
 *
 * Rend le `verified` qu'un écran doit AFFICHER, distinct du `verified` STOCKÉ :
 * une vérification périmée, ou dont on ignore la date, ne se présente plus comme
 * un fait. La preuve n'est pas détruite pour autant — `freshness.lastVerifiedAt`
 * la porte, et c'est elle qui permet d'écrire « information de mars 2026, à
 * revérifier » plutôt que de faire disparaître la ligne.
 *
 * Ne rend JAMAIS `verified: true` sur une arête stockée non vérifiée : la
 * fraîcheur peut retirer une affirmation, elle n'en crée aucune.
 */
export function readVerifiedWithFreshness(
  edge: { verified: boolean; lastVerifiedAt?: string | null },
  now: Date,
): { verified: boolean; freshness: OrgFreshness } {
  const freshness = readOrgFreshness(edge.lastVerifiedAt, now)
  return { verified: edge.verified && freshness.state === 'fresh', freshness }
}

/** Ce qu'une file de revérification désigne : une personne, ou une relation. */
export const ORG_REVALIDATION_KINDS = ['person', 'relation'] as const
export const orgRevalidationKindSchema = z.enum(ORG_REVALIDATION_KINDS)
export type OrgRevalidationKind = z.infer<typeof orgRevalidationKindSchema>

/**
 * Une entrée de la file — ce qu'il faut aller revérifier.
 *
 * `targetId` est toujours un ID, jamais un nom : deux homonymes chez deux
 * entités ne sont pas la même personne (S5). Pour une relation, la clé composite
 * `from|type|to` est celle que le ledger de corrections emploie déjà pour
 * désigner un lien — un seul vocabulaire d'identification dans tout le chantier.
 *
 * `label` porte le nom de la personne, et c'est délibéré : l'IDENTITÉ est l'une
 * des deux exceptions nommées de la doctrine des critères protégés (le livrable
 * DÉSIGNE la personne). Rien d'autre n'y voyage — ni titre, ni photo, ni ville.
 */
export const orgRevalidationTargetSchema = z.object({
  kind: orgRevalidationKindSchema,
  targetId: z.string().min(1),
  label: z.string().min(1),
  freshness: orgFreshnessSchema,
})
export type OrgRevalidationTarget = z.infer<typeof orgRevalidationTargetSchema>

/** La clé composite d'une relation — un seul endroit qui la fabrique. */
export function orgRelationKey(edge: { fromId: string; type: string; toId: string }): string {
  return `${edge.fromId}|${edge.type}|${edge.toId}`
}

/**
 * La file de revérification d'un graphe, DÉRIVÉE à la lecture.
 *
 * ORDRE, et pourquoi celui-là : les faits PÉRIMÉS d'abord, du plus vieux au plus
 * récent ; les « jamais vérifiés » ensuite. Un fait qui a été vérifié puis a
 * expiré est une régression ACTIVE de confiance — quelqu'un s'y fie encore,
 * parce qu'il a été affirmé une fois. Un fait jamais vérifié, lui, n'a jamais
 * rien promis : il est déjà présenté comme non vérifié partout, et il y en a
 * mécaniquement beaucoup (tout graphe antérieur à ce chantier). Les mettre en
 * tête noierait les vrais rappels sous un inventaire.
 *
 * Ce qui n'y entre PAS : ce qui est frais (rien à faire), et les arêtes
 * d'influence — une influence est une INFÉRENCE datée par `derivedAt`, personne
 * ne l'a jamais « vérifiée », donc lui demander une revérification n'aurait pas
 * de sens (voir le docblock de `orgInfluenceEdgeSchema`).
 */
export function orgRevalidationQueue(graph: OrgGraph, now: Date): OrgRevalidationTarget[] {
  const peopleById = new Map(graph.people.map(person => [person.id, person]))
  const nameOf = (id: string): string => peopleById.get(id)?.fullName ?? id

  const targets: OrgRevalidationTarget[] = []

  for (const person of graph.people) {
    const freshness = readOrgFreshness(person.lastVerifiedAt, now)
    if (freshness.state === 'fresh') continue
    targets.push({ kind: 'person', targetId: person.id, label: person.fullName, freshness })
  }

  for (const edge of graph.hierarchyEdges) {
    // Une arête jamais vérifiée ET jamais présentée comme vérifiée n'est pas un
    // rappel : elle est déjà en pointillé à l'écran, et la file dirait « allez
    // vérifier ce qu'on ne vous a jamais affirmé ».
    const freshness = readOrgFreshness(edge.lastVerifiedAt, now)
    if (freshness.state === 'fresh') continue
    if (freshness.state === 'never_verified' && !edge.verified) continue
    targets.push({
      kind: 'relation',
      targetId: orgRelationKey(edge),
      label: `${nameOf(edge.fromId)} → ${nameOf(edge.toId)}`,
      freshness,
    })
  }

  return targets.sort((a, b) => {
    if (a.freshness.state !== b.freshness.state) return a.freshness.state === 'stale' ? -1 : 1
    return (b.freshness.ageDays ?? 0) - (a.freshness.ageDays ?? 0)
  })
}
