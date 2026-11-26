import {
  Badge,
  Button,
  Card,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
  cn,
} from '@bellum/ui'
import { ArrowRight, Clock, FileSearch, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatSignalDate } from '@/lib/signal-date'
import { readableSource } from '@/lib/source-label'
import { formatTimeAgo } from '../../helpers/format'
import type { ConflictedField } from '@bellum/contracts'
import { AccountFieldConflicts } from './AccountFieldConflicts'
import type { AccountProvenance, ProvenanceSource } from './accountProvenance'
import type { ConfidenceTier } from '../evaluation/evaluationViewData'

/**
 * « Sources et confiance — accessible au clic » (Théo TF1 p.14).
 *
 * La colonne de droite de la vue d'ensemble s'ouvre sur la PROVENANCE du
 * dossier : sa fraîcheur globale, sa confiance, et la liste des sources qui
 * l'ont réellement nourri (Apollo, Pappers, Brave, France Travail…). Le badge
 * « Source : X » cesse d'être un bloc de navigation inline dans la copie
 * commerciale : la source devient une propriété tracée de chaque fait, lisible
 * sans polluer la lecture. Rien n'est inventé (cf. `accountProvenance.ts`).
 */
export function AccountProvenancePanel({
  provenance,
  conflicts = [],
}: {
  provenance: AccountProvenance
  /** #190.1 — les contradictions de champ du dossier (ouvertes et tranchées). */
  conflicts?: readonly ConflictedField[]
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const [sheetOpen, setSheetOpen] = useState(false)

  const hasFreshness = Boolean(provenance.lastAnalyzedAt)
  const hasConfidence = provenance.reliability != null
  const sources = provenance.sources
  // Present-only : rien à tracer ⇒ pas de panneau (jamais de coquille vide).
  if (!hasFreshness && !hasConfidence && sources.length === 0 && conflicts.length === 0) return null

  const analyzedDate = provenance.lastAnalyzedAt ? formatAbsoluteDate(provenance.lastAnalyzedAt, i18n.language) : null
  const preview = sources.slice(0, 5)

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
        <div className="flex items-center gap-3 px-4 py-4">
          <ShieldCheck className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0">
            <Text element="h3" size="sm" weight="semibold" noWrap className="truncate">
              {t('provenance.title')}
            </Text>
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('provenance.subtitle')}
            </Text>
          </div>
        </div>

        {/* Fraîcheur globale (p14 : « Identité, logo, SIREN, fraîcheur globale »). */}
        <div className="flex items-start gap-2 border-t border-[var(--bellum-border)] px-4 py-3">
          <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
          <div className="min-w-0">
            {analyzedDate ? (
              <>
                <Text size="xs" weight="medium" className="block text-[var(--bellum-text-primary)]">
                  {t('provenance.lastAnalysis', { date: analyzedDate })}
                </Text>
                <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                  {formatTimeAgo(provenance.lastAnalyzedAt as string)}
                </Text>
              </>
            ) : (
              <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                {t('provenance.neverAnalyzed')}
              </Text>
            )}
          </div>
        </div>

        {hasConfidence ? <ConfidenceRow reliability={provenance.reliability as number} tier={provenance.tier} /> : null}

        <AccountFieldConflicts conflicts={conflicts} />

        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('provenance.sourcesLabel')}
          </Text>
          {sources.length > 0 ? (
            <>
              <div className="mt-2 divide-y divide-[var(--bellum-border)]">
                {preview.map(source => (
                  <SourceRow key={source.key} source={source} />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                className="mt-3"
                onClick={() => setSheetOpen(true)}
              >
                {t('provenance.viewAll')}
              </Button>
            </>
          ) : (
            <Text size="xs" className="mt-2 block text-[var(--bellum-text-secondary)]">
              {t('provenance.noSources')}
            </Text>
          )}
        </div>
      </Card>

      <ProvenanceSheet open={sheetOpen} onOpenChange={setSheetOpen} sources={sources} />
    </>
  )
}

function ConfidenceRow({ reliability, tier }: { reliability: number; tier: ConfidenceTier | null }) {
  const { t } = useTranslation('accountDetail')
  // #2307.19 — `non_evaluable` est greyé comme une confiance faible, mais
  // n'EN est pas une : aucune source de collecte n'a répondu, il n'y a rien
  // à juger — un `${reliability}/100` (toujours 0) se lirait comme un
  // jugement plutôt que comme une absence de matière.
  const nonEvaluable = tier === 'non_evaluable'
  const weak = nonEvaluable || (tier ? tier === 'low' : reliability < 40)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--bellum-border)] px-4 py-3">
      <div className="min-w-0">
        <Text size="xs" weight="medium" className="block text-[var(--bellum-text-primary)]">
          {t('provenance.confidenceLabel')}
        </Text>
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('provenance.confidenceHint')}
        </Text>
      </div>
      <div className={cn('flex shrink-0 flex-col items-end', weak && 'opacity-60')}>
        {nonEvaluable ? (
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('provenance.tier.non_evaluable')}
          </Text>
        ) : (
          <>
            <Text
              size="sm"
              weight="semibold"
              className={weak ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--bellum-text-primary)]'}
            >
              {reliability}
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                /100
              </Text>
            </Text>
            {tier ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`provenance.tier.${tier}`)}
              </Text>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function SourceRow({ source, expanded = false }: { source: ProvenanceSource; expanded?: boolean }) {
  const { t } = useTranslation('accountDetail')
  const label = sourceLabel(t, source)
  const feeds = source.feeds.map(f => t(`provenance.feeds.${f}`)).join(' · ')
  // #2613 — une date de source inconnue ne fait plus de ligne : la source
  // elle-même (son nom, ses feeds) reste, seule la date manquante se tait.
  const date = source.latestDate ? formatSignalDate(source.latestDate) : null

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-3 py-2.5', expanded && 'py-4')}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bellum-surface-2)]">
        <FileSearch className="size-4 text-[var(--bellum-text-secondary)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Text size="xs" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
            {label}
          </Text>
          {source.providerKey === null && source.rawLabel === null ? (
            <Badge className="shrink-0 border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0 text-xs text-[var(--bellum-text-muted)]">
              {t('provenance.unknownBadge')}
            </Badge>
          ) : null}
        </div>
        <Text size="xs" className="block truncate text-[var(--bellum-text-secondary)]">
          {feeds}
        </Text>
      </div>
      {date ? (
        <Text size="xs" className="shrink-0 text-right text-[var(--bellum-text-muted)]">
          {date}
        </Text>
      ) : null}
    </div>
  )
}

function ProvenanceSheet({
  open,
  onOpenChange,
  sources,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: ProvenanceSource[]
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        // #2117.69 — SOUS 768px (la borne mobile unique), un drawer occupe
        // l'écran PLEIN, jamais une bande avec marge. Le panneau surchargeait
        // en `w-[min(440px,calc(100vw-1.5rem))]` : presque pleine largeur sur
        // un téléphone, mais `inset-y-3`/`right-3` (posés par `SheetContent`
        // pour `side="right"`) réservaient encore 1,5rem de chaque côté — pas
        // edge-to-edge. Les classes mobiles ci-dessous ciblent les MÊMES
        // familles Tailwind que la base (`inset-y-*`, `right-*`, `w-*`, `h-*`,
        // `rounded-*`, `border`) pour que `tailwind-merge` les résolve en
        // conflit garanti ; la bande latérale fixe ne revient qu'à `md:`.
        className="inset-y-0 right-0 left-0 h-full w-full rounded-none border-0 md:inset-y-3 md:right-3 md:left-auto md:h-[calc(100%-1.5rem)] md:w-[min(440px,calc(100vw-1.5rem))] md:rounded-lg md:border gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{t('provenance.sheetTitle')}</SheetTitle>
          <SheetDescription>{t('provenance.sheetDescription', { count: sources.length })}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-[var(--bellum-border)] px-4 md:px-6 py-2">
            {sources.map(source => (
              <SourceRow key={source.key} source={source} expanded />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

/** Provider label ← canonical key ; raw signal source ← literal ; else « source inconnue ». */
function sourceLabel(t: ReturnType<typeof useTranslation>['t'], source: ProvenanceSource): string {
  if (source.providerKey) return t(`provenance.providers.${source.providerKey}`)
  // Un libellé qui n'est qu'un jeton de citation du modèle — « [J3] [P3] »,
  // « [P1], [P4], [P8] » — n'apprend rien : il ne nomme ni média, ni registre,
  // ni date. On dit « source inconnue », qui est la vérité, plutôt que d'afficher
  // la notation interne d'un raisonnement. Vu sur un dossier réel le 04/08.
  const readable = readableSource(source.rawLabel)
  if (readable) return readable
  return t('provenance.unknownSource')
}

function formatAbsoluteDate(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
