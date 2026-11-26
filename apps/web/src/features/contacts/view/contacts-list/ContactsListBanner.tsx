import { Button } from '@bellum/ui'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Théo B c1-repertoire `.t-banner` (C2.R3) — une liste ouverte depuis « Mes listes » se DIT :
 * son nom, le nombre de fiches qu'elle porte, et la sortie. Le filtre `targetListId` existait
 * déjà dans l'URL ; il restait muet, la liste ressemblait au répertoire entier.
 *
 * Rien quand le nom n'est pas connu (liste supprimée, encore en chargement) : pas de « Liste : ».
 */
export function ContactsListBanner({
  name,
  total,
  onQuit,
}: {
  name: string | undefined
  /** Le total SERVEUR sous ce filtre ; inconnu = la phrase se tait plutôt que d'écrire « 0 ». */
  total: number | undefined
  onQuit: () => void
}) {
  const { t } = useTranslation('contacts')
  if (!name) return null
  return (
    <div
      role="status"
      data-testid="contacts-list-banner"
      className="flex flex-wrap items-center gap-3 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3"
    >
      <ListChecks className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm text-[var(--bellum-text-primary)]">{t('listBanner.title', { name })}</strong>
        {total !== undefined ? (
          <p className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">
            {t('listBanner.count', { count: total })}
          </p>
        ) : null}
      </div>
      <Button type="button" size="sm" variant="plain" onClick={onQuit}>
        {t('listBanner.quit')}
      </Button>
    </div>
  )
}
