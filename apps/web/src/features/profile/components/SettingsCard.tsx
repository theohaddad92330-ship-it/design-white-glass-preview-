import { memo, type ReactNode } from 'react'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'

type SettingsCardProps = {
  title: string
  description?: string
  tone?: 'default' | 'danger'
  children: ReactNode
  className?: string
}

/**
 * Une carte de Réglages À CONTENU LIBRE (formulaire, puces) : le bloc commun des maquettes Théo V22 (`SettingsBlock`,
 * titre et phrase DANS la carte, un filet), son corps aux marges des lignes. Un seul rendu de bloc pour tous les écrans
 * de Réglages (GA-26) — cette carte ne redessine plus le sien.
 */
export const SettingsCard = memo<SettingsCardProps>(function SettingsCard({
  title,
  description,
  tone = 'default',
  children,
  className,
}) {
  return (
    <SettingsBlock label={title} description={description} tone={tone} className={className}>
      <div className="px-5 py-4 sm:px-6">{children}</div>
    </SettingsBlock>
  )
})
