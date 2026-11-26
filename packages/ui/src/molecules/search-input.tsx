import { Search, X } from 'lucide-react'
import { memo } from 'react'
import { FlexContainer } from '../atoms/container'
import { Button } from '../components/button'
import { Input } from '../components/input'
import { cn } from '../lib/utils'

export type SearchInputProps = {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  className?: string
  inputClassName?: string
  size?: 'sm' | 'md'
  /**
   * Le nom ACCESSIBLE du champ.
   *
   * Le `placeholder` n'en est pas un : il disparaît à la première frappe, et
   * plusieurs lecteurs d'écran ne l'annoncent pas du tout. Sur un écran qui
   * porte deux champs (chercher une ligne, chercher une personne), « zone de
   * texte » deux fois ne dit rien.
   *
   * Optionnel, et non imposé : vingt-huit écrans montent déjà ce composant, et
   * leur en inventer un ici — depuis un composant qui ne connaît pas i18n —
   * poserait un libellé faux plutôt qu'absent. À défaut, le `placeholder` reste
   * ce que l'utilisateur voyant lit.
   */
  ariaLabel?: string
}

/**
 * SearchInput — Input with a leading search icon and a trailing clear button
 * that appears when the field has a value.
 */
export const SearchInput = memo<SearchInputProps>(function SearchInput({
  placeholder = 'Rechercher...',
  value,
  onChange,
  onClear,
  className,
  inputClassName,
  size = 'md',
  ariaLabel,
}) {
  const handleClear = () => {
    if (onClear) {
      onClear()
    } else {
      onChange('')
    }
  }

  const sizeClasses = {
    sm: 'w-48 lg:w-64 h-9 pl-9 pr-8 text-sm',
    md: 'w-full h-12 pl-12 pr-12',
  } as const

  const iconWrapperClasses = {
    sm: 'pl-3',
    md: 'pl-4',
  } as const

  const iconClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
  } as const

  return (
    <div className={cn('relative', className)}>
      <FlexContainer
        className={cn('absolute inset-y-0 left-0 items-center pointer-events-none', iconWrapperClasses[size])}
      >
        <Search className={cn('text-[var(--text-muted)]', iconClasses[size])} strokeWidth={1.75} />
      </FlexContainer>
      <Input
        type="text"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(sizeClasses[size], inputClassName)}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className={cn(
            'absolute inset-y-0 right-0 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mr-2',
            size === 'sm' ? 'w-4 h-4 mt-2.5' : 'mt-4 w-5 h-5',
          )}
        >
          <X className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
})
