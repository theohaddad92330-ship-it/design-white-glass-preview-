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
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConnectLemlist, useDisconnectLemlist, useLemlistStatus } from '@/features/lemlist/api'
import { CardShell, ConnectedBadge } from './CardShell'
import { ConnectorBenefits } from './ConnectorBenefits'
import { hasConnectorDetails } from './connector-benefits'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'
import { CONNECTOR_ICONS } from './connector-icons'
import type { ConnectorCardProps } from './connector-card-map'

/**
 * #4427.1 — la carte Lemlist, sur le modèle de la carte Odoo (l'autre connexion
 * par CLÉ de l'écran) : un bouton dans la grille, la saisie dans une boîte, la
 * clé masquée, et un refus qui s'affiche sous le champ sans le vider.
 *
 * La soumission EST la vérification : le serveur présente la clé à Lemlist
 * (`GET /team`) avant de l'enregistrer, et une clé refusée n'est jamais gardée.
 */
export function LemlistCard({ tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { t: tCommon } = useTranslation('common')
  const { data, isLoading } = useLemlistStatus()
  const connect = useConnectLemlist()
  const disconnect = useDisconnectLemlist()

  const [apiKey, setApiKey] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const connected = data?.connected === true

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setRefusal(null)
    try {
      await connect.mutateAsync({ apiKey: apiKey.trim() })
      toast.success(t('lemlistConnected'))
      // La clé quitte la mémoire de l'écran dès qu'elle est enregistrée.
      setApiKey('')
      setFormOpen(false)
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : t('lemlistConnectFailed'))
    }
  }

  return (
    <CardShell
      icon={CONNECTOR_ICONS.lemlist}
      connector="lemlist"
      name="Lemlist"
      description={t('lemlistDescription')}
      badge={connected ? <ConnectedBadge /> : undefined}
      expanded={connected}
      details={
        !hasConnectorDetails(tools) ? undefined : (
          <>
            <ConnectorBenefits tools={tools} />
            {(tools ?? []).map(tool => (
              <ConnectorDiagnostics key={tool.provider} tool={tool} hideLastSync />
            ))}
          </>
        )
      }
    >
      {isLoading ? null : connected ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="gap-1.5 self-start"
        >
          <Trash2 className="size-4" aria-hidden />
          {tCommon('actions.disconnect')}
        </Button>
      ) : (
        <Box display="flex" className="justify-end">
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t('lemlistConnectButton')}
          </Button>
        </Box>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('lemlistDialogTitle')}</DialogTitle>
            <DialogDescription>{t('lemlistDialogDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="lemlist-key" className="text-xs">
                {t('lemlistKeyLabel')}
              </Label>
              <Input
                id="lemlist-key"
                className="h-9"
                type="password"
                required
                autoComplete="off"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
              />
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('lemlistKeyWhere')}
              </Text>
            </Box>

            {refusal ? (
              <Text element="p" size="xs" className="text-[var(--danger-soft-text)]">
                {t('lemlistRefused', { reason: refusal })}
              </Text>
            ) : null}

            <Box display="flex" className="justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={connect.isPending}>
                {tCommon('actions.connect')}
              </Button>
            </Box>
          </form>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}
