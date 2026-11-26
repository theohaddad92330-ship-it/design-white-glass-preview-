import { Card, DotIndicator, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { getOrganigrammeLegendItems } from '@/lib/contactRoles'

type RoleLegendCardProps = {
  contactsCount: number
  classifiedContactsCount: number
}

export function RoleLegendCard({ contactsCount, classifiedContactsCount }: RoleLegendCardProps) {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4">
      <div className="mb-4">
        <Text size="base" weight="semibold">
          {t('legend.title')}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('legend.classifiedCount', { classified: classifiedContactsCount, total: contactsCount })}
        </Text>
      </div>
      <div className="space-y-3">
        {getOrganigrammeLegendItems().map(item => (
          <RoleLegendItem key={item.role} color={item.dotClass} label={item.label} description={item.description} />
        ))}
      </div>
    </Card>
  )
}

function RoleLegendItem({ color, label, description }: { color: string; label: string; description: string }) {
  return (
    <div className="flex gap-3">
      <DotIndicator className={`mt-1.5 size-2.5 shrink-0 rounded-full ${color}`} />
      <div>
        <Text size="sm" weight="semibold">
          {label}
        </Text>
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {description}
        </Text>
      </div>
    </div>
  )
}
