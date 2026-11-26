import type {
  BillingCalendar,
  BillingCalendarCell,
  BillingCalendarCellState,
  BillingCalendarRow,
} from '@/lib/billing-calendar'
import { jourSeul } from '@/lib/dates'

/**
 * Ce que le calendrier de facturation DIT — symboles, phrases, bornes (#1653).
 *
 * Rien ici ne CALCULE un état : la dérivation vit dans l'API
 * (`manual-billing-calendar.ts`, qui lit lui-même `windowsUntil`,
 * `billingHealth` et `covers`). Ce module traduit, il ne décide pas — deux
 * calculs du même fait finissent par se contredire, et la colonne « État » de
 * l'onglet « Sur facture » raconterait alors autre chose que cette grille.
 *
 * ⚠️ AUCUN `Intl.DateTimeFormat`, AUCUN `toLocaleString` — les mois sont écrits
 * à la main. Un `YYYY-MM` est un mois du calendrier, pas un instant : lui
 * donner une heure le ferait basculer d'un mois près de minuit, et la garde
 * `dates-au-meme-fuseau` refuserait le formateur nu de toute façon.
 */

/** Les cinq symboles de #1653, mot pour mot. */
export const SYMBOLE: Record<BillingCalendarCellState, string> = {
  paid: '✓',
  issued: '○',
  to_issue: '⚠',
  late: '✗',
  no_period: '—',
}

/**
 * La teinte de chaque état.
 *
 * ⚠️ Elle ACCOMPAGNE le symbole, elle ne le remplace jamais : une couleur seule
 * n'est pas une information — ni pour un daltonien, ni dans une capture en noir
 * et blanc, ni pour un lecteur d'écran. Chaque cellule porte en plus sa phrase
 * (`phraseDeCellule`), et le tableau porte sa légende.
 */
export const TEINTE: Record<BillingCalendarCellState, string> = {
  paid: 'var(--green)',
  issued: 'var(--blue)',
  to_issue: 'var(--amber)',
  late: 'var(--red)',
  no_period: 'var(--muted)',
}

/** La légende, dans l'ordre où #1653 l'écrit. */
export const ETATS_DE_LA_LEGENDE: ReadonlyArray<{ state: BillingCalendarCellState; libelle: string }> = [
  { state: 'paid', libelle: 'émise et encaissée' },
  { state: 'issued', libelle: 'émise, en attente' },
  { state: 'to_issue', libelle: 'à émettre' },
  { state: 'late', libelle: 'en retard' },
  { state: 'no_period', libelle: 'aucune période ne commence ce mois-ci' },
]

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const MOIS_LONGS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/
const CLE_JOUR = /^\d{4}-\d{2}-\d{2}$/

function decouperMois(month: string): { annee: number; index: number } | null {
  const trouve = CLE_MOIS.exec(month)
  if (!trouve) return null
  return { annee: Number(trouve[1]), index: Number(trouve[2]) - 1 }
}

/** `2026-09` → `sept. 26`. Un mois illisible est rendu TEL QUEL, jamais deviné. */
export function moisCourt(month: string): string {
  const decoupe = decouperMois(month)
  if (!decoupe) return month
  return `${MOIS_COURTS[decoupe.index]} ${String(decoupe.annee % 100).padStart(2, '0')}`
}

/** `2026-09` → `septembre 2026`. `—` quand il n'y a rien à écrire. */
export function moisLong(month: string): string {
  const decoupe = decouperMois(month)
  if (!decoupe) return month || '—'
  return `${MOIS_LONGS[decoupe.index]} ${decoupe.annee}`
}

/** `YYYY-MM` reculé de `pas` mois (12 par défaut : une fenêtre entière). */
export function moisPrecedent(month: string, pas = 1): string {
  return decalerMois(month, -pas)
}

/** `YYYY-MM` avancé de `pas` mois. */
export function moisSuivant(month: string, pas = 1): string {
  return decalerMois(month, pas)
}

function decalerMois(month: string, delta: number): string {
  const decoupe = decouperMois(month)
  if (!decoupe) return month
  const total = decoupe.annee * 12 + decoupe.index + delta
  const annee = Math.floor(total / 12)
  const index = total - annee * 12
  return `${annee}-${String(index + 1).padStart(2, '0')}`
}

function nombreDeMois(month: string): number {
  const decoupe = decouperMois(month)
  return decoupe ? decoupe.annee * 12 + decoupe.index : 0
}

type Bornes = Pick<BillingCalendar, 'anchorMonth' | 'currentMonth' | 'earliestPeriodMonth'>

/**
 * Y a-t-il quelque chose AVANT la fenêtre affichée ?
 *
 * La borne se MESURE sur les contrats réels (`earliestPeriodMonth`), elle n'est
 * pas devinée : un bouton qui remonte dans le vide ferait croire à un trou de
 * données là où il n'y a simplement aucun contrat.
 */
export function peutRemonter(bornes: Bornes): boolean {
  if (!bornes.earliestPeriodMonth) return false
  return nombreDeMois(bornes.earliestPeriodMonth) < nombreDeMois(bornes.anchorMonth) - 11
}

/** On n'avance jamais au-delà du mois courant : le futur ne se facture pas. */
export function peutAvancer(bornes: Bornes): boolean {
  return nombreDeMois(bornes.anchorMonth) < nombreDeMois(bornes.currentMonth)
}

/**
 * `05/09/2026` à partir d'une DATE SEULE.
 *
 * C'est `jourSeul` de `lib/dates`, et pas un formatage écrit ici : une
 * dérivation vit à un seul endroit, et deux façons de rendre un jour finiraient
 * par en rendre deux différents à un jour d'écart près de minuit.
 */
const jour = (iso: string) => jourSeul(iso, iso)

/** Le mot français de chaque périodicité. Un libellé vit à un seul endroit. */
export const PERIODICITE: Record<BillingCalendarRow['period'], string> = {
  monthly: 'mensuel',
  quarterly: 'trimestriel',
  yearly: 'annuel',
  one_off: 'ponctuel',
}

/**
 * La phrase qu'un lecteur d'écran lit sur une cellule — et le titre de la
 * cellule pour tout le monde.
 *
 * ⚠️ Elle porte la MÊME information que le symbole, pas moins : #1653 dit
 * « le symbole seul ne suffit pas ». Un état non mesuré n'est jamais rendu par
 * un zéro ou par un « à jour » de repli.
 */
export function phraseDeCellule(row: BillingCalendarRow, cell: BillingCalendarCell): string {
  if (cell.state === 'no_period' || !cell.window) {
    return `${row.workspaceName} — ${moisLong(cell.month)} : aucune période ne commence ce mois-ci. Contrat ${PERIODICITE[row.period]} démarré le ${jour(row.startDate)}.`
  }

  const etendue =
    cell.months > 1
      ? `période du ${jour(cell.window.start)} au ${jour(cell.window.end)} (${cell.months} mois)`
      : `période du ${jour(cell.window.start)} au ${jour(cell.window.end)}`

  const debut = `${row.workspaceName} — ${etendue}`

  switch (cell.state) {
    case 'paid':
      return `${debut} : facture ${cell.reference ?? 'sans référence'} émise et encaissée.`
    case 'issued':
      return `${debut} : facture ${cell.reference ?? 'sans référence'} émise, encaissement en attente.`
    case 'to_issue':
      return `${debut} : facture à émettre.`
    case 'late':
      // « en retard » sans durée mesurée reste « en retard » : inventer « 0 jour »
      // transformerait une lacune en fait.
      return cell.reference
        ? `${debut} : facture ${cell.reference} en retard d’encaissement${cell.lateDays === null ? '' : ` depuis ${cell.lateDays} jours`}.`
        : `${debut} : facture en retard${cell.lateDays === null ? '' : ` depuis ${cell.lateDays} jours`}.`
  }
}

/** `workspaceId` + jour de début, dans un paramètre d'URL qui fait l'aller-retour. */
export function cleDePeriode(workspaceId: string, periodStart: string): string {
  return `${workspaceId}~${periodStart}`
}

/**
 * Relit la clé d'une période. `null` dès qu'elle ne désigne rien de sûr.
 *
 * Le séparateur est `~` et non `-` : un identifiant d'espace est un UUID, donc
 * plein de tirets, et découper là-dessus rendrait un espace tronqué qui ne
 * correspondrait à personne.
 */
export function lireCleDePeriode(brut: string | undefined | null): { workspaceId: string; periodStart: string } | null {
  if (!brut) return null
  const separateur = brut.lastIndexOf('~')
  if (separateur <= 0) return null
  const workspaceId = brut.slice(0, separateur)
  const periodStart = brut.slice(separateur + 1)
  if (!workspaceId || !CLE_JOUR.test(periodStart)) return null
  return { workspaceId, periodStart }
}

/** Combien de cellules dans chaque état, toutes lignes confondues. */
export function compterEtats(rows: readonly BillingCalendarRow[]): Record<BillingCalendarCellState, number> {
  const comptes: Record<BillingCalendarCellState, number> = {
    paid: 0,
    issued: 0,
    to_issue: 0,
    late: 0,
    no_period: 0,
  }
  for (const row of rows) {
    for (const cell of row.cells) comptes[cell.state] += 1
  }
  return comptes
}
