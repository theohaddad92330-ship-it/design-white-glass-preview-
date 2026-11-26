import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@bellum/ui'
import { OUTREACH_CHANNELS, type ContentVisibility, type OutreachChannel } from '@bellum/contracts'
import { useCreateMessageLibraryEntry } from '@/features/message-library/hooks/useCreateMessageLibraryEntry'

/**
 * #4158.50 — créer un exemple de la bibliothèque depuis l'écran : titre, canal,
 * texte, visibilité « équipe » par défaut. L'API (lot L5) exige d'autres champs
 * de classement : ils prennent la valeur NEUTRE « non renseigné », et l'exemple
 * naît `a_revoir` + `inspiration` — jamais proposé comme message prêt à envoyer
 * tant qu'un humain ne l'a pas revu (la règle absolue de #3427 reste entière).
 */
const UNSET = 'non renseigné'

export function AddMessageExampleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('knowledge')
  const create = useCreateMessageLibraryEntry()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [channel, setChannel] = useState<OutreachChannel>('linkedin_draft')
  const [visibility, setVisibility] = useState<ContentVisibility>('team')
  const canSubmit = title.trim().length > 0 && text.trim().length > 0 && !create.isPending

  const submit = () => {
    create.mutate(
      {
        title: title.trim(),
        text: text.trim(),
        origin: t('messageLibrary.add.origin'),
        sourceDocument: t('messageLibrary.add.source'),
        version: 1,
        date: new Date().toISOString(),
        channel,
        scenarioId: 'cold_approach',
        persona: 'decideur',
        decisionRole: UNSET,
        stage: UNSET,
        route: UNSET,
        objective: UNSET,
        expectedVariables: [],
        mandatoryFacts: [],
        claims: [],
        status: 'a_revoir',
        mode: 'inspiration',
        usageConstraints: [],
        visibility,
      },
      {
        onSuccess: () => {
          setTitle('')
          setText('')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('messageLibrary.add.title')}</DialogTitle>
          <DialogDescription>{t('messageLibrary.add.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-example-title">{t('messageLibrary.add.titleLabel')}</Label>
            <Input id="msg-example-title" value={title} onChange={event => setTitle(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-example-channel">{t('messageLibrary.add.channelLabel')}</Label>
            <Select value={channel} onValueChange={value => setChannel(value as OutreachChannel)}>
              <SelectTrigger id="msg-example-channel" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTREACH_CHANNELS.map(value => (
                  <SelectItem key={value} value={value}>
                    {t(`messageLibrary.channel.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-example-text">{t('messageLibrary.add.textLabel')}</Label>
            <Textarea id="msg-example-text" rows={6} value={text} onChange={event => setText(event.target.value)} />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visibility === 'team'}
              onChange={event => setVisibility(event.target.checked ? 'team' : 'personal')}
            />
            {t('messageLibrary.add.shareWithTeam')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button className="min-h-11" disabled={!canSubmit} onClick={submit}>
            {t('messageLibrary.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
