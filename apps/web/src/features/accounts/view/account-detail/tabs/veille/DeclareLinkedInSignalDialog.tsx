import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { Linkedin, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeclareSignals } from '@/features/accounts/hooks/useDeclareSignals'

type DeclareLinkedInSignalDialogProps = {
  accountId: string
  /** #3924 — pré-remplissage depuis un post COLLÉ dans Laura ; vide sinon. */
  initialUrl?: string
  initialNote?: string
  /** #3924 — le libellé du déclencheur, quand l'écran hôte le nomme autrement. */
  triggerLabel?: string
}

/** Colle une URL et/ou un texte en un seul `label` — la forme STOCKÉE
 *  (`declaredSignalItemInputSchema.label`) n'a pas de champ URL dédié : c'est
 *  le fait « tel qu'écrit par le commercial », jamais reformulé. */
function buildLabel(url: string, note: string): string | null {
  const trimmedUrl = url.trim()
  const trimmedNote = note.trim()
  if (trimmedUrl && trimmedNote) return `${trimmedNote} — ${trimmedUrl}`
  if (trimmedNote) return trimmedNote
  if (trimmedUrl) return trimmedUrl
  return null
}

/**
 * #2634.1 — « Ajouter un signal depuis LinkedIn », sur la fiche compte.
 *
 * Doctrine `c79_collecte_large_mais_propre` (`agent_docs/doctrine.md`) :
 * LinkedIn n'est admis QUE par ce que le commercial apporte lui-même — une URL
 * et/ou un texte qu'il a copié. Ce composant ne contacte JAMAIS LinkedIn ; il
 * n'écrit que ce qui a été collé ici, vers `POST /accounts/:id/signals/declare`
 * (`useDeclareSignals`, même patron que `useDeclareOrgPeople`).
 */
export function DeclareLinkedInSignalDialog({
  accountId,
  initialUrl = '',
  initialNote = '',
  triggerLabel,
}: DeclareLinkedInSignalDialogProps) {
  const { t } = useTranslation('accountWatch')
  const declare = useDeclareSignals(accountId)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(initialUrl)
  const [note, setNote] = useState(initialNote)

  const label = buildLabel(url, note)

  const reset = () => {
    setUrl(initialUrl)
    setNote(initialNote)
  }

  const submit = () => {
    if (!label) return
    declare.mutate(
      { source: 'LinkedIn', entryKind: 'manual', signals: [{ label }] },
      {
        onSuccess: () => {
          reset()
          setOpen(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <Button type="button" variant="outline" size="sm" icon={Linkedin} onClick={() => setOpen(true)}>
        {triggerLabel ?? t('declareLinkedin.trigger')}
      </Button>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">{t('declareLinkedin.dialogTitle')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('declareLinkedin.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Box className="space-y-3">
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('declareLinkedin.urlPlaceholder')}
            aria-label={t('declareLinkedin.urlLabel')}
          />
          <Textarea
            rows={4}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('declareLinkedin.notePlaceholder')}
            aria-label={t('declareLinkedin.noteLabel')}
          />
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declareLinkedin.hint')}
          </Text>
          <Button
            type="button"
            size="sm"
            icon={Plus}
            disabled={!label || declare.isPending}
            isLoading={declare.isPending}
            onClick={submit}
          >
            {t('declareLinkedin.submit')}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
