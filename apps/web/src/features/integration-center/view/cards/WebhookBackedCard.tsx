import type { ConnectedTool } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  INTEGRATION_EVENTS,
  integrationsApi,
  type IntegrationEventType,
  type IntegrationProvider,
  type IntegrationStatus,
} from '@/features/integrations/api'
import { INTEGRATIONS_KEY } from '@/features/integrations/hooks/useIntegrations'
import type { ConnectorId } from '../../lib/connectors'
import { CardShell, ConnectedBadge } from './CardShell'
import { ConnectorBenefits } from './ConnectorBenefits'
import { hasConnectorDetails } from './connector-benefits'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'

// i18n label per subscribable event (mirror of the API event registry).
const EVENT_LABEL_KEY: Record<IntegrationEventType, string> = {
  buy_signal: 'eventBuySignal',
  'analysis.completed': 'eventAnalysisCompleted',
  // #1952.29 — l'accusé de fin d'un travail long de Laura.
  'laura.job.completed': 'eventLauraJobCompleted',
}

/** Per-integration event choice: which application events get delivered.
 *  Server-side `events: null` = every event (default), so a box is checked
 *  when the list is null OR contains the event. */
function EventSubscriptions({ provider, events }: { provider: IntegrationProvider; events: string[] | null }) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const isChecked = (evt: IntegrationEventType) => events == null || events.includes(evt)

  const toggle = async (evt: IntegrationEventType) => {
    if (busy) return
    setBusy(true)
    try {
      const next = INTEGRATION_EVENTS.filter(e => (e === evt ? !isChecked(e) : isChecked(e)))
      await integrationsApi.setEvents(provider, next)
      queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY })
      toast.success(t('eventsUpdatedToast'))
    } catch {
      toast.error(t('eventsUpdateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box display="flex" className="flex-wrap items-center gap-x-4 gap-y-1">
      <Text size="xs" color="text-[var(--text-ghost)]">
        {t('eventsLabel')}
      </Text>
      {INTEGRATION_EVENTS.map(evt => (
        <label
          key={evt}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]"
        >
          <input
            type="checkbox"
            checked={isChecked(evt)}
            disabled={busy}
            onChange={() => void toggle(evt)}
            className="size-3.5 accent-[var(--bellum-primary-500)]"
          />
          {t(EVENT_LABEL_KEY[evt])}
        </label>
      ))}
    </Box>
  )
}

/**
 * Canal branché par une URL de webhook collée par l'utilisateur.
 *
 * Le bouton « Tester » reste sur la carte alors que le JOURNAL des envois est
 * parti au back-office, et c'est délibéré : un test est un geste dont la
 * réponse est immédiate et lisible sans code HTTP, là où le journal demandait
 * de savoir lire un 403.
 */
export function WebhookBackedCard({
  provider,
  icon,
  connector,
  name,
  description,
  placeholder,
  helper,
  status,
  validate,
  tools,
}: {
  provider: IntegrationProvider
  icon: LucideIcon
  /** #1614 — l'outil dont la carte parle, pour aller chercher SON logo. */
  connector?: ConnectorId
  name: string
  description: string
  placeholder: string
  helper: string
  status?: IntegrationStatus
  validate: (url: string) => boolean
  /** Les lignes de registre du canal — ce que le bloc de bénéfice énumère. */
  tools?: readonly ConnectedTool[]
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | 'disconnect' | null>(null)
  const connected = status?.connected ?? false
  const trimmed = url.trim()
  const valid = validate(trimmed)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY })
    queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
  }

  const save = async () => {
    if (!valid || busy) return
    setBusy('save')
    try {
      await integrationsApi.set(provider, trimmed)
      setUrl('')
      invalidate()
      toast.success(t('webhookConnectedToast', { name }))
    } catch {
      toast.error(t('webhookConnectError', { name }))
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    if (busy) return
    setBusy('test')
    try {
      await integrationsApi.test(provider)
      toast.success(t('webhookTestSuccessToast', { name }))
    } catch {
      toast.error(t('webhookTestErrorToast', { name }))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (busy) return
    setBusy('disconnect')
    try {
      await integrationsApi.disconnect(provider)
      invalidate()
      toast.success(t('providerDisconnectedToast', { name }))
    } catch {
      toast.error(t('providerDisconnectError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <CardShell
      icon={icon}
      connector={connector}
      name={name}
      description={description}
      badge={connected ? <ConnectedBadge /> : undefined}
      /* #1442 — déplié une fois branché, replié sinon. Ces six canaux ont été
         OUBLIÉS au premier passage : seules les cartes OAuth et Odoo avaient été
         câblées, et la recette live les a montrés à 368 px chacun, bénéfices
         dépliés, sur des connecteurs que personne n'avait demandés. Un correctif
         règle une FAMILLE. */
      expanded={connected}
      details={
        !hasConnectorDetails(tools) ? undefined : (
          <>
            {/* #1443 — ce que le registre autorise sur ce canal. La carte disait
                seulement « connecté » ; ce qu'elle allait y faire n'était écrit
                nulle part, alors que le serveur le déclare. */}
            <ConnectorBenefits tools={tools} />
            {/* #1444 — les capacités du canal, leur état et leur dernière preuve.
                Un webhook n'expose aujourd'hui aucune portée : le panneau ne rend
                donc rien, et c'est correct — il n'a ni jeton ni portée, il a une
                URL, et soit elle répond soit non. Le monter quand même est ce qui
                fait que la promesse « recevoir `tools`, c'est les afficher » vaut
                ici aussi le jour où une ligne de canal en portera. */}
            {(tools ?? []).map(tool => (
              <ConnectorDiagnostics key={tool.provider} tool={tool} />
            ))}
          </>
        )
      }
    >
      {connected ? (
        <Box className="space-y-2.5">
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="min-w-0 truncate">
              {status?.label ?? t('webhookStatusFallback')}
            </Text>
            <Box display="flex" className="ml-auto shrink-0 items-center gap-2">
              {/* Ce bouton ENVOIE. Pour un webhook il n'existe aucune lecture
                  non destructive : la seule preuve est une livraison, donc un
                  vrai message dans le canal de quelqu'un. Le libellé le dit —
                  l'ancien (« Envoyer un test ») laissait croire à une
                  vérification silencieuse. */}
              <Button
                variant="secondary"
                size="sm"
                icon={Send}
                isLoading={busy === 'test'}
                onClick={test}
                title={t('webhookTestHint')}
              >
                {t('webhookTestButton')}
              </Button>
              <Button variant="ghost" size="sm" icon={Trash2} isLoading={busy === 'disconnect'} onClick={disconnect}>
                {tCommon('actions.disconnect')}
              </Button>
            </Box>
          </Box>
          <EventSubscriptions provider={provider} events={status?.events ?? null} />
        </Box>
      ) : (
        <Box className="space-y-2">
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={placeholder}
            className="bg-card border-[var(--bellum-border)] text-xs"
            spellCheck={false}
            autoComplete="off"
          />
          <Text
            size="xs"
            color={trimmed.length > 0 && !valid ? 'text-[var(--danger-soft-text)]' : 'text-[var(--text-ghost)]'}
          >
            {helper}
          </Text>
          <Box display="flex" className="justify-end">
            <Button variant="default" size="sm" disabled={!valid} isLoading={busy === 'save'} onClick={save}>
              {tCommon('actions.connect')}
            </Button>
          </Box>
        </Box>
      )}
    </CardShell>
  )
}
