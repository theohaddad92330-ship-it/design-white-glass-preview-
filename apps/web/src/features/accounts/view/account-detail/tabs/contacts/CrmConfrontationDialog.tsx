import type { CrmConfrontationPair } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Text,
} from '@bellum/ui'
import { RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCrmConfrontation } from '@/features/contacts/hooks/useCrmConfrontation'
import { useHideContact } from '@/features/contacts/hooks/useHideContact'

/**
 * #2120.48 — « Confronter avec mon CRM », visible en haut de l'onglet Contacts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 18/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Tous les fournisseurs, sur le DERNIER INSTANTANÉ déjà en base — aucun appel
 * live (`ContactsService.crmConfrontation`). L'écran DIT la date de cet
 * instantané, ou « fraîcheur non mesurée » quand elle est inconnue — jamais
 * une date devinée, jamais rien du tout.
 *
 * Une confrontation est une LECTURE : elle PROPOSE des paires CRM ↔ Bellum
 * probablement dupliquées. On ne fusionne JAMAIS — le seul geste possible est
 * de masquer l'une des deux fiches (réversible, `useHideContact`, la MÊME
 * action que #2120.44). Aucun champ n'est jamais écrasé : une correction faite
 * à la main survit donc par construction, pas par un contrôle ajouté ici.
 *
 * Si aucun CRM n'est branché, le dialogue le DIT et explique pourquoi il ne
 * peut rien confronter — il ne se ferme pas en silence et n'affiche jamais
 * « 0 écart » (ce qui laisserait croire à une comparaison faite).
 */
export function CrmConfrontationDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation('crm')
  const { data, isLoading, isError } = useCrmConfrontation(accountId, open)
  const hide = useHideContact()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('confrontation.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('confrontation.description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            …
          </Text>
        ) : isError || !data ? (
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {t('confrontation.loadError')}
          </Text>
        ) : !data.connected && !data.imported ? (
          <EmptyState
            size="sm"
            icon={<RefreshCcw className="h-8 w-8 text-[var(--bellum-text-muted)]" />}
            title={t('confrontation.notConnected.title')}
            description={t('confrontation.notConnected.body')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* #4680 — sans connecteur live, on confronte l'import déjà en base et on le NOMME tel qu'il est. */}
            {data.imported ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="confrontation-imported">
                {t('confrontation.importedSource')}
              </Text>
            ) : null}
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
              {data.snapshotAt
                ? t('confrontation.snapshotAt', { date: formatDate(data.snapshotAt, i18n.language) })
                : t('confrontation.snapshotUnknown')}
            </Text>
            {data.pairs.length === 0 ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('confrontation.empty')}
              </Text>
            ) : (
              <>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('confrontation.hint')}
                </Text>
                <ul className="flex flex-col gap-2">
                  {data.pairs.map(pair => (
                    <ConfrontationPairRow
                      key={`${pair.crmContact.id}::${pair.bellumContact.id}`}
                      pair={pair}
                      accountId={accountId}
                      onHide={contact => hide.mutate({ contact: { ...contact, account_id: accountId }, hidden: true })}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfrontationPairRow({
  pair,
  onHide,
}: {
  pair: CrmConfrontationPair
  accountId: string
  onHide: (contact: { id: string; full_name: string }) => void
}) {
  const { t } = useTranslation('crm')
  return (
    <li className="rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
      <Text size="xs" weight="semibold" className="mb-2 text-[var(--bellum-text-secondary)]">
        {t(`confrontation.reason.${pair.reason}`)} · {Math.round(pair.confidence * 100)}%
      </Text>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('confrontation.crmSide')}
          </Text>
          <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
            {pair.crmContact.fullName ?? pair.crmContact.email ?? '—'}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-auto px-0 text-xs"
            onClick={() => onHide({ id: pair.crmContact.id, full_name: pair.crmContact.fullName ?? '' })}
          >
            {t('confrontation.keepBellum')}
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('confrontation.bellumSide')}
          </Text>
          <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
            {pair.bellumContact.fullName ?? pair.bellumContact.email ?? '—'}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-auto px-0 text-xs"
            onClick={() => onHide({ id: pair.bellumContact.id, full_name: pair.bellumContact.fullName ?? '' })}
          >
            {t('confrontation.keepCrm')}
          </Button>
        </div>
      </div>
    </li>
  )
}

/** Même règle que `ContactsStaleCollectionNotice.tsx` (dupliquée à dessein :
 *  petit helper local, pas une dépendance croisée entre deux onglets). */
function formatDate(dateStr: string, language: string): string {
  const date = new Date(dateStr)
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
