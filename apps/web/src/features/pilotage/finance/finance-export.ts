import {
  unmeasuredShare,
  type CapacityForecast,
  type DsoResult,
  type Forecast,
  type RevenueBreakdown,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { toCsv } from '@/lib/csv'
import { formatCents } from '@/lib/money'

/**
 * L'EXPORT DU PANNEAU FINANCE — manque n°5 du lot du 30/08.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE RECALCULE RIEN, IL RECOPIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune formule ici. Chaque cellule reprend un champ déjà servi par les cinq
 * lectures financières (`GET /delivery/finance/*`), avec le MÊME formatage que
 * l'écran (`formatCents`, `unmeasuredShare`) — un export qui recalculerait à sa
 * façon serait une seconde vérité, celle que §4.4 de la doctrine de propagation
 * existe pour interdire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE SORT QUE CE QUE L'APPELANT A LE DROIT DE VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `FinancePanel` appelle cette fonction avec `null`/`undefined` sur CHAQUE
 * lecture qui a échoué — un droit manquant (`finance:read` absent) rend
 * exactement la même forme qu'une panne réseau, et les deux se traduisent par
 * une section ABSENTE du fichier plutôt qu'une ligne « non mesuré » qui
 * laisserait deviner qu'il y avait quelque chose à voir. C'est le même geste
 * que `restrictedToManagers` sur `Block` : un bloc qui ne s'affiche pas à
 * l'écran ne s'exporte pas non plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL PORTE SA DATE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fichier financier qui circule sans date se lit de travers dès qu'il est
 * rouvert une semaine plus tard — le même défaut GRAVE que l'écran sans période
 * visible (dossier du 26/08). La date de génération est donc une ligne du
 * fichier, jamais seulement un nom de fichier qu'on peut renommer.
 */

/** Ce que le panneau lit pour la marge — un sous-ensemble structurel de la
 *  réponse `GET /delivery/finance/margin`, non exportée par `missions/api.ts`. */
type FinanceExportMargin = {
  marginPercent: number | null
  measured: number
  unmeasured: number
  threshold: number | null
}

/** Le prévisionnel tel que l'écran le reçoit : ses trois lignes, plus la marge
 *  de sa part CONTRACTUALISÉE quand le serveur la sert. Facultative parce que le
 *  web se déploie avant l'API — un champ absent est une VERSION, pas une mesure
 *  manquante, et les deux ne s'écrivent pas pareil. */
type FinanceExportForecast = Forecast & { contractedMargin?: { marginPercent: number | null } }

/** Ce que le panneau lit pour la marge par canal — même raison. */
type FinanceExportChannels = {
  byChannel: ReadonlyArray<{ channel: string; marginPercent: number | null }>
  intermediationCost: number | null
}

/** Non exporté : seule `buildFinanceExportCsv` le consomme, dans ce fichier —
 *  un type exporté sans consommateur externe fait échouer `pnpm lint:exports:types`. */
type FinanceExportInput = {
  generatedAt: Date
  /** Le mois affiché. `undefined` sur le cockpit, qui n'a pas de sélecteur. */
  month?: string
  /**
   * La SOCIÉTÉ de l'ESN sur laquelle l'écran est filtré, par son NOM.
   *
   * `null` = toutes les sociétés, et le fichier l'écrit aussi — parce que « pas
   * de ligne » et « toutes » se ressemblent trop dans un tableur. Un export
   * financier muet sur son périmètre est le défaut GRAVE que la période visible
   * a déjà corrigé une fois : il circule, et personne ne peut plus savoir de
   * quoi il parle.
   */
  legalEntityName?: string | null
  /** `null`/`undefined` = section absente du fichier (droit manquant ou panne) — voir plus haut. */
  revenue?: RevenueBreakdown | null
  forecast?: FinanceExportForecast | null
  capacity?: CapacityForecast | null
  margin?: FinanceExportMargin | null
  channels?: FinanceExportChannels | null
  dso?: DsoResult | null
}

function tr(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`pilotage:${key}`, options)
}

function money(cents: number | null): string {
  return cents === null ? tr('notMeasured') : formatCents(cents)
}

function pct(value: number | null): string {
  return value === null ? tr('notMeasured') : `${Math.round(value)} %`
}

function count(value: number | null): string {
  return value === null ? tr('notMeasured') : String(value)
}

/** Une ligne du fichier : le bloc auquel elle appartient, son libellé, sa
 *  valeur — exactement les trois colonnes du tableau CSV. */
type ExportRow = readonly [block: string, metric: string, value: string]

function revenueRows(revenue: RevenueBreakdown | null | undefined): ExportRow[] {
  if (!revenue) return []
  const block = tr('finance.revenue.title')
  return revenue.lines.map(line => [block, tr(`finance.revenue.${line.kind}`), money(line.amountCents)] as const)
}

function forecastRows(forecast: FinanceExportForecast | null | undefined): ExportRow[] {
  if (!forecast) return []
  const block = tr('finance.forecast.title')
  const lines = forecast.lines.map(
    line => [block, tr(`finance.forecast.${line.kind}`), money(line.amountCents)] as const,
  )
  // La marge du prévisionnel CONTRACTUALISÉ sort avec ses trois lignes, jamais
  // à leur place : c'est un TAUX à côté de trois MONTANTS, et il ne couvre que
  // deux des trois lignes. Un serveur qui ne sert pas encore le champ ne produit
  // AUCUNE ligne — écrire « non mesuré » laisserait deviner un chiffre absent
  // alors qu'il s'agit d'une version.
  if (!forecast.contractedMargin) return lines
  return [
    ...lines,
    [block, tr('finance.forecast.contractedMargin'), pct(forecast.contractedMargin.marginPercent)] as const,
  ]
}

function capacityRows(capacity: CapacityForecast | null | undefined): ExportRow[] {
  if (!capacity) return []
  const block = tr('finance.capacity.title')
  return [
    [block, tr('finance.capacity.capacityDays'), count(capacity.capacityDays)],
    [block, tr('finance.capacity.committedDays'), count(capacity.committedDays)],
    // `bench.rate` est une fraction (0-1) : les DEUX autres lectures de ce
    // fichier (l'écran, `finance-alerts.ts`) le multiplient par 100 avant de
    // l'afficher — le refaire ici en aurait fait une TROISIÈME formule.
    [
      block,
      tr('finance.capacity.benchRate'),
      capacity.bench?.rate == null ? tr('notMeasured') : pct(capacity.bench.rate * 100),
    ],
    [block, tr('finance.capacity.availableDays'), count(capacity.availableDays)],
  ]
}

function marginRows(margin: FinanceExportMargin | null | undefined): ExportRow[] {
  if (!margin) return []
  const block = tr('finance.margin.title')
  return [
    [block, tr('finance.margin.aggregate'), pct(margin.marginPercent)],
    [block, tr('finance.margin.unmeasuredShare'), pct(unmeasuredShare(margin.measured, margin.unmeasured))],
    [
      block,
      tr('finance.margin.threshold'),
      margin.threshold == null ? tr('finance.margin.thresholdOff') : pct(margin.threshold),
    ],
  ]
}

function dsoRows(dso: DsoResult | null | undefined): ExportRow[] {
  if (!dso) return []
  const block = tr('finance.dso.title')
  return [
    [
      block,
      tr('finance.dso.days'),
      dso.days == null ? tr('notMeasured') : tr('finance.dso.value', { count: dso.days }),
    ],
  ]
}

function channelsRows(channels: FinanceExportChannels | null | undefined): ExportRow[] {
  if (!channels) return []
  const block = tr('finance.channels.title')
  const perChannel = channels.byChannel.map(
    entry =>
      [
        block,
        tr(`finance.channels.${entry.channel}`, { defaultValue: entry.channel }),
        pct(entry.marginPercent),
      ] as const,
  )
  const gap: ExportRow = [
    block,
    tr('finance.channels.gap'),
    channels.intermediationCost == null ? tr('notMeasured') : `${channels.intermediationCost} pt`,
  ]
  return [...perChannel, gap]
}

/** Le nom de fichier — la date y voyage AUSSI, pas seulement dans le contenu :
 *  un fichier renommé garde sa preuve. */
export function financeExportFilename(input: { generatedAt: Date; month?: string }): string {
  const stamp = input.generatedAt.toISOString().slice(0, 10)
  return input.month ? `finance-${input.month}-${stamp}.csv` : `finance-${stamp}.csv`
}

/** Le fichier complet : un en-tête qui porte la date et la période, puis un
 *  tableau à trois colonnes — une ligne par métrique VISIBLE à l'écran. */
export function buildFinanceExportCsv(input: FinanceExportInput): string {
  const header: string[][] = [
    [tr('finance.title')],
    [tr('finance.export.generatedAt', { date: input.generatedAt.toLocaleDateString('fr-FR') })],
    [input.month ? tr('finance.export.period', { month: input.month }) : tr('finance.export.currentView')],
    [
      input.legalEntityName
        ? tr('finance.export.entity', { name: input.legalEntityName })
        : tr('finance.export.allEntities'),
    ],
    [],
    [tr('finance.export.columns.block'), tr('finance.export.columns.metric'), tr('finance.export.columns.value')],
  ]

  const rows: ExportRow[] = [
    ...revenueRows(input.revenue),
    ...forecastRows(input.forecast),
    ...capacityRows(input.capacity),
    ...marginRows(input.margin),
    ...channelsRows(input.channels),
    ...dsoRows(input.dso),
  ]

  return toCsv([...header, ...rows.map(row => [...row])])
}
