import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EASE,
  Textarea,
  TooltipButton,
} from '@bellum/ui'
import { messageStyleThreadKey, type ApprovedTemplateCandidate, type MessageStyleTemplate } from '@bellum/contracts'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowUp, ChevronDown, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageStyleCreateForm } from '@/features/knowledge/view/MessageStyleCreateForm'
import { ApprovedTemplatePicker } from './ApprovedTemplatePicker'
import { channelIcon, channelLabel } from './channel'
import { ComposerParameters } from './ComposerParameters'
import { MessageBriefSummary } from './MessageBriefSummary'
import { MyAnglesPicker } from './MyAnglesPicker'
import type { MessageBrief } from '@/lib/message-insight'
import type { MessageParameters } from './message-parameters'
import type { EngagementChannel, ObjectionResponse } from './types'

type ComposerDockProps = {
  channel: EngagementChannel
  channels: EngagementChannel[]
  contactId: string
  context: string
  hasObjections: boolean
  /** #3637 — appel préparé sans aucune objection au dossier : on nomme l'absence. */
  objectionsGap?: boolean
  objections: ObjectionResponse[]
  showObjections: boolean
  onChannelChange: (channel: EngagementChannel) => void
  onContextChange: (context: string) => void
  onGenerate: () => void
  /** #2123.61-.68 — les paramètres du message choisis dans le formulaire. */
  parameters: MessageParameters
  onParametersChange: (parameters: MessageParameters) => void
  /** #3694.4 — le cadrage lu au dossier par le dernier brouillon généré ; absent = aucun bloc. */
  brief?: MessageBrief | null
  briefAngle?: string
  onToggleObjections: () => void
  /** #2204.59-.65 — les styles `active` de cet espace pour CE canal. Vide = aucun sélecteur affiché. */
  styleOptions: MessageStyleTemplate[]
  styleTemplateId: string | null
  onStyleTemplateIdChange: (styleTemplateId: string | null) => void
  /** #3417 (retour bêta 30/09) — insérer le texte EXACT d'un modèle approuvé. */
  onUseApprovedTemplate: (candidate: ApprovedTemplateCandidate) => void
}

export function ComposerDock({
  channel,
  channels,
  contactId,
  context,
  hasObjections,
  objectionsGap = false,
  objections,
  showObjections,
  onChannelChange,
  onContextChange,
  onGenerate,
  parameters,
  onParametersChange,
  brief,
  briefAngle = '',
  onToggleObjections,
  styleOptions,
  styleTemplateId,
  onStyleTemplateIdChange,
  onUseApprovedTemplate,
}: ComposerDockProps) {
  const { t } = useTranslation('engagement')
  const textareaRef = useAutoResizeTextarea(context)
  const [parametersOpen, setParametersOpen] = useState(false)

  return (
    <div className="p-2.5 sm:p-3">
      <div className="flex min-h-[104px] flex-col rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-3 shadow-sm">
        {hasObjections ? (
          <>
            <ObjectionsContextButton
              count={objections.length}
              expanded={showObjections}
              onToggle={onToggleObjections}
            />
            <AnimatePresence initial={false}>
              {showObjections ? <ComposerObjections objections={objections} /> : null}
            </AnimatePresence>
          </>
        ) : objectionsGap ? (
          // #3637 — « Préparer mon appel » promet les objections : sans dossier qui en porte, on le DIT
          // (une absence nommée), au lieu d'un silence que la recette lit comme « pas implémenté ».
          <p className="mb-2 text-xs text-[var(--bellum-text-secondary)]">{t('composer.objectionsNone')}</p>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={context}
          onChange={event => onContextChange(event.target.value)}
          rows={1}
          placeholder={t('composer.placeholder')}
          className="max-h-[220px] min-h-10 resize-none overflow-hidden border-none border-transparent focus-visible:border-none rounded-none bg-transparent p-0 text-sm leading-5 text-[var(--bellum-text-primary)] shadow-none placeholder:text-[var(--bellum-text-muted)] ring-offset-transparent focus-visible:ring-transparent"
          aria-label={t('composer.contextAria')}
        />
        <div className="mt-3 flex max-h-[min(40dvh,18rem)] flex-wrap items-start gap-2 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--bellum-border)]">
          {brief ? (
            <div className="w-full min-w-0">
              <MessageBriefSummary brief={brief} angle={briefAngle} onCorrect={() => setParametersOpen(true)} />
            </div>
          ) : null}
          <ComposerParameters
            parameters={parameters}
            onParametersChange={onParametersChange}
            open={parametersOpen}
            onOpenChange={setParametersOpen}
          />
          <ApprovedTemplatePicker
            channel={channel}
            contactId={contactId}
            parameters={parameters}
            onUseTemplate={onUseApprovedTemplate}
          />
          {/* #4739 — « Mes angles » : ceux que le commercial a écrits, retrouvés à chaque message. */}
          <MyAnglesPicker onUseAngle={onContextChange} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <ChannelSelector channel={channel} channels={channels} onChannelChange={onChannelChange} />
            {/* #2204.65 — le sélecteur reste là sans style actif : c'est la porte pour en créer un POUR CE FIL. */}
            <StyleSelector
              contactId={contactId}
              options={styleOptions}
              styleTemplateId={styleTemplateId}
              onStyleTemplateIdChange={onStyleTemplateIdChange}
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipButton
              tooltip={t('composer.generate')}
              variant="default"
              size="icon"
              aria-label={t('composer.generate')}
              className="size-6 rounded-full"
              onClick={onGenerate}
            >
              <ArrowUp className="size-4" />
            </TooltipButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComposerObjections({ objections }: { objections: ObjectionResponse[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.2, ease: EASE.out }}
      className="mb-3 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--bellum-warning)_24%,var(--bellum-border))] bg-[color-mix(in_srgb,var(--bellum-warning)_7%,transparent)]"
    >
      <div className="max-h-40  space-y-2 overflow-y-auto p-2.5 pr-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--bellum-border)]">
        {objections.map(item => (
          <ComposerObjection key={`${item.objection}-${item.response}`} item={item} />
        ))}
      </div>
    </motion.div>
  )
}

function ComposerObjection({ item }: { item: ObjectionResponse }) {
  return (
    <div className="text-xs leading-5">
      <p className="font-medium text-[var(--bellum-text-primary)]">{item.objection}</p>
      <p className="mt-0.5 text-[var(--bellum-text-secondary)]">{item.response}</p>
    </div>
  )
}

function ObjectionsContextButton({
  count,
  expanded,
  onToggle,
}: {
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('engagement')
  const label = t('composer.objections', { count })

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="mb-2 flex h-7 w-fit max-w-full items-center gap-2 rounded-md px-1.5 text-left text-sm font-medium text-[var(--bellum-text-secondary)] transition-[background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] hover:text-[var(--bellum-text-primary)] active:scale-[0.99]"
    >
      <AlertCircle className="size-4 shrink-0 text-[var(--warning-soft-text)]" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = '40px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [value])

  return ref
}

function ChannelSelector({
  channel,
  channels,
  onChannelChange,
}: {
  channel: EngagementChannel
  channels: EngagementChannel[]
  onChannelChange: (channel: EngagementChannel) => void
}) {
  const Icon = channelIcon(channel)

  if (channels.length === 1) {
    return (
      <div className="flex h-8 items-center gap-1.5 px-1.5 text-xs font-medium text-[var(--bellum-text-muted)]">
        <Icon className="size-3.5" />
        {channelLabel(channel)}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 px-1.5 text-xs rounded-full text-[var(--bellum-text-secondary)]"
        >
          <Icon className="size-3.5 mr-1" />
          {channelLabel(channel)}
          <ChevronDown className="size-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {channels.map(item => (
          <ChannelOption key={item} channel={item} onChannelChange={onChannelChange} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * #2204.59-.65 (épopée #2947) — choisir un style ici l'ajoute RÉELLEMENT à la
 * prochaine génération (`/ia/message`, `messageStyleTemplateId`), pas
 * seulement à l'estampille d'un message sauvegardé plus tard. `options` est
 * déjà filtré aux styles `active` DE CE CANAL par l'appelant (`EngagementPanel`) —
 * ce composant n'affiche jamais rien de plus que ce qu'on lui donne (GA-18/19).
 */
export function StyleSelector({
  contactId,
  options,
  styleTemplateId,
  onStyleTemplateIdChange,
}: {
  contactId: string
  options: MessageStyleTemplate[]
  styleTemplateId: string | null
  onStyleTemplateIdChange: (styleTemplateId: string | null) => void
}) {
  const { t } = useTranslation('engagement')
  const selected = options.find(option => option.id === styleTemplateId) ?? null
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs rounded-full text-[var(--bellum-text-secondary)]"
          >
            <Sparkles className="size-3.5 mr-1" />
            {selected ? selected.persona : t('composer.style.none')}
            <ChevronDown className="size-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => onStyleTemplateIdChange(null)}>{t('composer.style.none')}</DropdownMenuItem>
          {options.map(option => (
            <DropdownMenuItem key={option.id} onSelect={() => onStyleTemplateIdChange(option.id)}>
              {option.persona} — {option.objective}
            </DropdownMenuItem>
          ))}
          {/* #2204.65 — le fil, c'est la conversation avec CE contact : le style créé ici ne sert qu'à lui. */}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            {t('composer.style.createForThread')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent closeLabel={t('composer.style.createClose')} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('composer.style.createForThread')}</DialogTitle>
            <DialogDescription>{t('composer.style.createDescription')}</DialogDescription>
          </DialogHeader>
          <MessageStyleCreateForm
            conversationId={messageStyleThreadKey(contactId)}
            defaultOpen
            onDone={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function ChannelOption({
  channel,
  onChannelChange,
}: {
  channel: EngagementChannel
  onChannelChange: (channel: EngagementChannel) => void
}) {
  const Icon = channelIcon(channel)

  return (
    <DropdownMenuItem onSelect={() => onChannelChange(channel)} className="gap-2">
      <Icon className="size-4 text-[var(--bellum-text-secondary)]" />
      {channelLabel(channel)}
    </DropdownMenuItem>
  )
}
