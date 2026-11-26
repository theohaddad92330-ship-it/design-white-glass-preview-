import { renewalWindowBoundDays, type RenewalWindow } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * #2195.8 — LE LIBELLÉ D'UNE FENÊTRE SE CALCULE, IL N'EST PLUS UN NOM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Depuis la décision de Louis du 16/09/2026, chaque espace règle ses fenêtres en
 * JOURS. Les quatre valeurs `j15`…`j60` survivent comme IDENTIFIANTS de position
 * (GA-08 : un enum ne perd jamais de valeur), mais elles ne se LISENT plus : un
 * espace réglé sur [20, 40, 70, 100] verrait « Sous 15 jours » sur une fenêtre
 * qui s'ouvre à vingt — une étiquette fausse, qu'un commercial répète en
 * rendez-vous.
 *
 * Le calcul vit donc ICI et nulle part ailleurs (GA-26). C'est la même loi que
 * `MissionDeadline`, et pour la même raison mesurée le 03/09 : la MÊME mission
 * se lisait « J-28 » dans un onglet et « J-30 » dans l'autre, parce que deux
 * endroits dérivaient le même fait.
 *
 * ⚠️ Les quatre fenêtres SANS borne — `overdue`, `imminent`, `far`, `unknown` —
 * gardent leur libellé fixe, et c'est juste : elles ne se règlent pas. Leur
 * `renewalWindowBoundDays` rend `null`, jamais `0` : « à 0 jour » serait faux.
 */
export function renewalWindowLabel(
  t: TFunction<'missions'>,
  window: RenewalWindow,
  scale: readonly number[] | undefined,
): string {
  const days = renewalWindowBoundDays(window, scale)
  return days === null ? t(`renewals.windows.${window}`) : t('renewals.windows.withinDays', { count: days })
}

/** La même dérivation, pour la phrase qui explique la fenêtre. */
export function renewalWindowHint(
  t: TFunction<'missions'>,
  window: RenewalWindow,
  scale: readonly number[] | undefined,
): string {
  const days = renewalWindowBoundDays(window, scale)
  return days === null ? t(`renewals.windowHints.${window}`) : t('renewals.windowHints.withinDays', { count: days })
}

/**
 * La PASTILLE, plus courte que le libellé — une colonne de tableau ne tient pas
 * « Sous 20 jours ».
 *
 * `J-20` en français, `D-20` en anglais : la forme que le produit écrivait déjà
 * à la main pour les quatre jalons figés, désormais calculée.
 */
export function renewalWindowBadge(
  t: TFunction<'missions'>,
  window: RenewalWindow,
  scale: readonly number[] | undefined,
): string {
  const days = renewalWindowBoundDays(window, scale)
  return days === null ? t(`renewal.${window}`) : t('renewal.withinDays', { count: days })
}
