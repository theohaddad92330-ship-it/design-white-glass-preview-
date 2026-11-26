import { Link, useSearch } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTargetLists } from '../api'

/**
 * Théo B c2-mes-listes.R3 — « Ouvrir » une liste ramène au répertoire filtré, avec un bandeau qui dit QUELLE liste
 * filtre et comment la quitter. Le filtre lui-même vit dans l'URL (`targetListId`) ; ce bandeau ne l'écrit pas.
 * Aucun bandeau sans filtre, ni pour une liste inconnue de l'espace (rien n'est deviné).
 */
export function TargetListBanner() {
  const { t } = useTranslation('targets')
  const { targetListId } = useSearch({ strict: false }) as { targetListId?: string }
  const lists = useTargetLists()
  const list = targetListId ? lists.data?.find(candidate => candidate.id === targetListId) : undefined
  if (!list) return null
  const contacts = list.items.filter(item => item.removed_at == null && item.kind === 'contact').length
  return (
    <div
      role="status"
      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-sm text-[var(--bellum-text-primary)]"
    >
      <span>{t('contactLists.banner', { name: list.name, count: contacts })}</span>
      <Link
        to="/contacts"
        search={prev => ({ ...prev, targetListId: undefined })}
        className="inline-flex min-h-11 items-center gap-1 underline"
      >
        <X className="size-4" aria-hidden />
        {t('contactLists.quit')}
      </Link>
    </div>
  )
}
