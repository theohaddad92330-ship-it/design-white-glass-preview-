import type { ConnectedClientTool } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { DropdownMenuCheckboxItem, DropdownMenuLabel } from '@bellum/ui'

/**
 * #5048 — les puces « Tes outils avec Laura » (`ComposerToolChips`) se taisent sous 768 px une
 * fois le fil commencé (GA-28 : pas de pile entre composeur et navigation basse). Le geste n'est
 * pas perdu, il se reprend dans le « + » : MÊME sélection (`toolSourcesStore`), jamais montée en
 * même temps que les puces (`showHiddenComposerTools`, GA-26). Un outil « à reconnecter » ne se
 * coche pas : il se reconnecte dans `/integrations`, jamais ici.
 */
export function ComposerToolsChecklist({
  tools,
  excludedProviders,
  onToggle,
}: {
  tools: readonly ConnectedClientTool[]
  excludedProviders: readonly string[]
  onToggle: (provider: string) => void
}) {
  const { t } = useTranslation('chat')
  const selectable = tools.filter(tool => !tool.needsReconnect)
  if (selectable.length === 0) return null
  return (
    <>
      <DropdownMenuLabel>{t('toolChips.group')}</DropdownMenuLabel>
      {selectable.map(tool => (
        <DropdownMenuCheckboxItem
          key={tool.provider}
          checked={!excludedProviders.includes(tool.provider)}
          onCheckedChange={() => onToggle(tool.provider)}
          className="min-h-11"
        >
          {tool.name}
        </DropdownMenuCheckboxItem>
      ))}
    </>
  )
}
