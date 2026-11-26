import { z } from 'zod'

/**
 * LA MARQUE — le contrat partagé entre l'API, l'app et le site.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le mot « Bellum » apparaissait 537 fois dans le produit (115 dans le code de
 * l'app, 422 dans les traductions FR et EN) et « Laura » 356 fois. Tant qu'un
 * nom est écrit dans 893 endroits, aucun client ne peut voir le sien : il n'y
 * a rien à remplacer, il y a mille choses à remplacer.
 *
 * Ce module est le SEUL endroit qui sait comment s'appelle le produit quand
 * personne ne l'a renommé. Tout le reste lit `resolveBrand()`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE LE MARQUE BLANCHE NE DÉFAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le copilote devient renommable (décision de Louis du 01/09/2026, qui rouvre
 * D82 « le copilote s'appelle Laura, PARTOUT »). Ce qui reste entier :
 *
 *  - **un seul copilote, une seule porte.** Renommer n'autorise pas un second
 *    assistant : les gardes `laura-turn-single-door` et
 *    `laura-surfaces-are-not-second-assistants` tiennent la MÉCANIQUE, pas le
 *    nom, et elles ne bougent pas.
 *  - **la mention « produit par un système d'IA » reste obligatoire.** Elle ne
 *    dépend d'aucune marque : c'est une obligation d'information, et un client
 *    ne peut pas l'effacer en renommant son copilote.
 *  - **aucune probabilité, aucun score nu, aucune donnée inventée.** La
 *    doctrine du produit ne se sous-traite pas avec la marque.
 *
 * En revanche « copilote » reste le NOM COMMUN de la catégorie — c'est un
 * positionnement, pas une marque. Un client renomme son copilote ; il ne
 * renomme pas le fait que c'en soit un.
 */

/**
 * Le nom du produit quand personne ne l'a renommé.
 *
 * ⚠️ « Bellum » et non « BellumAI », et c'est un CONSTAT avant d'être un choix.
 * Les deux graphies coexistaient dans les traductions — « ce que Bellum
 * retient » (422 fois) à côté de « les alertes BellumAI » (105 fois) — sans
 * règle qui dise laquelle va où. Les fondre en une seule variable oblige à
 * trancher, et on retient la plus fréquente : elle change 105 phrases au lieu
 * de 422, et elle est celle que les écrans écrivaient déjà dans leurs tests.
 *
 * Le mot-symbole du logo n'est PAS concerné : c'est un composant, pas une
 * chaîne interpolée. Si le nom long doit revenir, il se change ICI, en un
 * point — c'est précisément ce que ce module achète.
 */
export const DEFAULT_BRAND_NAME = 'Bellum'

/** Le nom du copilote quand personne ne l'a renommé. */
export const DEFAULT_COPILOT_NAME = 'Laura'

/**
 * L'accent par défaut — `--bellum-primary-500`.
 *
 * ⚠️ Il est répété ici alors qu'il vit déjà dans `tokens.css`, et c'est
 * assumé : le CSS ne peut pas être lu depuis l'API, qui doit pourtant rendre
 * une valeur complète. La garde `brand-accent-matches-tokens` vérifie que les
 * deux ne divergent pas — un réglage vit à un seul endroit, et quand la
 * technique force un doublon, c'est un test qui le tient.
 */
export const DEFAULT_BRAND_ACCENT = '#5b3ee8'

/**
 * Ce que l'API rend, et ce que l'app affiche.
 *
 * Tous les champs sont RÉSOLUS : l'appelant ne voit jamais de `null` et n'a
 * donc aucun repli à réimplémenter. C'est la leçon des `?? 'Bellum'` qui se
 * seraient multipliés dans chaque composant — soixante-huit endroits, et le
 * soixante-neuvième oublié.
 */
export const brandSchema = z.object({
  /** Le nom affiché du produit. */
  name: z.string().min(1).max(60),
  /** Le nom du copilote. */
  copilotName: z.string().min(1).max(40),
  /** L'URL du logo, ou `null` pour la marque du produit. */
  logoUrl: z.string().url().max(500).nullable(),
  /** L'accent, toujours un hexadécimal à six chiffres en minuscules. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/),
  /**
   * `true` quand l'espace a posé sa propre marque.
   *
   * Ce n'est pas une commodité d'affichage : c'est ce qui permet aux écrans de
   * NE PAS montrer ce qui n'appartient qu'à nous — le changelog du produit, le
   * lien vers notre site, la mention « propulsé par ». Sans ce drapeau, chaque
   * écran aurait à comparer `name` à une constante, ce qui est la même
   * dérivation refaite à trente endroits.
   */
  isCustom: z.boolean(),
})

export type Brand = z.infer<typeof brandSchema>

/** Ce qu'un espace a réellement enregistré — chaque champ peut manquer. */
export type BrandOverrides = {
  brandName?: string | null
  copilotName?: string | null
  brandLogoUrl?: string | null
  brandAccent?: string | null
}

/**
 * La marque d'un espace, résolue.
 *
 * ⚠️ **Le seul endroit du produit qui écrit « BellumAI » ou « Laura ».** Tout
 * ce qui affiche un nom passe par ici. Un composant qui écrirait `?? 'Laura'`
 * pour se dépanner recréerait le problème que ce module supprime : un repli de
 * plus, à un endroit de plus, qu'on oubliera de changer.
 *
 * `isCustom` est vrai dès qu'UN champ est posé — pas seulement le nom. Un
 * client qui ne change que son logo est déjà chez lui, et l'écran ne doit pas
 * lui servir notre changelog.
 */
export function resolveBrand(overrides: BrandOverrides | null | undefined): Brand {
  const name = overrides?.brandName?.trim() || null
  const copilotName = overrides?.copilotName?.trim() || null
  const logoUrl = overrides?.brandLogoUrl?.trim() || null
  const accent = overrides?.brandAccent?.trim().toLowerCase() || null

  return {
    name: name ?? DEFAULT_BRAND_NAME,
    copilotName: copilotName ?? DEFAULT_COPILOT_NAME,
    logoUrl,
    accent: accent ?? DEFAULT_BRAND_ACCENT,
    isCustom: Boolean(name || copilotName || logoUrl || accent),
  }
}
