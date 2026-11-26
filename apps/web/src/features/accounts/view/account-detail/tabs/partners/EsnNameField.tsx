import type { EsnDirectorySuggestion } from '@bellum/contracts'
import { Input, Popover, PopoverAnchor, PopoverContent, Text, cn } from '@bellum/ui'
import { Building2 } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useEsnDirectorySuggestions } from './useEsnDirectorySuggestions'

/**
 * #1887 — LE CHAMP « NOM DE L'ESN », ADOSSÉ À NOTRE PROPRE RÉFÉRENTIEL.
 *
 * « je veux que la liste d'ESN qu'on a dans nos bases et tout nous servent à
 * faire de la suggestion, en mode je mets cap… ça nous met Capgemini et tout ».
 * C'était un `<Input>` nu : il fallait connaître l'orthographe exacte, et une
 * frappe approximative créait une ESN que rien ne rejoignait jamais.
 *
 * Le MOTIF est celui de `SearchAutocomplete` (écran de lancement d'analyse) —
 * `Popover` + `PopoverAnchor` autour du champ + des lignes qui sont des
 * `<button type="button">`. Aucune seconde façon d'afficher une liste de
 * propositions n'est inventée ici : il n'y a pas de `command`/`cmdk` dans
 * `@bellum/ui`, et c'est ce motif-là que le produit connaît déjà.
 *
 * ⚠️ CHOISIR UNE SUGGESTION REMPLIT LE CHAMP, ça n'ajoute pas. Le geste qui
 * engage reste « Ajouter », comme avant — et surtout : le champ reste LIBRE.
 * Une ESN absente du référentiel se déclare toujours à la main, parce que le
 * référentiel a 477 noms et que le marché en a plus.
 *
 * ⚠️ AUCUNE ENTREPRISE N'EST INVENTÉE. Les lignes viennent toutes du
 * référentiel ; quand rien ne correspond, la liste le DIT et ne propose pas la
 * frappe de l'utilisateur sous les traits d'une suggestion.
 */
export function EsnNameField({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  /** Le geste qui engage — déclenché à la touche Entrée comme au bouton. */
  onSubmit: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation('partners')
  const [open, setOpen] = useState(false)
  const { suggestions, loading, sourceUnavailable } = useEsnDirectorySuggestions(value)

  // Le panneau ne s'ouvre que si on a quelque chose à y écrire — une liste, une
  // attente, une panne, ou le fait qu'il n'y a rien. Un panneau vide qui
  // clignote à chaque touche est pire que pas de panneau.
  const hasSomethingToSay = loading || sourceUnavailable || suggestions.length > 0 || value.trim().length >= 2

  const choose = (suggestion: EsnDirectorySuggestion) => {
    onChange(suggestion.name)
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      setOpen(false)
      onSubmit()
    }
  }

  return (
    <Popover open={open && hasSomethingToSay} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full max-w-sm">
          <Input
            value={value}
            maxLength={160}
            placeholder={t('list.placeholder')}
            aria-label={t('list.fieldLabel')}
            disabled={disabled}
            onChange={event => {
              onChange(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Le focus reste dans le champ : on continue de taper pendant que la
        // liste se resserre. Sans ça, le panneau vole le curseur à l'ouverture.
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        className="max-h-64 overflow-y-auto p-1"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        {suggestions.length > 0 ? (
          <div role="listbox" aria-label={t('list.suggestions.groupLabel')}>
            {suggestions.map(suggestion => (
              <EsnSuggestionRow key={suggestion.normalizedName} suggestion={suggestion} onChoose={choose} />
            ))}
          </div>
        ) : loading ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1.5">
            {t('list.suggestions.searching')}
          </Text>
        ) : sourceUnavailable ? (
          /* Une panne se REMARQUE — « aucune ESN ne correspond » se croit, et
             ferait déclarer un doublon d'une ESN parfaitement présente. */
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="px-2 py-1.5">
            {t('list.suggestions.unavailable')}
          </Text>
        ) : (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1.5">
            {t('list.suggestions.none')}
          </Text>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Une ligne de proposition.
 *
 * Elle porte les faits qui DÉPARTAGENT deux entrées proches — « Capgemini » et
 * « Capgemini Invent » ne se distinguent que par leur ville, leur effectif ou
 * leur SIREN. Un fait absent est ABSENT : une entrée du référentiel que
 * personne n'a encore résolue se propose avec son seul nom, elle n'écrit pas
 * « 0 salarié » ni une ville devinée.
 */
function EsnSuggestionRow({
  suggestion,
  onChoose,
}: {
  suggestion: EsnDirectorySuggestion
  onChoose: (suggestion: EsnDirectorySuggestion) => void
}) {
  const { t } = useTranslation('partners')
  const facts = [
    suggestion.city,
    suggestion.headcountRange,
    suggestion.parentName ? t('list.suggestions.parent', { name: suggestion.parentName }) : null,
    suggestion.siren,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onChoose(suggestion)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
        'pointer-coarse:min-h-11',
        'transition-colors duration-150 ease-out hover:bg-[var(--bellum-bg-darker)]',
      )}
    >
      <Building2 className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--bellum-text-primary)]">{suggestion.name}</span>
        {facts ? <span className="block truncate text-xs text-[var(--bellum-text-muted)]">{facts}</span> : null}
      </span>
    </button>
  )
}
