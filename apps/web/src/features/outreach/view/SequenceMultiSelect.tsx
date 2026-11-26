import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { ChevronDown } from 'lucide-react'

/**
 * Théo C sequences-* — le sélecteur de la barre de filtres (`.v7-select` / `.a14-filterbar select`), à choix
 * MULTIPLE (décision Louis 23/10 : « multi-sélection partout »). Le déclencheur dit ce qui est choisi — « Tous… »,
 * le seul choix, ou « N choisis » ; le menu reste ouvert pendant qu'on coche ; « Tous » efface la famille.
 * Une seule définition pour la liste des séquences et la bibliothèque (GA-26).
 */
export function SequenceMultiSelect<T extends string>({
  label,
  allLabel,
  pickedLabel,
  options,
  values,
  onChange,
  testId,
}: {
  /** Le nom du filtre, lu par les lecteurs d'écran (« Filtrer par état », « Usage »…). */
  label: string
  allLabel: string
  pickedLabel: (count: number) => string
  options: readonly { value: T; label: string }[]
  values: ReadonlySet<T>
  onChange: (next: Set<T>) => void
  testId?: string
}) {
  const only = values.size === 1 ? options.find(option => values.has(option.value)) : undefined
  const shown = values.size === 0 ? allLabel : only ? only.label : pickedLabel(values.size)
  const toggle = (value: T) => {
    const next = new Set(values)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-40 justify-between pointer-coarse:min-h-11"
          aria-label={`${label} : ${shown}`}
          data-testid={testId}
        >
          <span className="truncate">{shown}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {options.map(option => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.has(option.value)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {values.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(new Set())}>{allLabel}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
