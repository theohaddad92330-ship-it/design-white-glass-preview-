import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { Button } from '@bellum/ui'
import { CreateWorkContextDialog, type CreateWorkContextDialogProps } from './CreateWorkContextDialog'

/**
 * #2455.4 — un déclencheur "Enregistrer ce contexte" réutilisable, monté à
 * chacun des trois parcours d'entrée demandés par l'issue (Mission ponctuelle
 * / Mon activité / un résultat). Ouvre la MÊME modale partout (GA-26).
 */
export function SaveWorkContextButton({
  label,
  variant = 'secondary',
  size = 'sm',
  ...dialogProps
}: Omit<CreateWorkContextDialogProps, 'open' | 'onOpenChange'> & {
  label: string
  variant?: 'secondary' | 'ghost' | 'default'
  size?: 'sm' | 'default'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} icon={Bookmark} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CreateWorkContextDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  )
}
