import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BEEPER_STATUS_KEY, beeperApi, useBeeperStatus } from '@/features/beeper/api'
import { TOAST_PROBLEM_MS } from '@/lib/toast-duration'
import { CardShell, ConnectedBadge, ReconnectBadge } from './CardShell'
import { CONNECTOR_ICONS } from './connector-icons'
import type { ConnectorCardProps } from './connector-card-map'

/**
 * #4406.4 — la carte Beeper : l'URL distante de SON Beeper Desktop (accès distant + son tunnel), puis
 * le consentement OAuth (PKCE côté serveur). Beeper se NOMME : c'est l'outil de l'utilisateur
 * (décision 14, #4314), comme Zoho.
 *
 * Même forme qu'Odoo (#1446) : un bouton dans la grille, la saisie dans une boîte de dialogue. Ce que
 * la boîte porte en plus : le GUIDE d'activation et l'AVERTISSEMENT de Beeper lui-même — exposer
 * l'API « peut exposer l'historique et permettre d'envoyer des messages à votre place ».
 *
 * Quatre états NOMMÉS : déconnecté, en attente de validation, connecté, injoignable (Desktop fermé ou
 * tunnel coupé — jamais « connecté » par défaut). Aucun jeton n'arrive jamais jusqu'ici.
 */
export function BeeperCard(_props: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.beeper' })
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const { data, isLoading } = useBeeperStatus()

  const [baseUrl, setBaseUrl] = useState('')
  const [tunnelDeclared, setTunnelDeclared] = useState(false)
  const [pending, setPending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const state = data?.state ?? 'disconnected'
  const linked = state === 'connected' || state === 'unreachable' || state === 'pending'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setRefusal(null)
    try {
      const { url } = await beeperApi.connect({ baseUrl: baseUrl.trim(), tunnelDeclared })
      // Le consentement se donne DANS Beeper : le navigateur y part, et revient par `?beeper=…`.
      window.location.assign(url)
    } catch (error) {
      // La raison du serveur (https requis, adresse interne refusée, Beeper injoignable) — la saisie survit.
      setRefusal(error instanceof Error ? error.message : t('connectFailed'))
      setPending(false)
    }
  }

  const disconnect = async () => {
    setPending(true)
    try {
      const result = await beeperApi.disconnect()
      if (result.warning) toast.warning(result.warning, { duration: TOAST_PROBLEM_MS })
      else toast.success(t('disconnected'))
      await queryClient.invalidateQueries({ queryKey: BEEPER_STATUS_KEY })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('disconnectFailed'))
    } finally {
      setPending(false)
    }
  }

  const badge = state === 'connected' ? <ConnectedBadge /> : state === 'unreachable' ? <ReconnectBadge /> : undefined

  return (
    <CardShell
      icon={CONNECTOR_ICONS.beeper}
      connector="beeper"
      name="Beeper"
      description={t('description')}
      badge={badge}
      expanded={linked}
      fitContent
    >
      {isLoading ? null : data?.configured === false ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('notOffered')}
        </Text>
      ) : linked ? (
        <Box display="flex" className="flex-col gap-2" data-testid="beeper-linked">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="beeper-state">
            {t(`state.${state}`)}
          </Text>
          {data?.baseUrl ? (
            <Text size="xs" className="break-all text-[var(--bellum-text-muted)]">
              {data.baseUrl}
              {data.tunnelDeclared ? ` · ${t('tunnelDeclaredShort')}` : ''}
            </Text>
          ) : null}
          <Box display="flex" className="flex-wrap gap-2">
            {state === 'pending' ? (
              <Button size="sm" className="min-h-11" onClick={() => setFormOpen(true)} disabled={pending}>
                {t('resume')}
              </Button>
            ) : null}
            {data?.baseUrl ? (
              <Button variant="outline" size="sm" onClick={disconnect} disabled={pending} className="min-h-11 gap-1.5">
                <Trash2 aria-hidden className="size-4" />
                {tCommon('actions.disconnect')}
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : (
        <Box display="flex" className="flex-col gap-2">
          {/* #4406.6 — l'état se lit sur la carte MÊME débranchée : « Non branché » nommé, pas un silence. */}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="beeper-state">
            {t('state.disconnected')}
          </Text>
          <Box display="flex" className="justify-end">
            <Button size="sm" className="min-h-11" onClick={() => setFormOpen(true)}>
              {t('connectButton')}
            </Button>
          </Box>
        </Box>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent closeLabel={tCommon('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogDescription')}</DialogDescription>
          </DialogHeader>

          {/* Le guide d'activation : la réponse, pas un lien vers une documentation qui peut déménager. */}
          <ol
            className="flex list-decimal flex-col gap-1 pl-5 text-xs text-[var(--bellum-text-secondary)]"
            data-testid="beeper-guide"
          >
            <li>{t('guide.step1')}</li>
            <li>{t('guide.step2')}</li>
            <li>{t('guide.step3')}</li>
            <li>{t('guide.step4')}</li>
          </ol>

          {/* L'avertissement de Beeper, tel qu'il le donne — avant de saisir quoi que ce soit. */}
          <Box
            role="note"
            data-testid="beeper-warning"
            className="flex gap-2 rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3"
          >
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
            <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
              {t('warning')}
            </Text>
          </Box>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="beeper-url" className="text-xs">
                {t('urlLabel')}
              </Label>
              <Input
                id="beeper-url"
                className="h-11"
                type="url"
                required
                inputMode="url"
                autoComplete="off"
                placeholder="https://beeper.mon-tunnel.example"
                value={baseUrl}
                onChange={event => setBaseUrl(event.target.value)}
              />
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('urlHint')}
              </Text>
            </Box>
            <label htmlFor="beeper-tunnel" className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
              <input
                id="beeper-tunnel"
                type="checkbox"
                className="size-4"
                checked={tunnelDeclared}
                onChange={event => setTunnelDeclared(event.target.checked)}
              />
              <span className="text-[var(--bellum-text-secondary)]">{t('tunnelLabel')}</span>
            </label>

            {refusal ? (
              <Text element="p" size="xs" className="text-[var(--danger-soft-text)]" data-testid="beeper-refusal">
                {t('refused', { reason: refusal })}
              </Text>
            ) : null}

            <Box display="flex" className="justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setFormOpen(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" className="min-h-11" disabled={pending}>
                {t('submit')}
              </Button>
            </Box>
          </form>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}
