import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<ComponentSize, { padding: string; labelSize: 'xs' | 'sm'; valueSize: 'xs' | 'sm' | 'base' }> =
  {
    sm: { padding: 'py-2 px-3', labelSize: 'xs', valueSize: 'xs' },
    md: { padding: 'py-3 px-4', labelSize: 'sm', valueSize: 'sm' },
    lg: { padding: 'py-4 px-5', labelSize: 'sm', valueSize: 'base' },
  }

export type DataRowProps = {
  label: string
  value: string | ReactNode
  action?: ReactNode
  size?: ComponentSize
  bordered?: boolean
  className?: string
}

export const DataRow = ({ label, value, action, size = 'md', bordered = true, className }: DataRowProps) => {
  const sizes = sizeStyles[size]

  return (
    <Box
      display="flex"
      className={cn(
        'items-center justify-between',
        sizes.padding,
        bordered && 'border-b border-[var(--bellum-border)] last:border-0',
        className,
      )}
    >
      <Text size={sizes.labelSize} element="span" className="text-[var(--bellum-text-secondary)] shrink-0">
        {label}
      </Text>
      {/* min-w-0 : le libellé est shrink-0 (jamais tronqué), donc c'est CE
          conteneur qui doit accepter de rétrécir sous sa largeur de contenu —
          le défaut `min-width: auto` d'un enfant de flex l'en empêcherait
          sinon, et la ligne déborderait à 360px au lieu que la valeur se
          tronque. */}
      <Box display="flex" className="min-w-0 flex-1 items-center justify-end gap-2">
        {typeof value === 'string' ? (
          <Text
            size={sizes.valueSize}
            weight="medium"
            element="span"
            className="min-w-0 truncate text-[var(--bellum-text-primary)]"
          >
            {value}
          </Text>
        ) : (
          value
        )}
        {action}
      </Box>
    </Box>
  )
}
