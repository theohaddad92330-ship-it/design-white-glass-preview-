import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '@/components/overlay/ModalPortal'

type ChooserType = {
  key: 'contact' | 'account' | 'need' | 'mission' | 'talent' | 'project' | 'notes' | 'activity'
  /** Un type de l'import universel ouvre l'assistant ; les autres sont lus par l'assistant de reprise. */
  target: 'assistant' | 'universal' | 'resume'
}

/**
 * Théo B c3-imports-sources.A1 — « Que veux-tu importer ? » : l'étape AVANT l'assistant. Les contacts mènent à
 * l'assistant de cette page ; comptes, besoins, missions, consultants et candidats à l'import universel ; projets,
 * notes et historique d'activité à l'assistant de reprise (Réglages › Import). Rien n'est retiré de ce qui se
 * sait importer aujourd'hui.
 */
const TYPES: readonly ChooserType[] = [
  { key: 'contact', target: 'assistant' },
  { key: 'account', target: 'universal' },
  { key: 'need', target: 'universal' },
  { key: 'mission', target: 'universal' },
  { key: 'talent', target: 'universal' },
  { key: 'project', target: 'resume' },
  { key: 'notes', target: 'resume' },
  { key: 'activity', target: 'resume' },
]

export function ImportTypeChooser({
  onClose,
  onUniversal,
}: {
  onClose: () => void
  /** Ouvre la fenêtre d'import universel pour ce type (comptes, besoins, missions, consultants). */
  onUniversal: (type: 'account' | 'need' | 'mission' | 'talent') => void
}) {
  const { t } = useTranslation('importWizard')
  const card =
    'flex min-h-11 w-full flex-col gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-left hover:border-[var(--bellum-primary-500)] focus-visible:outline focus-visible:outline-2'
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-chooser-title"
          className="mx-4 max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Text
              element="h3"
              id="import-chooser-title"
              size="base"
              weight="semibold"
              className="text-[var(--text-primary)]"
            >
              {t('contactsImport.chooser.title')}
            </Text>
            <button
              type="button"
              aria-label={t('common:actions.close')}
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--text-ghost)] hover:bg-[var(--bg-surface-hover)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {TYPES.map(entry => {
              const body = (
                <>
                  <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
                    {t(`contactsImport.chooser.types.${entry.key}.title`)}
                  </Text>
                  <Text size="xs" className="text-[var(--text-muted)]">
                    {t(`contactsImport.chooser.types.${entry.key}.hint`)}
                  </Text>
                </>
              )
              return (
                <li key={entry.key}>
                  {entry.target === 'assistant' ? (
                    <Link to="/contacts/import" search={{ source: 'file' }} className={card}>
                      {body}
                    </Link>
                  ) : entry.target === 'resume' ? (
                    <Link to="/settings/mes-donnees" search={{ tab: 'imports' }} className={card}>
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUniversal(entry.key as 'account' | 'need' | 'mission' | 'talent')}
                      className={card}
                    >
                      {body}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <Text size="sm" className="mt-4 text-[var(--text-muted)]">
            {t('contactsImport.chooser.cvHint')}{' '}
            <Link to="/consultants" className="underline underline-offset-2">
              {t('contactsImport.chooser.cvLink')}
            </Link>
          </Text>
        </div>
      </div>
    </ModalPortal>
  )
}
