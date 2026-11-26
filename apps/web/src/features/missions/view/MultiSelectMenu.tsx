import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Option = { value: string; label: string }

/**
 * Un filtre à MULTI-SÉLECTION (décision de Louis, 23/10/2026) : un bouton qui dit combien de valeurs sont
 * choisies, un menu de cases à cocher, et « Tout effacer » pour revenir à « tous ».
 *
 * Plusieurs valeurs d'un même critère sont un OU ; le menu reste ouvert pendant qu'on coche (on choisit
 * plusieurs valeurs d'affilée, pas une).
 */
export function MultiSelectMenu({
  label,
  options,
  values,
  onChange,
}: {
  label: string
  options: readonly Option[]
  values: readonly string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useTranslation('missions')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11 gap-1.5">
          {values.length > 0 ? t('multiSelect.some', { label, count: values.length }) : label}
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map(option => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={() =>
              onChange(
                values.includes(option.value)
                  ? values.filter(value => value !== option.value)
                  : [...values, option.value],
              )
            }
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {values.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={false} onSelect={() => onChange([])}>
              {t('multiSelect.clear')}
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
