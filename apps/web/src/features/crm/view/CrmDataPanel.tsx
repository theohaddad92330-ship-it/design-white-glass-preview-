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
  EntityAvatar,
  Text,
  Textarea,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Briefcase, Loader2, MessageSquarePlus, RefreshCw, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import {
  connectorFailureIsActionable,
  connectorFailureSpeaksForItself,
  connectorFailureState,
} from '@/lib/connector-failure'
import type { CrmContact } from '@/features/crm/api'
import { useAddCrmCompanyToPortfolio } from '@/features/crm/hooks/useAddCrmCompanyToPortfolio'
import { useCrmContacts } from '@/features/crm/hooks/useCrmContacts'
import { useLogCrmActivity } from '@/features/crm/hooks/useLogCrmActivity'

/**
 * CRM 2-way panel rendered inside Connaissances › Données CRM once a CRM is
 * connected. Left half = import (read the rep's CRM contacts, cursor-paginated);
 * right half of the 2-way sync = write-back (log a Bellum activity onto the
 * selected CRM contacts). Every row is real data from `GET /crm/contacts`; the
 * activity is a real `POST /crm/contacts/:id/activity` — nothing is fabricated.
 */
export function CrmDataPanel() {
  const { t } = useTranslation('integrations')
  const { t: tCommon } = useTranslation('common')
  const { data, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isRefetching } =
    useCrmContacts(true)
  const logActivity = useLogCrmActivity()
  const addToPortfolio = useAddCrmCompanyToPortfolio()

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(() => t('crm.defaultNote'))
  const [logging, setLogging] = useState(false)

  const contacts = useMemo(() => data?.pages.flatMap(page => page.contacts) ?? [], [data])
  const selectedCount = selected.size

  const toggle = (id: string, checked: boolean) =>
    setSelected(current => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const clearSelection = () => setSelected(new Set())

  const handleLogActivity = async () => {
    const ids = [...selected]
    const body = note.trim()
    if (ids.length === 0 || body.length === 0 || logging) return
    setLogging(true)
    const results = await Promise.allSettled(ids.map(crmId => logActivity.mutateAsync({ crmId, note: body })))
    setLogging(false)

    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = ids.length - ok
    if (ok > 0) {
      const failedSuffix = failed > 0 ? t('crm.logFailures', { count: failed }) : ''
      toast.success(t('crm.logSuccess', { count: ok, failedSuffix }))
      clearSelection()
      setNoteOpen(false)
      setNote(t('crm.defaultNote'))
    } else {
      toast.error(t('crm.logError'))
    }
  }

  return (
    <div className="w-full">
      {/* Header */}
      <Box display="flex" className="mb-4 items-center justify-between gap-3">
        <Box>
          <Text weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('crm.headerTitle')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('crm.headerSubtitle')}
          </Text>
        </Box>
        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          isLoading={isRefetching && !isFetchingNextPage}
          onClick={() => void refetch()}
        >
          {tCommon('actions.refresh')}
        </Button>
      </Box>

      {/* Selection action bar */}
      {selectedCount > 0 && (
        <Box
          display="flex"
          className="mb-3 items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
        >
          <Box display="flex" className="items-center gap-2">
            <Users className="size-4 text-[var(--bellum-text-secondary)]" />
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('crm.selectedCount', { count: selectedCount })}
            </Text>
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t('crm.clearSelectionAria')}
              // Croix de fermeture icône-seule : plancher tactile aux deux axes
              // (44 px, GA-30), au doigt seulement.
              className="flex items-center justify-center rounded-md p-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </Box>
          <Button variant="black" size="sm" icon={MessageSquarePlus} onClick={() => setNoteOpen(true)}>
            {t('crm.logActivity')}
          </Button>
        </Box>
      )}

      {/* List */}
      {isLoading ? (
        <Box display="flex" className="items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[var(--bellum-text-muted)]" />
        </Box>
      ) : isError ? (
        <CrmReadFailure error={error} />
      ) : contacts.length === 0 ? (
        <Box className="rounded-lg border border-[var(--bellum-border)] p-6 text-center">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('crm.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="divide-y divide-border/60 rounded-lg border border-[var(--bellum-border)]">
          {contacts.map(contact => (
            <CrmContactRow
              key={contact.id}
              contact={contact}
              selected={selected.has(contact.id)}
              onToggle={checked => toggle(contact.id, checked)}
              onAddToPortfolio={company => addToPortfolio.mutate({ company_name: company })}
              isAddingToPortfolio={
                addToPortfolio.isPending && addToPortfolio.variables?.company_name === contact.company
              }
            />
          ))}
        </Box>
      )}

      {hasNextPage && (
        <Box display="flex" className="mt-4 justify-center">
          <Button variant="outline" size="sm" isLoading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {t('crm.loadMore')}
          </Button>
        </Box>
      )}

      {/* Log-activity dialog */}
      <Dialog open={noteOpen} onOpenChange={open => (logging ? undefined : setNoteOpen(open))}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--bellum-text-primary)]">{t('crm.logActivity')}</DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('crm.dialogDescription', { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={4}
            maxLength={5000}
            placeholder={t('crm.notePlaceholder')}
            className="resize-y"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)} disabled={logging}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              variant="black"
              size="sm"
              icon={MessageSquarePlus}
              isLoading={logging}
              disabled={note.trim().length === 0}
              onClick={() => void handleLogActivity()}
            >
              {logging ? t('crm.logging') : tCommon('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * L'écran qui RÉPARE — une seule orthographe.
 *
 * `/settings/integrations` n'est plus une route (#4359) : la table
 * `lib/legacy-addresses.ts` la réécrit vers `/integrations`, pour les retours
 * OAuth déjà en vol. L'écran, lui, vit à
 * `/integrations`, et c'est lui qui porte le bouton « Connecter ». Y envoyer
 * directement évite un aller-retour, et une seule orthographe évite le défaut
 * déjà payé ici : une route émise qui n'existe pas.
 */
const INTEGRATIONS_ROUTE = '/integrations'

/**
 * Ce que l'écran dit — et propose — quand la lecture du CRM n'a pas abouti.
 *
 * `GET /crm/contacts` échoue par `crmReadFailure()`, qui rend un corps de
 * connecteur complet : `code`, les portées de LECTURE nommées, et une phrase
 * déjà écrite avec le geste à faire. Le panneau déstructurait `isError` SANS
 * `error` : il jetait tout cela pour afficher « Réessaie dans un instant », ce
 * qui est un mensonge sur une portée manquante — un jeton OAuth ne gagne pas une
 * portée après coup, et l'attente peut durer une journée.
 *
 * ⚠️ Le corps porte aussi `provider` (« hubspot »). Il n'arrive jamais ici :
 * `ApiError` ne transporte que `status`, `code` et `message`. On nomme la
 * CAPACITÉ (« ton CRM ») — garde GA-45.
 */
function CrmReadFailure({ error }: { error: unknown }) {
  const { t } = useTranslation('integrations')
  const failure = error instanceof ApiError ? error : null

  // #1836 — la dérivation vit dans `@/lib/connector-failure`, et plus ici :
  // quatre écrans la recopiaient, donc quatre endroits où ajouter un cas.
  const state = connectorFailureState(error)

  // La phrase du serveur telle quelle : elle nomme les portées manquantes et la
  // capacité dont l'autorisation est morte — le navigateur ne connaît ni l'une
  // ni l'autre. Le repli couvre un corps sans `message`.
  const message = connectorFailureSpeaksForItself(state)
    ? failure?.message?.trim() || (state === 'scope_missing' ? t('crm.scopeMissing') : t('crm.authorizationExpired'))
    : state === 'not_connected'
      ? t('crm.notConnected')
      : t('crm.loadError')

  return (
    <Box display="flex" className="flex-col items-start gap-2 rounded-lg border border-[var(--bellum-border)] p-6">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {message}
      </Text>
      {/* Une PANNE ne se répare pas dans Intégrations : un bouton qui ne répare
          rien est pire qu'un message nu. */}
      {connectorFailureIsActionable(state) ? (
        <Link
          to={INTEGRATIONS_ROUTE}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('crm.openIntegrations')}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </Box>
  )
}

function CrmContactRow({
  contact,
  selected,
  onToggle,
  onAddToPortfolio,
  isAddingToPortfolio,
}: {
  contact: CrmContact
  selected: boolean
  onToggle: (checked: boolean) => void
  /** #2150.32 — la société de la ligne, quand elle est connue (jamais `null`). */
  onAddToPortfolio: (company: string) => void
  isAddingToPortfolio: boolean
}) {
  const { t } = useTranslation('integrations')
  const name = displayName(contact)
  const subtitle = [contact.jobTitle, contact.company].filter(Boolean).join(' · ')

  return (
    <Box display="flex" className="items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={selected}
        onCheckedChange={value => onToggle(value === true)}
        aria-label={t('crm.selectContactAria', { name })}
      />
      <EntityAvatar name={name} size="sm" />
      <Box className="min-w-0 flex-1">
        <Text size="sm" weight="medium" noWrap className="truncate text-[var(--bellum-text-primary)]">
          {name}
        </Text>
        <Text size="xs" noWrap className="truncate text-[var(--bellum-text-secondary)]">
          {contact.email ?? (subtitle || t('crm.contactFallback'))}
        </Text>
      </Box>
      {subtitle && contact.email && (
        <Badge variant="outline" className="hidden max-w-[200px] truncate sm:inline-flex">
          {subtitle}
        </Badge>
      )}
      {/* #2150.32 (épopée #2781) — sans société connue il n'y a rien à
          résoudre : le bouton n'existe pas plutôt que d'appeler la porte
          avec un nom vide (GA-18/19, une absence ne s'affiche jamais comme
          un geste possible). */}
      {contact.company && (
        <Button
          variant="outline"
          size="sm"
          icon={Briefcase}
          isLoading={isAddingToPortfolio}
          aria-label={t('crm.addToPortfolioAria', { company: contact.company })}
          title={t('crm.addToPortfolio')}
          className="shrink-0 pointer-coarse:min-h-11"
          onClick={() => onAddToPortfolio(contact.company!)}
        >
          <span className="hidden md:inline">{t('crm.addToPortfolio')}</span>
        </Button>
      )}
    </Box>
  )
}

function displayName(contact: CrmContact): string {
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
  return full || contact.email || i18n.t('integrations:crm.contactFallback')
}
