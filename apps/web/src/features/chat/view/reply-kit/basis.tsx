import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import type { ReplySourceBasis } from '../reply-source-basis'
import { ReplyContextChips, ReplyMetaRow } from './header'

/**
 * #3765 / #3761.16 — LE FONDEMENT D'UNE RÉPONSE, composé avec les pièces du kit.
 *
 * Absorbe `ReplySourceBasis` (la ligne de fondement du pied de réponse) et `ReplySourcesFooter` (son double
 * dans le kit) — GA-26, rien n'existe deux fois : le périmètre (compte, portefeuille, portées des sources) est
 * une rangée de chips de contexte ; la nature de ce qui fonde la réponse et le palier de certitude sont une
 * ligne de métadonnées. Une mesure absente ne fait AUCUNE entrée ; sans aucune entrée, rien ne se rend.
 *
 * #3764 / #3861 (Louis, 11/10) — JAMAIS de ligne « Complétude » : le fait des sources non consultées se dit une
 * fois, par le badge nommé du pied de réponse et par le panneau « Voir la source ».
 */
export function ReplyBasis({ basis }: { basis: ReplySourceBasis | null }) {
  const { t } = useTranslation('chat')
  if (!basis) return null

  const scopeChips: { label: string }[] = []
  if (basis.scope.account) scopeChips.push({ label: t('provenance.basis.scopeAccount', { name: basis.scope.account }) })
  if (basis.scope.portfolio) {
    const { count, total } = basis.scope.portfolio
    scopeChips.push({
      label:
        total !== null
          ? t('provenance.basis.scopePortfolio', { count, total })
          : t('provenance.basis.scopePortfolioNoTotal', { count }),
    })
  }
  for (const scope of basis.scope.scopes) scopeChips.push({ label: scope })

  const meta = [
    {
      label: t('provenance.basis.foundedOn'),
      value:
        basis.foundations.length > 0
          ? basis.foundations.map(f => t(`provenance.basis.foundation.${f}`)).join(' · ')
          : null,
    },
    {
      label: t('provenance.basis.certainty'),
      value: basis.certainty ? t(`provenance.basis.certaintyTier.${basis.certainty}`) : null,
    },
  ]
  const undated = basis.undatedFreshness ? t('provenance.basis.undated') : null
  if (scopeChips.length === 0 && meta.every(item => !item.value) && !undated) return null

  return (
    <div className="space-y-1 px-1" data-testid="reply-basis">
      <ReplyContextChips chips={scopeChips} ariaLabel={t('replyKit.basis.scopeAria')} />
      <ReplyMetaRow items={meta} />
      {undated ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {undated}
        </Text>
      ) : null}
    </div>
  )
}
