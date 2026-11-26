import type { CampaignAudienceRequest, CampaignAudienceResult } from '@bellum/contracts'
import { Box, Button, Checkbox, SelectField, Text } from '@bellum/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { campaignAudienceApi } from '../api'

type AudienceSourceKind =
  'workspace_contacts' | 'crm' | 'import' | 'dormant_accounts' | 'partners' | 'event_participants' | 'need'
const SOURCE_KINDS: readonly AudienceSourceKind[] = [
  'workspace_contacts',
  'crm',
  'import',
  'dormant_accounts',
  'partners',
  'event_participants',
  'need',
]
const CAP_NONE = 'none'
type AudienceChannelChoice = 'any' | 'email' | 'phone'

/** Ce que la fenêtre de création reçoit — le sous-ensemble qu'elle consomme. */
type PreparedContact = {
  id: string
  full_name: string
  title: string | null
  email: string | null
  assigned_to: string | null
}

const PREVIEW_COUNTERS = [
  'total',
  'eligible',
  'missing_coordinates',
  'unverified_identity',
  'already_in_sequence',
  'already_contacted',
  'duplicates',
  'other_owner',
  'excluded_accounts',
  'left_contacts',
  'team_collisions',
  'personal_contacts',
] as const

const ALWAYS_SHOWN_COUNTERS: ReadonlySet<(typeof PREVIEW_COUNTERS)[number]> = new Set(['total', 'eligible'])

/**
 * Épopée #2974 (lot V39) — LE CONSTRUCTEUR D'AUDIENCE, à l'écran.
 *
 * Choisir une source et des filtres, PRÉVISUALISER (le serveur juge, par le
 * contrat `buildCampaignAudience`), puis remettre la liste éligible à la
 * fenêtre de création — où chaque séquence reste celle d'UNE personne
 * (doctrine c74). Les doublons sont PROPOSÉS, jamais fusionnés ; un contact
 * déjà en séquence active est signalé et exclu par défaut ; un effacement
 * RGPD ne se nomme pas. Rien n'est lu avant le clic.
 */
export function AudienceBuilderBlock({ onPrepare }: { onPrepare: (contacts: PreparedContact[]) => void }) {
  const { t, i18n } = useTranslation('outreach')
  const [source, setSource] = useState<AudienceSourceKind>('workspace_contacts')
  const [channel, setChannel] = useState<AudienceChannelChoice>('any')
  // #2380.53 / #2380.54 / #2380.56 — plafonds de fréquence : « none » = aucun plafond, jamais 0.
  const [capAccount, setCapAccount] = useState<string>(CAP_NONE)
  const [capDay, setCapDay] = useState<string>(CAP_NONE)
  const [capContact, setCapContact] = useState<string>(CAP_NONE)
  // #2380.55 — plafond par canal.
  const [capChannel, setCapChannel] = useState<string>(CAP_NONE)
  const [includeCollisions, setIncludeCollisions] = useState(false)
  // #2380.11 — rien n'est lu tant que la source « événement » n'est pas choisie.
  const [eventId, setEventId] = useState<string | null>(null)
  const isEventSource = source === 'event_participants'
  const events = useQuery({
    queryKey: ['outreach', 'audience', 'events'],
    queryFn: () => campaignAudienceApi.events(),
    enabled: isEventSource,
  })
  const eventList = events.data ?? []
  const activeEventId = eventList.some(event => event.activity_id === eventId)
    ? eventId
    : (eventList[0]?.activity_id ?? null)
  const noEventToTarget = isEventSource && events.isSuccess && eventList.length === 0
  // #2202.15 — la source « besoin » : rien n'est lu tant qu'elle n'est pas choisie.
  const [needId, setNeedId] = useState<string | null>(null)
  const isNeedSource = source === 'need'
  const needs = useQuery({
    queryKey: ['outreach', 'audience', 'needs'],
    queryFn: () => campaignAudienceApi.needs(),
    enabled: isNeedSource,
  })
  const needList = needs.data ?? []
  const activeNeedId = needList.some(need => need.need_id === needId) ? needId : (needList[0]?.need_id ?? null)
  const noNeedToTarget = isNeedSource && needs.isSuccess && needList.length === 0
  const preview = useMutation<CampaignAudienceResult, Error, CampaignAudienceRequest>({
    mutationFn: body => campaignAudienceApi.preview(body),
  })
  const result = preview.data

  const run = () =>
    preview.mutate({
      source:
        source === 'event_participants' && activeEventId
          ? { kind: 'event_participants', activity_id: activeEventId }
          : source === 'need' && activeNeedId
            ? { kind: 'need', need_id: activeNeedId }
            : { kind: source === 'event_participants' || source === 'need' ? 'workspace_contacts' : source },
      filters: {
        ...(channel === 'any' ? {} : { channel }),
        ...(capAccount === CAP_NONE ? {} : { max_per_account: Number(capAccount) }),
        ...(capDay === CAP_NONE ? {} : { max_per_day: Number(capDay) }),
        ...(capContact === CAP_NONE ? {} : { max_per_contact: Number(capContact) }),
        ...(capChannel === CAP_NONE ? {} : { max_per_channel: Number(capChannel) }),
      },
      include_collisions: includeCollisions,
    })

  const nameOf = (id: string) => result?.eligible.find(entry => entry.contact_id === id)?.full_name ?? null

  return (
    <Box className="rounded-lg border border-[var(--bellum-border)] p-4">
      <Box className="flex items-center gap-2">
        <Users className="size-4" aria-hidden="true" />
        <Text element="h2" size="sm" weight="medium">
          {t('audienceBuilder.title')}
        </Text>
      </Box>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5 block">
        {t('audienceBuilder.subtitle')}
      </Text>

      <Box className="mt-3 flex flex-wrap items-center gap-3">
        <SelectField
          ariaLabel={t('audienceBuilder.sourceLabel')}
          value={source}
          onChange={next => setSource(next as AudienceSourceKind)}
          options={SOURCE_KINDS.map(value => ({ value, label: t(`audienceBuilder.source.${value}`) }))}
        />
        {isEventSource && eventList.length > 0 ? (
          <SelectField
            ariaLabel={t('audienceBuilder.eventLabel')}
            value={activeEventId ?? ''}
            onChange={setEventId}
            options={eventList.map(event => ({
              value: event.activity_id,
              label: t('audienceBuilder.eventOption', {
                subject: event.subject ?? t(`audienceBuilder.eventKind.${event.kind}`, { defaultValue: event.kind }),
                date: new Date(event.occurred_at).toLocaleDateString(i18n.language),
                count: event.participant_count,
              }),
            }))}
          />
        ) : null}
        {isNeedSource && needList.length > 0 ? (
          <SelectField
            ariaLabel={t('audienceBuilder.needLabel')}
            value={activeNeedId ?? ''}
            onChange={setNeedId}
            options={needList.map(need => ({
              value: need.need_id,
              label: t('audienceBuilder.needOption', { title: need.title, count: need.contact_count }),
            }))}
          />
        ) : null}
        <SelectField
          ariaLabel={t('audienceBuilder.capAccountLabel')}
          value={capAccount}
          onChange={setCapAccount}
          options={[CAP_NONE, '1', '2', '3'].map(value => ({ value, label: t(`audienceBuilder.capAccount.${value}`) }))}
        />
        <SelectField
          ariaLabel={t('audienceBuilder.capDayLabel')}
          value={capDay}
          onChange={setCapDay}
          options={[CAP_NONE, '20', '50'].map(value => ({ value, label: t(`audienceBuilder.capDay.${value}`) }))}
        />
        <SelectField
          ariaLabel={t('audienceBuilder.capContactLabel')}
          value={capContact}
          onChange={setCapContact}
          options={[CAP_NONE, '1', '2', '3'].map(value => ({
            value,
            label: t(`audienceBuilder.capContact.${value}`),
          }))}
        />
        <SelectField
          ariaLabel={t('audienceBuilder.capChannelLabel')}
          value={capChannel}
          onChange={setCapChannel}
          options={[CAP_NONE, '20', '50'].map(value => ({ value, label: t(`audienceBuilder.capChannel.${value}`) }))}
        />
        <SelectField
          ariaLabel={t('audienceBuilder.channelLabel')}
          value={channel}
          onChange={next => setChannel(next as AudienceChannelChoice)}
          options={(['any', 'email', 'phone'] as const).map(value => ({
            value,
            label: t(`audienceBuilder.channel.${value}`),
          }))}
        />
        <label className="flex min-h-11 items-center gap-2">
          <Checkbox checked={includeCollisions} onCheckedChange={checked => setIncludeCollisions(checked === true)} />
          <Text size="sm">{t('audienceBuilder.includeCollisions')}</Text>
        </label>
        <Button
          size="sm"
          className="min-h-11"
          onClick={run}
          disabled={preview.isPending || (isEventSource && !activeEventId) || (isNeedSource && !activeNeedId)}
        >
          {t('audienceBuilder.preview')}
        </Button>
      </Box>

      {noEventToTarget ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2 block">
          {t('audienceBuilder.noEvent')}
        </Text>
      ) : null}
      {noNeedToTarget ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2 block">
          {t('audienceBuilder.noNeed')}
        </Text>
      ) : null}
      {needs.isError && isNeedSource ? (
        <Text size="sm" className="mt-2 block text-[var(--danger-soft-text)]" role="alert">
          {t('audienceBuilder.needError')}
        </Text>
      ) : null}
      {events.isError && isEventSource ? (
        <Text size="sm" className="mt-2 block text-[var(--danger-soft-text)]" role="alert">
          {t('audienceBuilder.eventError')}
        </Text>
      ) : null}

      {preview.isError ? (
        <Text size="sm" className="mt-3 block text-[var(--danger-soft-text)]" role="alert">
          {t('audienceBuilder.error')}
        </Text>
      ) : null}

      {result ? (
        <Box className="mt-4 flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* « Dans la source » et « Éligibles » se lisent toujours ; les neuf autres sont des
                motifs d'écart : un motif sans cas ne fait AUCUNE ligne (recette prod 01/10 :
                douze compteurs dont dix à 0), il se nomme quand il existe. */}
            {PREVIEW_COUNTERS.filter(key => ALWAYS_SHOWN_COUNTERS.has(key) || result.preview[key] > 0).map(key => (
              <div key={key}>
                <dt>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(`audienceBuilder.counter.${key}`)}
                  </Text>
                </dt>
                <dd>
                  <Text size="sm" weight="medium">
                    {result.preview[key]}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>

          {capAccount !== CAP_NONE || capDay !== CAP_NONE || capContact !== CAP_NONE || capChannel !== CAP_NONE ? (
            <Text size="sm">
              {t('audienceBuilder.cappedCounter')} : {result.preview.frequency_capped}
            </Text>
          ) : null}

          {result.eligible.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {result.eligible.map(entry => (
                <li key={entry.contact_id} className="flex flex-wrap items-baseline gap-x-2">
                  <Text size="sm" weight="medium">
                    {entry.full_name}
                  </Text>
                  {entry.account_name ? (
                    <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                      {entry.account_name}
                    </Text>
                  ) : null}
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('audienceBuilder.monoContact')}
                  </Text>
                  {entry.identity_unverified ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('audienceBuilder.flag.identityUnverified')}
                    </Text>
                  ) : null}
                  {entry.owned_by_other ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('audienceBuilder.flag.ownedByOther')}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {result.duplicates.length > 0 ? (
            <Box className="flex flex-col gap-1">
              {result.duplicates.map(group => (
                <Text key={`${group.key}:${group.contact_ids.join(',')}`} size="sm" className="block">
                  {t('audienceBuilder.duplicate', {
                    key: t(`audienceBuilder.duplicateKey.${group.key}`),
                    names: group.contact_ids.map(id => nameOf(id) ?? t('audienceBuilder.unnamed')).join(', '),
                  })}
                </Text>
              ))}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('audienceBuilder.duplicateHint')}
              </Text>
            </Box>
          ) : null}

          {result.excluded.length > 0 ? (
            <Box className="flex flex-col gap-1">
              <Text size="sm" weight="medium">
                {t('audienceBuilder.excludedTitle')}
              </Text>
              <ul className="flex flex-col gap-1">
                {result.excluded.map(entry => (
                  <li key={entry.contact_id} className="flex flex-wrap items-baseline gap-x-2">
                    {entry.full_name ? <Text size="sm">{entry.full_name}</Text> : null}
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t(`audienceBuilder.reason.${entry.reason}`)}
                    </Text>
                    {/* #2380.61 — un arrêt se dit avec son motif, jamais deviné : absent = rien d'écrit. */}
                    {entry.reason === 'opted_out' && entry.stop_reason ? (
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('audienceBuilder.stopReasonLine', {
                          reason: t(`audienceBuilder.stopReason.${entry.stop_reason}`, {
                            defaultValue: entry.stop_reason,
                          }),
                        })}
                      </Text>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}

          {result.eligible.length > 0 ? (
            <Button
              size="sm"
              className="min-h-11 self-start"
              onClick={() =>
                onPrepare(
                  result.eligible.map(entry => ({
                    id: entry.contact_id,
                    full_name: entry.full_name,
                    title: entry.title,
                    email: entry.email,
                    assigned_to: entry.assigned_to,
                  })),
                )
              }
            >
              {t('audienceBuilder.prepare', { count: result.eligible.length })}
            </Button>
          ) : (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('audienceBuilder.noneEligible')}
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  )
}
