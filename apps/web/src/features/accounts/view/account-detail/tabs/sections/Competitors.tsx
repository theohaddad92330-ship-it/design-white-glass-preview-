import type { Competitor } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassCard } from '../../components/GlassCard'

/**
 * ⚠️ GARDÉ INTENTIONNELLEMENT malgré zéro appelant (audit code-mort du
 * 31/08/2026 — lot hygiène). NE PAS supprimer sans re-vérifier.
 *
 * `account.raw_analysis.competitors[].{name,strengths,weaknesses}` reste
 * PRODUIT par la phase 3 (`competitorSchema`, account-analysis.ts:118) et LU
 * par l'export PDF (`account-pdf/normalize.ts:297`) — mais ce composant-ci
 * était le SEUL affichage à l'écran, et rien ne l'a remplacé : le
 * `CompetitivePositioningCard` actuel (monté dans `TabOverview.tsx`) lit un
 * champ DIFFÉRENT (`strategy.vs_competitors[].{competitor,our_counter_angle}`
 * — la contre-attaque, pas les forces/faiblesses du concurrent). Supprimer ce
 * fichier ferait disparaître les forces/faiblesses de l'écran (elles
 * resteraient dans le PDF export). Décision produit à prendre : remonter
 * cette lecture quelque part, ou assumer qu'elle reste PDF-only.
 */

type CompetitorsProps = {
  competitors: Competitor[]
}

export function Competitors({ competitors }: CompetitorsProps) {
  const { t } = useTranslation('accountDetail')
  const renderable = competitors.filter(c => typeof c.name === 'string' && c.name.length > 0)
  if (renderable.length === 0) return null

  return (
    <GlassCard>
      <Text
        element="h3"
        size="sm"
        weight="semibold"
        className="mb-3 flex items-center gap-2 text-[var(--bellum-text-primary)]"
      >
        <Users className="h-4 w-4 text-[var(--bellum-text-muted)]" />
        {t('competitors.title')}
      </Text>
      <div className="space-y-3">
        {renderable.map((comp, i) => (
          <div
            key={`${comp.name}-${i}`}
            className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-4"
          >
            <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {comp.name}
            </Text>
            {comp.strengths && (
              <Text element="p" size="xs" className="mt-1 text-[var(--success-soft-text)]">
                {t('competitors.strengths', { value: comp.strengths })}
              </Text>
            )}
            {comp.weaknesses && (
              <Text element="p" size="xs" className="mt-0.5 text-[var(--danger-soft-text)]">
                {t('competitors.weaknesses', { value: comp.weaknesses })}
              </Text>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
