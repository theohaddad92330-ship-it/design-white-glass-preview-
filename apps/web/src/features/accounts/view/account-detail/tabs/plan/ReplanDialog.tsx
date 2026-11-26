import { MESSAGE_MATRIX, type StrategyScope } from '@bellum/contracts'
import {
  Box,
  Button,
  chipClassName,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Text,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Compass, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import type { AttackAngle } from './planViewData'

type EntryMode = NonNullable<StrategyScope['entryMode']>
type MessageObjective = NonNullable<StrategyScope['objective']>

const ENTRY_MODES: readonly EntryMode[] = ['top_down', 'bottom_up', 'middle_out'] as const

type ReplanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  angles: AttackAngle[]
}

/**
 * "Changer d'angle / re-planifier" (Théo Palier-2 §3). Rebuilds the action plan
 * around a chosen angle / entry vector / focus entity, reusing the stored research
 * + contacts — a synchronous, credit-free re-plan (never a full re-analysis). An
 * empty selection lets the LLM recommend the strategy. Nothing runs until the user
 * clicks "Re-planifier" explicitly.
 */
export function ReplanDialog({ open, onOpenChange, accountId, angles }: ReplanDialogProps) {
  const { t } = useTranslation('accountDetail')
  const queryClient = useQueryClient()
  const [angle, setAngle] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode | ''>('')
  const [focusEntity, setFocusEntity] = useState('')
  const [constraints, setConstraints] = useState('')
  const [objective, setObjective] = useState<MessageObjective | ''>('')

  // Reset the form each time the dialog (re)opens so a second run starts clean.
  useEffect(() => {
    if (open) {
      setAngle('')
      setEntryMode('')
      setFocusEntity('')
      setConstraints('')
      setObjective('')
    }
  }, [open])

  const angleTitles = dedupeAngleTitles(angles)

  const isDemo = useIsDemo()

  const replan = useMutation({
    mutationFn: (strategy: StrategyScope) => accountsApi.replan(accountId, strategy),
    onSuccess: async () => {
      toast.success(t('replan.success'))
      await queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.cause === 409) {
        // #3278.8 — en démo le 409 est le gel des dossiers, pas une précondition manquante : on le dit, et on ferme.
        if (isDemo) {
          toast.warning(t('replan.demoFrozen'))
          onOpenChange(false)
          return
        }
        toast.error(t('replan.preconditionError'))
        return
      }
      // #1092 — « HTTP erreur en notification ». Mesuré en production : un 502
      // `ROUTER_EXTERNAL_TARGET_ERROR` à 120 176 ms, c'est-à-dire la coupure de
      // la passerelle qui sert la SPA. Le calcul, lui, court toujours côté
      // serveur et persiste son plan quand il aboutit.
      //
      // C'est donc un `unknown` au sens du contrat de dispatch, pas un échec :
      // la requête est PARTIE, on n'a simplement pas eu la réponse. Le dire
      // évite le pire geste possible ici — relancer, qui repaie un calcul
      // peut-être déjà fait. On rafraîchit le dossier plutôt que de conclure.
      const status = err instanceof Error ? err.cause : undefined
      if (status === 502 || status === 504) {
        void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
        toast.warning(t('replan.timeoutTitle'), { description: t('replan.timeoutDescription'), duration: 10_000 })
        return
      }
      toast.error(err instanceof Error && err.message ? err.message : t('replan.error'))
    },
  })

  const submit = () => {
    const strategy: StrategyScope = {
      ...(angle ? { angle } : {}),
      ...(entryMode ? { entryMode } : {}),
      ...(focusEntity.trim() ? { focusEntity: focusEntity.trim() } : {}),
      ...(constraints.trim() ? { constraints: constraints.trim() } : {}),
      ...(objective ? { objective } : {}),
    }
    replan.mutate(strategy)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
            <Compass className="size-4" aria-hidden />
            {t('replan.title')}
          </DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">{t('replan.subtitle')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          <Box className="space-y-1.5">
            <Label>{t('replan.angleLabel')}</Label>
            <Box display="flex" className="flex-wrap gap-2">
              <OptionChip label={t('replan.angleAuto')} active={angle === ''} onClick={() => setAngle('')} />
              {angleTitles.map(title => (
                <OptionChip key={title} label={title} active={angle === title} onClick={() => setAngle(title)} />
              ))}
            </Box>
          </Box>

          <Box className="space-y-1.5">
            <Label>{t('replan.entryModeLabel')}</Label>
            <Box display="flex" className="flex-wrap gap-2">
              <OptionChip label={t('replan.angleAuto')} active={entryMode === ''} onClick={() => setEntryMode('')} />
              {ENTRY_MODES.map(mode => (
                <OptionChip
                  key={mode}
                  label={t(`replan.entryMode.${mode}`)}
                  active={entryMode === mode}
                  onClick={() => setEntryMode(mode)}
                />
              ))}
            </Box>
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="replan-focus">{t('replan.focusEntityLabel')}</Label>
            <Input
              id="replan-focus"
              value={focusEntity}
              maxLength={120}
              placeholder={t('replan.focusEntityPlaceholder')}
              onChange={e => setFocusEntity(e.target.value)}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="replan-constraints">{t('replan.constraintsLabel')}</Label>
            <Input
              id="replan-constraints"
              value={constraints}
              maxLength={300}
              placeholder={t('replan.constraintsPlaceholder')}
              onChange={e => setConstraints(e.target.value)}
            />
          </Box>

          {/* #2947 (#2204.11) — the message OBJECTIVE: the batch M1-M2-M3 is
              replayed around it. Same codes and labels as the composer — one
              taxonomy, never a second list. Empty = Laura decides (no key sent). */}
          <Box className="space-y-1.5">
            <Label>{t('replan.objectiveLabel')}</Label>
            <SelectField
              ariaLabel={t('replan.objectiveLabel')}
              value={objective}
              onChange={value => setObjective(value as MessageObjective | '')}
              emptyOption={{ label: t('replan.angleAuto') }}
              options={MESSAGE_MATRIX.objectives.map(code => ({
                value: code,
                label: t(`engagement:composer.parameters.objectives.${code}`),
              }))}
            />
          </Box>

          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('replan.hint')}
          </Text>
        </Box>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={replan.isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="black" size="sm" icon={RefreshCw} isLoading={replan.isPending} onClick={submit}>
            {t('replan.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      /* La grammaire partagée plutôt qu'une septième forme écrite à la main.
         Cette puce vit DANS un dialogue et garde donc son composant local (elle
         n'est pas une rangée de filtres), mais elle emprunte le même langage :
         même hauteur, même rayon, même façon de dire « c'est celui-ci ». */
      className={chipClassName({ active, size: 'sm', className: 'max-w-full truncate' })}
    >
      {label}
    </button>
  )
}

/** The angle strings are matched server-side on their title, so dedupe + drop empties. */
function dedupeAngleTitles(angles: AttackAngle[]): string[] {
  const seen = new Set<string>()
  const titles: string[] = []
  for (const angle of angles) {
    const title = angle.title?.trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    titles.push(title)
  }
  return titles
}
