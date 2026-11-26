import {
  ROUTINE_ACTION_LEVEL,
  ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS,
  ROUTINE_SELECTABLE_STATUSES,
  type NoReplyFollowUpDryRun,
  type RoutineAutonomy,
  type RoutineChannel,
  type RoutineView,
} from '@bellum/contracts'
import { Badge, Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useUpdateRoutine } from '../api'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const MAX_ITEMS_PER_RUN_OPTIONS = Array.from(
  { length: ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max - ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min + 1 },
  (_, i) => ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min + i,
)

/**
 * LES RÉGLAGES D'UNE ROUTINE — UN formulaire générique, pas un par routine
 * (c75). Monté à deux endroits qui portent la MÊME routine : la carte de la
 * bibliothèque et sa fiche `/settings/routines/:key` (#2843, #2398.11).
 * Un réglage ne se redéfinit pas à chaque endroit (GA-26) : les deux écrans
 * rendent ces composants, aucun ne recopie un sélecteur.
 */

/**
 * #2398.14 — NO-GO « activer sans montrer sources, autonomie et condition
 * d'arrêt ». Passer une routine à `active` ne part plus au premier clic : la
 * porte montre d'abord ce qu'elle LIT, ce qu'elle a le droit de faire, quand
 * elle se déclenche, ce qui l'arrête, puis attend un geste explicite. Aucune
 * autre transition (pause, désactivation) n'est freinée : se retirer ne doit
 * jamais demander confirmation.
 */
export function RoutineStatusControl({ view }: { view: RoutineView }) {
  const { t, i18n } = useTranslation('routines')
  const update = useUpdateRoutine()
  const [pending, setPending] = useState(false)
  const { definition, subscription, blockers } = view
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const blocked = blockers.length > 0

  return (
    <Box className="flex flex-col items-end gap-2">
      {/* #2398.7 — six statuts nommés côté contrat, trois réglables ici
          (`ROUTINE_SELECTABLE_STATUSES`) : les autres n'ont encore aucun
          mécanisme qui les produise. #2399.8/.9 — bloquée, elle ne s'active
          plus pour rien. */}
      <Select
        value={subscription.status}
        disabled={update.isPending || blocked}
        onValueChange={status => {
          if (status === 'active' && subscription.status !== 'active') {
            setPending(true)
            return
          }
          setPending(false)
          update.mutate({
            key: definition.key,
            patch: { status: status as (typeof ROUTINE_SELECTABLE_STATUSES)[number] },
          })
        }}
      >
        <SelectTrigger aria-label={definition.name[locale]} className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* #2843.9 — `error` est désormais PRODUIT (trois échecs de suite) : il
              s'affiche tel quel, non choisissable ; « Active » le fait sortir. */}
          {ROUTINE_SELECTABLE_STATUSES.includes(
            subscription.status as (typeof ROUTINE_SELECTABLE_STATUSES)[number],
          ) ? null : (
            <SelectItem value={subscription.status} disabled>
              {t(`status.${subscription.status}`)}
            </SelectItem>
          )}
          {ROUTINE_SELECTABLE_STATUSES.map(status => (
            <SelectItem key={status} value={status}>
              {t(`status.${status}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending ? (
        <RoutineActivationPreview
          view={view}
          busy={update.isPending}
          onCancel={() => setPending(false)}
          onConfirm={() => {
            update.mutate({ key: definition.key, patch: { status: 'active' } })
            setPending(false)
          }}
        />
      ) : null}
    </Box>
  )
}

/**
 * #2398.13/#2398.14/#2399.5 — CE QUE L'ACTIVATION CHANGERAIT, avant qu'elle
 * ait lieu. Tout vient du catalogue et de l'abonnement réels : rien n'est
 * simulé ni inventé ici. La simulation sur les données du compte (« aurait
 * préparé X relances ») n'existe que pour `no_reply_follow_up` — le reste de
 * la porte le dit plutôt que de laisser croire que toutes se simulent.
 */
function RoutineActivationPreview({
  view,
  busy,
  onConfirm,
  onCancel,
}: {
  view: RoutineView
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation('routines')
  const { definition, subscription } = view
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const schedule =
    definition.cadence === 'continuous'
      ? t('cadence.continuous')
      : `${t(`cadence.${definition.cadence}`)} · ${t('field.at', { hour: subscription.hour })}`

  return (
    <Box
      role="group"
      aria-label={t('activation.title')}
      className="flex w-full max-w-md flex-col gap-1.5 rounded-lg border border-[var(--bellum-border)] p-3 text-left"
    >
      <Text size="sm" weight="medium">
        {t('activation.title')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.reads', { reads: definition.reads[locale] })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('actions:actionLevel.current', {
          level: t(`actions:actionLevel.levels.${ROUTINE_ACTION_LEVEL[definition.automationLevel]}`),
        })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.condition', { condition: definition.condition[locale] })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('activation.schedule', { schedule, channel: t(`channel.${subscription.channel}`) })}
      </Text>
      {/* #2398.14 — « ce qui l'arrête » est la CONDITION D'ARRÊT (`stopCondition`), pas le repli : le
          gate affichait `fallback` sous ce libellé. Le repli reste dit, sous son propre nom. `null` =
          aucune ligne (GA-18/GA-19). */}
      {definition.stopCondition ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('field.stopCondition', { stopCondition: definition.stopCondition[locale] })}
        </Text>
      ) : null}
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.fallback', { fallback: definition.fallback[locale] })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {definition.key === 'no_reply_follow_up' ? t('activation.simulateHint') : t('activation.noSimulation')}
      </Text>
      <Box className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={onConfirm}>
          {t('activation.confirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('activation.cancel')}
        </Button>
      </Box>
    </Box>
  )
}

/** Heure, jour et canal : les mêmes sélecteurs sur la carte et sur la fiche. */
export function RoutineScheduleControls({ view }: { view: RoutineView }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const { definition, subscription } = view

  return (
    <>
      {/* Une routine CONTINUE n'a pas d'heure : elle suit les objets, pas
          l'horloge. Afficher un sélecteur inopérant ferait croire à un réglage. */}
      <Box className={definition.cadence === 'continuous' ? 'hidden' : 'flex items-center gap-2'}>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('field.hour')}
        </Text>
        <Select
          value={String(subscription.hour)}
          onValueChange={value => update.mutate({ key: definition.key, patch: { hour: Number(value) } })}
        >
          <SelectTrigger className="h-8 w-24" aria-label={t('field.hour')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map(hour => (
              <SelectItem key={hour} value={String(hour)}>
                {t('field.at', { hour })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      {definition.cadence === 'weekly' ? (
        <Box className="flex items-center gap-2">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('field.weekday')}
          </Text>
          <Select
            value={String(subscription.weekday ?? 5)}
            onValueChange={value => update.mutate({ key: definition.key, patch: { weekday: Number(value) } })}
          >
            <SelectTrigger className="h-8 w-32" aria-label={t('field.weekday')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map(day => (
                <SelectItem key={day} value={String(day)}>
                  {t(`weekday.${day}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>
      ) : null}

      {/* #2205.21/.37 — le CANAL (in_app/email) est patchable côté API. */}
      <Box className="flex items-center gap-2">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('field.channel')}
        </Text>
        <Select
          value={subscription.channel}
          onValueChange={value => update.mutate({ key: definition.key, patch: { channel: value as RoutineChannel } })}
        >
          <SelectTrigger className="h-8 w-40" aria-label={t('field.channel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_app">{t('channel.in_app')}</SelectItem>
            <SelectItem value="email">{t('channel.email')}</SelectItem>
          </SelectContent>
        </Select>
      </Box>
    </>
  )
}

/**
 * #2843 (#2205.45) — LE PLAFOND DE DESTINATAIRES, distinct de la cible
 * calculée. Réglable UNIQUEMENT pour `no_reply_follow_up` — la seule routine
 * où le calcul de la cible est déjà séparé de l'écriture (voir
 * `RoutineExecutors.noReplyFollowUp`). Mêmes deux montages que
 * `RoutineScheduleControls` (carte de liste, fiche) — un réglage ne se
 * redéfinit pas à chaque endroit (GA-26).
 */
export function RoutineMaxItemsPerRunControl({ view }: { view: RoutineView }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const { definition, subscription } = view

  if (definition.key !== 'no_reply_follow_up') return null

  return (
    <Box className="flex items-center gap-2">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.maxItemsPerRun')}
      </Text>
      <Select
        value={String(subscription.maxItemsPerRun ?? ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min)}
        onValueChange={value => update.mutate({ key: definition.key, patch: { maxItemsPerRun: Number(value) } })}
      >
        <SelectTrigger className="h-8 w-36" aria-label={t('field.maxItemsPerRun')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MAX_ITEMS_PER_RUN_OPTIONS.map(count => (
            <SelectItem key={count} value={String(count)}>
              {t('field.maxItemsPerRunOption', { count })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Box>
  )
}

/**
 * #2843.13 — AUTONOMIE, PORTÉE, OWNER, VALIDATIONS : mêmes deux montages que
 * `RoutineScheduleControls` (carte, fiche), un seul formulaire (c75, GA-26).
 *
 * - Autonomie : le niveau du catalogue ou `n0_inform` (garde le résultat sans
 *   notifier) — jamais au-dessus du catalogue. Revenir au catalogue écrit `null`.
 * - Owner : réglable seulement quand la routine lit l'ESPACE ; une routine qui lit
 *   ta boîte ou ton agenda reste à toi, et le dit.
 * - Portée et validations : nommées depuis le catalogue (ce que la routine lit, et
 *   les gestes qu'elle attend toujours) — rien n'écrit tout seul.
 * Aucun coût ni crédit ici (c132) : le budget de la fiche ne se lit qu'au back-office.
 */
export function RoutineGovernanceControls({ view }: { view: RoutineView }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const { definition, subscription } = view
  const levels: RoutineAutonomy[] = ['n0_inform', definition.automationLevel]
  const autonomy = subscription.autonomy ?? definition.automationLevel

  return (
    <>
      <Box className="flex items-center gap-2">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('field.autonomy')}
        </Text>
        <Select
          value={autonomy}
          disabled={update.isPending}
          onValueChange={value =>
            update.mutate({
              key: definition.key,
              patch: { autonomy: value === definition.automationLevel ? null : (value as RoutineAutonomy) },
            })
          }
        >
          <SelectTrigger className="h-8 w-56" aria-label={t('field.autonomy')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levels.map(level => (
              <SelectItem key={level} value={level}>
                {t(`level.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>
      {definition.scope === 'workspace' ? (
        <RoutineOwnerControl view={view} />
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('field.ownerSelf')}
        </Text>
      )}
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t(`scope.${definition.scope}`)}
      </Text>
      {definition.validations.map(validation => (
        <Text key={validation} size="xs" className="text-[var(--bellum-text-secondary)]">
          {t(`validation.${validation}`)}
        </Text>
      ))}
    </>
  )
}

const SELF_OWNER = 'self'

function RoutineOwnerControl({ view }: { view: RoutineView }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const members = useWorkspaceMembers()
  const { definition, subscription } = view
  const others = (members.data ?? []).filter(member => !member.isSelf)

  return (
    <Box className="flex items-center gap-2">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.owner')}
      </Text>
      <Select
        value={subscription.ownerUserId ?? SELF_OWNER}
        disabled={update.isPending}
        onValueChange={value =>
          update.mutate({ key: definition.key, patch: { ownerUserId: value === SELF_OWNER ? null : value } })
        }
      >
        <SelectTrigger className="h-8 w-48" aria-label={t('field.owner')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SELF_OWNER}>{t('owner.self')}</SelectItem>
          {others.map(member => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.fullName ?? member.email ?? member.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Box>
  )
}

/** Le résultat de la simulation `no_reply_follow_up` — ZÉRO écriture, ZÉRO appel modèle. */
export function RoutineDryRunResult({
  query,
}: {
  query: { isLoading: boolean; isError: boolean; data?: NoReplyFollowUpDryRun }
}) {
  const { t } = useTranslation('routines')
  const { data } = query
  return (
    <Box className="flex flex-col gap-1.5 border-t border-[var(--bellum-border)] pt-3">
      {query.isLoading ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dryRun.loading')}
        </Text>
      ) : query.isError || !data ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dryRun.error')}
        </Text>
      ) : data.threadsFound === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dryRun.empty')}
        </Text>
      ) : (
        <>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('dryRun.summary', { count: data.threadsFound })}
          </Text>
          <Box className="flex flex-wrap items-center gap-2">
            <Badge variant={data.wouldPrepareDraft ? 'success' : 'outline'} className="text-xs">
              {data.wouldPrepareDraft ? t('dryRun.would') : t(`dryRun.reasons.${data.blockedReason ?? 'no_thread'}`)}
            </Badge>
            {data.oldest?.counterpart ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {data.oldest.counterpart}
                {data.oldest.daysSinceLastMessage !== null
                  ? ` · ${t('dryRun.silentFor', { days: data.oldest.daysSinceLastMessage })}`
                  : null}
              </Text>
            ) : null}
          </Box>
        </>
      )}
    </Box>
  )
}
