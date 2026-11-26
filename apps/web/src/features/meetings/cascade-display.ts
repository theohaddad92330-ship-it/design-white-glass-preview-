import type { MeetingCardState, MeetingCascadeCard, MeetingSource, UserAutonomyBand } from '@bellum/contracts'

/**
 * Comment la cascade se LIT — les correspondances d'affichage, à un seul
 * endroit.
 *
 * Rien ici ne décide : le niveau technique (N0-N5) décide, la puce A0-A3 le
 * dit, et ce fichier choisit la couleur de la puce. Trois responsabilités, trois
 * endroits — c'est ce qui évite qu'une carte finisse par porter une bande
 * choisie à la main parce qu'elle rendait mieux.
 */

/**
 * La pilule de chaque bande.
 *
 * `a3` est la seule à porter une couleur d'alerte, et c'est délibéré : c'est la
 * bande qui vise l'extérieur, donc la seule que l'œil doit trouver seul dans
 * une grille de neuf cartes. `a0` reste neutre — lire n'engage rien.
 *
 * Les variantes viennent du `Badge` partagé, dont chaque couple texte/fond est
 * mesuré AA dans les deux thèmes (GA-33). Aucune couleur n'est écrite ici.
 */
export const BAND_BADGE_VARIANT: Readonly<Record<UserAutonomyBand, 'default' | 'info' | 'primary' | 'warning'>> = {
  a0: 'default',
  a1: 'info',
  a2: 'primary',
  a3: 'warning',
}

/**
 * La couleur du texte d'état, par token sémantique.
 *
 * ⚠️ Jamais une nuance fixe ni une classe de la palette Tailwind : `*-soft-text`
 * est la seule forme qui tienne le contraste AA des deux côtés. Un
 * `text-amber-400` ici court-circuiterait le système entier.
 */
export const STATE_TEXT_CLASS: Readonly<Record<MeetingCardState, string>> = {
  to_validate: 'text-[var(--success-soft-text)]',
  draft: 'text-[var(--accent-soft-text)]',
  draft_go_no_go: 'text-[var(--accent-soft-text)]',
  to_confirm: 'text-[var(--warning-soft-text)]',
  dated_and_owned: 'text-[var(--success-soft-text)]',
  // « Certaines sans date ni propriétaire » n'est pas un succès : la couleur le
  // dit avant que la phrase ne soit lue.
  partially_dated: 'text-[var(--warning-soft-text)]',
  separate_draft: 'text-[var(--warning-soft-text)]',
  stage_proposed: 'text-[var(--accent-soft-text)]',
  scheduled_draft: 'text-[var(--warning-soft-text)]',
  account_memory: 'text-[var(--accent-soft-text)]',
  // #2319.82 — « Projet à qualifier », « Besoin potentiel » : une réserve, que
  // la couleur d'avertissement dit avant le mot.
  to_qualify: 'text-[var(--warning-soft-text)]',
  potential_need: 'text-[var(--warning-soft-text)]',
}

/**
 * La clé i18n du titre d'une carte.
 *
 * Quatre sorties se comptent (contacts, actions, apprentissages) et prennent
 * donc un pluriel ; les autres sont uniques par construction. Le `count` part
 * dans tous les cas : i18next ignore le pluriel d'une clé qui n'en a pas.
 */
export function cardTitleKey(card: MeetingCascadeCard): string {
  return `outputs.${card.kind}`
}

/** L'inventaire d'avant validation, en toutes lettres (« 1 besoin, 4 tâches »). */
export function countKey(kind: string): string {
  return `counts.${kind}`
}

/** Ce qu'on a lu, tel qu'on l'annonce. Une source non lue ne s'écrit pas. */
export function sourceKey(source: MeetingSource): string {
  return `sources.${source.kind}`
}
