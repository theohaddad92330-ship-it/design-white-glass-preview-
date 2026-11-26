import { PLAYBOOK_FAMILY_ORDER, type PlaybookFamily } from '../playbook-families'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import { FileUp, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import type { ImportSequenceLibraryResult } from '@bellum/contracts'
import { useAskLauraAction } from '../hooks/useAskLauraAction'
import {
  useImportSequenceLibrary,
  useSequenceTemplates,
  useSetSequenceTemplateVisibility,
} from '../hooks/useSequenceLibrary'
import { SEQUENCE_LIBRARY_MAX_FILE_BYTES, fileToBase64 } from '../sequence-library'
import { modelSteps, modelToCsv, textToBase64, type ModelStepDraft } from '../sequence-model-csv'
import { ImportSummary } from './SequenceLibraryBlock'

/**
 * Théo C sequences-liste / sequences-bibliotheque — les quatre fenêtres de la bibliothèque : « Créer mon
 * modèle » (nom, usage, trois étapes), « Préparer avec {{copilot}} », « Un modèle depuis une page web » et
 * « Importer des campagnes ». Aucune n'envoie quoi que ce soit : un modèle se PRÉPARE, la personne envoie.
 */

const STEP_DAYS = [0, 3, 7] as const

/** Les trois étapes s'ouvrent DÉJÀ rédigées (la trame de départ de l'usage choisi), jamais des champs vides. */
export function starterSteps(family: PlaybookFamily, t: TFunction<'outreach'>): ModelStepDraft[] {
  return STEP_DAYS.map((day, index) => ({
    day,
    subject: t(`libraryView.model.starter.${family}.${index}.subject`),
    body: t(`libraryView.model.starter.${family}.${index}.body`),
  }))
}

/** Théo C sequences-bibliotheque — « Personnaliser une copie » : la fenêtre s'ouvre sur le modèle lu, déjà rempli. */
export type ModelCopy = { name: string; family: PlaybookFamily; steps: ModelStepDraft[] }

export function CreateModelDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: ModelCopy
}) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const askLaura = useAskLauraAction()
  const importMutation = useImportSequenceLibrary()
  const templates = useSequenceTemplates()
  const setVisibility = useSetSequenceTemplateVisibility()
  const [name, setName] = useState(initial?.name ?? '')
  const [family, setFamily] = useState<PlaybookFamily>(initial?.family ?? 'prospecting')
  const [when, setWhen] = useState('')
  const [condition, setCondition] = useState('')
  const [steps, setSteps] = useState<ModelStepDraft[]>(() => initial?.steps ?? starterSteps('prospecting', t))
  // Une copie porte déjà ses textes : changer d'usage ne les remplace pas.
  const [touched, setTouched] = useState(initial !== undefined)

  const chooseFamily = (next: PlaybookFamily) => {
    setFamily(next)
    // Changer d'usage re-propose la trame ; le texte déjà retouché à la main n'est jamais écrasé.
    if (!touched) setSteps(starterSteps(next, t))
  }
  const editStep = (index: number, patch: Partial<ModelStepDraft>) => {
    setTouched(true)
    setSteps(current => current.map((step, at) => (at === index ? { ...step, ...patch } : step)))
  }
  const canSave = name.trim() !== '' && modelSteps(steps).length > 0 && !importMutation.isPending

  const save = async () => {
    const modelName = name.trim()
    try {
      await importMutation.mutateAsync({
        filename: 'mon-modele.csv',
        content_base64: textToBase64(modelToCsv(modelName, steps)),
      })
      // « en personnel » : l'importation partage par défaut avec l'équipe ; ce modèle-ci est le sien.
      const fresh = (await templates.refetch()).data?.find(template => template.name === modelName)
      if (fresh && fresh.visibility !== 'personal') setVisibility.mutate({ id: fresh.id, visibility: 'personal' })
      toast.success(t('libraryView.model.saved'))
      onOpenChange(false)
    } catch {
      toast.error(t('library.import.failed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('libraryView.model.title')}</DialogTitle>
          <DialogDescription>{t('libraryView.model.lead')}</DialogDescription>
        </DialogHeader>
        <Box className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t('libraryView.model.name')}
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder={t('libraryView.model.namePlaceholder')}
              className="pointer-coarse:min-h-11"
            />
          </label>
          <Box className="flex flex-col gap-1 text-sm">
            <Text element="span" size="sm">
              {t('libraryView.model.usage')}
            </Text>
            <Select value={family} onValueChange={next => chooseFamily(next as PlaybookFamily)}>
              <SelectTrigger aria-label={t('libraryView.model.usage')} className="pointer-coarse:min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBOOK_FAMILY_ORDER.map(value => (
                  <SelectItem key={value} value={value}>
                    {t(`playbooks.family.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
          <label className="flex flex-col gap-1 text-sm">
            {t('libraryView.model.when')}
            <Input
              value={when}
              onChange={event => setWhen(event.target.value)}
              placeholder={t('libraryView.model.whenPlaceholder')}
              className="pointer-coarse:min-h-11"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('libraryView.model.condition')}
            <Input
              value={condition}
              onChange={event => setCondition(event.target.value)}
              placeholder={t('libraryView.model.conditionPlaceholder')}
              className="pointer-coarse:min-h-11"
            />
          </label>

          <Box className="flex flex-wrap items-center justify-between gap-2">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('libraryView.model.proposed')}
            </Text>
            {/* « Régénérer » : une autre trame, demandée à Laura avec l'usage et le moment saisis. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() =>
                askLaura(
                  t('libraryView.model.regeneratePrompt', {
                    usage: t(`playbooks.family.${family}`),
                    when: when.trim() || t('libraryView.model.whenPlaceholder'),
                  }),
                )
              }
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {t('libraryView.model.regenerate')}
            </Button>
          </Box>

          {steps.map((step, index) => (
            <Box key={index} className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] p-3">
              <Text element="h3" size="sm" weight="semibold">
                {index === 0
                  ? t('libraryView.model.step', { n: 1 })
                  : t('libraryView.model.stepOptional', { n: index + 1 })}
              </Text>
              <Box className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <label className="flex flex-col gap-1 text-sm">
                  {t('libraryView.model.day')}
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={step.day}
                    onChange={event => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      if (!Number.isNaN(parsed)) editStep(index, { day: parsed })
                    }}
                    className="pointer-coarse:min-h-11"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t('libraryView.model.subject')}
                  <Input
                    value={step.subject}
                    onChange={event => editStep(index, { subject: event.target.value })}
                    className="pointer-coarse:min-h-11"
                  />
                </label>
              </Box>
              <label className="flex flex-col gap-1 text-sm">
                {t('libraryView.model.message')}
                <Textarea
                  rows={5}
                  value={step.body}
                  onChange={event => editStep(index, { body: event.target.value })}
                />
              </label>
            </Box>
          ))}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('libraryView.model.hint', {
              firstName: '{{firstName}}',
              companyName: '{{companyName}}',
              signature: '{{signature}}',
            })}
          </Text>
        </Box>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button className="pointer-coarse:min-h-11" disabled={!canSave} onClick={() => void save()}>
            {t('libraryView.model.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Préparer un modèle avec Laura » — l'objectif s'ouvre DÉJÀ rédigé, éditable ; « Préparer une trame » le lui remet. */
export function LauraModelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const askLaura = useAskLauraAction()
  const [goal, setGoal] = useState(() => t('libraryView.laura.suggestion'))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('libraryView.laura.title')}</DialogTitle>
          <DialogDescription>{t('libraryView.laura.lead')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          {t('libraryView.laura.goal')}
          <Textarea rows={4} value={goal} onChange={event => setGoal(event.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            className="pointer-coarse:min-h-11"
            disabled={goal.trim() === ''}
            onClick={() => {
              askLaura(t('libraryView.laura.prompt', { goal: goal.trim() }))
              onOpenChange(false)
            }}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t('libraryView.laura.prepare')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Un modèle depuis une page web » — Laura lit la page et propose la trame ; l'adresse est à saisir (une URL ne se devine pas). */
export function WebPageModelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const askLaura = useAskLauraAction()
  const [url, setUrl] = useState('')
  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim())
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('libraryView.web.title')}</DialogTitle>
          <DialogDescription>{t('libraryView.web.lead')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          {t('libraryView.web.address')}
          <Input
            type="url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder={t('libraryView.web.placeholder')}
            className="pointer-coarse:min-h-11"
          />
        </label>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            className="pointer-coarse:min-h-11"
            disabled={!valid}
            onClick={() => {
              askLaura(t('libraryView.web.prompt', { url: url.trim() }))
              onOpenChange(false)
            }}
          >
            {t('libraryView.web.read')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Importer des campagnes » — dépôt ou parcours d'un fichier ; le dernier import nomme ses lignes écartées. */
export function ImportCampaignsDialog({
  open,
  onOpenChange,
  last,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  last: ImportSequenceLibraryResult | null
  onImported: (result: ImportSequenceLibraryResult) => void
}) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const importMutation = useImportSequenceLibrary()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > SEQUENCE_LIBRARY_MAX_FILE_BYTES) {
      toast.error(t('library.import.tooLarge'))
      return
    }
    try {
      onImported(await importMutation.mutateAsync({ filename: file.name, content_base64: await fileToBase64(file) }))
    } catch {
      toast.error(t('library.import.failed'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setOver(false)
    void onFile(event.dataTransfer.files[0])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('libraryView.import.title')}</DialogTitle>
          <DialogDescription>{t('libraryView.import.lead')}</DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('library.import.input')}
          data-testid="sequence-library-file"
          onChange={event => void onFile(event.target.files?.[0])}
        />
        <div
          onDragOver={event => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center ${
            over ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)]' : 'border-[var(--bellum-border)]'
          }`}
        >
          <Text size="sm" weight="medium">
            {t('libraryView.import.drop')}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={importMutation.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="size-4" aria-hidden="true" />
            {t('libraryView.import.browse')}
          </Button>
        </div>
        {last ? (
          <Box className="flex flex-col gap-2">
            <Text element="h3" size="sm" weight="semibold">
              {t('libraryView.import.last')}
            </Text>
            <ImportSummary result={last} />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('libraryView.import.skippedHint')}
            </Text>
          </Box>
        ) : null}
        <DialogFooter>
          <Button className="pointer-coarse:min-h-11" onClick={() => onOpenChange(false)}>
            {tc('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
