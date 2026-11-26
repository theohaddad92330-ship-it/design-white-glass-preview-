import { memo, useId, type ElementType, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Text } from '../atoms/text'
import { HelpIcon } from '../molecules/help-icon'
import { Input } from './input'
import { Label } from './label'
import { Textarea } from './textarea'

type BaseFormFieldProps<P> = {
  label: string
  /** Component to render as the input field — `Input`, `Textarea`, or any custom field. */
  component: ElementType
  inputProps: P
  error?: string
  description?: string
  required?: boolean
  helperText?: string
}

function BaseFormField<P extends InputHTMLAttributes<HTMLInputElement> | TextareaHTMLAttributes<HTMLTextAreaElement>>({
  label,
  component: Component,
  inputProps,
  error,
  description,
  required,
  helperText,
}: BaseFormFieldProps<P>) {
  // #2436.5 / #2436.15 (GA-374) — trois ids stables, générés une fois par
  // instance. `fieldId` relie le libellé au champ (`htmlFor`/`id`) : sans lui,
  // `<Label>` et `<Component>` sont deux frères que rien ne relie, et un
  // lecteur d'écran qui atterrit sur l'input n'annonce aucun nom.
  const fieldId = useId()
  const errorId = useId()
  const descriptionId = useId()
  // Erreur et description ne s'affichent jamais ensemble (cf. rendu ci-dessous) :
  // un seul `aria-describedby` à la fois, jamais les deux ids concaténés pour
  // un texte à moitié rendu.
  const describedBy = error ? errorId : description ? descriptionId : undefined
  const existingId = (inputProps as { id?: string }).id ?? fieldId

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={existingId}>
        {label}
        {required && (
          <Text element="span" className="text-[var(--danger-soft-text)]">
            *
          </Text>
        )}
        {helperText && <HelpIcon title={helperText} />}
      </Label>
      <Component {...inputProps} id={existingId} aria-invalid={!!error} aria-describedby={describedBy} />
      {description && !error && (
        <Text id={descriptionId} size="sm" className="text-muted-foreground">
          {description}
        </Text>
      )}
      {error && (
        // `role="alert"` (alerte implicite `aria-live="assertive"`) : une
        // erreur qui apparaît APRÈS la soumission, quand le focus n'est plus
        // dans le champ, doit s'annoncer d'elle-même — sinon elle n'existe
        // que pour qui la relit visuellement.
        <Text id={errorId} role="alert" size="sm" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      )}
    </div>
  )
}

export const FormField = memo(function FormField(
  props: Omit<BaseFormFieldProps<InputHTMLAttributes<HTMLInputElement>>, 'component'>,
) {
  return <BaseFormField {...props} component={Input} />
})

export const FormTextareaField = memo(function FormTextareaField(
  props: Omit<BaseFormFieldProps<TextareaHTMLAttributes<HTMLTextAreaElement>>, 'component'>,
) {
  return <BaseFormField {...props} component={Textarea} />
})
