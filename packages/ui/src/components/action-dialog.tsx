import { AlertTriangle, Plus, type LucideIcon } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { IconBadge } from '../atoms/icon-badge'
import { Spinner } from '../atoms/spinner'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { FormField } from './form-field'

type DialogVariant = 'base' | 'success' | 'danger' | 'info'
type SizeDialog = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'

const getDialogContentClassName = (size: SizeDialog) =>
  cn(
    size === 'sm' && 'max-w-sm',
    size === 'md' && 'max-w-md',
    size === 'lg' && 'max-w-lg',
    size === 'xl' && 'min-w-xl',
    size === '2xl' && 'min-w-2xl',
    size === '3xl' && 'min-w-3xl',
    size === '4xl' && 'min-w-4xl',
  )

export type ActionDialogProps = {
  variant?: DialogVariant
  size?: SizeDialog
  open: boolean
  onOpenChange?: (open: boolean) => void
  onConfirm?: () => void
  title: string
  description?: ReactNode
  icon?: LucideIcon
  content?: ReactNode
  triggerButton?: ReactNode
  validateButtonLabel?: string
  validateButtonDisabled?: boolean
  confirmLabel?: string
  confirmPlaceholder?: string
  isLoading?: boolean
  blurOverlay?: boolean
  /**
   * #1797 — le nom accessible de la croix de fermeture de `DialogContent`
   * (variantes `base`/`info`, celles qui ne passent pas par `AlertDialog`).
   * `packages/ui` n'a pas d'i18n : le défaut reste français comme les autres
   * libellés de ce composant (`validateButtonLabel`, `cancelButtonLabel`),
   * et l'appelant le traduit s'il en a besoin.
   */
  closeLabel?: string
  cancelButtonLabel?: string
  cancelAction?: () => void
  allowCancelAction?: boolean
  /** Custom footer — replaces the default cancel/confirm buttons */
  footer?: ReactNode
}

export const ActionDialog = memo<ActionDialogProps>(function ActionDialog(props) {
  const { variant = 'base', validateButtonLabel = 'Enregistrer' } = props
  if (variant === 'danger') return <DangerDialog {...props} validateButtonLabel={validateButtonLabel} />
  if (variant === 'info') {
    return <BaseDialog {...props} validateButtonLabel={validateButtonLabel} variant={variant} />
  }
  return <BaseDialog {...props} validateButtonLabel={validateButtonLabel} />
})

type BaseDialogHeaderProps = {
  icon: LucideIcon
  iconColor: string
  bgColor: string
  title: string
  description?: ReactNode
}

function BaseDialogHeader({ icon, iconColor, bgColor, title, description }: BaseDialogHeaderProps) {
  return (
    <DialogHeader>
      <Box display="flex" className="items-center gap-2">
        <IconBadge icon={icon} iconColor={iconColor} bg={bgColor} />
        <Box>
          <DialogTitle>
            <Text size="lg" weight="medium" className="text-foreground">
              {title}
            </Text>
          </DialogTitle>
          {description && (
            <DialogDescription>
              <Text size="sm" className="text-muted-foreground">
                {description}
              </Text>
            </DialogDescription>
          )}
        </Box>
      </Box>
    </DialogHeader>
  )
}

type DangerDialogProps = Omit<ActionDialogProps, 'variant'>

function DangerDialog(props: DangerDialogProps) {
  const {
    open,
    onOpenChange,
    onConfirm,
    title,
    description,
    size = 'md',
    blurOverlay = true,
    triggerButton,
    content,
    confirmLabel,
    confirmPlaceholder,
    validateButtonLabel,
    validateButtonDisabled,
    isLoading,
    allowCancelAction,
    footer,
  } = props

  const [input, setInput] = useState('')

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {triggerButton && <AlertDialogTrigger asChild>{triggerButton}</AlertDialogTrigger>}
      {blurOverlay && <AlertDialogOverlay className="backdrop-blur-xs bg-background/10" />}
      <AlertDialogContent className={getDialogContentClassName(size)}>
        <AlertDialogHeader>
          <Box display="flex" className="items-center gap-2">
            <IconBadge icon={AlertTriangle} iconColor="text-[var(--danger-soft-text)]" bg="bg-red-500/10" />
            <AlertDialogTitle>
              <Text size="base" weight="medium" className="text-foreground">
                {title}
              </Text>
            </AlertDialogTitle>
          </Box>
          <AlertDialogDescription>
            <Text element="span" size="sm" className="text-muted-foreground">
              {description}
            </Text>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {content && <Box className="flex flex-col gap-4">{content}</Box>}

        {confirmLabel && (
          <FormField
            label={confirmLabel}
            inputProps={{
              placeholder: confirmPlaceholder ?? 'Entrez la valeur de confirmation',
              value: input,
              onChange: e => setInput(e.target.value),
            }}
          />
        )}

        {footer ? (
          <AlertDialogFooter>{footer}</AlertDialogFooter>
        ) : (
          <AlertDialogFooter>
            {allowCancelAction && <AlertDialogCancel>Annuler</AlertDialogCancel>}
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={(confirmLabel ? !input.trim() : false) || isLoading || validateButtonDisabled}
              onClick={() => {
                onConfirm?.()
                onOpenChange?.(false)
              }}
            >
              {isLoading ? <Spinner size={16} className="animate-spin" aria-hidden="true" /> : validateButtonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function BaseDialog(props: ActionDialogProps) {
  const {
    open,
    onOpenChange,
    onConfirm,
    title,
    description,
    blurOverlay = true,
    triggerButton,
    content,
    validateButtonLabel,
    validateButtonDisabled,
    cancelButtonLabel = 'Annuler',
    cancelAction,
    icon = Plus,
    variant = 'base',
    size = 'md',
    isLoading,
    allowCancelAction,
    footer,
    closeLabel = 'Fermer',
  } = props

  const handleClose = () => onOpenChange?.(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {triggerButton && <DialogTrigger asChild>{triggerButton}</DialogTrigger>}
      {blurOverlay && <DialogOverlay className="backdrop-blur-xs bg-background/10" />}
      <DialogContent
        closeLabel={closeLabel}
        className={cn('max-h-[90vh] overflow-y-auto', getDialogContentClassName(size))}
      >
        <BaseDialogHeader
          icon={icon}
          iconColor="text-white"
          bgColor="bg-[var(--bellum-primary-500)]"
          title={title}
          description={description}
        />
        {content && <Box className="flex flex-col gap-4">{content}</Box>}
        {footer ? (
          <DialogFooter>{footer}</DialogFooter>
        ) : (
          <DialogFooter>
            {allowCancelAction && (
              <Button variant="outline" onClick={cancelAction ? cancelAction : handleClose}>
                {cancelButtonLabel}
              </Button>
            )}
            <Button
              disabled={validateButtonDisabled || isLoading}
              variant={variant === 'info' ? 'outline' : 'default'}
              onClick={() => onConfirm?.()}
              isLoading={isLoading}
            >
              {validateButtonLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
