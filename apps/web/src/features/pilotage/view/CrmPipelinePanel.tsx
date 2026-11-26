import type { PipelinePeriod, PipelineReport } from '@bellum/contracts'
import { Badge, Button, Card, FilterChips, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api-error'
import {
  connectorFailureIsActionable,
  connectorFailureSpeaksForItself,
  connectorFailureState,
} from '@/lib/connector-failure'
import { useSession } from '@/lib/hooks/use-session'
import { pilotageApi } from '../api'
import { formatRate } from './chain-reading'

const PERIODS: PipelinePeriod[] = ['month', 'quarter', 'year']

/**
 * Le pipeline du CRM, calculé et daté.
 *
 * Trois règles d'affichage, toutes du même côté que le calcul :
 *
 *  - **Un chiffre inconnu se dit inconnu.** `winRate: null` affiche « pas encore
 *    de deal clos », jamais « 0 % ». Un commercial qui lit 0 % conclut qu'il ne
 *    gagne rien, alors que la vérité est que le trimestre vient de commencer.
 *  - **La couverture est visible.** La date de synchronisation et la troncature
 *    sont écrites sous le rapport : un chiffre daté d'hier reste utile, à
 *    condition qu'on sache qu'il date d'hier.
 *  - **Pas de CRM connecté ⇒ l'écran le dit**, plutôt que d'afficher un pipeline
 *    vide qui se lirait « vous n'avez aucune affaire ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS D'ÉCHEC, JAMAIS UN « OU »
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 27/08 : la route répondait 503 avec un corps qui disait
 * TOUT — `code: "scope_missing"`, la capacité, les trois portées manquantes, et
 * une phrase déjà écrite avec le geste à faire. Le CRM ÉTAIT connecté ; il lui
 * manquait trois autorisations. L'écran, lui, affichait « Aucun CRM connecté,
 * **ou** lecture impossible », sans aucun chemin pour agir.
 *
 * Trois situations, trois gestes, et ils ne se ressemblent pas :
 *
 *  - **pas connecté** (412 : la route existe, il manque une CONDITION) — il n'y
 *    a rien à réparer, il y a quelque chose à brancher ;
 *  - **connecté sans le droit de lire** (`scope_missing`) — ne repassera JAMAIS
 *    tout seul : un jeton ne gagne pas une portée après coup. C'est le seul cas
 *    où la phrase vient du SERVEUR : elle nomme les portées, et la réécrire ici
 *    perdrait ce qu'elle a de plus utile ;
 *  - **panne réelle** — « rien n'est perdu, réessaie ». La confondre avec les
 *    deux autres, c'est faire attendre quelqu'un qui devrait cliquer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS CRM, LA CARTE EST COMPACTE — #1435
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Quand aucun CRM n'est connecté, ne pas réserver une énorme carte vide à
 * Pipeline du CRM. »* Le défaut n'était pas le message — il était juste — mais
 * tout ce qui l'entourait : l'écran montait le sous-titre, le sélecteur mois /
 * trimestre / année et le bouton de rafraîchissement AVANT de découvrir qu'il
 * n'avait rien à afficher. Trois commandes qui ne commandent rien, au-dessus
 * d'un vide.
 *
 * La forme compacte ne s'applique qu'aux deux états qui appellent un GESTE
 * ailleurs (pas connecté, portée manquante). Une panne garde ses commandes :
 * c'est précisément là que « réessayer » a un sens.
 */
export function CrmPipelinePanel() {
  const { t, i18n } = useTranslation('pilotage')
  const { user } = useSession()
  const [period, setPeriod] = useState<PipelinePeriod>('quarter')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['crm-pipeline', user?.id, period],
    queryFn: () => pilotageApi.pipeline(period),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  })

  // #1435 — « rien à brancher » n'est pas « rien à afficher » : c'est un état
  // qui tient en deux lignes, et il ne réserve pas la place d'un graphe.
  const unplugged = isError && connectorFailureIsActionable(connectorFailureState(error))
  if (unplugged) {
    return (
      <Card className="mt-6 p-4">
        <Text size="sm" weight="semibold">
          {t('pipeline.title')}
        </Text>
        <PipelineUnavailable error={error} />
      </Card>
    )
  }

  const money = (value: number): string =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Text size="sm" weight="semibold">
            {t('pipeline.title')}
          </Text>
          <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('pipeline.subtitle')}
          </Text>
        </div>
        <div className="flex items-center gap-1.5">
          <FilterChips
            size="sm"
            ariaLabel={t('pipeline.periodAria')}
            options={PERIODS.map(value => ({ value, label: t(`pipeline.period.${value}`) }))}
            value={period}
            onChange={next => next && setPeriod(next)}
          />
          <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('pipeline.loading')}
        </Text>
      ) : isError || !data ? (
        <PipelineUnavailable error={error} />
      ) : (
        <PipelineBody report={data} money={money} />
      )}
    </Card>
  )
}

/** L'écran de l'ÉCRAN qui répare — le seul de l'app où l'utilisateur autorise
 *  lui-même l'accès, et donc le seul où nommer l'outil a un sens. */
const INTEGRATIONS_ROUTE = '/integrations'

/**
 * Ce que l'écran dit — et propose — quand la lecture n'a pas abouti.
 *
 * ⚠️ Le corps d'erreur porte `provider` (« hubspot »). Il n'arrive jamais ici :
 * `ApiError` ne transporte que `status`, `code` et `message`. L'app nomme la
 * CAPACITÉ (« ton CRM »), pas l'éditeur — et une garde de ce fichier vérifie que
 * personne ne rebranche le champ.
 *
 * ⚠️ #1836 — la DÉRIVATION (« lequel des échecs ? ») vivait ici, et à
 * l'identique dans trois autres écrans de connecteur. Quatre copies d'une même
 * question, donc quatre endroits où ajouter un cas : le jour où le serveur a su
 * dire « la connexion existe et elle est MORTE », un seul l'aurait appris. Elle
 * vit dans `@/lib/connector-failure` ; cet écran ne décide que de ses MOTS.
 */
function PipelineUnavailable({ error }: { error: unknown }) {
  const { t } = useTranslation('pilotage')
  const failure = error instanceof ApiError ? error : null
  const state = connectorFailureState(error)

  // La phrase du serveur telle quelle : elle nomme les portées manquantes et la
  // capacité dont l'autorisation est morte — deux choses que le navigateur ne
  // connaît pas. Le repli couvre un corps sans `message` — le contrat l'impose,
  // mais un écran muet se lit comme un bug d'affichage.
  //
  // #1836 — `authorization_expired` rejoint ce camp-là, et c'est TOUT le sujet :
  // il tombait dans « panne », donc l'écran disait « réessaie » et retirait le
  // chemin de réparation devant une connexion morte qui ne revient jamais seule.
  const message = connectorFailureSpeaksForItself(state)
    ? failure?.message?.trim() ||
      (state === 'scope_missing' ? t('pipeline.scopeMissing') : t('pipeline.authorizationExpired'))
    : state === 'not_connected'
      ? t('pipeline.notConnected')
      : t('pipeline.failed')

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {message}
      </Text>
      {/* Une réponse juste sans chemin est le motif dominant de ce chantier. Une
          PANNE, elle, ne se répare pas dans Intégrations : pas de faux chemin. */}
      {connectorFailureIsActionable(state) ? (
        <Link
          to={INTEGRATIONS_ROUTE}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('pipeline.openIntegrations')}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}

function PipelineBody({ report, money }: { report: PipelineReport; money: (value: number) => string }) {
  const { t, i18n } = useTranslation('pilotage')
  const decided = report.closed.won + report.closed.lost

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('pipeline.open')} value={String(report.open.deals)} hint={money(report.open.amount)} />
        <Stat
          label={t('pipeline.won')}
          value={String(report.closed.won)}
          hint={money(report.closed.wonAmount)}
          tone="success"
        />
        <Stat
          label={t('pipeline.winRate')}
          // `null` ⇒ on écrit pourquoi, on n'écrit pas « 0 % ». Et un taux non
          // nul qui s'arrondirait à zéro s'écrit « < 1 % » : ce panneau formatait
          // son pourcentage à la main, comme deux autres écrans du pilotage, et
          // aucun des trois ne traitait ce cas-là (`chain-reading.ts`).
          value={report.winRate == null ? t('pipeline.noClosedDeal') : formatRate(report.winRate, t)}
          hint={report.winRate == null ? undefined : t('pipeline.onDecided', { count: decided })}
        />
        <Stat
          label={t('pipeline.cycle')}
          value={
            report.averageCycleDays == null
              ? t('pipeline.notMeasurable')
              : t('pipeline.days', { count: report.averageCycleDays })
          }
          hint={report.cycleUnmeasured > 0 ? t('pipeline.cycleExcluded', { count: report.cycleUnmeasured }) : undefined}
        />
      </div>

      {report.open.byStage.length > 0 && (
        <div className="mt-4">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('pipeline.byStage')}
          </Text>
          <dl className="mt-2 flex flex-col gap-1">
            {report.open.byStage.map(stage => (
              <div key={stage.stage} className="flex items-center justify-between gap-2">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {stage.label ?? stage.stage}
                </Text>
                <Text size="xs" weight="medium">
                  {t('pipeline.dealsCount', { count: stage.deals })}
                  {stage.amount > 0 ? ` · ${money(stage.amount)}` : ''}
                  {/* Les montants absents sont dits, pas fondus dans le total. */}
                  {stage.amountUnknown > 0 ? ` · ${t('pipeline.amountUnknown', { count: stage.amountUnknown })}` : ''}
                </Text>
              </div>
            ))}
          </dl>
        </div>
      )}

      {report.closed.outcomeUnknown > 0 && (
        <Badge variant="outline" className="mt-3">
          {t('pipeline.outcomeUnknown', { count: report.closed.outcomeUnknown })}
        </Badge>
      )}

      <Text size="xs" className="mt-4 text-[var(--bellum-text-muted)]">
        {report.coverage.syncedAt
          ? t('pipeline.coverage', {
              count: report.coverage.dealsRead,
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(report.coverage.syncedAt),
              ),
            })
          : t('pipeline.neverSynced')}
        {report.coverage.truncated ? ` · ${t('pipeline.truncated')}` : ''}
      </Text>
    </>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'success' }) {
  return (
    <div className="rounded-md border border-[var(--bellum-border)] p-3">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text
        size="sm"
        weight="semibold"
        className={tone === 'success' ? 'mt-1 text-[var(--success-soft-text)]' : 'mt-1'}
      >
        {value}
      </Text>
      {hint ? (
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}
