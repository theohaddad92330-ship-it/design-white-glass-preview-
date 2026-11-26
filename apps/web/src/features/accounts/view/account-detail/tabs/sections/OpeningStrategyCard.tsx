import { intelligenceEstimateKind } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { DoorOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { useAccountIntelligenceContext } from '@/features/accounts/hooks/useAccountIntelligenceContext'
import { AnalysisSectionCard } from './AnalysisSectionCard'
import { accountOpeningStrategyView, type AccountOpeningStrategyEntryPoint } from './accountOpeningStrategy'

/**
 * « Par où ouvrir ce compte » — lue au contexte canonique du dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE CARTE A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Elle normalisait `raw_analysis.comment_ouvrir_compte` elle-même — la MÊME
 * normalisation que refaisait, séparément, l'onglet Score (`OpenAccountCard`).
 * Deux calculs du même fait pouvaient nommer deux portes différentes le même
 * jour, exactement le NO-GO de #2285.23. #2786/#2285.3 — elle lit désormais
 * `entryPaths`/`recommendations` du contexte canonique
 * (`useAccountIntelligenceContext`, #2116), qui arbitre déjà DataForge contre
 * l'inférence du modèle — jamais `raw_analysis` en direct.
 *
 * ⚠️ La source n'est plus figée à `model` : une porte NOMMÉE (DataForge) est un
 * FAIT observé sur un corpus de parcours, une narration sans porte nommée
 * reste une INFÉRENCE — d'où la mention « hypothèse » réservée à ce second cas.
 */
export function OpeningStrategyCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountDetail')
  const context = useAccountIntelligenceContext(accountId).data

  // La façade n'a pas encore répondu (chargement, ou module non monté) : on se
  // TAIT, comme `IncumbentEsnCard` — une lecture indisponible n'est pas un
  // constat.
  if (!context) return null

  const view = accountOpeningStrategyView(context)
  // Ni une porte nommée ni une narration : une structure vide n'est pas une
  // stratégie, la carte ne s'affiche pas.
  if (view.state === 'unknown') return null
  const openingEstimate = intelligenceEstimateKind(view.source, 'hypothesis')

  return (
    <AnalysisSectionCard
      icon={DoorOpen}
      title={t('openingStrategy.title')}
      source={view.source}
      analyzedAt={view.observedAt}
      provenanceDetail={view.source === 'inference' ? t('openingStrategy.hypothesis') : undefined}
    >
      {/* #4016.L4 — une porte tirée de l'inférence ou des priors de la base de référence est une
          HYPOTHÈSE, badgée avec sa base (la base de référence ne se nomme jamais). */}
      {openingEstimate ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-2">
          <EstimatedBadge kind={openingEstimate} basis={t(`estimateBasis.${view.source}`)} />
        </div>
      ) : null}
      {view.narrative ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text element="p" size="sm" className="whitespace-pre-line leading-relaxed">
            {view.narrative}
          </Text>
        </div>
      ) : null}

      {view.entryPoints.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('openingStrategy.entryPointsTitle')}
          </Text>
          <ul className="mt-2 space-y-3">
            {view.entryPoints.map((entry, index) => (
              <EntryPointRow key={`${entry.label}-${index}`} entry={entry} />
            ))}
          </ul>
        </div>
      ) : null}
    </AnalysisSectionCard>
  )
}

function EntryPointRow({ entry }: { entry: AccountOpeningStrategyEntryPoint }) {
  const { t } = useTranslation('accountDetail')

  return (
    <li className="flex min-w-0 gap-3">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Text size="sm" weight="medium">
          {entry.label || t('openingStrategy.noLabel')}
        </Text>
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {entry.targetProfile
            ? t('openingStrategy.targetProfile', { value: entry.targetProfile })
            : t('openingStrategy.noTargetProfile')}
        </Text>
        <Text element="p" size="xs" className="mt-0.5 leading-relaxed text-[var(--bellum-text-muted)]">
          {entry.justification || t('openingStrategy.noJustification')}
        </Text>
      </div>
    </li>
  )
}
