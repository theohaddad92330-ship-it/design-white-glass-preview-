import { useTranslation } from 'react-i18next'
import {
  buildRefreshPlan,
  REFRESH_MODE_DIMENSIONS,
  type RefreshDimension,
  type RefreshScopeMode,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { CalendarClock, CheckCircle2, Clock, RefreshCw, Search, ShieldCheck, Wand2 } from 'lucide-react'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'

/**
 * #2125.35-.38, .42, .46, .49 — CE QUE LA RELANCE VA FAIRE, AVANT DE LA
 * CONFIRMER.
 *
 * L'écran disait déjà ce qu'une relance CONSERVE et ce qu'elle REFAIT (#1133).
 * Il ne disait pas ce qui était devenu VIEUX ni depuis quand — donc rien ne
 * permettait de juger si ça valait les crédits — ni qu'il existe un
 * rafraîchissement moins cher quand on ne cherche que l'organisation.
 *
 * ⚠️ AUCUN chiffre n'est écrit ici. Le coût des deux modes vient de
 * `refreshModeCost` (contrats), qui lit la grille que le serveur DÉBITE : « le
 * coût annoncé avant le clic est exactement le coût débité » (GA-49 / GA-86).
 * Un coût que le serveur n'a pas rendu se dit « non mesuré » — jamais « 0 »,
 * qui se lirait « gratuit » (GA-18 / GA-19).
 *
 * Et le plan lui-même n'est pas calculé ici : `buildRefreshPlan` le construit,
 * là où vivent aussi la règle d'ancienneté et la liste des objets qu'un
 * rafraîchissement n'écrase jamais (GA-26 — une dérivation vit à un seul
 * endroit).
 */
export function RefreshPlanCard({
  freshness,
  mode,
  onModeChange,
  now = new Date(),
}: {
  /** La fraîcheur par axe du dossier relancé (`*_refreshed_at`). */
  freshness: Partial<Record<RefreshDimension, string | null>>
  mode: RefreshScopeMode
  onModeChange: (mode: RefreshScopeMode) => void
  /** Paramètre pour que « ancien » se teste sans horloge réelle. */
  now?: Date
}) {
  const { t, i18n } = useTranslation('search')
  // Théo B r1-recherche (#4468) — aucun crédit à l'écran : le plan est construit sans coût, les boutons de mode
  // ne portent plus de prix (le coût reste côté serveur, `refreshModeCost`).
  const plan = buildRefreshPlan({ mode, fullAnalysisCredits: null, now, freshness })

  const axisLabel = (dimension: RefreshDimension): string => t(`accounts:refreshDimension.${dimension}`)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-3">
      <div className="flex items-center gap-2">
        <RefreshCw className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <Text size="sm" weight="medium">
          {t('refreshPlan.title')}
        </Text>
      </div>

      {/* #2125.42 — DEUX MODES, chacun avec SON coût. « L'organisation » ne
          relit que l'organigramme et les gens : c'est le geste de qui vient de
          voir passer une nomination, et payer une analyse entière pour ça est
          précisément ce que le retour reproche. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(REFRESH_MODE_DIMENSIONS) as RefreshScopeMode[]).map(candidate => (
          <button
            key={candidate}
            type="button"
            aria-pressed={mode === candidate}
            onClick={() => onModeChange(candidate)}
            className={`flex min-h-11 flex-col items-start rounded-lg border px-3 py-1.5 text-left ${
              mode === candidate
                ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)]'
                : 'border-[var(--bellum-border)]'
            }`}
          >
            {/* i18n keys: refreshPlan.mode.full | refreshPlan.mode.organisation */}
            <Text size="xs" weight="medium">
              {t(`refreshPlan.mode.${candidate}`)}
            </Text>
          </button>
        ))}
      </div>

      {/* #2318.3 — « dernière analyse » : la plus récente des dates de
          fraîcheur parmi les axes de ce mode. INCONNUE, jamais une date de
          zéro, quand rien n'est lisible. La SEULE ligne de détail encore
          visible à l'arrivée (#3141, bêta 27/09) — le reste (ancien, frais,
          relu, sources, durée, préservé, remboursement) vit dans le
          dépliable ci-dessous, fermé par défaut. */}
      {plan.lastAnalyzedAt ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-last-analyzed">
          {t('refreshPlan.lastAnalyzedAt', { date: new Date(plan.lastAnalyzedAt).toLocaleDateString(i18n.language) })}
        </Text>
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="refresh-plan-last-analyzed">
          {t('refreshPlan.lastAnalyzedAtUnknown')}
        </Text>
      )}

      {/* #3141 (27/09/2026, bêta) — le panneau était trop long : titres et
          une ligne restent visibles à l'arrivée, le détail (huit blocs) passe
          dans ce dépliable, FERMÉ par défaut (`CollapsedSection`, GA-26 — un
          seul patron de repli, `packages/ui/src/motion.ts` pour le mouvement). */}
      <CollapsedSection title={t('refreshPlan.detailsToggle')} className="border-0 bg-transparent">
        <div className="flex flex-col gap-2">
          {/* #2125.35 — CE QUI EST ANCIEN, AVEC SA DATE. Un axe jamais relu
              n'a pas une date de zéro : il a une date INCONNUE, et c'est ce
              qui s'écrit. */}
          {plan.aged.length > 0 ? (
            <div className="flex items-start gap-1.5" data-testid="refresh-plan-aged">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {`${t('refreshPlan.aged')} `}
                {plan.aged
                  .map(entry => {
                    const date = entry.measuredAt ? new Date(entry.measuredAt) : null
                    const readable =
                      date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(i18n.language) : null
                    return readable
                      ? t('refreshPlan.agedOn', { axis: axisLabel(entry.dimension), date: readable })
                      : t('refreshPlan.agedUnknownDate', { axis: axisLabel(entry.dimension) })
                  })
                  .join(' · ')}
              </Text>
            </div>
          ) : null}

          {/* #2318.3 — « sections encore fraîches » : le pendant positif de
              « ancien » ci-dessus. N'affiche rien quand rien n'est frais — un
              bloc vide n'apprend rien. */}
          {plan.fresh.length > 0 ? (
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-fresh">
                {t('refreshPlan.fresh', { axes: plan.fresh.map(axisLabel).join(', ') })}
              </Text>
            </div>
          ) : null}

          {/* #2125.36 / .38 — ce qui sera RELU (et donc le résultat attendu),
              et ce que ça POURRAIT changer. */}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-reread">
            {t('refreshPlan.reread', { axes: plan.reread.map(axisLabel).join(', ') })}
          </Text>
          <div className="flex items-start gap-1.5">
            <Wand2 className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-may-change">
              {/* i18n keys: refreshPlan.output.facts | .signals | .contacts | .org_chart | .recommendations | .actions */}
              {t('refreshPlan.mayChange', {
                outputs: plan.mayChange.map(output => t(`refreshPlan.output.${output}`)).join(', '),
              })}
            </Text>
          </div>

          {/* #2318.3 — « sources consultées » : des NATURES, jamais un nom de
              fournisseur (GA-44 — l'espace nomme ce qu'il a branché, jamais
              ce qui nous sert). */}
          <div className="flex items-start gap-1.5">
            <Search className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-sources">
              {/* i18n keys: refreshPlan.sourceNature.official_registry | .company_website | .job_postings | .public_news | .professional_network */}
              {t('refreshPlan.sources', {
                natures: plan.sources.map(nature => t(`refreshPlan.sourceNature.${nature}`)).join(', '),
              })}
            </Text>
          </div>

          {/* #2318.3 — « durée » : deux bornes, jamais un chiffre unique qui
              se lirait comme une promesse exacte. */}
          <div className="flex items-start gap-1.5">
            <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-duration">
              {t('refreshPlan.duration', { min: plan.durationMinutes.min, max: plan.durationMinutes.max })}
            </Text>
          </div>

          {/* #2125.37 / .58-.61 — ce qu'il NE TOUCHERA PAS, nommé objet par
              objet. « Conservés : tes corrections, tes contacts » est déjà
              dit au-dessus ; ces quatre-là ne l'étaient nulle part. */}
          <div className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="refresh-plan-preserved">
              {/* i18n keys: refreshPlan.preservedKind.private_note | .validated_action | .evidence | .declared_relation */}
              {t('refreshPlan.preserved', {
                kinds: plan.preserved.map(kind => t(`refreshPlan.preservedKind.${kind}`)).join(', '),
              })}
            </Text>
          </div>

          {/* #2125.49 — et ce qui se passe si ça échoue (Théo B r1-recherche #4468 : dit en quota, jamais en crédits). */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('refreshPlan.refund')}
          </Text>
        </div>
      </CollapsedSection>
    </div>
  )
}
