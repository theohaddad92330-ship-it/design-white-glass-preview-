import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PROJECT_COLUMN_KEYS, type ProjectColumnKey } from '../model/project-columns'

/**
 * #4337.1 — le menu « Colonnes » du tableau des affaires, posé dans la barre des filtres. Il ne fait que rendre le
 * choix qui vit dans `useProjectColumns` ; le nom de l'affaire, épinglé, n'y figure pas.
 */
export function ProjectColumnsPicker({
  visible,
  onToggle,
  onReset,
}: {
  visible: readonly ProjectColumnKey[]
  onToggle: (key: ProjectColumnKey, visible: boolean) => void
  onReset: () => void
}) {
  const { t } = useTranslation('projects')
  return (
    // `modal={false}` : on parcourt le tableau en même temps qu'on coche.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 size-4" aria-hidden="true" />
          {t('table.columnsCta')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60dvh] overflow-y-auto">
        <DropdownMenuLabel>{t('table.columnsLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PROJECT_COLUMN_KEYS.map(key => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={visible.includes(key)}
            // Le menu reste ouvert : cocher trois colonnes ne demande pas trois ouvertures.
            onSelect={event => event.preventDefault()}
            onCheckedChange={checked => onToggle(key, checked === true)}
          >
            {t(`table.columns.${key}`)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()}>{t('table.columnsReset')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
