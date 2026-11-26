import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EntityAvatar,
  Input,
  Spinner,
  Text,
} from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useDebounce } from '@/hooks/useDebounce'

/**
 * Théo B m1.R9 — « Nouveau message » → « À qui veux-tu écrire ? ». On choisit la personne dans le répertoire ;
 * « Choisir » ouvre la préparation d'e-mail EXISTANTE de son contact (Théo C6), qui s'ouvre déjà rédigée par Laura.
 * La préparation est la même que depuis la fiche contact : un seul brouillon, un seul endroit (GA-26).
 * Coordonnées pro en clair (c87).
 */
export function NewMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('mailbox')
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced] = useDebounce(query.trim(), 300)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('newMessage.title')}</DialogTitle>
          <DialogDescription>{t('newMessage.description')}</DialogDescription>
        </DialogHeader>
        <label className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
          <Input
            className="pl-9"
            aria-label={t('newMessage.searchAria')}
            placeholder={t('newMessage.searchPlaceholder')}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        {open ? (
          <ContactChoices
            query={debounced}
            onChoose={id => {
              onOpenChange(false)
              void navigate({ to: '/contacts/$id/approach/$channel', params: { id, channel: 'email' } })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ContactChoices({ query, onChoose }: { query: string; onChoose: (id: string) => void }) {
  const { t } = useTranslation('mailbox')
  const contacts = useContacts(query ? { q: query } : {})
  const items = (contacts.data?.pages ?? []).flatMap(page => page.data).slice(0, 15)

  if (contacts.isLoading) {
    return (
      <Box className="flex h-24 items-center justify-center">
        <Spinner />
      </Box>
    )
  }
  if (contacts.isError) {
    return (
      <Text size="sm" className="text-[var(--danger-soft-text)]">
        {t('newMessage.failed')}
      </Text>
    )
  }
  if (items.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('newMessage.empty')}
      </Text>
    )
  }
  return (
    <ul className="flex max-h-[60dvh] flex-col divide-y divide-[var(--bellum-border)] overflow-y-auto">
      {items.map(contact => (
        <li key={contact.id} className="flex items-center gap-3 py-2">
          <EntityAvatar name={contact.full_name} size="sm" />
          <Box className="flex min-w-0 flex-1 flex-col">
            <Text size="sm" weight="semibold" className="truncate">
              {contact.full_name}
            </Text>
            <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
              {[contact.entity, contact.title, contact.email].filter(Boolean).join(' · ')}
            </Text>
          </Box>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => onChoose(contact.id)}>
            {t('newMessage.choose')}
          </Button>
        </li>
      ))}
    </ul>
  )
}
