import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { ActionDialog } from './action-dialog'

export type ConfirmationDialogProps = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** 'confirm' shows the primary button, 'danger' shows a red destructive button */
  variant?: 'confirm' | 'danger'
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  /** Trigger element opening the dialog */
  trigger: ReactNode
  isLoading?: boolean
}

/**
 * ConfirmationDialog — simplified confirm/cancel dialog wrapping `ActionDialog`.
 */
export const ConfirmationDialog = memo<ConfirmationDialogProps>(function ConfirmationDialog({
  title,
  description,
  icon = AlertTriangle,
  variant = 'confirm',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  trigger,
  isLoading,
}) {
  const [open, setOpen] = useState(false)

  return (
    <ActionDialog
      open={open}
      onOpenChange={setOpen}
      variant={variant === 'danger' ? 'danger' : 'base'}
      title={title}
      description={description}
      icon={icon}
      triggerButton={<span onClick={() => setOpen(true)}>{trigger}</span>}
      validateButtonLabel={confirmLabel}
      cancelButtonLabel={cancelLabel}
      onConfirm={() => {
        onConfirm()
        setOpen(false)
      }}
      allowCancelAction
      isLoading={isLoading}
    />
  )
})
