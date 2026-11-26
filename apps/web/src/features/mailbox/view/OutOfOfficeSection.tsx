import { Box, Button, Checkbox, Label, Switch, Text, Textarea } from '@bellum/ui'
import type { MailboxProvider, OutOfOfficeRequest } from '@bellum/contracts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useMailboxStatus, useOutOfOffice, useSaveOutOfOffice } from '../api'

/** ISO (UTC) → valeur d'un `datetime-local` (heure locale du navigateur). */
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Valeur d'un `datetime-local` (heure locale) → ISO UTC, ou `undefined` si vide ou invalide. */
function localInputToIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/**
 * Théo D settings-integrations.DÉC.absence — LA RÉPONSE D'ABSENCE, dans le tiroir Outlook ET dans le tiroir
 * Gmail (Louis 22/10 : « un utilisateur Gmail doit avoir un endroit pour la régler »).
 *
 * `GET/PUT /mailbox/out-of-office` existaient pour les deux fournisseurs sans aucun appelant web : c'est ce
 * composant. Ce que le serveur écrit, c'est la réponse automatique DU FOURNISSEUR — Bellum n'envoie rien lui-même.
 *
 * Deux protections : une absence activée est BORNÉE par une date de fin (une réponse sans fin est un piège à
 * relance automatique, le contrat le dit), et sans la permission d'écriture sur les réglages de la boîte le
 * formulaire n'est pas proposé — la phrase dit quoi reconnecter, plutôt qu'un échec après coup.
 */
export function OutOfOfficeSection({ provider }: { provider: MailboxProvider }) {
  const { t } = useTranslation('mailbox', { keyPrefix: 'outOfOffice' })
  const { data: status } = useMailboxStatus()
  const canUse = Boolean(status?.connected && status.provider === provider && status.capabilities.outOfOffice)
  const current = useOutOfOffice(canUse)
  const save = useSaveOutOfOffice()

  const [enabled, setEnabled] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [message, setMessage] = useState('')
  const [contactsOnly, setContactsOnly] = useState(false)
  const [touched, setTouched] = useState(false)

  const remote = current.data
  useEffect(() => {
    if (touched || !remote) return
    setEnabled(remote.enabled)
    setStartsAt(isoToLocalInput(remote.startsAt))
    setEndsAt(isoToLocalInput(remote.endsAt))
    setMessage(remote.message ?? '')
    setContactsOnly(remote.contactsOnly)
  }, [remote, touched])

  if (!status?.connected || status.provider !== provider) return null

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setTouched(true)
      set(value)
    }

  if (!status.capabilities.outOfOffice) {
    return (
      <Box as="section" className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-4">
        <Text element="h3" size="sm" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('missingScope')}
        </Text>
      </Box>
    )
  }

  const endMissing = enabled && endsAt === ''
  const submit = () => {
    const body: OutOfOfficeRequest = {
      enabled,
      contactsOnly,
      ...(localInputToIso(startsAt) ? { startsAt: localInputToIso(startsAt) } : {}),
      ...(localInputToIso(endsAt) ? { endsAt: localInputToIso(endsAt) } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
    }
    save.mutate(body, {
      onSuccess: () => {
        setTouched(false)
        toast.success(t('saved'))
      },
      onError: () => toast.error(t('failed')),
    })
  }

  return (
    <Box as="section" className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] p-4">
      <Box>
        <Text element="h3" size="sm" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>
      <Box display="flex" className="min-h-11 items-center gap-3">
        <Switch
          id={`ooo-${provider}-enabled`}
          checked={enabled}
          onCheckedChange={change(setEnabled)}
          aria-label={t('enable')}
        />
        <Label htmlFor={`ooo-${provider}-enabled`}>{t('enable')}</Label>
      </Box>
      <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Box className="flex flex-col gap-1">
          <Label htmlFor={`ooo-${provider}-from`}>{t('from')}</Label>
          <input
            id={`ooo-${provider}-from`}
            type="datetime-local"
            value={startsAt}
            onChange={event => change(setStartsAt)(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-3 text-sm"
          />
        </Box>
        <Box className="flex flex-col gap-1">
          <Label htmlFor={`ooo-${provider}-to`}>{t('to')}</Label>
          <input
            id={`ooo-${provider}-to`}
            type="datetime-local"
            value={endsAt}
            onChange={event => change(setEndsAt)(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-3 text-sm"
          />
        </Box>
      </Box>
      {endMissing && (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {t('endRequired')}
        </Text>
      )}
      <Box className="flex flex-col gap-1">
        <Label htmlFor={`ooo-${provider}-message`}>{t('message')}</Label>
        <Textarea
          id={`ooo-${provider}-message`}
          rows={4}
          maxLength={5000}
          value={message}
          onChange={event => change(setMessage)(event.target.value)}
        />
      </Box>
      <Box display="flex" className="min-h-11 items-center gap-3">
        <Checkbox
          id={`ooo-${provider}-contacts`}
          checked={contactsOnly}
          onCheckedChange={value => change(setContactsOnly)(value === true)}
        />
        <Label htmlFor={`ooo-${provider}-contacts`}>{t('contactsOnly')}</Label>
      </Box>
      <Box>
        <Button type="button" size="sm" className="min-h-11" disabled={endMissing || save.isPending} onClick={submit}>
          {t('save')}
        </Button>
      </Box>
    </Box>
  )
}
