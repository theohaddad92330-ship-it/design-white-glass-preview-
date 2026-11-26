import type { ExpenseCategory, ExpenseReportStatus } from '@bellum/contracts'
import { appLocale } from '@/lib/locale'

/**
 * Ce que l'écran met sur un état et sur une catégorie.
 *
 * ⚠️ Il vit ICI et pas dans les deux vues, parce que la file et le tiroir
 * montrent le MÊME objet : deux tables de correspondance divergeraient, et une
 * note « refusée » en rouge dans la liste et en gris dans le tiroir se lit
 * comme deux notes différentes.
 *
 * Les variantes sont celles de `Badge` (@bellum/ui) — jamais une couleur
 * écrite à la main : une nuance fixe de la palette ne passe AA que d'un côté du
 * thème, et l'écran bascule.
 */
export const STATUS_VARIANT: Record<ExpenseReportStatus, 'default' | 'success' | 'danger' | 'outline'> = {
  pending: 'default',
  validated: 'success',
  rejected: 'danger',
  /**
   * Le BROUILLON est le seul état QUI N'ATTEND RIEN de personne d'autre.
   *
   * D'où le contour plutôt qu'un fond : les trois autres badges disent « voilà
   * où en est ta demande », celui-ci dit « tu ne l'as pas encore envoyée ». Lui
   * donner une teinte pleine le ferait lire comme un quatrième état du circuit,
   * et le valideur chercherait quoi en faire.
   */
  draft: 'outline',
}

/**
 * Un glyphe par catégorie — DÉCORATIF, et rendu `aria-hidden`.
 *
 * Le libellé de la ligne porte déjà la catégorie en toutes lettres : l'icône
 * accélère le balayage visuel, elle ne porte aucune information seule. C'est
 * pourquoi elle n'a pas de nom accessible — lui en donner ferait lire deux fois
 * la même chose à un lecteur d'écran.
 */
export const CATEGORY_GLYPH: Record<ExpenseCategory, string> = {
  meal: '🍽️',
  hotel: '🛏️',
  train: '🚆',
  plane: '✈️',
  taxi: '🚕',
  car_rental: '🚗',
  fuel: '⛽',
  toll: '🛣️',
  parking: '🅿️',
  mileage: '📏',
  supplies: '📦',
  other: '🧾',
}

/**
 * Le poids d'un fichier, en unités lisibles.
 *
 * ⚠️ Il vit ICI depuis le 31/08/2026, et plus dans le tiroir : le DÉPÔT
 * l'affiche aussi, avant l'envoi. Deux formatages du même poids finissent par
 * arrondir différemment, et « 124 KB » avant l'envoi contre « 0,1 MB » après
 * se lit comme deux fichiers.
 *
 * N'est appelé que sur un nombre MESURÉ — `MeasuredValue` a déjà écarté `null`
 * avant d'y arriver, et le dépôt lit `File.size`, qui existe toujours.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * #1827.2 — un montant LU automatiquement, en euros et centimes EXACTS.
 *
 * ⚠️ Ce n'est PAS `formatCents` (`@/lib/money`) : celui-là arrondit à l'euro
 * pour un total de tableau de bord, où le dernier centime n'apprend rien. Ici
 * le nombre EST la donnée qu'on demande de vérifier — l'arrondir masquerait
 * l'écart entre ce que le modèle a lu et ce que porte réellement le
 * justificatif.
 */
export function formatExtractedAmount(cents: number): string {
  return new Intl.NumberFormat(appLocale(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}
