import { ChevronRight, Headset, Info, Mail, type LucideIcon } from 'lucide-react'
import { memo, useState } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { ActionDialog } from '../components/action-dialog'
import { Button } from '../components/button'

type ContactItem = {
  icon: LucideIcon
  label: string
  href: string
}

export type ContactDialogProps = {
  openDialog?: boolean
  onOpenChange?: (open: boolean) => void
  showTriggerButton?: boolean
  title?: string
  description?: string
  imageSrc?: string
  contacts?: ContactItem[]
  triggerLabel?: string
}

const defaultContacts: ContactItem[] = [
  { icon: Headset, label: '+33 6 00 00 00 00', href: 'tel:+33000000000' },
  { icon: Mail, label: 'contact@bellum.fr', href: 'mailto:contact@bellum.fr' },
]

export const ContactDialog = memo<ContactDialogProps>(function ContactDialog({
  openDialog,
  onOpenChange,
  showTriggerButton = true,
  title = 'Pour contacter le support',
  description = 'Vous pouvez nous contacter par telephone ou par email. Nous vous repondrons dans les plus brefs delais.',
  imageSrc,
  contacts = defaultContacts,
  triggerLabel = 'Contacter le support',
}) {
  const [open, setOpen] = useState(false)
  return (
    <ActionDialog
      open={open || !!openDialog}
      onOpenChange={o => {
        setOpen(o)
        onOpenChange?.(o)
      }}
      onConfirm={() => {
        setOpen(false)
        onOpenChange?.(false)
      }}
      icon={Info}
      variant="info"
      title={title}
      triggerButton={
        showTriggerButton && (
          <Button variant="default" onClick={() => setOpen(true)}>
            {triggerLabel}
          </Button>
        )
      }
      allowCancelAction={false}
      validateButtonLabel="Fermer"
      size="xl"
      content={
        <Box py={4} className="space-y-6">
          {imageSrc && <img src={imageSrc} alt="contact" className="w-1/2 h-1/2 object-cover mx-auto" />}
          <Text size="base">{description}</Text>
          <Box rounded="lg" className="divide-y border overflow-hidden">
            {contacts.map(contact => (
              <a
                key={contact.href}
                href={contact.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <Box display="flex" className="items-center gap-3">
                  <contact.icon className="w-5 h-5 text-foreground" />
                  <Text size="sm" element="span">
                    {contact.label}
                  </Text>
                </Box>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </Box>
        </Box>
      }
    />
  )
})
