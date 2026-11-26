import { AlertTriangle } from 'lucide-react'
import { Box } from '../atoms/box'
import { Spacer } from '../atoms/spacer'
import { Text } from '../atoms/text'
import { Button } from '../components/button'
import { SectionCard } from './section-card'

type DangerZoneAction = {
  title: string
  description: string
  label?: string
  onAction: () => void
}

export type DangerZoneProps = {
  actions: DangerZoneAction[]
}

export const DangerZone = ({ actions }: DangerZoneProps) => (
  <SectionCard
    icon={AlertTriangle}
    title="Zone dangereuse"
    description="Attention, ces actions sont irréversibles"
    variant="danger"
  >
    <Box className="space-y-3">
      {actions.map(action => (
        <Box key={action.title} display="flex" className="items-center justify-between">
          <Box>
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {action.title}
            </Text>
            <Spacer size={2} />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {action.description}
            </Text>
          </Box>
          <Button variant="destructive" size="sm" onClick={action.onAction}>
            {action.label ?? 'Supprimer'}
          </Button>
        </Box>
      ))}
    </Box>
  </SectionCard>
)
