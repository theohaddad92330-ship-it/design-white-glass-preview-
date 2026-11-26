/**
 * Les scores que le site MONTRE — décomposés, et rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le site publiait « SCORE D'OPPORTUNITÉ · 87 / 100 · Fort potentiel » dans le
 * héros, un anneau « 8,5 /10 · GO » dans le mockup d'app, et trois anneaux
 * « 92 / 88 / 81 » sans dénominateur sur la page produit. Quatre chiffres nus,
 * écrits en dur dans quatre composants, dont aucun ne disait de quoi il était
 * fait.
 *
 * La doctrine du dépôt est pourtant sans ambiguïté : **un score n'est jamais
 * nu** — ses axes, et ce qui n'a pas pu être évalué est NOMMÉ ; sous trois
 * axes, il n'y a pas de score. Et **un axe non évaluable SORT du
 * dénominateur**, sinon le score mesure la complétude de nos données plutôt
 * que le compte.
 *
 * Le site est la page qu'on lit AVANT d'acheter. Y montrer un score nu
 * installe chez le prospect exactement la lecture probabiliste que le produit
 * refuse — et qu'il aura ensuite à lui désapprendre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE SONT DES EXEMPLES, ET ILS LE DISENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces chiffres illustrent un écran, ils ne décrivent aucun compte réel. Les
 * composants qui les affichent portent la mention « exemple »
 * (`common.score.sample`). Un chiffre d'illustration qui ne se présente pas
 * comme tel est une donnée fictive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES AXES NE SONT PAS INVENTÉS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Leurs clés et leurs plafonds sont ceux du produit — `SCORE_AXES` /
 * `SCORE_AXIS_MAX` et `CONTACT_SCORE_CRITERIA` de `@bellum/contracts`. Le site
 * ne les IMPORTE pas (les contrats sont une devDependency, la page doit rester
 * autonome à l'exécution) : c'est la garde `no-nude-score.test.ts` qui
 * confronte les deux à chaque CI. Le jour où le produit change de grille, le
 * site devient rouge — il ne dérive pas en silence.
 *
 * Les libellés, eux, vivent dans les catalogues (`common.score.*`), en quatre
 * langues : un score décomposé en français et nu en néerlandais reste nu.
 */

/**
 * Un axe du score : sa clé produit, ses points, son plafond.
 *
 * `evaluated: false` ⇒ l'axe n'a pas pu être évalué. Il sort du numérateur ET
 * du dénominateur, et ses points valent 0 — non pas parce qu'il vaut zéro,
 * mais parce qu'il ne compte nulle part. C'est la distinction que « non mesuré
 * n'est pas mesuré à zéro » demande de tenir.
 */
type IllustrationAxis = {
  key: string
  points: number
  max: number
  evaluated: boolean
}

export type IllustrationScore = {
  axes: readonly IllustrationAxis[]
  /** Somme des points des axes ÉVALUÉS. Dérivée, jamais recopiée. */
  points: number
  /** Somme des plafonds des axes ÉVALUÉS — le dénominateur réel. */
  outOf: number
  /** Les axes qu'on n'a pas pu évaluer, nommés par leur clé. */
  notEvaluated: readonly string[]
}

/**
 * Le score, calculé — jamais écrit à la main.
 *
 * Un total recopié à côté de ses axes est le mensonge le plus facile à
 * commettre : il reste cohérent avec lui-même pendant qu'il contredit ses
 * parties, et l'écran n'en dit rien.
 */
function compose(axes: readonly IllustrationAxis[]): IllustrationScore {
  const evaluated = axes.filter(axis => axis.evaluated)
  return {
    axes,
    points: evaluated.reduce((sum, axis) => sum + axis.points, 0),
    outOf: evaluated.reduce((sum, axis) => sum + axis.max, 0),
    notEvaluated: axes.filter(axis => !axis.evaluated).map(axis => axis.key),
  }
}

/**
 * Le score d'un compte : cinq axes de 0 à 5 (grille /25 du produit).
 *
 * `capacity` n'est pas évaluable ici, et c'est le cas le plus fréquent en vrai :
 * cet axe (taille de l'ESN, concurrence, périmètre pilote possible) se juge
 * contre le profil de l'ESN, que le visiteur n'a pas encore renseigné. Le
 * dénominateur tombe donc à 20 — le score reste lisible, et l'écran dit
 * pourquoi il n'est pas sur 25.
 */
export const ACCOUNT_SCORE_ILLUSTRATION: IllustrationScore = compose([
  { key: 'fit', points: 5, max: 5, evaluated: true },
  { key: 'signal', points: 5, max: 5, evaluated: true },
  { key: 'accessibility', points: 4, max: 5, evaluated: true },
  { key: 'capacity', points: 0, max: 5, evaluated: false },
  { key: 'data_quality', points: 3, max: 5, evaluated: true },
])

/**
 * Le score d'un contact : six critères, 100 points au total dans le produit.
 *
 * `angleFit` n'est pas évaluable tant qu'aucun angle d'attaque n'est choisi —
 * le dénominateur des trois contacts est donc 90, pas 100. Trois contacts,
 * trois décompositions : un seul chiffre partagé et deux chiffres nus à côté
 * aurait été la même faute sous une autre forme.
 */
export const CONTACT_SCORE_ILLUSTRATIONS: readonly IllustrationScore[] = [
  compose([
    { key: 'role', points: 30, max: 30, evaluated: true },
    { key: 'proximity', points: 18, max: 20, evaluated: true },
    { key: 'seniority', points: 15, max: 15, evaluated: true },
    { key: 'accessibility', points: 12, max: 15, evaluated: true },
    { key: 'angleFit', points: 0, max: 25, evaluated: false },
    { key: 'freshness', points: 9, max: 10, evaluated: true },
  ]),
  compose([
    { key: 'role', points: 24, max: 30, evaluated: true },
    { key: 'proximity', points: 16, max: 20, evaluated: true },
    { key: 'seniority', points: 12, max: 15, evaluated: true },
    { key: 'accessibility', points: 15, max: 15, evaluated: true },
    { key: 'angleFit', points: 0, max: 25, evaluated: false },
    { key: 'freshness', points: 8, max: 10, evaluated: true },
  ]),
  compose([
    { key: 'role', points: 18, max: 30, evaluated: true },
    { key: 'proximity', points: 14, max: 20, evaluated: true },
    { key: 'seniority', points: 9, max: 15, evaluated: true },
    { key: 'accessibility', points: 12, max: 15, evaluated: true },
    { key: 'angleFit', points: 0, max: 25, evaluated: false },
    { key: 'freshness', points: 7, max: 10, evaluated: true },
  ]),
]
