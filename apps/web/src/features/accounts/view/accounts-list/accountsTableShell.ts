/**
 * L'enveloppe du tableau des comptes — écrite UNE fois, rendue deux fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE (#1623, #1417, D337)
 * ─────────────────────────────────────────────────────────────────────────────
 * La classe de la table était recopiée à l'identique dans `AccountsTable` et
 * dans `AccountsTableSkeleton`, plancher compris. Un réglage qui vit à deux
 * endroits dérive au premier lot qui n'en touche qu'un (GA-26) — et c'est
 * exactement ce qui est arrivé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PLANCHER, ET CE QU'IL AVAIT CESSÉ DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il valait `1220px`, et le commentaire qui le justifiait additionnait des
 * colonnes qui n'existaient plus : « 96 (effectif) », « 144 (analyse) »,
 * « 192 (signal) ». #1417 a retiré la colonne « Effectif » et rétréci les autres
 * pour que « Prochaine action » cesse d'être coupée — mais le PLANCHER, lui, n'a
 * pas bougé. Mesuré en production le 06/09/2026 sur `/accounts` :
 *
 *     table : 1 220 px · conteneur : 1 158 px · « Actions du compte » à x = 1 462
 *
 * Autrement dit le correctif de #1417 avait rétréci les colonnes pour rien : la
 * table restait clouée à 1 220 px par son propre plancher et débordait toujours.
 *
 * ⚠️ GA-118 était censée l'attraper. Elle ne l'a pas fait pour DEUX raisons, et
 * les deux sont réparées avec ce fichier :
 *
 *   1. ces deux fichiers étaient NOMMÉS dans ses exceptions (D337, plancher en
 *      pixels pour des colonnes en rem) — le plancher s'écrit désormais en
 *      `rem`, donc l'exception est levée, ce qui clôt D337 ;
 *   2. son assertion « le plancher couvre la somme des colonnes » sautait
 *      explicitement les fichiers « dont les entêtes vivent ailleurs » — c'est
 *      le cas d'`AccountsTable`, dont les `<TableHead>` sont dans
 *      `AccountsTableHeaderRow`. La garde a donc été verte pendant tout ce
 *      temps, sur le seul tableau qui violait sa règle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE PLANCHER S'ÉCRIT EN REM
 * ─────────────────────────────────────────────────────────────────────────────
 * Les colonnes sont en `rem` (`w-28` = 7rem). Un plancher en pixels coïncide
 * avec leur somme par hasard, à 16 px de police racine — et le réglage
 * « Taille du texte : Grand » agit précisément sur la police RACINE. Les
 * colonnes grandissent, le plancher ne bouge pas, `table-fixed` les rétrécit
 * toutes, et les libellés se coupent. C'est la règle de GA-118, et c'est celle
 * que ces deux fichiers étaient les derniers à ne pas tenir.
 */

/**
 * Les largeurs déclarées des colonnes, en rem — dans l'ordre du tableau.
 *
 * Elles sont là pour être LUES par GA-118, qui les compare aux classes Tailwind
 * réellement écrites dans `AccountsTableHeaderRow`. Une somme qui vit dans un
 * commentaire ne garde rien : c'est ainsi que le plancher a survécu à #1417.
 */
export const ACCOUNTS_TABLE_COLUMNS_REM = {
  /**
   * Compte — `md:w-64` (refonte Théo, 23/10/2026 ; 18rem avant).
   *
   * Le nom, son secteur et ses pastilles. Les 2rem rendus vont à « Sujet & prochaine action », qui
   * porte désormais deux textes (le signal dominant ET l'action) là où « Signal dominant » n'en
   * portait qu'un.
   */
  company: 16,
  /** Sujet & prochaine action — `w-64` : l'ex-« Signal dominant » (12rem) + la prochaine action écrite. */
  subject: 16,
  /** Relation — `w-32` : le statut (bouton), l'état secondaire et la classe d'accessibilité dessous. */
  relation: 8,
  /** Personnes — `w-28` : deux visages, le nombre, le badge Décideur. */
  people: 7,
  /** Responsable — `w-28` : l'initiale teintée et le prénom. */
  owner: 7,
  /** Décision d'équipe + verdict, en mots — `w-40` ; grille de qualification et date d'analyse dessous. */
  decision: 10,
  /** « Demander à Laura » + le « … » de fin de ligne — `w-20`. */
  rowActions: 5,
} as const

/**
 * La somme des colonnes déclarées : 69rem, soit 1 104 px à 16 px de racine — le tableau tient dans
 * l'écran de 1 440 px à côté de la barre latérale de 232 px, comme la maquette de Théo.
 *
 * ⚠️ 82rem jusqu'au 23/10/2026 : neuf colonnes. La refonte Théo en rend sept ; les trois colonnes
 * hors maquette (accessibilité, grille, dernière analyse) se lisent dans les cellules qu'elles qualifient.
 */
export const ACCOUNTS_TABLE_MIN_WIDTH_REM = Object.values(ACCOUNTS_TABLE_COLUMNS_REM).reduce((sum, rem) => sum + rem, 0)

/**
 * La classe de la table, plancher compris.
 *
 * Le plancher ne vaut qu'à partir de `md` : sous cette borne les colonnes
 * secondaires sont masquées et le tableau tient dans l'écran. Le forcer sur un
 * téléphone rendrait un défilement horizontal où l'on perd le nom du compte en
 * allant lire son score — le contraire de ce qu'une liste sert à faire.
 *
 * ⚠️ Le plancher est écrit en toutes lettres et non composé (`md:min-w-[${…}]`) :
 * Tailwind lit les sources en STATIQUE, une classe construite à l'exécution
 * n'existe dans aucune feuille de style. GA-118 vérifie qu'il dit bien la somme
 * ci-dessus, en lisant les deux fichiers plutôt qu'en les croyant sur parole.
 */
export const ACCOUNTS_TABLE_CLASS = 'w-full table-fixed border-collapse md:min-w-[69rem]'
