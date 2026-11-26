import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Text } from '../atoms/text'
import { Input } from './input'
import { Label } from './label'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

type Props = {
  label: string
  error?: string
  required?: boolean
  inputProps: InputHTMLAttributes<HTMLInputElement>
}

/**
 * Password input with a show/hide toggle. Lives in `@bellum/ui` so any app
 * (web, future admin/back-office, marketing) can reuse the same behavior.
 */
export function PasswordField({ label, error, required, inputProps }: Props) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  const tooltipLabel = visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required && (
          <Text element="span" className="text-[var(--danger-soft-text)]">
            *
          </Text>
        )}
      </Label>
      <div className="relative">
        <Input {...inputProps} type={visible ? 'text' : 'password'} aria-invalid={!!error} className="pr-10" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible(v => !v)}
              aria-label={tooltipLabel}
              aria-pressed={visible}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--bellum-primary-500)_35%,transparent)] after:absolute after:content-[''] pointer-coarse:after:-inset-2"
            >
              <Icon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{tooltipLabel}</TooltipContent>
        </Tooltip>
      </div>
      {error && (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      )}
    </div>
  )
}
