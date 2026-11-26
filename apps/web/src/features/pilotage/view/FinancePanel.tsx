import {
  kpiTarget,
  unmeasuredShare,
  type DsoResult,
  type KpiTarget,
  type NumberExplanation,
  type RevenueLine,
} from '@bellum/contracts'
import { Card, HelpIcon, Text } from '@bellum/ui'
import { Link, useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ExplainedNumber } from '@/components/explain/ExplainedNumber'
import {
  benchRateExplanation,
  commercialMarginExplanation,
  dsoExplanation,
  signedRevenueExplanation,
} from '@/components/explain/explanations'
import { TrendLine } from '@/components/primitives/TrendLine'
import { useCapacity, useDso } from '@/features/missions/api'
import { useDashboardChannels, useDashboardForecast, useDashboardMargin, useDashboardRevenue } from '../api'
import { downloadCSV } from '@/lib/export-csv'
import { useDataExit } from '@/lib/data-exit'
import { formatMonth } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { buildFinanceExportCsv, financeExportFilename } from '../finance/finance-export'
import { formatFinancePeriod, previousMonthOf } from '../finance/finance-period'
import { isReachable, knownDestinations } from '../quality/lib/destinations'
import { formatRate } from './chain-reading'
import { KpiTargetBadge } from './KpiTargetBadge'
import { formatKpiTarget } from './kpi-target-format'

/** Les six blocs de la lecture financière — la clé qui dit lesquels une rangée monte. */
type FinanceBlockKey = 'revenue' | 'forecast' | 'capacity' | 'margin' | 'channels' | 'dso'

/** Où vivent les missions rattachées à personne — et la population du bloc
 *  MARGE, dont les alertes portent des `missionId`. */
const MISSIONS_POPULATION = '/missions'

/**
 * ⚠️ UNE DESTINATION PAR CHIFFRE (Louis, 01/09/2026).
 *
 * « Peu importe quel CTA, ça m'envoie toujours vers missions en cours. »
 * Quatre des cinq liens pointaient sur `/missions`, qui ouvre l'onglet
 * « Missions en cours » : quatre chiffres comptant quatre populations
 * différentes menaient au même écran, et aucun ne montrait ce qu'on venait de
 * cliquer. Un lien qui n'ouvre pas ce qu'il annonce est pire qu'un chiffre nu.
 *
 * Chaque destination est celle des tables réellement lues côté serveur :
 * · CA — `invoice_readiness` (facturé, encaissé) et les CRA (produit) ;
 * · Prévisionnel — dominé par « espéré », qui lit `opportunities` ;
 * · Capacité — le vivier, qui porte l'équipe.
 *
 * La MARGE PAR CANAL n'en a aucune, et c'est une décision : le canal vit sur
 * les conditions commerciales d'une mission (`mission_commercial_terms`) et
 * aucun écran ne classe par canal. La renvoyer vers la liste des missions
 * répéterait exactement le défaut qu'on corrige ici.
 */
const INVOICING_POPULATION = '/missions/facturation'
const OPPORTUNITIES_POPULATION = '/projects'

/** Où voir le détail du bloc Capacité : le vivier, qui porte l'équipe. */
const CONSULTANTS_POPULATION = '/consultants'

/**
 * LES QUATRE CIBLES QUE CET ÉCRAN PEUT COMPARER — PDF 5 §13.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT QUATRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source chiffre DIX indicateurs ; ce panneau n'affiche la valeur que de
 * quatre d'entre eux. Les six autres sont ailleurs (la vue Qualité des données),
 * ou pas encore calculés — et leur cible vit au dictionnaire, avec la raison.
 * Poser ici une pilule sur un chiffre qu'on n'a pas serait exactement ce que
 * l'écran refuse depuis toujours.
 *
 * Résolues UNE FOIS, en tête : la clé (`dso_days`…) est le seul lien entre le
 * dictionnaire et cette tuile, et si l'une d'elles était renommée, une
 * résolution éparpillée dans six blocs laisserait cinq pilules disparaître en
 * silence. `kpi-targets.test.ts` refuse déjà les clés orphelines.
 */
const TARGETS = {
  dso: kpiTarget('dso_days'),
  bench: kpiTarget('bench_rate'),
  margin: kpiTarget('gross_margin'),
  unmeasuredMargin: kpiTarget('unmeasured_margin'),
} as const

/**
 * Les cinq lectures financières, et le défaut qu'elles corrigent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CALCULÉES DEPUIS DES SEMAINES, AFFICHÉES NULLE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/finance/{revenue,margin,dso,forecast,capacity}` existent,
 * sont testées, portent chacune leur discipline d'honnêteté — et n'avaient
 * AUCUN appelant. `useForecast` et `useRevenue` étaient même écrits côté web,
 * sans être montés dans un seul composant.
 *
 * Un calcul juste que personne ne voit ne vaut pas mieux qu'un calcul absent :
 * c'est même pire, parce qu'il donne l'impression que le sujet est traité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'additionne RIEN. Les quatre chiffres d'affaires restent quatre lignes, et
 * le prévisionnel reste trois lignes non pondérées — l'écart entre elles EST
 * l'information. Un « CA du mois » unique est le chiffre le plus dangereux d'un
 * outil commercial : chacun croit qu'il parle du sien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PORTÉES DEPUIS LE 26/08/2026 (D1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commercial voit désormais SON chiffre. Trois conséquences à l'écran :
 *
 *  - la portée est DITE. Sur un espace où rien n'est attribué, une portée
 *    restreinte rend « 0 € », et « 0 € » se lit « je n'ai rien vendu » alors que
 *    la vérité est « rien ne m'est rattaché » ;
 *  - les missions rattachées à personne sont COMPTÉES, comme les lignes sans
 *    montant le sont déjà ;
 *  - les trois blocs réservés à `finance:read` (marge par canal, délai de
 *    paiement, capacité) disent « réservé », et non « indisponible » : un droit
 *    manquant et une panne appellent deux gestes différents.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `month` — LE SEUL AJOUT DU 27/08/2026, ET IL EST FACULTATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau interrogeait les six lectures SANS période. Le serveur retombait
 * alors sur son défaut (le mois précédent) et rien à l'écran ne le disait :
 * c'est le seul défaut que le dossier du 26/08 qualifie de GRAVE sur les neuf
 * maquettes de l'écran Finance — « un écran financier dont on ne voit pas la
 * période se lit de travers dès qu'il est partagé ou exporté ».
 *
 * L'écran dédié (`/pilotage/finance`) porte le sélecteur et passe le mois ici.
 * Absent, le comportement est **inchangé** : le cockpit `/pilotage` continue
 * d'appeler `<FinancePanel />` sans argument et rend exactement la même chose
 * qu'avant.
 *
 * Trois lectures ne prennent PAS de mois, et ce n'est pas un oubli : le
 * prévisionnel regarde devant (il porte un horizon, pas un mois), la capacité
 * décrit le mois EN COURS — « combien l'équipe peut ENCORE vendre » ne se pose
 * pas sur un mois passé — et le délai de paiement est une médiane sur tout
 * l'historique. L'écran dédié l'ÉCRIT plutôt que de laisser une période affichée
 * en haut promettre qu'elle gouverne tout ce qui est dessous.
 */
export function FinancePanel({
  month,
  legalEntity = null,
  only,
  header,
}: {
  month?: string
  /**
   * L4 (14/10/2026) — LES BLOCS À RENDRE. Absent = les six, et le cockpit
   * `/pilotage` reste byte-identique. `/pilotage/finance` range ces six blocs
   * dans ses quatre rangées : chaque rangée en monte quelques-uns, sans Card
   * ni titre propres (la rangée les porte). Les six lectures sont TOUJOURS
   * demandées (clés de cache partagées) : l'export reste complet.
   */
  only?: readonly FinanceBlockKey[]
  /** `full` = titre + export (défaut hors `only`), `toolbar` = export et portée
   *  seulement, `none` = rien (défaut avec `only`). */
  header?: 'full' | 'toolbar' | 'none'
  /**
   * La société CHOISIE — son identifiant pour les requêtes, son nom pour
   * l'export. Les deux voyagent ensemble parce qu'un fichier qui porterait un
   * `uuid` en en-tête ne dirait rien à qui l'ouvre, et parce que redemander le
   * nom ici obligerait ce panneau à connaître la liste des sociétés, dont il
   * n'a aucun autre usage.
   */
  legalEntity?: { id: string; name: string } | null
} = {}) {
  const { t, i18n } = useTranslation('pilotage')
  const standalone = only !== undefined
  const headerMode = header ?? (standalone ? 'none' : 'full')
  const show = (key: FinanceBlockKey) => !only || only.includes(key)
  // L4 — CHAQUE bloc DIT sa période quand l'écran en porte une (`month`). Un
  // bloc qui ne suit pas le sélecteur le dit aussi : « 1 022 000 € encaissés »
  // d'un côté et « aucune source » de l'autre étaient deux FENÊTRES.
  const monthLabel = month ? formatFinancePeriod(month, i18n.language) : null
  const periodOf = {
    revenue: monthLabel ? t('finance.period.month', { month: monthLabel }) : undefined,
    margin: monthLabel ? t('finance.period.month', { month: monthLabel }) : undefined,
    channels: monthLabel ? t('finance.period.month', { month: monthLabel }) : undefined,
    forecast: monthLabel ? t('finance.period.ahead') : undefined,
    capacity: monthLabel ? t('finance.period.currentMonth') : undefined,
    dso: monthLabel ? t('finance.period.allHistory') : undefined,
  }
  const Shell = standalone ? PlainShell : Card
  // #2081.14 — le CSV financier est construit dans le navigateur : la règle
  // d'espace « qui peut exporter » se lit ici (décidée par l'API) et masque le
  // bouton quand elle réserve l'export aux administrateurs.
  const dataExit = useDataExit()
  const legalEntityId = legalEntity?.id ?? null
  const revenue = useDashboardRevenue(month, legalEntityId)
  const forecast = useDashboardForecast(legalEntityId)
  const sharedRevenueReasons = sharedReasonKeys(revenue.data?.lines ?? [])
  // ⚠️ La capacité et le délai de paiement gardent leurs hooks d'origine, SANS
  // société : ce sont les deux lectures que le registre déclare aveugles, et
  // leur passer une société aurait donné un paramètre que le serveur ignore —
  // le retour exact du défaut qu'on répare, un cran plus bas.
  const capacity = useCapacity()
  const margin = useDashboardMargin(month, legalEntityId)
  const dso = useDso()
  const channels = useDashboardChannels(month, legalEntityId)

  /**
   * « EXPLIQUE-MOI CE CHIFFRE » — PDF 6 §5.1, sur les trois lectures de cet
   * écran qui savent expliquer leur calcul.
   *
   * ⚠️ Les SEUILS ne sont pas réécrits : ils passent par `formatKpiTarget`, qui
   * est déjà la seule voix des cibles de cet écran (`KpiTargetBadge` l'utilise).
   * Les recomposer dans le panneau les ferait diverger du badge affiché à deux
   * centimètres, sur le même chiffre.
   *
   * ⚠️ Traduits dans le namespace `explain` et non `pilotage` : ces six
   * intitulés servent quatre écrans, et les recopier par écran garantirait
   * qu'un cinquième arrive avec sa propre formulation.
   */
  const { t: tExplain } = useTranslation('explain')
  const explanations = useMemo(
    () => ({
      bench: benchRateExplanation(capacity.data, TARGETS.bench ? [formatKpiTarget(TARGETS.bench, t)] : [], tExplain),
      // #2575.3 — margin.data est aggregateMargin (niveau COMMERCIAL), pas la marge brute.
      margin: commercialMarginExplanation(
        margin.data,
        TARGETS.margin ? [formatKpiTarget(TARGETS.margin, t)] : [],
        tExplain,
      ),
      dso: dsoExplanation(dso.data, TARGETS.dso ? [formatKpiTarget(TARGETS.dso, t)] : [], tExplain),
      signed: signedRevenueExplanation(
        revenue.data?.lines.find(line => line.kind === 'signed'),
        tExplain,
      ),
    }),
    [capacity.data, margin.data, dso.data, revenue.data, t, tExplain],
  )

  /**
   * LE DELTA PÉRIODE/PÉRIODE — manque n°2 du lot du 30/08.
   *
   * ⚠️ Le piège du lot : « un delta n'existe que si la période antérieure
   * existe ». `month` absent (le cockpit `/pilotage`) n'a AUCUNE période à
   * comparer — le serveur retombe sur son défaut sans le dire, et demander
   * quand même un mois antérieur inventerait une période que personne n'a
   * choisie. `previousMonth` reste donc `undefined`, ce qui fait de
   * `useRevenue`/`useAggregateMargin` la MÊME requête que la lecture
   * « courante » juste au-dessus — React Query la partage, il n'y a pas de
   * second appel réseau — et aucun delta ne se rend (voir plus bas, gardé par
   * `month ?`) : le cockpit reste **byte-identique** à avant ce lot.
   *
   * Seuls le chiffre d'affaires et la marge d'espace comparent une période à
   * l'autre : ce sont les deux lectures qui prennent `month` ET qui tiennent
   * en UNE valeur par ligne. La capacité (mois en cours), le prévisionnel
   * (horizon) et le délai de paiement (tout l'historique) ne portent pas de
   * mois au sens où « le mois d'avant » aurait un sens — inchangé.
   */
  const previousMonth = month ? previousMonthOf(month) : undefined
  // La MÊME société pour le mois d'avant, sans quoi le delta comparerait deux
  // populations différentes et afficherait un écart qui n'a jamais eu lieu.
  const previousRevenue = useDashboardRevenue(previousMonth, legalEntityId)
  const previousMargin = useDashboardMargin(previousMonth, legalEntityId)

  // Un 403 n'est pas un vide : sans `finance:read`, on le DIT. Une carte
  // absente ferait croire que ces chiffres n'existent pas ; une carte vide se
  // lirait « il n'y a rien à facturer ».
  const forbidden = [revenue, forecast, capacity, margin, dso, channels].every(query => query.isError)

  // La portée annoncée par le serveur, lue sur la première réponse qui la
  // porte. Elle est identique sur les trois : la répéter à l'écran serait la
  // même phrase trois fois.
  const scope = revenue.data?.scope ?? margin.data?.scope ?? forecast.data?.scope ?? null
  const restricted = scope?.kind === 'own'

  /**
   * La part des missions dont la marge n'a pas pu être calculée.
   *
   * Le serveur envoyait déjà les DEUX comptes (`measured`, `unmeasured`) et
   * l'écran n'affichait que le second, en note. Le ratio est ce que la source
   * chiffre — et la division vit à UN seul endroit (`unmeasuredShare`), qui
   * refuse un dénominateur nul.
   */
  const unmeasuredMarginShare = margin.data ? unmeasuredShare(margin.data.measured, margin.data.unmeasured) : null

  // L'arbre de routes RÉEL de ce navigateur, résolu UNE fois pour tout le
  // panneau — `OrphanMissions` ET chaque lien « voir le détail » de bloc en
  // ont besoin, désormais. Avant le manque n°3, seul `OrphanMissions` posait
  // une destination et la résolvait donc lui-même ; un panneau qui en pose
  // plusieurs paierait cette lecture une fois par bloc pour rien.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])

  /**
   * L'EXPORT — manque n°5. Il ne sort que ce que l'écran a MONTRÉ : une
   * lecture en échec (`isError`, droit manquant ou panne) passe `null` à
   * `buildFinanceExportCsv`, qui retire alors la section entière plutôt que
   * d'écrire une ligne « non mesuré » qui laisserait deviner qu'il y avait
   * quelque chose à voir — le même geste que `restrictedToManagers` sur
   * `Block`. `forbidden` (plus bas) retire le bouton entier : rien à exporter
   * quand rien n'est affiché.
   */
  function handleExport() {
    if (!dataExit.grant) return
    const csv = buildFinanceExportCsv({
      generatedAt: new Date(),
      month,
      // ⚠️ La SOCIÉTÉ voyage dans le fichier, et c'est le même défaut GRAVE que
      // la période manquante : un export financier qui ne dit pas sur quel
      // périmètre il porte se lit de travers dès qu'il est rouvert ou transmis.
      // Le nom, jamais l'identifiant — un `uuid` en en-tête ne dit rien.
      legalEntityName: legalEntity?.name ?? null,
      revenue: revenue.isError ? null : revenue.data,
      forecast: forecast.isError ? null : forecast.data,
      capacity: capacity.isError ? null : capacity.data,
      margin: margin.isError ? null : margin.data,
      channels: channels.isError ? null : channels.data,
      dso: dso.isError ? null : dso.data,
    })
    downloadCSV(csv, financeExportFilename({ generatedAt: new Date(), month }), dataExit.grant)
  }

  return (
    <Shell className="mt-6 p-4">
      <div className="flex items-start justify-between gap-2">
        {headerMode === 'full' ? (
          <div>
            <Text size="sm" weight="semibold">
              {t('finance.title')}
            </Text>
            <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
              {t('finance.subtitle')}
            </Text>
          </div>
        ) : (
          <span />
        )}
        {/* Aucun export tant que rien n'est affiché : un bouton qui produirait
            un fichier vide apprendrait à ne plus cliquer dessus. */}
        {headerMode !== 'none' && !forbidden && dataExit.allowed ? (
          <button
            type="button"
            onClick={handleExport}
            className="shrink-0 rounded-md border border-[var(--bellum-border)] px-2 py-1 text-xs font-medium text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
          >
            {t('finance.export.button')}
          </button>
        ) : null}
      </div>
      {restricted && headerMode !== 'none' ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-accent)]">
          {t('finance.scope.own')}
          {/* Les missions orphelines COMPTENT des objets : ils existent, ils
              s'ouvrent, et la phrase sans chemin vers eux est un reproche sans
              suite. Le lien vit DANS la phrase, donc à la hauteur de sa ligne —
              l'exemption que GA-30 nomme explicitement. */}
          {typeof scope?.outsideAnyPortfolio === 'number' && scope.outsideAnyPortfolio > 0 ? (
            <>
              {' '}
              <OrphanMissions count={scope.outsideAnyPortfolio} known={known} />
            </>
          ) : null}
        </Text>
      ) : null}

      {forbidden ? (
        /* ⚠️ AUCUN lien ici, et c'est une décision et non un oubli.
           « Ces chiffres relèvent du périmètre finance » ne compte rien : c'est
           un DROIT manquant. Aucun écran de ce produit ne répare un droit —
           Réglages › Équipe gère les MEMBRES, pas les portées — et un bouton qui
           mène à un écran incapable d'agir est pire qu'un chiffre nu. La phrase
           reste donc nue tant que la portée ne se règle nulle part. */
        <Text size="sm" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('finance.forbidden')}
        </Text>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Les QUATRE chiffres d'affaires, jamais fondus. */}
          <Block
            title={t('finance.revenue.title')}
            hidden={!show('revenue')}
            period={periodOf.revenue}
            hint={t('finance.revenue.hint')}
            query={revenue}
            detail={{ href: INVOICING_POPULATION, label: t('finance.detail') }}
            known={known}
          >
            {revenue.data?.lines.map(line => (
              <Row
                key={line.kind}
                label={t(`finance.revenue.${line.kind}`)}
                tooltip={t(`finance.revenue.tooltip.${line.kind}`)}
                /* #3709 — « Encaissé » nomme sa PÉRIODE et sa SOURCE à côté du chiffre. */
                caption={
                  line.kind === 'collected' && revenue.data?.periodMonth
                    ? t('finance.revenue.collectedCaption', {
                        month: formatMonth(revenue.data.periodMonth.slice(0, 7)) ?? revenue.data.periodMonth,
                      })
                    : undefined
                }
                value={line.amountCents === null ? null : formatCents(line.amountCents)}
                /* Seule la ligne « signé » sait expliquer son calcul : les
                   trois autres CA n'ont pas de dénominateur lu. Un geste posé
                   sur les quatre ouvrirait trois panneaux vides. */
                explanation={line.kind === 'signed' ? explanations.signed : null}
                note={
                  line.amountCents === null
                    ? // #3483 — une raison partagée par plusieurs lignes se dit UNE fois, sous
                      // le bloc (`SharedReasons`) : quatre fois la même phrase était un mur.
                      sharedRevenueReasons.has(reasonOf(line))
                      ? null
                      : // ⚠️ `unavailableReason` est une CLÉ, pas une phrase, et
                        // elle était rendue telle quelle : l'utilisateur lisait
                        // « unavailable » en anglais au milieu d'un écran
                        // français. Le `defaultValue` protège une clé future.
                        t(`finance.revenue.reasons.${reasonOf(line)}`, {
                          defaultValue: t('finance.revenue.reasons.unavailable'),
                          context: month ? 'screen' : undefined,
                        })
                    : line.withoutAmount > 0
                      ? t('finance.floor', { count: line.withoutAmount })
                      : null
                }
                // Un pourcentage n'a de sens que sur la MÊME ligne, un mois
                // plus tôt — jamais entre deux lignes différentes du bloc.
                // Absent sans `month` (voir le commentaire au-dessus de
                // `previousMonth`) : le cockpit ne montre AUCUNE tendance.
                trend={
                  month ? (
                    <TrendLine
                      trend={{
                        state: 'measured',
                        current: line.amountCents,
                        previous: previousRevenue.data?.lines.find(previousLine => previousLine.kind === line.kind)
                          ?.amountCents,
                      }}
                      sense="moreIsBetter"
                      className="block"
                    />
                  ) : null
                }
              />
            ))}
            <SharedReasons month={month} lines={revenue.data?.lines ?? []} shared={sharedRevenueReasons} />
          </Block>

          {/* Trois lignes, aucune pondération — refusé cinq fois. */}
          <Block
            title={t('finance.forecast.title')}
            hidden={!show('forecast')}
            period={periodOf.forecast}
            hint={t('finance.forecast.hint')}
            query={forecast}
            detail={{ href: OPPORTUNITIES_POPULATION, label: t('finance.detail') }}
            known={known}
          >
            {forecast.data?.lines.map(line => (
              <Row
                key={line.kind}
                label={t(`finance.forecast.${line.kind}`)}
                tooltip={t(`finance.forecast.tooltip.${line.kind}`)}
                value={line.amountCents === null ? null : formatCents(line.amountCents)}
                note={
                  // ⚠️ « Le total est un plancher » suppose qu'AU MOINS UNE ligne
                  // porte un montant. À 100 % de lignes sans montant, il n'y a
                  // pas de plancher : le serveur rend `null` et la raison se dit
                  // comme sur la carte d'à côté — deux cartes du même bloc
                  // traitaient l'absence de deux façons opposées (recette 27/08).
                  line.amountCents === null
                    ? t('finance.noAmount', { count: line.count })
                    : line.withoutAmount > 0
                      ? t('finance.floor', { count: line.withoutAmount })
                      : t('finance.lines', { count: line.count })
                }
              />
            ))}
            {/* LA MARGE PRÉVISIONNELLE — la moitié qui se MESURE, et le nom le
                dit.

                Les maquettes en montrent une sur les TROIS lignes ; le dépôt la
                déclarait « non mesurée » parce qu'« aucune dérivation ne la
                calcule ». C'était vrai de la ligne ESPÉRÉE — le pipe n'a aucun
                coût — et faux des deux autres : `acquis` et `probable` sont des
                missions signées, qui portent un TJM et un coût chargé SAISIS.
                Leur marge n'est pas une prévision, c'est la marge
                CONTRACTUELLE de contrats existants.

                ⚠️ Rien n'est pondéré par une chance de signature : le refus
                `c26_probabilite` porte sur le pipe, et le pipe reste dehors —
                l'infobulle le dit, la ligne ne l'additionne à rien. */}
            <Row
              label={t('finance.forecast.contractedMargin')}
              tooltip={t('finance.forecast.tooltip.contractedMargin')}
              value={
                forecast.data?.contractedMargin?.marginPercent == null
                  ? null
                  : `${Math.round(forecast.data.contractedMargin.marginPercent)} %`
              }
              note={
                // Trois silences DIFFÉRENTS, trois phrases : le serveur ne sert
                // pas encore le champ, il n'a rien pu mesurer, ou il a mesuré
                // sur trop peu de missions. Les fondre ferait chercher la panne
                // au mauvais endroit.
                forecast.data && forecast.data.contractedMargin === undefined
                  ? t('finance.forecast.contractedMarginAbsent')
                  : forecast.data?.contractedMargin?.measurability?.measurable === false
                    ? t('finance.forecast.contractedMarginNotEnough', {
                        have: forecast.data.contractedMargin.measurability.observed,
                        need: forecast.data.contractedMargin.measurability.required,
                        count: forecast.data.contractedMargin.measurability.observed,
                      })
                    : forecast.data?.contractedMargin && forecast.data.contractedMargin.unmeasured > 0
                      ? t('finance.forecast.contractedMarginUnmeasured', {
                          count: forecast.data.contractedMargin.unmeasured,
                        })
                      : t('finance.forecast.contractedMarginScope')
              }
            />
          </Block>

          {/* `null` et non 0 : « 0 jour à vendre » se lit « tout le monde est
              staffé », l'inverse exact de « on ne sait pas ». */}
          <Block
            title={t('finance.capacity.title')}
            hidden={!show('capacity')}
            period={periodOf.capacity}
            hint={t('finance.capacity.hint')}
            restrictedToManagers={restricted}
            query={capacity}
            detail={{ href: CONSULTANTS_POPULATION, label: t('finance.detail') }}
            known={known}
          >
            <Row
              label={t('finance.capacity.capacityDays')}
              tooltip={t('finance.capacity.tooltip.capacityDays')}
              value={capacity.data?.capacityDays == null ? null : String(capacity.data.capacityDays)}
              note={null}
            />
            <Row
              label={t('finance.capacity.committedDays')}
              tooltip={t('finance.capacity.tooltip.committedDays')}
              value={capacity.data?.committedDays == null ? null : String(capacity.data.committedDays)}
              note={null}
            />
            {/* Le taux d'intercontrat : le seuil `benchRate` était déclaré
                depuis le 21/08 et lu par personne. Un taux sur trois consultants
                n'est pas un taux — c'est une fraction que le départ d'une seule
                personne déplace de trente points. */}
            <Row
              label={t('finance.capacity.benchRate')}
              tooltip={t('finance.capacity.tooltip.benchRate')}
              // Le pourcentage passe par `formatRate` : un taux d'intercontrat
              // de 0,4 % écrit « 0 % » se lit « personne n'est sur le banc ».
              value={capacity.data?.bench?.rate == null ? null : formatRate(capacity.data.bench.rate, t)}
              explanation={explanations.bench}
              // « < 5 % bien piloté ». `bench.rate` vaut déjà `null` sous le
              // seuil de mesurabilité, donc rien à re-garder ici : la pilule
              // hérite du refus du calcul.
              target={TARGETS.bench}
              targetValue={capacity.data?.bench?.rate == null ? null : capacity.data.bench.rate * 100}
              note={
                capacity.data?.bench && !capacity.data.bench.measurability.measurable
                  ? t('finance.capacity.benchNotMeasurable', {
                      have: capacity.data.bench.measurability.observed,
                      need: capacity.data.bench.measurability.required,
                    })
                  : capacity.data?.bench
                    ? t('finance.capacity.onBench', { count: capacity.data.bench.onBench })
                    : null
              }
            />
            <Row
              label={t('finance.capacity.availableDays')}
              tooltip={t('finance.capacity.tooltip.availableDays')}
              value={capacity.data?.availableDays == null ? null : String(capacity.data.availableDays)}
              note={
                capacity.data && capacity.data.unmeasured > 0
                  ? t('finance.capacity.unmeasured', { count: capacity.data.unmeasured })
                  : null
              }
            />
          </Block>

          <Block
            title={t('finance.margin.title')}
            hidden={!show('margin')}
            period={periodOf.margin}
            hint={t('finance.margin.hint')}
            query={margin}
            detail={{ href: MISSIONS_POPULATION, label: t('finance.detail') }}
            known={known}
          >
            <Row
              label={t('finance.margin.aggregate')}
              tooltip={t('finance.margin.tooltip.aggregate')}
              value={margin.data?.marginPercent == null ? null : `${Math.round(margin.data.marginPercent)} %`}
              explanation={explanations.margin}
              trend={
                month ? (
                  <TrendLine
                    trend={{
                      state: 'measured',
                      current: margin.data?.marginPercent,
                      previous: previousMargin.data?.marginPercent,
                    }}
                    sense="moreIsBetter"
                    className="block"
                  />
                ) : null
              }
              /* ⚠️ LE PIÈGE LE PLUS FIN DE CET ÉCRAN, et il est ici.
                 Contrairement au délai de paiement et au taux d'intercontrat,
                 `marginPercent` NE s'annule PAS sous le seuil de mesurabilité :
                 « sous le seuil, le chiffre reste calculé ». Le comparer quand
                 même à « 25-40 % » colorerait en vert une marge tirée de DEUX
                 missions, avec toute l'autorité d'une pilule.
                 `measurability` voyageait depuis le 26/08 sans qu'aucun écran ne
                 la lise — le champ n'était même pas déclaré côté navigateur. */
              target={TARGETS.margin}
              targetValue={
                margin.data && margin.data.measurability?.measurable !== false ? margin.data.marginPercent : null
              }
              note={
                margin.data && margin.data.measurability?.measurable === false
                  ? t('finance.margin.notEnough', {
                      have: margin.data.measurability.observed,
                      need: margin.data.measurability.required,
                      count: margin.data.measurability.observed,
                    })
                  : margin.data && margin.data.unmeasured > 0
                    ? t('finance.margin.unmeasured', { count: margin.data.unmeasured })
                    : null
              }
            />
            {/* L4 — LE DÉNOMINATEUR de la marge, dit en toutes lettres : « 72 % »
                sans sa base ne se lit pas. */}
            {margin.data && month ? (
              <Row
                label={t('finance.margin.base')}
                tooltip={t('finance.margin.tooltip.base')}
                value={t('finance.margin.baseValue', { count: margin.data.measured })}
                note={null}
              />
            ) : null}
            {/* LA PART NON MESURÉE, en pourcentage et non plus en compte seul.
                « 4 missions non chiffrées » ne dit pas si la marge au-dessus
                décrit l'espace : sur quarante missions c'est du bruit, sur six
                c'est un chiffre qu'il ne faut pas croire. La source pose la
                cible (< 10 %), et c'est une cible sur notre propre IGNORANCE.

                ⚠️ Zéro mission sur zéro n'est pas « 0 % non mesuré » : le calcul
                rend `null` et la ligne dit qu'il n'y avait rien à mesurer. Sans
                ce refus, un espace vide afficherait la meilleure complétude
                possible. */}
            <Row
              label={t('finance.margin.unmeasuredShare')}
              tooltip={t('finance.margin.tooltip.unmeasuredShare')}
              value={
                unmeasuredMarginShare === null
                  ? null
                  : t('finance.margin.unmeasuredShareValue', { value: unmeasuredMarginShare })
              }
              target={TARGETS.unmeasuredMargin}
              targetValue={unmeasuredMarginShare}
              note={
                unmeasuredMarginShare === null && margin.data
                  ? t('finance.margin.unmeasuredShareNone')
                  : t('finance.margin.unmeasuredShareNote')
              }
            />
            {margin.data?.threshold == null ? (
              <Row
                label={t('finance.margin.threshold')}
                tooltip={t('finance.margin.tooltip.threshold')}
                value={null}
                note={t('finance.margin.thresholdOff')}
              />
            ) : (
              <Row
                label={t('finance.margin.threshold')}
                tooltip={t('finance.margin.tooltip.threshold')}
                value={`${margin.data.threshold} %`}
                note={t('finance.margin.below', { count: margin.data.alerts.length })}
              />
            )}
          </Block>

          {/* « L'indicateur le plus stratégique » du §5.3 : l'écart entre le
              direct et le passage par un intermédiaire est ce qui justifie ou
              non un chantier de référencement. Sans lui, la décision se prend au
              feeling. */}
          <Block
            title={t('finance.channels.title')}
            hidden={!show('channels')}
            period={periodOf.channels}
            hint={t('finance.channels.hint')}
            restrictedToManagers={restricted}
            query={channels}
            /* Aucun lien : le canal vit sur les conditions commerciales d'une
               mission et aucun écran ne classe par canal (voir l'en-tête). */
            known={known}
          >
            {channels.data?.byChannel.map(entry => (
              <Row
                key={entry.channel}
                label={t(`finance.channels.${entry.channel}`, { defaultValue: entry.channel })}
                // Un seul texte pour les cinq canaux : ce qu'exclut la marge ne
                // change pas selon le canal, seule la population change.
                tooltip={t('finance.channels.tooltip.margin')}
                value={entry.marginPercent === null ? null : `${entry.marginPercent} %`}
                note={
                  entry.unmeasured > 0
                    ? t('finance.channels.unmeasured', { count: entry.unmeasured })
                    : t('finance.channels.missions', { count: entry.missions })
                }
              />
            ))}
            <Row
              label={t('finance.channels.gap')}
              tooltip={t('finance.channels.tooltip.gap')}
              value={channels.data?.intermediationCost == null ? null : `${channels.data.intermediationCost} pt`}
              note={channels.data?.intermediationCost == null ? t('finance.channels.gapUnknown') : null}
            />
          </Block>

          {/* « non mesurable — 3 factures sur les 10 nécessaires » plutôt qu'un
              silence, qui fait chercher une panne — ET ce que le calcul a sorti,
              qui manquait : voir `DsoExclusions`.

              ⚠️ AUCUN `detail` ici, et c'est une décision reprise de
              `DsoExclusions` plus bas — pas un oubli du manque n°3. Le DSO
              porte sur TOUT l'historique payé ; le seul écran qui montre une
              facture (`/missions/facturation`) n'affiche qu'UN mois. Un lien
              mènerait à une liste où les factures annoncées n'apparaissent
              pas, le « lien mort » que `quality/lib/destinations` existe pour
              empêcher. */}
          <Block
            title={t('finance.dso.title')}
            hidden={!show('dso')}
            period={periodOf.dso}
            hint={t('finance.dso.hint')}
            restrictedToManagers={restricted}
            query={dso}
          >
            <Row
              label={t('finance.dso.days')}
              tooltip={t('finance.dso.tooltip.days')}
              value={dso.data?.days == null ? null : t('finance.dso.value', { count: dso.data.days })}
              explanation={explanations.dso}
              // « DSO opérationnel < 65 j ». `days` vaut `null` tant que le
              // seuil de dix factures n'est pas atteint — jamais un chiffre
              // provisoire, donc jamais une pilule verte sur du vide.
              target={TARGETS.dso}
              targetValue={dso.data?.days}
              note={dso.data ? <DsoExclusions data={dso.data} /> : null}
            />
          </Block>
        </div>
      )}
    </Shell>
  )
}

function PlainShell({ children }: { children: React.ReactNode; className?: string }) {
  return <div>{children}</div>
}

/**
 * Les missions rattachées à personne, et la porte vers elles.
 *
 * Le lien disparaît si ce navigateur ne connaît pas `/missions` — le comptage,
 * lui, reste : on ne retire jamais l'information, seulement le lien mort.
 *
 * ⚠️ `known` est REÇU en prop depuis le 30/08 (manque n°3), et non plus résolu
 * ICI. La raison d'origine — « le panneau émet AU PLUS une destination » — a
 * cessé d'être vraie le jour où chaque `Block` a porté son propre lien « voir
 * le détail » : cinq destinations à vérifier, pas une. Les résoudre chacune
 * dans son composant aurait relu l'arbre de routes cinq fois par rendu pour le
 * même résultat ; `FinancePanel` le fait UNE fois et le distribue.
 */
/** La raison d'une ligne sans montant — toujours une clé, jamais vide. */
function reasonOf(line: RevenueLine): string {
  return line.unavailableReason ?? 'unavailable'
}

/** Les raisons portées par AU MOINS DEUX lignes sans montant : elles se disent une fois, sous le bloc. */
function sharedReasonKeys(lines: readonly RevenueLine[]): ReadonlySet<string> {
  const keys = lines.filter(line => line.amountCents === null).map(reasonOf)
  return new Set(keys.filter((key, index) => keys.indexOf(key) !== index))
}

/** UNE phrase par raison partagée, avec les lignes qu'elle concerne (« Signé, Produit : … »). */
function SharedReasons({
  lines,
  shared,
  month,
}: {
  lines: readonly RevenueLine[]
  shared: ReadonlySet<string>
  month?: string
}) {
  const { t } = useTranslation('pilotage')
  return (
    <>
      {[...shared].map(key => (
        <Text key={key} size="xs" className="text-[var(--bellum-text-muted)]">
          {lines
            .filter(line => line.amountCents === null && reasonOf(line) === key)
            .map(line => t(`finance.revenue.${line.kind}`))
            .join(', ')}{' '}
          —{' '}
          {t(`finance.revenue.reasons.${key}`, {
            defaultValue: t('finance.revenue.reasons.unavailable'),
            context: month ? 'screen' : undefined,
          })}
        </Text>
      ))}
    </>
  )
}

function OrphanMissions({ count, known }: { count: number; known: ReadonlySet<string> }) {
  const { t } = useTranslation('pilotage')
  const label = t('finance.scope.outside', { count })
  if (!isReachable(MISSIONS_POPULATION, known)) return <>{label}</>
  return (
    <Link
      to={MISSIONS_POPULATION}
      aria-label={t('population.openAria', { label })}
      className="rounded-md underline underline-offset-4 hover:no-underline"
    >
      {label}
    </Link>
  )
}

/**
 * Ce que le délai de paiement a SORTI de son calcul, nommé à côté du chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La médiane écarte trois populations, et la tuile n'en avouait que deux — la
 * troisième, les factures CONTESTÉES, sortait dans le `WHERE` de la requête et
 * n'apparaissait nulle part. L'exclusion est juste (« un litige n'est pas un
 * retard » : le temps qu'une facture contestée met à être réglée mesure la durée
 * d'une négociation, pas la ponctualité d'un client). Ce qui manquait, c'est de
 * le DIRE — une médiane muette sur ce qu'elle a sorti ment dans les deux sens :
 * garder ces factures gonflerait le délai alors que le client n'a rien à payer
 * tant que le litige dure, et les sortir en silence cache de l'argent qui ne
 * rentre pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES TENUES ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Les exclusions ne se CHASSENT plus.** L'ancienne version affichait « non
 *    mesurable » OU « écartées faute de dates », jamais les deux — si bien que
 *    dans le cas le plus fréquent (pas encore mesurable), la tuile taisait tout
 *    ce qu'elle avait sorti. Elles s'ajoutent désormais.
 * 2. **Deux populations distinctes, jamais fondues.** « non datable » = on ne
 *    sait pas QUAND elle a été payée ; « contestée » = le client conteste. Les
 *    confondre ferait disparaître la seule des deux qui coûte de l'argent.
 * 3. **`0` et « on ne sait pas » ne s'écrivent pas pareil.** « aucune facture
 *    contestée » est une mesure VRAIE, et elle rassure : la médiane porte sur
 *    tout le portefeuille payé. « non comptées » demande de réessayer. Écrire
 *    `0` sur une lecture ratée dirait « rien à signaler » (GA-18/GA-19).
 *
 * ⚠️ AUCUN LIEN, et c'est une décision — pas un oubli. La règle du dépôt veut
 * qu'un compteur qui NOMME une population l'OUVRE ; `OrphanMissions`, quelques
 * lignes plus bas, le fait. Elle ne peut pas être tenue ici : le DSO porte sur
 * TOUT l'historique payé, alors que le seul écran montrant une facture
 * contestée (`/missions/facturation`) appelle `useInvoiceReadiness()` sans mois
 * et n'affiche donc qu'UN mois. Une facture contestée réglée il y a huit mois
 * n'y serait pas, et le lien mènerait à un écran où les factures annoncées
 * n'apparaissent pas — le « lien mort » que `quality/lib/destinations` existe
 * pour empêcher : « il fait douter de tout le reste de la liste ». Le compte
 * reste donc nu jusqu'à ce que cet écran sache s'ouvrir sur une population.
 */
function DsoExclusions({ data }: { data: DsoResult }) {
  const { t } = useTranslation('pilotage')
  const parts: string[] = []

  // Ce qu'il manque pour que le chiffre existe — inchangé, mais il ne chasse
  // plus les aveux qui suivent.
  if (data.days == null) {
    parts.push(t('finance.dso.needMore', { count: data.measurability.observed, need: data.measurability.required }))
  }
  if (data.undatable > 0) parts.push(t('finance.dso.undatable', { count: data.undatable }))

  // ⚠️ `== null` couvre `null` ET `undefined` : un serveur qui ne porte pas
  // encore le champ ne sait pas plus compter qu'une lecture ratée. Dans les deux
  // cas la réponse honnête est « non comptées », jamais « aucune ».
  parts.push(
    data.disputed == null
      ? t('finance.dso.disputedUnknown')
      : data.disputed === 0
        ? t('finance.dso.disputedNone')
        : t('finance.dso.disputed', { count: data.disputed }),
  )

  return <>{parts.join(' · ')}</>
}

function Block({
  title,
  hidden,
  period,
  hint,
  query,
  restrictedToManagers,
  detail,
  known,
  children,
}: {
  title: string
  /** L4 — bloc monté par une autre rangée : rien à rendre ici. */
  hidden?: boolean
  /** L4 — la PÉRIODE du bloc, en toutes lettres. Absente sur le cockpit. */
  period?: string
  hint: string
  query: { isLoading: boolean; isError: boolean }
  /** `true` quand l'échec s'explique par un droit manquant, pas par une panne.
   *  Les deux appellent des gestes différents : demander l'accès, ou réessayer. */
  restrictedToManagers?: boolean
  /**
   * Le lien « voir le détail » de ce bloc — manque n°3 du lot du 30/08.
   *
   * Absent (comme sur le bloc Délai de paiement) quand aucune destination ne
   * montre fidèlement ce que le bloc compte — un lien qui ne mène pas où il
   * le prétend est pire que pas de lien : voir le commentaire sur le bloc DSO.
   * `known` est requis dès que `detail` est posé : sans lui, un serveur en
   * avance sur ce navigateur rendrait un lien mort.
   */
  detail?: { href: string; label: string } | null
  known?: ReadonlySet<string>
  children: React.ReactNode
}) {
  const { t } = useTranslation('pilotage')
  if (hidden) return null
  // Jamais sur un bloc en chargement, en erreur, ou dont la destination est
  // inconnue de ce navigateur — les trois raisons pour lesquelles ce bloc n'a
  // RIEN à montrer derrière le lien.
  const showDetail =
    !query.isLoading && !query.isError && detail != null && isReachable(detail.href, known ?? new Set())
  return (
    <div data-finance-block>
      <div className="flex items-center justify-between gap-2">
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {title}
        </Text>
        {showDetail && detail ? (
          <Link
            to={detail.href}
            aria-label={t('finance.detailAria', { title })}
            className="shrink-0 rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline"
          >
            {detail.label}
          </Link>
        ) : null}
      </div>
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {hint}
      </Text>
      {period ? (
        <Text size="xs" weight="medium" data-period-label className="mb-2 block text-[var(--bellum-text-secondary)]">
          {period}
        </Text>
      ) : (
        <span className="mb-2 block" />
      )}
      {query.isLoading ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('loading')}
        </Text>
      ) : query.isError ? (
        // Distinguer l'échec du vide : c'est tout le sujet de cet écran. Et
        // depuis D1, distinguer aussi l'échec du DROIT MANQUANT.
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {restrictedToManagers ? t('finance.restricted') : t('finance.unavailable')}
        </Text>
      ) : (
        <dl className="flex flex-col gap-1.5">{children}</dl>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  note,
  target,
  targetValue,
  tooltip,
  caption,
  trend,
  explanation,
}: {
  label: string
  /** La période et la source, en petit sous le libellé (#3709). */
  caption?: string
  value: string | null
  note?: React.ReactNode
  /**
   * La cible du PDF 5 §13.3, quand cette ligne en porte une. `null` sur les
   * lignes que la source ne chiffre pas — la majorité, et c'est voulu.
   */
  target?: KpiTarget | null
  /**
   * La valeur à COMPARER, dans l'unité de la cible — jamais la chaîne affichée.
   *
   * ⚠️ Deux paramètres et non un, parce que `value` est déjà formatée (« 32
   * jours », « 17 % ») et qu'un écran qui reparserait sa propre chaîne pour
   * comparer se tromperait le jour où la traduction change. Et surtout : ils ne
   * disent pas la même chose. La marge d'espace a une `value` (le chiffre est
   * calculé) et pas de `targetValue` quand elle repose sur trop peu de missions
   * — affichée, mais pas comparable.
   */
  targetValue?: number | null
  /**
   * L'INFOBULLE PAR MÉTRIQUE — manque n°1 du lot du 30/08.
   *
   * Ce que CE chiffre compte, sur quelle fenêtre, et — la ligne qui a de la
   * valeur — ce qui en est EXCLU. Une infobulle qui ne ferait que redire le
   * `hint` du bloc ne livrerait rien de neuf ; `finance-tooltip-i18n.test.ts`
   * refuse qu'elle y soit identique, et exige le mot « exclut ».
   */
  tooltip?: string
  /**
   * LE DELTA PÉRIODE/PÉRIODE — manque n°2. Un `<TrendLine>` déjà résolu par
   * l'appelant (il connaît seul la ligne PRÉCÉDENTE à laquelle comparer), ou
   * `null` quand aucune période antérieure n'est en jeu. Jamais recalculé ici :
   * la dérivation vit à un seul endroit (`lib/trend.ts`, GA-26).
   */
  trend?: React.ReactNode
  /**
   * « EXPLIQUE-MOI CE CHIFFRE » (PDF 6 §5.1) — `null`/absent = AUCUN geste.
   *
   * Porté par la ligne et non par le bloc : sur les cinq lectures de cet écran,
   * quatre chiffres seulement savent expliquer leur calcul, et un bouton qui
   * ouvrirait un panneau vide sur les autres apprendrait à ne plus cliquer.
   */
  explanation?: NumberExplanation | null
}) {
  const { t } = useTranslation('pilotage')
  // #3483 / #3550.3 — dans une LISTE, une absence ne fait AUCUNE ligne (doctrine 20/09) : une valeur
  // absente SANS raison à dire (`note`) n'a rien à montrer — ni « non mesuré » nu, ni tiret isolé.
  // Avec une raison, la ligne reste : c'est elle qui apprend à l'utilisateur quoi faire.
  if (value === null && !note) return null
  return (
    <div className="flex items-baseline justify-between gap-2">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {label}
        {tooltip ? (
          <span className="ml-1 inline-flex translate-y-px align-middle">
            <HelpIcon title={tooltip} />
          </span>
        ) : null}
        {note ? <span className="ml-1 text-[var(--bellum-text-muted)]">· {note}</span> : null}
        {caption ? <span className="block text-[var(--bellum-text-muted)]">{caption}</span> : null}
      </Text>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex items-baseline gap-1.5">
          {target ? <KpiTargetBadge target={target} value={targetValue} /> : null}
          {/* `ExplainedNumber` rend son enfant TEL QUEL quand il n'y a rien à
              expliquer : aucun conteneur en plus, le chiffre ne bouge pas d'un
              pixel entre une ligne explicable et une ligne qui ne l'est pas. */}
          <ExplainedNumber explanation={explanation} label={label}>
            <Text
              size="xs"
              weight="medium"
              className={value === null ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--bellum-text-primary)]'}
            >
              {value ?? t('notMeasured')}
            </Text>
          </ExplainedNumber>
        </span>
        {trend}
      </span>
    </div>
  )
}
