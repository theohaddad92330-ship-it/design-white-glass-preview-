import { FilterX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ContactsOutOfScopeView } from './outOfScope'

/**
 * « X écartés (hors périmètre) » — dit au commercial POURQUOI son stock de
 * contacts est plus petit que ce qu'Apollo a trouvé, et de quelles entités
 * venaient les écartés. Sans ça, un périmètre qui fonctionne se lit comme une
 * recherche qui rate.
 */
export function ContactsOutOfScopeNotice({ data }: { data: ContactsOutOfScopeView }) {
  const { t } = useTranslation('accountOrg')

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-1)_60%,transparent)] px-4 py-3">
      <FilterX className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--bellum-text-primary)]">
          {t('contactsTab.outOfScope.title', { count: data.dropped })}
        </p>
        <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">
          {data.entities.length > 0
            ? t('contactsTab.outOfScope.entities', { entities: data.entities.join(', ') })
            : t('contactsTab.outOfScope.reason')}
        </p>
      </div>
    </div>
  )
}
