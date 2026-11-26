import { Button } from '@bellum/ui'
import { toast } from 'sonner'
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useApplicationUpdate } from '@/lib/hooks/use-application-update'

export const UpdateHandler = memo<{ children: ReactNode }>(function UpdateHandler({ children }) {
  const { t } = useTranslation('common')
  const { updateState, update } = useApplicationUpdate()
  const hasShownToast = useRef(false)

  const updateButton = useMemo(
    () => (
      <Button
        onClick={() => {
          update()
        }}
        variant="secondary"
      >
        {t('actions.update')}
      </Button>
    ),
    [update, t],
  )

  useEffect(() => {
    if (updateState === 'available' || (updateState === 'force' && !hasShownToast.current)) {
      toast.info(t('update.newVersion'), {
        action: updateButton,
      })
      hasShownToast.current = true
    }
  }, [updateState, update, updateButton, t])

  return children
})
