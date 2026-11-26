/**
 * LES COLONNES DE L'ÉCRAN DES PAIEMENTS, et celle qu'on n'enlève pas.
 *
 * Même trio que les missions (`features/missions/columns.ts` +
 * `useMissionColumns` + `MissionColumnsPicker`), recopié plutôt qu'extrait : un
 * sélecteur de colonnes GÉNÉRIQUE se justifierait au TROISIÈME appelant, pas au
 * second. L'extraire aujourd'hui inventerait une abstraction sur un seul
 * exemple, et c'est ainsi qu'on obtient une abstraction qui ne convient à
 * personne.
 *
 * ⚠️ L'ordre de ce tableau est l'ordre d'AFFICHAGE, jamais l'ordre des clics :
 * un utilisateur qui décoche puis recoche « Retard » ne doit pas le retrouver
 * en dernière colonne.
 *
 * ⚠️ CESSION (31/08/2026) : entre `account` et `payable`, comme sur la
 * maquette — CLIENT, puis CESSION, puis MONTANT TTC. Elle est BRANCHÉE sur le
 * domaine affacturage (`features/factoring`), qui sert la donnée par la même
 * clé mission × mois que ce paiement (`receivableKey`, `@bellum/contracts`) :
 * aucune requête n'est refaite ici, celle du domaine cession suffit.
 */
export const PAYMENT_COLUMN_KEYS = [
  'consultant',
  'month',
  'validation',
  'account',
  'mission',
  'cession',
  'payable',
  'scheduledOn',
  'status',
  'overdue',
  'nextAction',
  'reminders',
] as const
export type PaymentColumnKey = (typeof PAYMENT_COLUMN_KEYS)[number]

/**
 * Ce qui s'affiche sans rien régler — les colonnes de la maquette, moins
 * celles qu'elle n'a pas.
 *
 * `reminders` est masquée par défaut : la maquette ne la montre pas, et une
 * colonne de plus sur un écran déjà large rend les autres illisibles. Elle
 * reste ATTEIGNABLE, parce que « combien de fois a-t-on relancé » est la
 * première question qu'on se pose devant un paiement en retard.
 */
/**
 * Les colonnes NÉES après qu'un utilisateur a pu enregistrer son choix.
 *
 * ⚠️ Ce n'est PAS la liste des défauts. Une préférence enregistrée avant qu'une
 * colonne existe ne la contient pas ; la rendre telle quelle masque la colonne
 * neuve à tous ceux qui ont déjà ouvert l'écran — le défaut mesuré en
 * production le 04/09/2026 sur « Prochaine action » de `/missions`.
 *
 * Vide aujourd'hui : aucune colonne n'a encore été ajoutée à cet écran depuis
 * qu'il persiste un choix. Quand une le sera, elle s'inscrit ICI en même temps.
 * `column-preference-lists-new-columns.test.ts` le vérifie.
 */
export const PAYMENT_COLUMNS_ADDED_SINCE: readonly PaymentColumnKey[] = [] as const

export const DEFAULT_PAYMENT_COLUMNS: readonly PaymentColumnKey[] = [
  'consultant',
  'month',
  'validation',
  'account',
  'cession',
  'payable',
  'scheduledOn',
  'status',
  'overdue',
  'nextAction',
] as const

/**
 * La colonne qu'on ne masque pas.
 *
 * Sans le consultant, une ligne de paiement ne désigne plus personne : elle
 * devient un montant sans destinataire, et la file entière cesse d'être
 * actionnable.
 */
export const PINNED_PAYMENT_COLUMN: PaymentColumnKey = 'consultant'

export function isPaymentColumnKey(value: unknown): value is PaymentColumnKey {
  return typeof value === 'string' && (PAYMENT_COLUMN_KEYS as readonly string[]).includes(value)
}
