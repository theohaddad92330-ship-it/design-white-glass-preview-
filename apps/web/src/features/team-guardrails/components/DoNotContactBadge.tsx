import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { DoNotContactEntry } from '@bellum/contracts'
import { useContactGuardrails, useDoNotContactList } from '../hooks'

/**
 * #4158.22 — le badge « Ne pas contacter » d'un contact listé par l'espace
 * (contact lui-même, ou domaine de son adresse). Rien si le contact n'y figure pas.
 */
export function DoNotContactBadge({ contactId }: { contactId: string }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useContactGuardrails([contactId])
  const entry = data?.items.find(item => item.contact_id === contactId)?.do_not_contact
  if (!entry) return null
  return (
    <Badge variant="warning" title={t('badge.doNotContactTitle', { reason: entry.reason })}>
      {t('badge.doNotContact')}
    </Badge>
  )
}

/** Le domaine d'une adresse e-mail, comme le serveur le normalise (minuscules, après le dernier `@`). */
function emailDomain(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? ''
  const at = value.lastIndexOf('@')
  return at > 0 && at < value.length - 1 ? value.slice(at + 1) : null
}

/** L'entrée de la liste qui vise ce contact (lui-même, sinon le domaine de son adresse) — `null` si aucune. */
export function listedDoNotContact(
  entries: readonly DoNotContactEntry[] | undefined,
  contactId: string,
  email?: string | null,
): DoNotContactEntry | null {
  if (!entries) return null
  const domain = emailDomain(email)
  return (
    entries.find(entry => entry.kind === 'contact' && entry.contact_id === contactId) ??
    entries.find(entry => entry.kind === 'domain' && domain !== null && entry.domain === domain) ??
    null
  )
}

/**
 * #4158.52 — le MÊME badge, même texte, pour une LISTE de contacts (`/contacts`, contacts d'un
 * compte). Il lit la liste « ne pas contacter » de l'espace UNE fois (requête partagée entre toutes
 * les lignes) au lieu d'une requête par ligne. Rien si le contact n'y figure pas (une absence ne fait
 * aucune ligne), rien non plus tant que la liste n'a pas répondu.
 */
export function DoNotContactListBadge({ contactId, email }: { contactId: string; email?: string | null }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useDoNotContactList()
  const entry = listedDoNotContact(data?.items, contactId, email)
  if (!entry) return null
  return (
    <Badge variant="warning" title={t('badge.doNotContactTitle', { reason: entry.reason })}>
      {t('badge.doNotContact')}
    </Badge>
  )
}
