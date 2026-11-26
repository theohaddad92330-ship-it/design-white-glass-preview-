import type { Task } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePipeline } from '@/features/projects/hooks/usePipeline'
import { useCapacity, useMissions, useRevenue } from '@/features/missions/api'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import {
  CAPACITY_HORIZON_MONTHS,
  capacityWindow,
  cockpitState,
  isBlankWorkspace,
  sourceState,
  type CockpitBlock,
  type SourceState,
} from '../cockpit'

/**
 * LE COCKPIT DU COMMERCIAL — « comment va MON mois ? » (BEL-BO-002).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc portait DEUX blocs sur six : un pipe valorisé sans sa ventilation, et
 * deux chiffres d'affaires sur quatre. Les quatre montants étaient pourtant
 * calculés depuis des mois (`revenue.service.ts`) et rendus par `/pilotage` —
 * le motif que ce dépôt connaît par cœur : du code juste que personne n'appelle.
 *
 * Les six blocs sont ceux de la source, dans son ordre de lecture :
 *  1. mon pipe, PAR ÉTAPE, chaque barre cliquable ;
 *  2. mon chiffre d'affaires — quatre nombres JAMAIS fondus ;
 *  3. mes missions en cours ;
 *  4. ce qu'il reste à vendre ;
 *  5. ce qui m'attend — #2567.K2 (18/09/2026) : DÉPLACÉ vers
 *     `DailyGesturesBlock`, posé tôt sur `/briefing` (retour client
 *     François Thomas, 17/09/2026 : sans intention de prospecter, rien ne
 *     donnait de raison d'ouvrir l'outil) ;
 *  6. ce qui a bougé depuis ma dernière visite — livré à part, plus haut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CHIFFRES NE SE FONDENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Signé · produit · facturé · encaissé. Un « CA du mois » unique est le chiffre
 * le plus dangereux d'un outil commercial, parce que chacun croit qu'il parle du
 * sien — et l'écart ENTRE eux est justement l'information : un signé très
 * supérieur au produit dit qu'on vend plus vite qu'on ne livre, un facturé très
 * supérieur à l'encaissé dit qu'on a un problème de recouvrement.
 *
 * ⚠️ Le SIGNÉ vient du montant du projet et de nulle part ailleurs. Aucun
 * « TJM × durée » : ce serait un chiffre inventé, qui varierait selon qu'on
 * compte 20 ou 21 jours ouvrés, et il figurerait dans un tableau de chiffre
 * d'affaires. Le refus est déjà écrit deux fois dans le dépôt
 * (`revenue.service.ts:86`, `NeedsKanban.tsx:21`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS LE DROIT FINANCIER, TROIS BLOCS DISPARAISSENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un montant refusé est RETIRÉ de la réponse, jamais mis à zéro. Sans le
 * droit, la colonne n'existe pas. » Le bloc ne montre pas quatre tirets : il
 * n'existe pas — quatre tirets feraient chercher une panne là où il n'y a rien
 * à réparer. Le bloc 3 (missions en cours, retiré par #1394) et le bloc 6
 * restent, à leur place : ils ne portent aucun montant que le serveur n'ait
 * déjà retiré.
 *
 * ⚠️ La condition était `revenue.isError && pipeline.isError` : il fallait que
 * les DEUX échouent. Un 403 sur le seul chiffre d'affaires laissait donc le bloc
 * à l'écran avec « Non mesuré » à la place des montants — c'est-à-dire un droit
 * manquant présenté comme une donnée absente, exactement la confusion que
 * `FinancePanel` évite déjà. Chaque bloc disparaît maintenant sur SON refus.
 */
export function MyActivityBlock({ tasks }: { tasks?: readonly Task[] }) {
  const { t } = useTranslation('briefing')
  const now = useMemo(() => new Date(), [])
  // Trois mois pleins devant, un appel par mois : le service rend une capacité
  // MENSUELLE (`mission-scores.service.ts:194`), et lui faire dire « 90 jours »
  // en multipliant un mois par trois inventerait deux mois d'affectations.
  const capacityMonths = useMemo(() => nextMonths(now, CAPACITY_HORIZON_MONTHS), [now])

  // ⚠️ `'own'` n'est pas décoratif : le serveur rend l'ESPACE quand on ne
  // demande rien. Sans ce mot, un siège responsable lisait le chiffre de toute
  // l'ESN sous le titre « Mon chiffre d'affaires » — et rien ne pouvait le
  // trahir à l'écran, un total juste pour l'espace ayant l'air d'un total juste
  // pour soi. `/pilotage/finance` appelle le même hook SANS portée, et c'est
  // voulu : là, c'est l'espace qu'on regarde.
  const revenue = useRevenue(undefined, 'own')
  // ⚠️ `'own'` n'est pas décoratif, même raison que le chiffre d'affaires juste
  // au-dessus : sans lui, le serveur rend l'ESPACE, et « Mon pipe » affichait le
  // pipe de toute l'ESN sous ce titre. `/projects` et l'état vide de `/missions`
  // appellent `usePipeline()` SANS portée, et c'est voulu : là, c'est l'espace.
  const pipeline = usePipeline('own')
  // D880 — « MES missions en cours » : le titre promet le portefeuille du
  // lecteur, la route rendait l'espace entier. Jumeau du défaut « Mon pipe »
  // juste au-dessus ; le serveur savait déjà lire `?scope=own`.
  const missions = useMissions({ scope: 'own' })
  const capacity0 = useCapacity(capacityMonths[0])
  const capacity1 = useCapacity(capacityMonths[1])
  const capacity2 = useCapacity(capacityMonths[2])

  const capacityQueries = [capacity0, capacity1, capacity2]
  const states: Record<CockpitBlock, SourceState> = {
    revenue: sourceState(revenue),
    // Les trois mois forment UN bloc : un seul refus refuse la capacité entière
    // (c'est le même droit), une seule panne la rend partielle.
    capacity: worstOf(capacityQueries.map(sourceState)),
    // Le bloc « depuis ta dernière visite » vit dans son propre composant, plus
    // haut dans l'écran, et porte déjà ses états. Il est compté ici comme
    // SERVI : le dire « en panne » depuis ce bloc-ci exigerait de refaire sa
    // lecture, donc deux vérités.
    sinceLastVisit: 'ready',
  }
  const state = cockpitState(states)

  // ⚠️ Le pipe et les missions ne sont plus AFFICHÉS ici (#1394), mais ils sont
  // toujours LUS — c'est ce couple qui distingue un espace neuf d'un espace
  // calme, et il ne se conclut jamais d'un silence. Leurs états sont donc
  // calculés à côté du registre des blocs plutôt que dedans : les compter parmi
  // les blocs ferait annoncer « 3 blocs sur 5 » à un écran qui n'en montre que
  // trois, et le compteur mentirait dans l'autre sens.
  const pipeState = sourceState(pipeline)
  const missionsState = sourceState(missions)

  const capacity = capacityWindow(capacityQueries.map(query => query.data))

  // ÉTAT « espace neuf » — et il ne se conclut jamais d'un silence : les deux
  // sources doivent avoir RÉPONDU pour qu'on affirme que rien n'existe.
  if (
    isBlankWorkspace({
      pipe: pipeline.data,
      pipeState,
      missions: missions.data?.missions.length,
      missionsState,
    })
  ) {
    return <BlankWorkspace />
  }

  return (
    <Box className="flex min-w-0 flex-col gap-5">
      {state.kind === 'partial' ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('activity.partial', { served: state.served, expected: state.expected })}{' '}
          {state.failed.map(block => t(`activity.failed.${block}`)).join(' ')}
        </Text>
      ) : null}

      {/* 1 — MON CHIFFRE D'AFFAIRES. Quatre nombres côte à côte, jamais fondus. */}
      {states.revenue === 'refused' ? null : (
        <RevenueBlock lines={revenue.data?.lines} periodMonth={revenue.data?.periodMonth} state={states.revenue} />
      )}

      {/* 2 — CE QU'IL RESTE À VENDRE. */}
      {states.capacity === 'refused' ? null : <CapacityBlock window={capacity} state={states.capacity} />}

      {/* #2567.K2 — « CE QUI M'ATTEND » (la file d'interventions) est SORTIE
          d'ici le 18/09/2026 : promue en `DailyGesturesBlock`, posée tôt sur
          `/briefing` pour qu'elle se voie sans intention de prospecter. Elle
          n'apparaît plus deux fois sur la même page (loi 4 du tome 7). */}

      {/* #1394 — LES DEUX MAISONS DE CE QUI A ÉTÉ RETIRÉ.
          Le pipe par étape vit dans `/projects`, les missions dans `/missions`,
          et le détail financier dans les Décisions. Un bloc qu'on allège doit
          dire OÙ va ce qu'il n'affiche plus, sinon il se lit comme une perte. */}
      <Box className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link to="/projects" className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2">
          {t('activity.openPipe')}
        </Link>
        <Link to="/missions" className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2">
          {t('activity.openMissions')}
        </Link>
        <Link to="/pilotage" className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2">
          {t('activity.more')}
        </Link>
      </Box>
    </Box>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Le pire des trois états : un refus l'emporte, puis une panne, puis l'attente. */
function worstOf(states: readonly SourceState[]): SourceState {
  if (states.some(state => state === 'refused')) return 'refused'
  if (states.some(state => state === 'failed')) return 'failed'
  if (states.some(state => state === 'loading')) return 'loading'
  return 'ready'
}

/** Les `count` prochains mois, `YYYY-MM`, à partir du mois EN COURS. */
function nextMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1)).toISOString().slice(0, 7),
  )
}

/**
 * Un espace où rien n'a jamais existé — et les deux gestes qui le remplissent.
 *
 * Un état vide sans sortie est un cul-de-sac : c'est la cause racine déjà payée
 * ici (« une réponse juste sans chemin »). La phrase NOMME les deux gestes, et
 * chacun est un lien.
 */
function BlankWorkspace() {
  const { t } = useTranslation('briefing')
  return (
    <Box className="flex min-w-0 flex-col items-start gap-2">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('activity.blank')}
      </Text>
      <Box className="flex flex-wrap gap-3">
        <Link to="/search" className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2">
          {t('activity.blankSearch')}
        </Link>
        <Link
          to="/settings/mes-donnees"
          search={{ tab: 'imports' }}
          className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2"
        >
          {t('activity.blankImport')}
        </Link>
      </Box>
    </Box>
  )
}

/** Le titre d'un sous-bloc du cockpit. */
function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" weight="medium" className="block text-[var(--bellum-text-secondary)]">
      {children}
    </Text>
  )
}

/**
 * « … » pendant la lecture, « Indisponible » ensuite. Jamais un vide muet.
 *
 * ⚠️ La PHRASE de la panne (« le calcul de capacité n'a pas répondu ») est
 * écrite une seule fois, dans l'entête de l'écran, et pas ici : la répéter sous
 * le titre du bloc dirait deux fois la même chose au même endroit — le
 * quatrième « ce qui n'apparaît pas deux fois » du tome 7. Le titre du bloc dit
 * lequel, l'entête dit quoi. Et « Indisponible » est déjà le mot du brief pour
 * ça (`state.unavailable`), sur les trois autres blocs de l'écran.
 */
function BlockNotice({ state }: { state: SourceState }) {
  const { t } = useTranslation('briefing')
  return (
    <Text size="sm" className="block text-[var(--bellum-text-muted)]">
      {state === 'loading' ? t('activity.loading') : t('state.unavailable')}
    </Text>
  )
}

/* ── Bloc 2 — mon chiffre d'affaires ──────────────────────────────────────── */

type RevenueLineView = {
  kind: string
  amountCents: number | null
  withoutAmount: number
  unavailableReason: string | null
}

/**
 * Les QUATRE chiffres, dans l'ordre du contrat, jamais additionnés.
 *
 * ⚠️ Le MOIS est écrit, et il le fallait. Sans `?month=`, l'API rend le mois
 * PRÉCÉDENT (`finance.controller.ts:90`, `previousMonth()`) : le bloc annonçait
 * « Produit ce mois » au-dessus du chiffre du mois d'avant, c'est-à-dire la
 * seule chose pire qu'un chiffre absent — un chiffre juste sur la mauvaise
 * période. Le mois vient de la réponse (`periodMonth`), pas de l'horloge du
 * navigateur : le déduire ici le ferait diverger le 1er du mois.
 */
function RevenueBlock({
  lines,
  periodMonth,
  state,
}: {
  lines: RevenueLineView[] | undefined
  periodMonth: string | undefined
  state: SourceState
}) {
  const { t, i18n } = useTranslation('briefing')
  const month = periodMonth
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${periodMonth.slice(0, 7)}-01T12:00:00Z`),
      )
    : null
  return (
    <Box className="flex min-w-0 flex-col gap-2">
      <BlockTitle>{month ? t('activity.revenue.titleMonth', { month }) : t('activity.revenue.title')}</BlockTitle>
      {state !== 'ready' || !lines ? (
        <BlockNotice state={state} />
      ) : (
        <Box className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {lines.map(line => (
            <Box key={line.kind} className="min-w-0 rounded-md border border-[var(--bellum-border)] p-2.5">
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {t(`activity.revenue.${line.kind}`)}
              </Text>
              <Text size="lg" weight="semibold" className="mt-0.5 block">
                {line.amountCents === null ? t('activity.unmeasured') : formatCents(line.amountCents)}
              </Text>
              <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                {/* `unavailableReason` est une CLÉ, pas une phrase : la rendre
                    telle quelle afficherait « no_source » en anglais au milieu
                    d'un écran français. Le `defaultValue` protège une clé
                    future. */}
                {line.amountCents === null
                  ? t(`activity.revenue.reasons.${line.unavailableReason}`, {
                      defaultValue: t('activity.revenue.reasons.unavailable'),
                    })
                  : line.withoutAmount > 0
                    ? t('activity.revenue.floor', { count: line.withoutAmount })
                    : ''}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

/* ── Bloc 4 — ce qu'il reste à vendre ─────────────────────────────────────── */

function CapacityBlock({
  window,
  state,
}: {
  window: { sellableDays: number | null; unmeasuredMonths: number; months: string[] }
  state: SourceState
}) {
  const { t } = useTranslation('briefing')
  return (
    <Box className="flex min-w-0 flex-col gap-1">
      <BlockTitle>{t('activity.capacity.title', { count: CAPACITY_HORIZON_MONTHS })}</BlockTitle>
      {state !== 'ready' ? (
        <BlockNotice state={state} />
      ) : (
        <>
          <Text size="lg" weight="semibold" className="block">
            {/* ⚠️ JAMAIS « 0 jour à vendre » quand on ne sait pas : ça se lit
                « tout le monde est staffé », alors que ça veut dire « je ne sais
                pas ». Deux conclusions opposées sur la même case vide. */}
            {window.sellableDays === null
              ? t('activity.unmeasured')
              : t('activity.capacity.days', { count: window.sellableDays })}
          </Text>
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {window.sellableDays === null
              ? t('activity.capacity.unmeasured', { count: window.unmeasuredMonths })
              : t('activity.capacity.scope')}
          </Text>
        </>
      )}
    </Box>
  )
}

/* ── Bloc 5 — ce qui m'attend ─────────────────────────────────────────────── */
// #2567.K2 (18/09/2026) — DÉPLACÉ vers `DailyGesturesBlock.tsx`. La file
// d'interventions, son ordre et ses liens sont inchangés (`myQueue`,
// `interventionHref`, `../cockpit`) : seul l'écran qui l'affiche a changé.
