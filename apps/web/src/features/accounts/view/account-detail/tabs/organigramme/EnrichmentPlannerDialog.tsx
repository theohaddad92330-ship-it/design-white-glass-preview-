import type { OrgEnrichmentTargetMode, OrgHierarchyLevel, OrgEnrichmentPlanRequest } from '@bellum/contracts'
import { ORG_ENRICHMENT_TARGET_MODES, ORG_ENRICHMENT_WAVE_SIZE, orgHierarchyLevelSchema } from '@bellum/contracts'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoBanner,
  Input,
  Label,
  Text,
} from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { useEnrichmentConfirm, useEnrichmentPlanEstimate } from '@/features/accounts/hooks/useEnrichmentPlanner'
import { trackActionCompleted, trackActionStarted } from '@/lib/product-tracker'

/** #2130.59 — même convention que `TabPartners.tsx` : le motif de route
 *  littéral, jamais dérivé d'un `accountId` (GA-276). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'
const ENRICHMENT_ACTION = 'enrichment_started'

const HIERARCHY_LEVELS = orgHierarchyLevelSchema.options
/** Les modes affichés sous « Ou cibler précisément » — tous sauf le CTA rapide. */
const PRECISE_MODES = ORG_ENRICHMENT_TARGET_MODES.filter(mode => mode !== 'next_batch')

type EnrichmentPlannerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
}

/**
 * Construit les paramètres du mode choisi, ou `null` tant qu'un paramètre
 * requis manque — `direction` sans entité, `hierarchy_level` sans niveau.
 * `null` désarme la requête d'estimation (voir `useEnrichmentPlanEstimate`) :
 * on ne calcule jamais un périmètre à moitié saisi.
 */
export function buildEnrichmentParams(
  mode: OrgEnrichmentTargetMode,
  entity: string,
  hierarchyLevels: OrgHierarchyLevel[],
): OrgEnrichmentPlanRequest | null {
  if (mode === 'direction') {
    const trimmed = entity.trim()
    return trimmed ? { mode, entity: trimmed } : null
  }
  if (mode === 'hierarchy_level') {
    return hierarchyLevels.length > 0 ? { mode, hierarchyLevels } : null
  }
  return { mode }
}

/**
 * Le planificateur d'enrichissement de l'organigramme (PDF-22 FINAL §11, P1).
 *
 * Cinq modes de ciblage (D810, voir le docblock de
 * `@bellum/contracts/schemas/org-enrichment-planner`) et un coût annoncé
 * AVANT confirmation — jamais un clic qui engage des crédits sans le dire.
 */
export function EnrichmentPlannerDialog({ open, onOpenChange, accountId }: EnrichmentPlannerDialogProps) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })
  // ⚠️ Un `keyPrefix` NEUTRALISE le préfixe de namespace : `t('common:actions.cancel')`
  // se résout en `accountOrg:enrichmentPlanner.common:actions.cancel`, qui n'existe
  // pas — i18next rend alors la CLÉ BRUTE, et « actions.cancel » s'affichait tel quel
  // en production (mesuré à l'écran le 31/08/2026). Il faut un second `t` sur le
  // namespace commun, comme `DeleteAccountDialog.tsx:31-32`.
  const { t: tCommon } = useTranslation('common')
  const gate = useCreditGate()

  const [mode, setMode] = useState<OrgEnrichmentTargetMode>('next_batch')
  const [entity, setEntity] = useState('')
  const [hierarchyLevels, setHierarchyLevels] = useState<OrgHierarchyLevel[]>([])

  // Repart d'un état propre à chaque ouverture — un second lancement ne doit
  // pas hériter du mode/périmètre du précédent.
  useEffect(() => {
    if (open) {
      setMode('next_batch')
      setEntity('')
      setHierarchyLevels([])
    }
  }, [open])

  const params = buildEnrichmentParams(mode, entity, hierarchyLevels)
  const estimate = useEnrichmentPlanEstimate(accountId, params)
  const confirm = useEnrichmentConfirm(accountId)

  const toggleLevel = (level: OrgHierarchyLevel) => {
    setHierarchyLevels(current => (current.includes(level) ? current.filter(l => l !== level) : [...current, level]))
  }

  const contactsTargeted = estimate.data?.contactsTargeted
  // Lancer exige un périmètre MESURÉ et non vide — jamais sur un « unknown »
  // (on ne confirmerait alors aucun chiffre réel) ni sur un vrai zéro.
  const canLaunch =
    params !== null &&
    estimate.isSuccess &&
    contactsTargeted?.status === 'measured' &&
    contactsTargeted.value > 0 &&
    gate.canEnrich

  const launch = () => {
    if (!params) return
    // #2130.59 — anonyme, par écran : jamais l'`accountId` ni le mode/périmètre
    // choisi (une stratégie commerciale), seulement le geste et sa complétion.
    trackActionStarted(ENRICHMENT_ACTION, ACCOUNT_DETAIL_SCREEN)
    confirm.mutate(params, {
      onSuccess: result => {
        trackActionCompleted(ENRICHMENT_ACTION, ACCOUNT_DETAIL_SCREEN)
        // #2592 — trouvé par la garde d'interpolation en construisant ce lot :
        // `launchSuccess_one`/`_other` attendent `{{matched}}`, `count` ne
        // sert qu'à CHOISIR la variante, il ne l'interpole pas.
        toast.success(t('launchSuccess', { count: result.matched, matched: result.matched }))
        if (result.remaining > 0) {
          toast.info(t('launchRemaining', { remaining: result.remaining }))
        }
      },
      onError: err => {
        toast.error(err instanceof Error && err.message ? err.message : t('launchError'))
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          <ModeCard
            mode="next_batch"
            active={mode === 'next_batch'}
            badge={t('quickActionBadge')}
            label={t('modes.next_batch.label', { count: ORG_ENRICHMENT_WAVE_SIZE })}
            description={t('modes.next_batch.description')}
            onSelect={() => setMode('next_batch')}
          />

          <Box className="space-y-1.5">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
              {t('targetPrecisely')}
            </Text>
            <Box className="space-y-2">
              {PRECISE_MODES.map(precise => (
                <ModeCard
                  key={precise}
                  mode={precise}
                  active={mode === precise}
                  label={t(`modes.${precise}.label`)}
                  description={t(`modes.${precise}.description`)}
                  onSelect={() => setMode(precise)}
                />
              ))}
            </Box>
          </Box>

          {mode === 'direction' ? (
            <Box className="space-y-1.5">
              <Label htmlFor="enrichment-planner-direction">{t('directionLabel')}</Label>
              <Input
                id="enrichment-planner-direction"
                value={entity}
                maxLength={200}
                placeholder={t('directionPlaceholder')}
                onChange={e => setEntity(e.target.value)}
              />
            </Box>
          ) : null}

          {mode === 'hierarchy_level' ? (
            <Box className="space-y-1.5">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('hierarchyLevelLabel')}
              </Text>
              <Box className="grid grid-cols-2 gap-2">
                {HIERARCHY_LEVELS.map(level => (
                  <Box key={level} display="flex" className="items-center gap-2">
                    <Checkbox
                      id={`enrichment-planner-level-${level}`}
                      checked={hierarchyLevels.includes(level)}
                      onCheckedChange={() => toggleLevel(level)}
                    />
                    <Label htmlFor={`enrichment-planner-level-${level}`} className="text-sm font-normal">
                      {t(`hierarchyLevel.${level}`)}
                    </Label>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}

          <EstimateBanner
            estimate={estimate.data}
            isLoading={estimate.isFetching && params !== null}
            isError={estimate.isError}
          />
        </Box>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={confirm.isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="black"
            size="sm"
            icon={Sparkles}
            isLoading={confirm.isPending}
            disabled={!canLaunch || confirm.isPending}
            title={gate.canEnrich ? undefined : t('insufficientCredits')}
            onClick={launch}
          >
            {confirm.isPending ? t('launching') : t('launch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModeCard({
  mode,
  active,
  label,
  description,
  badge,
  onSelect,
}: {
  mode: OrgEnrichmentTargetMode
  active: boolean
  label: string
  description: string
  badge?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      data-mode={mode}
      className={`w-full min-h-11 rounded-lg border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-[var(--bellum-primary-500)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_10%,transparent)]'
          : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]'
      }`}
    >
      {badge ? (
        <Text size="xs" weight="semibold" className="mb-1 text-[var(--bellum-text-accent)] uppercase tracking-wide">
          {badge}
        </Text>
      ) : null}
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
    </button>
  )
}

function EstimateBanner({
  estimate,
  isLoading,
  isError,
}: {
  estimate:
    | {
        contactsTargeted: { status: 'measured'; value: number } | { status: 'unknown'; reason: string }
        waveCount: { status: 'measured'; value: number } | { status: 'unknown'; reason: string }
        estimatedCredits: { status: 'measured'; value: number } | { status: 'unknown'; reason: string }
      }
    | undefined
  isLoading: boolean
  isError: boolean
}) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })

  if (isError) {
    return (
      <InfoBanner variant="danger" title={t('estimateTitle')}>
        {t('estimateError')}
      </InfoBanner>
    )
  }

  if (isLoading || !estimate) {
    return (
      <InfoBanner variant="default" title={t('estimateTitle')}>
        {t('loadingEstimate')}
      </InfoBanner>
    )
  }

  const { contactsTargeted, waveCount } = estimate

  // « Non mesuré » n'est JAMAIS « 0 » (GA-18/19). `contactsTargeted` non
  // mesuré ENTRAÎNE waveCount et estimatedCredits non mesurés (voir
  // `computeWaves` côté serveur — un coût ne se déduit jamais d'un périmètre
  // qu'on n'a pas pu compter) : la RAISON n'est donc écrite qu'UNE fois,
  // jamais répétée trois fois pour la même absence.
  if (contactsTargeted.status === 'unknown') {
    return (
      <InfoBanner variant="default" title={t('estimateTitle')}>
        {contactsTargeted.reason}
      </InfoBanner>
    )
  }

  if (contactsTargeted.value === 0) {
    return (
      <InfoBanner variant="default" title={t('estimateTitle')}>
        {t('nothingToEnrich')}
      </InfoBanner>
    )
  }

  const segments = [
    t('contactsTargeted', { count: contactsTargeted.value }),
    segmentFor(waveCount, value => t('waveCount', { count: value })),
  ]

  return (
    <InfoBanner variant="warning" title={t('estimateTitle')}>
      {segments.join(' · ')}
    </InfoBanner>
  )
}

function segmentFor(
  value: { status: 'measured'; value: number } | { status: 'unknown'; reason: string },
  format: (value: number) => string,
): string {
  if (value.status === 'unknown') return value.reason
  return format(value.value)
}
