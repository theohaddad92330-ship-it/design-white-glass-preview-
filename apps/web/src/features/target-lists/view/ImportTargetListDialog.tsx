import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useVoiceAvailability } from '@/features/chat/voice/useVoiceAvailability'
import { useVoiceMode } from '@/features/chat/voice/useVoiceMode'
import { formatVoiceClock } from '@/features/chat/voice/voice-recorder'
import { isSupportedLanguage } from '@/i18n/config'
import { useImportTargetList } from '../useImportTargetList'
import { parseImportedNames } from '../lib/import-list'
import { TARGET_FIELD_CLASS } from './TargetListCard'
import { trackedMutation } from '@/lib/product-tracker'

interface ImportTargetListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * #2156.55 — « Importer une liste ».
 *
 * `addTargetListItemSchema` (packages/contracts/src/schemas/target-list.ts)
 * exige un `ref_id` réel : cette boîte ne crée donc jamais une fiche à partir
 * d'un nom collé, elle en RETROUVE parmi celles déjà dans l'espace
 * (`useImportTargetList`). Ce qu'on ne retrouve pas est annoncé, jamais tu ni
 * inventé — doctrine « jamais de donnée fictive ».
 */
export function ImportTargetListDialog({ open, onOpenChange }: ImportTargetListDialogProps) {
  const { t, i18n } = useTranslation('targets')
  const importList = useImportTargetList()
  const [name, setName] = useState('')
  const [text, setText] = useState('')

  // #2434.55 — DICTER la liste plutôt que la taper : chaque enregistrement
  // ajoute UNE ligne (un nom par « Terminer »), jamais un envoi de masse — rien
  // n'est écrit tant que « Importer » n'est pas cliqué (le mot RESTE dans
  // `text`, relisible et corrigeable comme un nom collé au clavier).
  const isDemo = useIsDemo()
  const voiceAvailable = useVoiceAvailability(isDemo)
  const language = isSupportedLanguage(i18n.language) ? i18n.language : 'fr'
  const voice = useVoiceMode({
    language,
    resetKey: open ? 'import-target-list-open' : 'import-target-list-closed',
    accountId: null,
    onTranscribed: result => {
      setText(current => (current.trim() ? `${current.trimEnd()}\n${result.text}` : result.text))
    },
    onError: () => toast.error(t('import.dictationError')),
  })

  const names = parseImportedNames(text)
  const canSubmit = name.trim().length > 0 && names.length > 0 && !importList.isPending

  const submit = () => {
    if (!canSubmit) return
    const tracked = trackedMutation('target_list_imported', '/signals')
    importList.mutate(
      { listName: name.trim(), names },
      {
        onSuccess: outcome => {
          tracked.onSuccess()
          toast.success(
            t('import.success', { count: outcome.added }),
            outcome.unmatched.length > 0
              ? {
                  description: t('import.unmatched', {
                    count: outcome.unmatched.length,
                    names: outcome.unmatched.join(', '),
                  }),
                }
              : undefined,
          )
          setName('')
          setText('')
          onOpenChange(false)
        },
        onError: () => {
          tracked.onError()
          toast.error(t('import.error'))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('import.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
          {t('create.name')}
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={120}
            className={TARGET_FIELD_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
          {t('import.namesLabel')}
          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            rows={6}
            placeholder={t('import.namesPlaceholder')}
            className={`${TARGET_FIELD_CLASS} w-full`}
          />
        </label>

        {voiceAvailable ? (
          <div className="flex flex-wrap items-center gap-2">
            {voice.phase === 'idle' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Mic}
                onClick={() => void voice.start()}
                className="pointer-coarse:min-h-11"
              >
                {t('import.dictateName')}
              </Button>
            ) : null}
            {voice.phase === 'requesting' ? (
              <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
                {t('import.dictateRequesting')}
              </span>
            ) : null}
            {voice.phase === 'recording' ? (
              <span role="group" aria-label={t('import.dictateName')} className="flex items-center gap-2">
                <span role="status" className="text-xs font-medium text-[var(--bellum-text-primary)]">
                  {t('import.dictateListening')}
                </span>
                <span className="text-xs tabular-nums text-[var(--bellum-text-muted)]">
                  {formatVoiceClock(voice.elapsedMs)}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={voice.cancel}>
                  {t('import.cancel')}
                </Button>
                <Button type="button" variant="black" size="sm" icon={Square} onClick={voice.stop}>
                  {t('import.dictateStop')}
                </Button>
              </span>
            ) : null}
            {voice.phase === 'transcribing' ? (
              <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
                {t('import.dictateTranscribing')}
              </span>
            ) : null}
          </div>
        ) : null}
        {voiceAvailable ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('import.dictationNotice')}
          </Text>
        ) : null}

        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('import.hint')}
        </Text>
        {/* #2167.9 — le contrat de page exige un coût ÉVENTUEL nommé sur
            chaque surface de prospection. Cet import ne fait que retrouver
            des `ref_id` déjà dans l'espace (`useImportTargetList`), jamais de
            collecte ni d'enrichissement : le coût réel est ZÉRO, quel que
            soit le volume collé — un import à 927 noms ne coûte pas plus
            qu'un seul. Le dire évite qu'un utilisateur hésite avant de coller
            une longue liste. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('import.costHint')}
        </Text>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('import.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {t('import.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
