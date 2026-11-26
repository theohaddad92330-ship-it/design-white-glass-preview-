import type { TelephonyProvider } from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Input, Label, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnectTelephony, useDisconnectTelephony, useTelephonyStatus } from '../api'

const PROVIDERS: TelephonyProvider[] = ['aircall', 'ringover', 'allo']

/**
 * La carte « Outil d'appel » de Réglages › Intégrations.
 *
 * Comme l'ATS, c'est l'un des rares écrans autorisés à nommer l'éditeur : un
 * bouton « Connecter » doit dire ce qu'il connecte.
 *
 * La case des transcriptions est DÉCOCHÉE par défaut et porte son avertissement
 * juste à côté. Ce n'est pas une préférence d'affichage : lire la transcription
 * d'un appel suppose que les deux parties y ont consenti, et cette décision
 * appartient à l'ESN. Une case pré-cochée l'aurait prise à sa place.
 */
export function TelephonyCard() {
  const { t } = useTranslation('integrations')
  const { data: status } = useTelephonyStatus()
  const connect = useConnectTelephony()
  const disconnect = useDisconnectTelephony()

  const [provider, setProvider] = useState<TelephonyProvider>('aircall')
  const [apiId, setApiId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [alloNumber, setAlloNumber] = useState('')
  const [transcripts, setTranscripts] = useState(false)
  // #4016 L12 — l'enregistrement est-il annoncé aux deux parties ? Décoché par défaut.
  const [announced, setAnnounced] = useState(false)

  const connected = Boolean(status?.connected)
  const canSubmit =
    apiKey.trim().length >= 8 &&
    (provider !== 'aircall' || apiId.trim().length >= 3) &&
    (provider !== 'allo' || alloNumber.trim().length >= 3)

  const submit = () => {
    connect.mutate({
      provider,
      ...(provider === 'aircall' ? { apiId: apiId.trim() } : {}),
      ...(provider === 'allo' ? { alloNumber: alloNumber.trim() } : {}),
      apiKey: apiKey.trim(),
      transcriptsEnabled: transcripts,
      recordingConsentAnnounced: announced,
    })
    setApiId('')
    setApiKey('')
    setAlloNumber('')
  }

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="flex items-start justify-between gap-3">
        <Box className="space-y-1">
          <Box className="flex items-center gap-2">
            <Text weight="medium">{t('telephony.title')}</Text>
            {connected ? (
              <Badge variant="outline" className="text-xs">
                {t('telephony.connected')}
              </Badge>
            ) : null}
          </Box>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('telephony.description')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('telephony.readOnlyNotice')}
          </Text>
        </Box>
        {connected ? (
          <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {t('telephony.disconnect')}
          </Button>
        ) : null}
      </Box>

      {connected ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {status?.transcriptsEnabled ? t('telephony.transcriptsOn') : t('telephony.transcriptsOff')}{' '}
          {status?.recordingConsentAnnounced ? t('telephony.announcedOn') : t('telephony.announcedOff')}
        </Text>
      ) : (
        <Box className="space-y-3">
          <Box className="flex items-center gap-1.5">
            <FilterChips
              size="sm"
              ariaLabel={t('telephony.providerAria')}
              options={PROVIDERS.map(value => ({ value, label: t(`telephony.provider.${value}`) }))}
              value={provider}
              onChange={next => next && setProvider(next)}
            />
          </Box>

          {provider === 'aircall' ? (
            <Box className="space-y-1.5">
              <Label htmlFor="telephony-api-id">{t('telephony.apiId')}</Label>
              <Input
                id="telephony-api-id"
                autoComplete="off"
                value={apiId}
                onChange={event => setApiId(event.target.value)}
              />
            </Box>
          ) : null}

          {provider === 'allo' ? (
            <Box className="space-y-1.5">
              <Label htmlFor="telephony-allo-number">{t('telephony.alloNumber')}</Label>
              <Input
                id="telephony-allo-number"
                autoComplete="off"
                placeholder="+33…"
                value={alloNumber}
                onChange={event => setAlloNumber(event.target.value)}
              />
            </Box>
          ) : null}

          <Box className="space-y-1.5">
            <Label htmlFor="telephony-api-key">{t('telephony.apiKey')}</Label>
            <Input
              id="telephony-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
            />
          </Box>

          <Box className="space-y-1">
            <label className="flex items-start gap-2" htmlFor="telephony-transcripts">
              <input
                id="telephony-transcripts"
                type="checkbox"
                className="mt-1"
                checked={transcripts}
                onChange={event => setTranscripts(event.target.checked)}
              />
              <Text size="sm">{t('telephony.transcriptsLabel')}</Text>
            </label>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('telephony.transcriptsWarning')}
            </Text>
          </Box>

          <Box className="space-y-1">
            <label className="flex items-start gap-2" htmlFor="telephony-announced">
              <input
                id="telephony-announced"
                type="checkbox"
                className="mt-1"
                checked={announced}
                onChange={event => setAnnounced(event.target.checked)}
              />
              <Text size="sm">{t('telephony.announcedLabel')}</Text>
            </label>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('telephony.announcedWarning')}
            </Text>
          </Box>

          <Box className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!canSubmit || connect.isPending}>
              {connect.isPending ? t('telephony.connecting') : t('telephony.connect')}
            </Button>
            {connect.isError ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {(connect.error as Error).message}
              </Text>
            ) : null}
          </Box>
        </Box>
      )}
    </Box>
  )
}
