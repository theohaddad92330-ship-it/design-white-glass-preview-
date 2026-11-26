import { Button, SettingsRow } from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteAccountDialog } from './DeleteAccountDialog'

/**
 * Rangée « Supprimer mon compte » (RGPD droit à l'effacement). Ouvre une
 * confirmation explicite ; toute la logique de suppression vit dans
 * `<DeleteAccountDialog>`.
 */
export function DeleteAccountRow() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { t: tCommon } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <>
      <SettingsRow
        title={t('deleteAccountTitle')}
        description={t('deleteAccountRowDescription')}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="border-red-500/40 text-[var(--danger-soft-text)] hover:bg-red-500/5 hover:text-[var(--danger-soft-text)]"
          >
            <Trash2 size={13} className="mr-1.5" />
            {tCommon('actions.delete')}
          </Button>
        }
      />
      <DeleteAccountDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
