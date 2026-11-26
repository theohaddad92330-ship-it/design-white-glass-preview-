import { Box, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import {
  pilotageChainGuidance,
  STOCK_METRIC_SOURCE,
  stockBaselineValue,
  type PilotageLevelReport,
  type PilotageMetric,
  type StockBaseline,
  type StockMetricKey,
} from '@bellum/contracts'
import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TrendLine } from '@/components/primitives/TrendLine'
import { formatCount } from '@/lib/locale'
import { isReachable } from '../quality/lib/destinations'
import { formatRate, levelReading, metricTone } from './chain-reading'

/**
 * L'ICÔNE D'UN MAILLON — quatre états, parce que le gris en cachait deux.
 *
 * ⚠️ « Non lu » et « lu, rien à juger » portaient exactement le même signe. La
 * carte Expansion affichait donc « Clients actifs 0 » sous l'icône de « non
 * mesuré » : elle montrait un chiffre en disant qu'elle n'en avait pas. Les deux
 * situations appellent pourtant des gestes opposés — aller chercher la donnée
 * d'un côté, ne rien faire de l'autre.
 *
 * Le contrat, lui, garde ses trois statuts : le CALCUL n'a rien à juger dans les
 * deux cas, et une valeur d'énumération ne s'ajoute pas au milieu (GA-08). C'est
 * l'écran qui a besoin de la nuance, et `levelReading` la lui donne.
 *
 * Chaque icône porte son NOM : sans lui, quatre états se lisent « une image ».
 */
const READING_META: Record<
  ReturnType<typeof levelReading>,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: 'size-4 text-[var(--success-soft-text)]', label: 'status.ok' },
  alerte: { icon: AlertTriangle, className: 'size-4 text-[var(--warning-soft-text)]', label: 'status.alerte' },
  nothingToJudge: {
    icon: MinusCircle,
    className: 'size-4 text-[var(--bellum-text-muted)]',
    label: 'status.nothingToJudge',
  },
  unread: { icon: CircleDashed, className: 'size-4 text-[var(--bellum-text-muted)]', label: 'status.unread' },
}

/** La couleur d'une valeur, par ce que `metricTone` en a dit. */
const TONE_CLASS: Record<ReturnType<typeof metricTone>, string> = {
  alert: 'text-[var(--warning-soft-text)]',
  unknown: 'text-[var(--bellum-text-muted)]',
  measured: 'text-[var(--bellum-text-primary)]',
}

/**
 * Les indicateurs qui DÉNOMBRENT des objets, et l'écran qui porte ces objets.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQ SUR DIX-SEPT, ET LES DOUZE AUTRES SONT UN CHOIX
 * ─────────────────────────────────────────────────────────────────────────────
 * La chaîne affiche jusqu'à dix-sept indicateurs. Cinq seulement ont une
 * population qu'un écran de ce produit contient ; les douze autres restent des
 * chiffres nus, et ce n'est pas un oubli :
 *
 *  - un TAUX (`replyRate`, `qualificationRate`, `conversionRate`,
 *    `correctionRate`) ne compte pas des objets. « Aller voir les 42 % » n'a
 *    aucun sens — d'où le filtre sur `unit === 'count'`, qui rend la règle
 *    structurelle plutôt que déclarative ;
 *  - `tjm`, `margin`, `dso` et `marginBand` ne sont pas captés : ils valent
 *    « non mesuré » en permanence, et une valeur non mesurée n'a pas de
 *    population ;
 *  - `contactsTargeted`, `emailsSent`, `conversions`, `rejectedItems` et
 *    `profilesPushed` comptent bien des objets, mais aucun écran ne montre
 *    CETTE population-là. Envoyer vers un écran qui en montre une autre serait
 *    le défaut qu'on corrige, retourné : un lien qui ne mène pas à ce qu'il
 *    annonce est pire qu'un chiffre nu.
 *
 * ⚠️ Chaque destination est celle où la requête du serveur va CHERCHER ses
 * lignes (`pilotage.service.ts`), pas celle dont le nom ressemble :
 *  - `signals` additionne `recent_signals` sur les comptes — la colonne que
 *    le plateau de la Veille dénombre, le commentaire du service le dit. Ce
 *    plateau vit sur « Mes cibles » depuis #2151.60 : le lien y va DIRECTEMENT,
 *    sans le détour de la redirection de `/watchlist` ;
 *  - `meetings` compte des CONTACTS (`user_status = 'meeting'`), pas des
 *    actions : le centre d'actions n'en contient aucun ;
 *  - `benchAvailable` compte des lignes de `consultants` filtrées sur
 *    `availability` — le vivier. Le pool de réactivation (`/consultants/pool`)
 *    est une autre population : fins d'affectation et dormants, jamais la
 *    disponibilité déclarée.
 */
const METRIC_POPULATIONS: Record<string, string> = {
  signals: '/signals',
  meetings: '/contacts',
  needsQualified: '/projects/needs',
  benchAvailable: '/consultants',
  activeClients: '/accounts',
}

/**
 * #2206.32 (clôture #2935) — LE VERBE DE CHAQUE MAILLON, PAS « OUVRIR ».
 *
 * Les cinq maillons ci-dessus étaient les seuls du produit à porter un lien
 * (`populationOf`) — et tous les cinq partageaient le même verbe générique
 * (`population.openAria`, « — ouvrir la liste »), quel que soit ce qu'on va y
 * FAIRE. Un verbe par maillon, tiré du même commentaire qui documente CE que
 * chaque population compte juste au-dessus (`signals` = comptes qui viennent
 * de signaler, `meetings` = contacts rencontrés, `needsQualified` = besoins
 * qualifiés, `benchAvailable` = vivier disponible, `activeClients` = comptes
 * actifs) — jamais un geste que le maillon ne peut pas encore accomplir.
 * Absent de cette table ⇒ retombe sur `population.openAria` (comportement
 * historique), pour un maillon qui gagnerait une destination sans verbe
 * encore choisi.
 */
const METRIC_ACTIONS: Partial<Record<string, string>> = {
  signals: 'population.actions.signals',
  meetings: 'population.actions.meetings',
  needsQualified: 'population.actions.needsQualified',
  benchAvailable: 'population.actions.benchAvailable',
  activeClients: 'population.actions.activeClients',
}

/**
 * La destination d'un indicateur, ou `null` quand il n'y a rien à ouvrir.
 *
 * Trois refus, et ils ne disent pas la même chose : un taux n'a pas d'objets ;
 * une valeur NON LUE ne dit rien de ce qu'une liste contiendrait ; un compte à
 * ZÉRO est une mesure vraie dont la population est vide — l'ouvrir montrerait
 * une liste qui parle d'autre chose.
 */
function populationOf(metric: PilotageMetric, known: ReadonlySet<string>): string | null {
  if (metric.unit !== 'count') return null
  if (metric.value === null || metric.value <= 0) return null
  const to = METRIC_POPULATIONS[metric.key]
  if (!to || !isReachable(to, known)) return null
  return to
}

/** L'état d'un maillon, NOMMÉ — quatre icônes, jamais une image muette. */
export function LevelStatusIcon({ level }: { level: Pick<PilotageLevelReport, 'status' | 'metrics'> }) {
  const { t } = useTranslation('pilotage')
  const meta = READING_META[levelReading(level)]
  const Icon = meta.icon
  return <Icon className={meta.className} role="img" aria-label={t(meta.label)} />
}

/**
 * LA VALEUR D'UN INDICATEUR — le chiffre, son dénominateur, sa tendance.
 *
 * Extraite de la ligne pour être montrée SEULE sur un maillon de la chaîne
 * (#1433) : le maillon ne porte qu'une métrique, et son libellé est déjà le nom
 * du maillon. Une dérivation vit à un seul endroit — deux calculs du même
 * pourcentage ont déjà divergé sur cet écran.
 */
export function MetricValue({
  metric,
  baseline,
  align = 'start',
  size = 'xs',
  showLabel = true,
}: {
  metric: PilotageMetric
  baseline: StockBaseline | undefined
  align?: 'start' | 'end'
  /**
   * Le libellé sous le chiffre — VRAI sur un maillon, FAUX dans une ligne.
   *
   * ⚠️ Défaut vu en RECETTE LIVE le 04/09, invisible aux 7 471 tests : le détail
   * d'un maillon écrivait « Rendez-vous · 0 · Rendez-vous ». La ligne rend déjà
   * son libellé à GAUCHE ; ce bloc le répétait sous la valeur, parce qu'il a été
   * extrait pour le maillon de la chaîne — où le libellé est nécessaire, le nom
   * du maillon ne disant pas ce que le chiffre compte.
   *
   * Le DÉNOMINATEUR, lui, reste dans les deux cas : « sur 17 besoins pris en
   * charge » n'est écrit nulle part ailleurs, et un taux nu est précisément ce
   * que cet écran refuse.
   */
  showLabel?: boolean
  /**
   * ⚠️ Deux tailles, deux rôles — et l'échelle de Tailwind, jamais une valeur
   * arbitraire (D80). Sur un MAILLON, le chiffre est ce qu'on vient lire :
   * #1440 demande « grands chiffres 24–28 px », mais six maillons sur une ligne
   * ne portent pas du 24 px sans déborder — `lg` (18 px) est le plus grand pas
   * de l'échelle qui tienne à six colonnes. Dans une LIGNE de détail, le chiffre
   * accompagne son libellé et reste à `xs`.
   */
  size?: 'xs' | 'lg'
}) {
  const { t } = useTranslation('pilotage')

  /**
   * ⚠️ `value === null` et NON `status === 'non_mesure'`.
   *
   * Les deux étaient confondus : un stock mesuré à zéro (« 0 consultant
   * disponible ») s'affichait « non mesuré » alors qu'on le connaît
   * parfaitement. C'est le chiffre qui dit s'il est mesuré ; le statut ne dit
   * que la COULEUR.
   */
  const value =
    metric.value === null
      ? t('notMeasured')
      : metric.unit === 'rate'
        ? formatRate(metric.value, t)
        : formatCount(metric.value)

  /**
   * SUR COMBIEN le taux est calculé — « un score n'est jamais nu ».
   *
   * ⚠️ « Taux de qualification 0 % » ne se distingue d'une division par rien que
   * si le dénominateur est écrit. Le calcul faisait déjà la différence (un
   * dénominateur nul rend `null`, donc « non mesuré ») ; l'écran, lui, affichait
   * les deux de la même façon, si bien qu'un décrochage réel — « 0 qualifié sur
   * 43 besoins pris en charge » — se lisait comme une case vide.
   */
  // #3673 (lot R8 07/10, vu en passant) — `count` pilote le PLURIEL (i18next), jamais
  // l'affichage : i18next ne formate aucun nombre tout seul. « sur 35051 contacts » sans
  // séparateur, à deux centimètres d'une carte Acquisition qui écrit « 35 051 », en était la
  // preuve. `formatCount` (Intl.NumberFormat) porte l'affichage, sous une clé séparée.
  const denominator =
    metric.unit === 'rate' && metric.denominator != null
      ? t(`over.${metric.key}`, {
          count: metric.denominator,
          formattedCount: formatCount(metric.denominator),
          defaultValue: '',
        })
      : ''

  /**
   * L'évolution depuis la photo du mois dernier — seulement pour les STOCKS.
   *
   * Un indicateur de FLUX (emails envoyés, besoins convertis) n'a rien à faire
   * ici : sa comparaison se recalcule à partir de dates, et une photo de plus
   * serait une seconde vérité. C'est `STOCK_METRIC_SOURCE` qui tranche, pas une
   * liste recopiée — le jour où un stock entre ou sort, cette ligne suit.
   */
  // Le libellé, le dénominateur, ou les deux — jamais une ligne vide, et jamais
  // le libellé deux fois sur la même ligne.
  const caption = [showLabel ? t(`metrics.${metric.key}`, { defaultValue: metric.key }) : '', denominator]
    .filter(Boolean)
    .join(' · ')

  const isStock = STOCK_METRIC_SOURCE[metric.key as StockMetricKey] === 'chain'
  const previous = isStock ? stockBaselineValue(baseline, metric.key as StockMetricKey) : null

  return (
    <span
      className={
        align === 'end'
          ? 'flex min-w-0 flex-col items-end gap-0.5 text-right'
          : 'flex min-w-0 flex-col items-start gap-0.5'
      }
    >
      {/* ⚠️ La couleur suit `metricTone`, donc la VALEUR — pas le statut. Un
          zéro LU (« 0 client actif ») portait le gris de « non mesuré » : la
          carte montrait un chiffre en disant qu'elle n'en avait pas. */}
      <Text element="span" size={size} weight="semibold" className={TONE_CLASS[metricTone(metric)]}>
        {value}
      </Text>
      {caption ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {caption}
        </Text>
      ) : null}
      {/* Le chiffre du jour est à deux centimètres : on ne le répète pas
          (`showCurrent` absent). Sur ces deux stocks, monter est la bonne
          direction — un vivier qui se remplit, un client de plus. */}
      {isStock ? (
        <TrendLine trend={{ state: 'measured', current: metric.value, previous }} sense="moreIsBetter" absoluteOnly />
      ) : null}
    </span>
  )
}

/** Une ligne d'indicateur, et la porte vers les objets qu'elle compte. */
/**
 * LA PROVENANCE D'UN CHIFFRE (#1440).
 *
 * « Chaque KPI doit ouvrir source, période, dénominateur, dernière mise à
 * jour. » Les quatre, ou rien : trois sur quatre laisserait croire que la
 * quatrième n'existe pas.
 *
 * ⚠️ La PÉRIODE est « état courant », et c'est un fait à dire, pas un défaut à
 * cacher : aucune requête de la chaîne ne porte de fenêtre temporelle. L'écran
 * écrivait « aucun ce mois-ci » à côté de ces chiffres, ce qui laissait croire
 * à une fenêtre glissante.
 *
 * ⚠️ Une métrique NON MESURÉE n'affiche aucune source. Nommer la table d'où
 * viendrait un chiffre qu'on n'a pas lu laisserait croire qu'on l'a lu — c'est
 * la même règle que « non mesuré n'est pas zéro ».
 */
function MetricProvenance({ metric, generatedAt }: { metric: PilotageMetric; generatedAt: string | undefined }) {
  const { t, i18n } = useTranslation('pilotage')
  const sources = metric.source ?? []
  const computed =
    generatedAt && !Number.isNaN(new Date(generatedAt).getTime())
      ? new Intl.DateTimeFormat(i18n.language.startsWith('en') ? 'en-GB' : 'fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(generatedAt))
      : null

  // ⚠️ #2500 (démo, GÊNANT, mesuré en prod le 17/09/2026) — cette ligne rendait
  // `sources.join(', ')` BRUT : « Source : contacts, record_field_audits », un
  // nom de TABLE affiché tel quel. `PILOTAGE_METRIC_SOURCES` porte des
  // identifiants SQL (packages/contracts/src/schemas/pilotage.ts), pas des
  // libellés — chaque table passe par `provenance.tables.<table>` avant de
  // s'afficher. Défaut manquant explicitement plutôt qu'un repli silencieux
  // sur le nom brut : `MetricProvenance.test.tsx` couvre TOUTES les tables du
  // registre, pas seulement celle vue en recette.
  const humanSources = sources.map(table => t(`provenance.tables.${table}`, { defaultValue: table }))

  const lines = [
    sources.length > 0 ? t('provenance.source', { tables: humanSources.join(', ') }) : t('provenance.sourceNone'),
    t('provenance.window'),
    // #3673 (lot R8 07/10, vu en passant) — même défaut que la ligne « sur N contacts » juste
    // au-dessus : `count` pilote le pluriel, `formattedCount` (Intl.NumberFormat) porte l'affichage.
    metric.unit === 'rate' && metric.denominator != null
      ? t('provenance.denominator', { count: metric.denominator, formattedCount: formatCount(metric.denominator) })
      : null,
    computed ? t('provenance.computedAt', { time: computed }) : null,
  ].filter((line): line is string => line !== null)

  return (
    <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
      {lines.join(' · ')}
    </Text>
  )
}

/**
 * #3415.2 (beta-feedback, lot C14 30/09/2026) — SEUIL, CAUSE, DÉCISION,
 * RESPONSABLE — mais SEULEMENT quand le maillon DÉCROCHE.
 *
 * « On n'affiche pas ce qu'on n'a pas » : un indicateur `ok` n'a rien à
 * décider, et `pilotageChainGuidance` rend `null` pour les dix indicateurs qui
 * ne peuvent structurellement pas alerter (stock, sans amont, sans seuil) —
 * cette ligne reste alors muette plutôt que d'inventer une décision de
 * façade. Voir `packages/contracts/src/schemas/pilotage-chain-guidance.ts`
 * pour la raison des sept indicateurs couverts.
 */
function MetricGuidance({ metric }: { metric: PilotageMetric }) {
  const { t } = useTranslation('pilotage')
  if (metric.status !== 'alerte') return null
  const guidance = pilotageChainGuidance(metric.key)
  if (!guidance) return null
  return (
    <Box className="mt-1 rounded-md border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-2">
      <Attr label={t('catalogue.threshold')} value={guidance.threshold} />
      <Attr label={t('catalogue.cause')} value={guidance.cause} />
      <Attr label={t('catalogue.decision')} value={guidance.decision} strong />
      <Attr label={t('catalogue.owner')} value={t(`catalogue.owners.${guidance.owner}`)} />
    </Box>
  )
}

/** Une ligne label/valeur : « seuil »/« décision »/« propriétaire ». */
function Attr({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box display="flex" className="mt-0.5 gap-2">
      <Text element="span" size="xs" className="w-24 shrink-0 text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text
        element="span"
        size="xs"
        className={strong ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-secondary)]'}
      >
        {value}
      </Text>
    </Box>
  )
}

export function MetricRow({
  metric,
  known,
  baseline,
  generatedAt,
}: {
  metric: PilotageMetric
  known: ReadonlySet<string>
  baseline: StockBaseline | undefined
  /** Quand la chaîne a été calculée — la « dernière mise à jour » du retour. */
  generatedAt?: string | undefined
}) {
  const { t } = useTranslation('pilotage')
  const value =
    metric.value === null
      ? t('notMeasured')
      : metric.unit === 'rate'
        ? formatRate(metric.value, t)
        : String(metric.value)
  const label = t(`metrics.${metric.key}`, { defaultValue: metric.key })
  const to = populationOf(metric, known)
  const actionKey = to ? METRIC_ACTIONS[metric.key] : undefined

  const body = (
    <>
      <Text
        element="span"
        size="xs"
        className={to ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-secondary)]'}
      >
        {label}
      </Text>
      <MetricValue metric={metric} baseline={baseline} align="end" showLabel={false} />
    </>
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        {to ? (
          <Link
            to={to}
            // « 116 » n'est pas un nom accessible, et huit cartes de trois lignes
            // donneraient huit fois le même. Le libellé ET la valeur visibles
            // entrent dans le nom annoncé (WCAG 2.5.3, « label in name »).
            aria-label={
              actionKey ? t(actionKey, { label, value }) : t('population.openAria', { label: `${label} : ${value}` })
            }
            // La ligne ENTIÈRE est la cible : un chiffre de trois caractères ne
            // se touche pas. `pointer-coarse:min-h-11` pose les 44 px là où la
            // question se pose — au doigt, pas à la largeur de fenêtre (GA-30).
            className="-mx-1 flex w-full items-center justify-between gap-2 rounded-md px-1 hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
          >
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      {/* #1440 — la provenance, SOUS le chiffre : c'est là qu'on la cherche
          quand on doute de lui, et un tiroir de plus pour trois faits courts
          coûterait un clic à chaque question. */}
      <MetricProvenance metric={metric} generatedAt={generatedAt} />
      {/* #3415.2 — seuil/cause/décision/responsable, SOUS la provenance :
          l'un dit d'où vient le chiffre, l'autre ce qu'on en fait. */}
      <MetricGuidance metric={metric} />
    </div>
  )
}

/**
 * LE DÉTAIL D'UN MAILLON — ce que la chaîne compacte ne montre pas.
 *
 * La chaîne ne porte qu'une métrique par maillon (celle qui mesure le passage).
 * Les autres ne sont pas perdues : elles sont ici, avec leurs populations
 * cliquables — c'est le « clic = détail » du retour, et c'est la raison pour
 * laquelle réduire l'affichage ne réduit pas l'information.
 */
export function LevelDetail({
  level,
  known,
  baseline,
  generatedAt,
}: {
  level: PilotageLevelReport
  known: ReadonlySet<string>
  baseline: StockBaseline | undefined
  /** Quand la chaîne a été calculée (#1440). */
  generatedAt?: string | undefined
}) {
  const { t } = useTranslation('pilotage')
  return (
    <Card className="mt-3 p-4">
      <Text size="sm" weight="semibold">
        {t(`levels.${level.level}.title`)}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t(`levels.${level.level}.subtitle`)}
      </Text>
      <dl className="mt-3 flex flex-col gap-1.5">
        {level.metrics.map(metric => (
          <MetricRow key={metric.key} metric={metric} known={known} baseline={baseline} generatedAt={generatedAt} />
        ))}
      </dl>
    </Card>
  )
}
