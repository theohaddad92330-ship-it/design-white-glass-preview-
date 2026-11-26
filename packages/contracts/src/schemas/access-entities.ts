import { z } from 'zod'

/**
 * Par quelle ENTITÉ entrer — le ticket que le tome 3 dit le plus important.
 *
 * Le modèle classe VINCI en D : 90 000 salariés, coté, exposition publique
 * massive. Un praticien expérimenté le met pourtant en sprint 1 — parce qu'il
 * ne vise pas VINCI, il vise **VINCI Autoroutes**, une entité avec sa propre
 * direction digitale. Il l'écrit noir sur blanc : « ne pas attaquer le siège ».
 *
 * D'où la règle : **sur une classe C ou D, le produit ne propose jamais le
 * groupe.** Il propose des entités, ordonnées, chacune avec sa raison.
 *
 * Ce module CLASSE, il n'invente pas : chaque point vient d'un fait déjà en
 * base — la nature déclarée de l'entité, un rang 1 connu, des contacts qu'on y
 * a, un site à son adresse. Une entité sans aucun de ces faits reste proposable
 * (l'ignorance n'est pas un obstacle) mais passe derrière celles qu'on connaît.
 */

/** Ce qu'on sait d'une entité au moment de la classer. */
export const accessEntityInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `bu` | `subsidiary` | `division` | `unknown`. */
  kind: z.string(),
  /** Le rang 1 en place sur ce périmètre, quand quelqu'un l'a renseigné. */
  rank1Incumbent: z.string().nullable().default(null),
  /** Combien de contacts de l'espace sont rattachés à cette entité. */
  contactCount: z.number().int().nonnegative().default(0),
  /** Combien de sites retenus lui sont rattachés. */
  siteCount: z.number().int().nonnegative().default(0),
})
export type AccessEntityInput = z.infer<typeof accessEntityInputSchema>

export type RankedAccessEntity = {
  id: string
  name: string
  score: number
  /** En français, et FACTUELLE : ce qui donne son rang à cette entité. */
  reason: string
  /** Les mêmes faits, structurés : l'écran les dit dans la langue de l'utilisateur (#3473). Vide = aucun fait. */
  reasonFacts: AccessEntityReasonFact[]
  /**
   * #4016 L9 — les axes du barème SANS fait connu sur cette entité, NOMMÉS.
   * Un score n'est jamais nu : sous le nombre, ce qui n'a pas pu être évalué
   * reste dit (jamais un « 0 »). Vide quand tous les axes portent un fait.
   */
  missingAxes: AccessEntityAxis[]
}

/** Les quatre axes du barème d'entrée (nature · contacts · sites · rang 1). */
export const ACCESS_ENTITY_AXES = ['kind', 'contacts', 'sites', 'rank1'] as const
export type AccessEntityAxis = (typeof ACCESS_ENTITY_AXES)[number]

/**
 * Un fait ET les points qu'il a rapportés — #4016 L9 (renversement daté du
 * 11/10/2026 de c48 : le score d'une filiale / BU s'affiche AVEC ses axes).
 * La somme des `points` de `reasonFacts` est EXACTEMENT `score`.
 */
export type AccessEntityReasonFact = { readonly points: number } & (
  | { code: 'kind'; kind: string }
  | { code: 'contacts'; count: number }
  | { code: 'sites'; count: number }
  | { code: 'rank1'; value?: string }
)

/** Une entité NOMMÉE (bu, filiale, division) vaut mieux qu'un périmètre flou. */
const POINTS_NAMED_KIND = 25
/** Des contacts chez elle : c'est la porte la plus courte, et de loin. */
const POINTS_PER_CONTACT = 6
const POINTS_CONTACT_MAX = 40
/** Un site retenu : une implantation qui achète localement. */
const POINTS_PER_SITE = 8
const POINTS_SITE_MAX = 16
/** Un rang 1 connu n'est pas un point négatif : c'est un CHEMIN, et le dire
 *  vaut mieux que de le taire — mais il passe derrière une entrée directe. */
const POINTS_KNOWN_INCUMBENT = 5

const NAMED_KINDS = new Set(['bu', 'subsidiary', 'division'])

/**
 * Les entités par ordre d'entrée, la plus praticable d'abord.
 *
 * Le score n'est PAS une probabilité (huitième refus de l'arbitrage n°4) : c'est
 * une somme de faits, et chaque point est nommé dans `reason`. Deux entités sans
 * aucun fait gardent l'ordre alphabétique — un ordre arbitraire déguisé en
 * classement serait pire qu'une liste non triée.
 */
export function rankAccessEntities(entities: readonly AccessEntityInput[]): RankedAccessEntity[] {
  return [...entities]
    .map(entity => {
      const reasons: string[] = []
      const reasonFacts: AccessEntityReasonFact[] = []
      let score = 0

      if (NAMED_KINDS.has(entity.kind)) {
        score += POINTS_NAMED_KIND
        reasons.push(KIND_LABELS[entity.kind] ?? 'périmètre identifié')
        reasonFacts.push({ code: 'kind', kind: entity.kind, points: POINTS_NAMED_KIND })
      }
      if (entity.contactCount > 0) {
        const points = Math.min(entity.contactCount * POINTS_PER_CONTACT, POINTS_CONTACT_MAX)
        score += points
        reasons.push(
          entity.contactCount === 1 ? '1 contact déjà identifié' : `${entity.contactCount} contacts déjà identifiés`,
        )
        reasonFacts.push({ code: 'contacts', count: entity.contactCount, points })
      }
      if (entity.siteCount > 0) {
        const points = Math.min(entity.siteCount * POINTS_PER_SITE, POINTS_SITE_MAX)
        score += points
        reasons.push(entity.siteCount === 1 ? '1 site retenu' : `${entity.siteCount} sites retenus`)
        reasonFacts.push({ code: 'sites', count: entity.siteCount, points })
      }
      if (
        entity.rank1Incumbent &&
        entity.rank1Incumbent !== 'unknown' &&
        entity.rank1Incumbent !== 'none' &&
        entity.rank1Incumbent !== 'no'
      ) {
        score += POINTS_KNOWN_INCUMBENT
        reasons.push(RANK1_REASONS[entity.rank1Incumbent] ?? `rang 1 connu : ${entity.rank1Incumbent}`)
        reasonFacts.push(
          entity.rank1Incumbent === 'yes'
            ? { code: 'rank1', points: POINTS_KNOWN_INCUMBENT }
            : { code: 'rank1', value: entity.rank1Incumbent, points: POINTS_KNOWN_INCUMBENT },
        )
      }

      return {
        id: entity.id,
        name: entity.name,
        score,
        // Une entité sans aucun fait le DIT. « Rien ne s'y oppose » n'est pas
        // « c'est la bonne porte » — et l'écran doit pouvoir faire la différence.
        reasonFacts,
        // Un rang 1 « non » est une réponse CONNUE (0 point, mais évaluée) : il
        // ne fait pas un axe manquant. « unknown » / absent, si.
        missingAxes: ACCESS_ENTITY_AXES.filter(
          axis =>
            !reasonFacts.some(fact => fact.code === axis) &&
            !(axis === 'rank1' && (entity.rank1Incumbent === 'no' || entity.rank1Incumbent === 'none')),
        ),
        reason: reasons.length > 0 ? reasons.join(' · ') : 'aucun fait connu sur ce périmètre',
      }
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/** La valeur brute (`yes`/`no`) ne se montre jamais : on la dit en français (#3473). */
const RANK1_REASONS: Record<string, string> = {
  yes: 'rang 1 installé',
}

const KIND_LABELS: Record<string, string> = {
  bu: 'business unit identifiée',
  subsidiary: 'filiale identifiée',
  division: 'division identifiée',
}

/**
 * Le groupe doit-il être écarté comme porte d'entrée ?
 *
 * Vrai dès la classe C : « pas en direct, voici les intermédiaires ». C'est la
 * règle qui empêche le produit de proposer le siège de Nanterre à une ESN de
 * quatre personnes.
 */
export function shouldAvoidGroupEntry(accessClass: string | null | undefined): boolean {
  return accessClass === 'C' || accessClass === 'D'
}
