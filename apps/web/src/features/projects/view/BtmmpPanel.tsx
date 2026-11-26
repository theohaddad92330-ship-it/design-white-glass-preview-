import { Badge, Button, Text, Textarea } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BTMMP_AXES,
  EVIDENCE_GAP_LABELS,
  type Btmmp,
  type BtmmpAxis,
  btmmpCompleteness,
  type OpportunityReadiness,
  type ProjectConfidence,
} from '@bellum/contracts'
import { CheckCircle2, ClipboardList, Circle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { projectsApi, projectQueryKeys } from '../api'

/** Ton du badge de confiance — même échelle et même palette que
 *  `ProjectProvenanceLine` (GA-26 : un réglage vit à un seul endroit). */
const CONFIDENCE_VARIANT: Record<ProjectConfidence, 'success' | 'default' | 'warning'> = {
  high: 'success',
  medium: 'default',
  low: 'warning',
}

/**
 * #3266.16 (BEL-SC-237) — le blocage à traiter en premier, en une phrase.
 * Réutilise les libellés qui existent déjà (GA-26) : `EVIDENCE_GAP_LABELS`
 * (bilingue, `@bellum/contracts`) pour un manque « opportunité », l'axe BTMMP
 * déjà traduit (`btmmp.axes.*.label`) pour un axe encore vide — jamais un
 * troisième jeu de libellés pour la même idée.
 */
function ReadinessSummary({ readiness }: { readiness: OpportunityReadiness }) {
  const { t, i18n } = useTranslation('projects')
  const locale = i18n.language.startsWith('fr') ? 'fr' : 'en'
  const blocker = readiness.main_blocker

  const blockerLabel =
    blocker?.kind === 'evidence'
      ? EVIDENCE_GAP_LABELS[blocker.gap][locale]
      : blocker?.kind === 'btmmp'
        ? t(`btmmp.axes.${blocker.axis}.label`)
        : null

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--bellum-border)] pb-2">
      <Text size="xs" color="text-muted-foreground">
        {blockerLabel ? t('btmmp.readiness.mainBlocker', { label: blockerLabel }) : t('btmmp.readiness.noBlocker')}
      </Text>
      {readiness.confidence ? (
        <Badge variant={CONFIDENCE_VARIANT[readiness.confidence]}>
          {t(`provenance.confidence.${readiness.confidence}`)}
        </Badge>
      ) : null}
    </div>
  )
}

/**
 * Qualification BTMMP d'un besoin (annexe méthodo p21 « Qualification BTMMP et
 * découverte »).
 *
 * « Un besoin n'est qualifié que si Bellum comprend le budget, timing, mission,
 * management, process et prochaine étape. » Chaque axe est un champ libre : le
 * commercial note ce qu'il a APPRIS, jamais deviné. La complétude déterministe
 * dit honnêtement où en est la qualification — un besoin à moitié qualifié le
 * reste. N'apparaît que sur un besoin MATÉRIALISÉ (il faut son id).
 *
 * `readiness` (#3266.16, optionnel — deploy-skew) ajoute LA lecture qui
 * manquait par-dessus : le blocage PRINCIPAL et le niveau de confiance,
 * combinés depuis ce même BTMMP et le barème anti-inflation — jamais un
 * second calcul, voir `opportunityReadiness` (@bellum/contracts).
 */
export function BtmmpPanel({
  opportunityId,
  btmmp,
  readiness,
}: {
  opportunityId: string
  btmmp?: Btmmp | null
  readiness?: OpportunityReadiness
}) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Btmmp>(() => ({ ...(btmmp ?? {}) }))
  const [open, setOpen] = useState(false)

  const { filled, score, qualified } = btmmpCompleteness(draft)

  const save = useMutation({
    mutationFn: (patch: Btmmp) => projectsApi.updateBtmmp(opportunityId, patch),
    onSuccess: () => {
      toast.success(t('btmmp.saved'))
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all })
    },
    onError: () => toast.error(t('btmmp.error')),
  })

  const set = (axis: BtmmpAxis) => (value: string) => setDraft(prev => ({ ...prev, [axis]: value }))

  return (
    <div className="mt-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <ClipboardList className="size-4 text-[var(--bellum-text-accent)]" />
          <Text size="sm" weight="medium">
            {t('btmmp.title')}
          </Text>
        </span>
        <Badge variant={qualified ? 'success' : 'outline'}>
          {qualified ? t('btmmp.qualified') : t('btmmp.progress', { score, total: BTMMP_AXES.length })}
        </Badge>
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {readiness ? <ReadinessSummary readiness={readiness} /> : null}
          {BTMMP_AXES.map(axis => {
            const done = filled.includes(axis)
            return (
              <div key={axis} className="grid gap-1">
                <div className="flex items-center gap-1.5">
                  {done ? (
                    <CheckCircle2 className="size-3 text-[var(--success-soft-text)]" />
                  ) : (
                    <Circle className="size-3 text-[var(--bellum-text-muted)]" />
                  )}
                  <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                    {t(`btmmp.axes.${axis}.label`)}
                  </Text>
                </div>
                <Textarea
                  value={draft[axis] ?? ''}
                  onChange={e => set(axis)(e.target.value)}
                  placeholder={t(`btmmp.axes.${axis}.hint`)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            )
          })}
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending} className="self-end">
            {save.isPending ? t('btmmp.saving') : t('btmmp.save')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
