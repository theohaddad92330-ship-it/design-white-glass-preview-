import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, SelectField, Text, type SelectFieldOption } from '@bellum/ui'

/**
 * #4425 — UNE valeur du profil qui s'affiche, et qui se corrige là où on la lit.
 *
 * Lecture : la valeur, ou « Non renseigné » (jamais `0`, jamais une cellule
 * vide qui se lirait comme une valeur). Écriture : un champ en ligne, rognée à
 * l'envoi ; `onSave` est l'appelant qui décide OÙ ça s'écrit (le même
 * `PUT /esn-profile` que le questionnaire, ou le magasin d'onboarding) — ce
 * composant ne connaît aucune route. Un échec garde le champ ouvert et le dit.
 *
 * `lockedReason` : le verrou de rôle (non admin d'un espace partagé) — pas de
 * bouton, la raison est dite.
 */
export function InlineProfileValue({
  label,
  value,
  onSave,
  inputType = 'text',
  options,
  lockedReason = null,
  className,
}: {
  label: string
  value: string | null
  onSave: (next: string) => void | Promise<void>
  inputType?: 'text' | 'number' | 'url'
  /** Liste FERMÉE (ex. `ESN_ANSWER_OPTIONS`) : un sélecteur, jamais un champ libre qui écrirait une valeur hors liste. */
  options?: readonly SelectFieldOption[]
  lockedReason?: string | null
  className?: string
}) {
  const { t } = useTranslation('common')
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const open = (): void => {
    setDraft(value ?? '')
    setFailed(false)
    setEditing(true)
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setPending(true)
    setFailed(false)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={event => void submit(event)} className={className}>
        <label htmlFor={inputId} className="text-xs text-[var(--bellum-text-muted)]">
          {label}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {options ? (
            <SelectField
              id={inputId}
              ariaLabel={label}
              value={draft}
              onChange={setDraft}
              options={options}
              disabled={pending}
              className="min-w-0 flex-1 pointer-coarse:min-h-11"
            />
          ) : (
            <Input
              id={inputId}
              type={inputType}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              disabled={pending}
              className="min-w-0 flex-1 pointer-coarse:min-h-11"
            />
          )}
          <Button type="submit" size="sm" isLoading={pending} className="pointer-coarse:min-h-11">
            {t('actions.save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setEditing(false)}
            className="pointer-coarse:min-h-11"
          >
            {t('actions.cancel')}
          </Button>
        </div>
        {failed && (
          <Text element="p" size="xs" role="alert" className="mt-1 text-[var(--danger-soft-text)]">
            {t('inlineEdit.saveFailed')}
          </Text>
        )}
      </form>
    )
  }

  return (
    <div className={className}>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        <Text
          element="span"
          size="sm"
          className={value ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}
        >
          {value || t('inlineEdit.notProvided')}
        </Text>
        {lockedReason ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {lockedReason}
          </Text>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={open}
            aria-label={`${t('actions.edit')} — ${label}`}
            className="pointer-coarse:min-h-11"
          >
            {t('actions.edit')}
          </Button>
        )}
      </div>
    </div>
  )
}
