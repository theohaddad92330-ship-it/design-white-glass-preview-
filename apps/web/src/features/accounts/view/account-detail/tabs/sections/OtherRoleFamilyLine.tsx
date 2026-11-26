import { Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OTHER_DETAIL_LIMIT, otherRoleTitleDetail } from './roleFamilyOther'

/**
 * K.3 / #4325 — « Autre », à part des métiers : son nombre, ce que c'est, et les intitulés qu'il regroupe.
 * Voir `roleFamilyOther.ts` pour la raison. Le détail vient des contacts de ce compte ; sans lui, la ligne
 * NOMME l'absence de détail plutôt que de laisser un nombre opaque.
 */
export function OtherRoleFamilyLine({
  persons,
  contacts,
}: {
  persons: number
  contacts: ReadonlyArray<{ family?: string | null; title?: string | null }>
}) {
  const { t } = useTranslation('accountDetail')
  const [expanded, setExpanded] = useState(false)
  const detail = otherRoleTitleDetail(contacts)
  const shown = expanded ? detail : detail.slice(0, OTHER_DETAIL_LIMIT)
  const hiddenCount = detail.length - shown.length

  return (
    <div data-testid="role-family-other" className="mt-3 border-t border-[var(--bellum-border)] pt-2">
      <Text size="sm">
        <span className="font-medium">{t('canonicalContext.otherFamily.title')}</span>
        <span className="text-[var(--bellum-text-secondary)]">
          {' '}
          — {t('canonicalContext.roleFamilyPersons', { count: persons })}
        </span>
      </Text>
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('canonicalContext.otherFamily.hint')}
      </Text>
      {detail.length === 0 ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
          {t('canonicalContext.otherFamily.detailUnavailable')}
        </Text>
      ) : (
        <div data-testid="role-family-other-detail" className="mt-1">
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {t('canonicalContext.otherFamily.detailTitle')}
          </Text>
          <ul className="mt-1 space-y-0.5">
            {shown.map(row => (
              <li key={row.title}>
                <Text size="sm">
                  <span>{row.title}</span>
                  <span className="text-[var(--bellum-text-secondary)]">
                    {' '}
                    — {t('canonicalContext.otherFamily.titleCount', { count: row.count })}
                  </span>
                </Text>
              </li>
            ))}
          </ul>
          {detail.length > OTHER_DETAIL_LIMIT ? (
            <Button type="button" variant="ghost" size="sm" className="w-fit px-0" onClick={() => setExpanded(v => !v)}>
              {expanded
                ? t('canonicalContext.otherFamily.seeLess')
                : t('canonicalContext.otherFamily.seeMore', { count: hiddenCount })}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
