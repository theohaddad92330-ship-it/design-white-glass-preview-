import { z } from 'zod'

/**
 * La restitution d'un compte, en huit blocs (recette finale du 02/08, §22) —
 * et le score en cinq axes qui la conclut (§28).
 *
 * **Ce que le rapport reproche.** L'analyse d'un compte s'affichait en un pavé
 * de texte : « Le compte cumule des signaux d'achat forts (budget confirmé,
 * pression coûts, recrutements) et une accessibilité correcte via des filiales
 * vierges… ». C'est juste, c'est même bien écrit, et c'est inutilisable. Un
 * commercial ne lit pas un paragraphe avant un rendez-vous : il cherche une
 * réponse à une question précise, et il la cherche toujours au même endroit.
 *
 * D'où huit blocs qui ne sont pas une mise en page mais des QUESTIONS. Chacun
 * répond à une seule, et un bloc sans réponse le dit plutôt que de se remplir
 * de généralités — c'est la différence entre un dossier honnête et un dossier
 * qui a l'air complet.
 *
 * Le huitième — « ce que Bellum écarte » — est celui qui manquait partout, et
 * c'est le plus important : sans lui, l'utilisateur ne peut pas distinguer ce
 * que le produit n'a pas trouvé de ce qu'il a délibérément mis de côté. La
 * première lecture fait douter de l'outil, la seconde le rend prévisible.
 */

/** Les huit questions, dans l'ordre où un commercial se les pose. */
export const BRIEFING_BLOCKS = [
  /** « Est-ce que ce compte mérite mon temps ? » */
  'bellum_read',
  /** « Quels signaux et changements justifient d'agir maintenant ? » */
  'why_now',
  /** « Quelles expertises et références créent un angle crédible ? » */
  'why_for_you',
  /** « Quelle BU, entité, ville ou programme attaquer ? » */
  'recommended_perimeter',
  /** « Qui contacter d'abord, puis qui activer ? » */
  'access_path',
  /** « Référencement, concurrence, gouvernance, taille, budget, maturité achats. » */
  'blockers',
  /** « Une action vérifiable et exécutable aujourd'hui. » */
  'immediate_action',
  /** « Angles trop larges, C-levels intouchables, géographies inutiles. » */
  'excluded',
] as const
export type BriefingBlockKey = (typeof BRIEFING_BLOCKS)[number]

/**
 * Un bloc rempli, ou honnêtement vide.
 *
 * `missing` n'est pas un détail de présentation : un bloc vide sans raison se
 * lit comme un bug, un bloc vide AVEC sa raison se lit comme une information
 * (« on n'a pas trouvé de référence comparable dans votre profil »). La
 * distinction change ce que l'utilisateur fait ensuite.
 */
export const briefingBlockSchema = z.object({
  key: z.enum(BRIEFING_BLOCKS),
  /** Le contenu du bloc. Vide ⇒ `missingReason` doit être renseigné. */
  content: z.string().trim().default(''),
  /** Pourquoi ce bloc est vide. Renseigné SEULEMENT quand `content` l'est. */
  missingReason: z.string().trim().nullable().default(null),
  /** Faits cités, pour que chaque affirmation puisse être vérifiée. */
  evidence: z.array(z.string().trim().min(1)).max(10).default([]),
})
export type BriefingBlock = z.infer<typeof briefingBlockSchema>

/** Les cinq axes du score (§28), chacun noté de 0 à 5. */
export const SCORE_AXES = [
  /** Offres, références, profils disponibles, capacité de delivery. */
  'fit',
  /** Budget, recrutement, nomination, programme, incident, calendrier. */
  'signal',
  /** BU accessible, sponsor, rang 2, relation existante, référencement. */
  'accessibility',
  /** Taille de l'ESN, concurrence, achats, périmètre pilote possible. */
  'capacity',
  /** Fraîcheur, sources, identité, couverture. */
  'data_quality',
] as const
export type ScoreAxis = (typeof SCORE_AXES)[number]

/** La note maximale d'un axe. Cinq axes × 5 = 25, la grille déjà en vigueur. */
export const SCORE_AXIS_MAX = 5

/** Le total possible — dérivé, jamais recopié : deux constantes qui se
 *  contredisent produiraient un score sur 25 affiché sur 20. */
export const SCORE_TOTAL_MAX = SCORE_AXES.length * SCORE_AXIS_MAX

export const scoreAxisResultSchema = z.object({
  axis: z.enum(SCORE_AXES),
  points: z.number().int().min(0).max(SCORE_AXIS_MAX),
  /**
   * La preuve qui justifie la note. Un axe noté sans preuve est un avis, et un
   * avis ne se conteste pas — c'est ce qui rend un score inutile en réunion.
   */
  evidence: z.string().trim().default(''),
  /**
   * Ce qui ferait monter cet axe. C'est la partie actionnable du score : « avec
   * une référence bancaire ou un partenaire rang 2, le score passerait à 6 ».
   */
  lever: z.string().trim().nullable().default(null),
})
export type ScoreAxisResult = z.infer<typeof scoreAxisResultSchema>

export const accountScoreSchema = z.object({
  axes: z.array(scoreAxisResultSchema),
  total: z.number().int().min(0).max(SCORE_TOTAL_MAX),
  max: z.literal(SCORE_TOTAL_MAX),
})
export type AccountScore = z.infer<typeof accountScoreSchema>

/**
 * Le total, calculé — jamais rendu par le modèle.
 *
 * Le §27 montre le symptôme : « la logique est juste mais le score est tronqué
 * par un profil ESN non précisé et une collecte encore partielle ». Un total
 * qu'on demande à un modèle peut ne pas être la somme de ses parties, et
 * personne ne s'en aperçoit — l'écran affiche un nombre cohérent avec
 * lui-même. Le calculer ici rend l'incohérence impossible.
 */
export function computeAccountScore(axes: readonly ScoreAxisResult[]): AccountScore {
  const clamped = axes.map(axis => ({
    ...axis,
    points: Math.max(0, Math.min(SCORE_AXIS_MAX, Math.floor(axis.points))),
  }))
  const total = clamped.reduce((sum, axis) => sum + axis.points, 0)
  return { axes: clamped, total: Math.min(SCORE_TOTAL_MAX, total), max: SCORE_TOTAL_MAX }
}

/**
 * Les axes dont la note est PLAFONNÉE par un manque de données plutôt que par
 * le compte lui-même.
 *
 * La distinction est celle du §27, et elle est décisive : un score de 4/25
 * parce que le compte est difficile n'appelle pas la même décision qu'un score
 * de 4/25 parce qu'on ne sait rien de l'ESN. Le premier dit « passez votre
 * chemin », le second dit « complétez votre profil ». Les afficher pareil fait
 * abandonner des comptes pour une mauvaise raison.
 */
export function axesLimitedByData(score: AccountScore): ScoreAxis[] {
  const quality = score.axes.find(axis => axis.axis === 'data_quality')
  if (!quality || quality.points >= SCORE_AXIS_MAX - 1) return []
  // Quand la qualité des données est basse, les axes qui en DÉPENDENT sont
  // suspects : on ne peut pas juger l'adéquation ni l'accessibilité d'un compte
  // qu'on connaît mal. La capacité, elle, dépend de l'ESN et reste jugeable.
  return score.axes
    .filter(axis => (axis.axis === 'fit' || axis.axis === 'accessibility') && axis.points < SCORE_AXIS_MAX)
    .map(axis => axis.axis)
}

/**
 * Un bloc est-il honnêtement rempli ? Soit du contenu, soit une raison — jamais
 * ni l'un ni l'autre.
 */
export function isBlockHonest(block: BriefingBlock): boolean {
  const hasContent = block.content.trim().length > 0
  const hasReason = (block.missingReason ?? '').trim().length > 0
  return hasContent !== hasReason ? true : hasContent && !hasReason
}

/** Les blocs qui ne respectent pas la règle — de quoi faire échouer un test
 *  plutôt que de livrer un dossier troué. */
export function dishonestBlocks(blocks: readonly BriefingBlock[]): BriefingBlockKey[] {
  return blocks.filter(block => !isBlockHonest(block)).map(block => block.key)
}
