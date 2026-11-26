import {
  WORKSPACE_DELEGATION_SCOPES,
  delegationLifecycle,
  type OutreachDelegationView,
  type WorkspaceDelegationScope,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMailboxStatus } from '@/features/mailbox/api'
import { formatDate } from '@/lib/locale'
import {
  useDelegationAction,
  useOutreachDelegations,
  useRenewMandate,
  useSignScopedMandate,
} from '../hooks/useOutreachDelegations'

/**
 * #4016 L5 — les bornes proposées à la signature. Elles restent sous le PLANCHER
 * des plans (`SEND_BOUNDS_FLOOR` : 30 jours, 200 envois) ; le serveur refuse et
 * NOMME tout dépassement de l'offre, il n'écrête jamais.
 */
const PROPOSED = { days: 14, max: 30, start: 9, end: 18 } as const

/** Le mandat le plus récent et NON révoqué d'une portée — celui que la porte du dispatcher lit. */
export function currentMandate(
  delegations: readonly OutreachDelegationView[],
  scope: WorkspaceDelegationScope,
): OutreachDelegationView | null {
  const ofScope = delegations
    .filter(d => d.scope === scope && !d.revoked_at)
    .sort((a, b) => Date.parse(b.validated_at) - Date.parse(a.validated_at))
  return ofScope[0] ?? null
}

/**
 * #4016 L5 — DÉCISION LOUIS 11/10/2026 : « tout ok mais faut un go vérifié
 * avant ». Un envoi automatique est possible pour quatre usages d'espace, mais
 * chacun exige SON mandat, SIGNÉ ici par le commercial (case à cocher, jamais
 * pré-cochée), borné, révocable, renouvelable par re-signature (#4016.4 — dit à
 * l'écran dans `mandates.intro`, pas seulement porté par le bouton). Sans mandat, la
 * ligne le DIT : chaque message attend la validation, comme avant.
 */
export function MandateScopesBlock({ canSend }: { canSend: boolean }) {
  const { t } = useTranslation('outreach')
  const { data: delegations = [] } = useOutreachDelegations()
  const action = useDelegationAction()
  const [signing, setSigning] = useState<{ scope: WorkspaceDelegationScope; renewOf: string | null } | null>(null)

  return (
    <Box className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {t('mandates.title')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {canSend ? t('mandates.intro') : t('mandates.noMailbox')}
      </Text>
      {/* #4016.L5 — la raison ne reste pas un texte : elle porte le geste qui la lève. */}
      {canSend ? null : (
        <Link
          to="/integrations"
          className="w-fit text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
        >
          {t('mandates.connectMailbox')}
        </Link>
      )}
      <Box className="flex flex-col gap-2">
        {WORKSPACE_DELEGATION_SCOPES.map(scope => {
          const mandate = currentMandate(delegations, scope)
          const lifecycle = mandate ? delegationLifecycle(mandate, new Date()) : null
          const live = lifecycle === 'active' || lifecycle === 'paused' || lifecycle === 'not_started'
          return (
            <Box
              key={scope}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] p-3"
            >
              <Box className="flex min-w-0 flex-col gap-0.5">
                <Box className="flex items-center gap-2">
                  <Text size="sm" weight="medium">
                    {t(`mandates.scope.${scope}`)}
                  </Text>
                  {lifecycle ? (
                    <Badge variant={lifecycle === 'active' ? 'success' : live ? 'warning' : 'outline'}>
                      {t(`mandates.status.${lifecycle}`, { date: formatDate(mandate?.expires_at ?? '') })}
                    </Badge>
                  ) : null}
                </Box>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {mandate
                    ? t('mandates.sent', { sent: mandate.sent_count, max: mandate.max_messages })
                    : t('mandates.status.none')}
                </Text>
                {/* #4293.2 (#3702.3) — en pause, aucun envoi ; la reprise ne demande pas de re-signer. */}
                {lifecycle === 'paused' ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('mandates.pausedHint')}
                  </Text>
                ) : null}
              </Box>
              <Box className="flex gap-2">
                {!mandate ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canSend}
                    onClick={() => setSigning({ scope, renewOf: null })}
                  >
                    {t('mandates.sign')}
                  </Button>
                ) : null}
                {mandate && !live ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canSend}
                    onClick={() => setSigning({ scope, renewOf: mandate.id })}
                  >
                    {t('mandates.renew')}
                  </Button>
                ) : null}
                {mandate && lifecycle === 'active' ? (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ id: mandate.id, action: 'pause' })}>
                    {t('mandates.pause')}
                  </Button>
                ) : null}
                {mandate && lifecycle === 'paused' ? (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ id: mandate.id, action: 'resume' })}>
                    {t('mandates.resume')}
                  </Button>
                ) : null}
                {mandate && live ? (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ id: mandate.id, action: 'revoke' })}>
                    {t('mandates.revoke')}
                  </Button>
                ) : null}
              </Box>
            </Box>
          )
        })}
      </Box>
      {signing ? (
        <SignMandateDialog scope={signing.scope} renewOf={signing.renewOf} onClose={() => setSigning(null)} />
      ) : null}
    </Box>
  )
}

/** La signature : une case à cocher explicite, jamais pré-cochée ; rien ne part depuis cette fenêtre. */
function SignMandateDialog({
  scope,
  renewOf,
  onClose,
}: {
  scope: WorkspaceDelegationScope
  renewOf: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('outreach')
  const { data: mailbox } = useMailboxStatus()
  const sign = useSignScopedMandate()
  const renew = useRenewMandate()
  const [signed, setSigned] = useState(false)
  const address = mailbox?.connected ? (mailbox.address ?? '') : ''
  const pending = sign.isPending || renew.isPending

  const submit = () => {
    if (!signed) return
    if (renewOf) {
      renew.mutate({ id: renewOf, body: { duration_days: PROPOSED.days, signed: true } }, { onSuccess: onClose })
      return
    }
    sign.mutate(
      {
        scope,
        campaign_label: t(`mandates.scope.${scope}`),
        contact_ids: [],
        channels: ['email'],
        sender_mailbox_id: address,
        window: { start_hour: PROPOSED.start, end_hour: PROPOSED.end },
        duration_days: PROPOSED.days,
        max_messages: PROPOSED.max,
        signed: true,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('mandates.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('mandates.dialog.description', { scope: t(`mandates.scope.${scope}`) })}
          </DialogDescription>
        </DialogHeader>
        <Text size="sm">
          {t('mandates.dialog.bounds', {
            days: PROPOSED.days,
            max: PROPOSED.max,
            start: PROPOSED.start,
            end: PROPOSED.end,
          })}
        </Text>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={signed}
            onCheckedChange={checked => setSigned(checked === true)}
            aria-label={t('mandates.dialog.checkbox')}
          />
          <span>{t('mandates.dialog.checkbox')}</span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('mandates.dialog.cancel')}
          </Button>
          <Button disabled={!signed || !address || pending} onClick={submit}>
            {t('mandates.dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
