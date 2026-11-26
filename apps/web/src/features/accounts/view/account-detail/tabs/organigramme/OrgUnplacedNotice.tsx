import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4749 — l'organigramme NOMME ce qu'il n'a pas pu placer, au lieu de rendre `null`.
 *
 * Un compte à 1 658 contacts, 0 placé, ne montrait RIEN : l'écran mentait par omission. C'est un
 * rendu structuré, pas une liste : l'absence reste nommée (combien de connus, combien non
 * rattachés, pourquoi). Jamais une probabilité, jamais un rattachement deviné.
 */
export function OrgUnplacedNotice({ known, unplaced }: { known: number; unplaced: number }) {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4" role="group" aria-label={t('hierarchy.unplacedAria')}>
      <Text element="h3" size="base" weight="semibold">
        {t('hierarchy.unplacedTitle')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-primary)]">
        {t('hierarchy.unplacedBody', { known, unplaced })}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('hierarchy.unplacedReason')}
      </Text>
    </Card>
  )
}
