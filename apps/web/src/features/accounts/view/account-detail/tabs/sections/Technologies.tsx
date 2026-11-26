import type { TechnologyEntry } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassCard } from '../../components/GlassCard'

/**
 * ⚠️ GARDÉ INTENTIONNELLEMENT malgré zéro appelant (audit code-mort du
 * 31/08/2026 — lot hygiène). NE PAS supprimer sans re-vérifier.
 *
 * `account.raw_analysis.technology_stack[].{name,usage}` reste PRODUIT par
 * la phase 3 (`technologyEntrySchema`, account-analysis.ts:117). L'écran
 * live (`CompanyPublicDataSection` → `TechStackCard`) affiche un champ
 * DIFFÉRENT : `detected_tech_stack`, une simple liste de noms détectés, sans
 * le `usage` (« React — pour le portail client ») que CE composant montrait.
 * Moins sévère que `Competitors`/`ItPrograms` : l'export PDF
 * (`account-pdf/normalize.ts:293`, `techItemSchema`) garde `usage` ET en plus
 * `maturity`/`opportunity_for_esn`, que cet écran n'a jamais montrés non plus
 * — le PDF est donc déjà la version la plus complète disponible. Gardé par
 * cohérence avec les deux autres cas de ce lot, pas par urgence.
 */

type TechnologiesProps = {
  technologies: TechnologyEntry[]
}

export function Technologies({ technologies }: TechnologiesProps) {
  const { t } = useTranslation('accountDetail')
  const renderable = technologies.filter(tech => typeof tech.name === 'string' && tech.name.length > 0)
  if (renderable.length === 0) return null

  return (
    <GlassCard>
      <Text
        element="h3"
        size="sm"
        weight="semibold"
        className="mb-3 flex items-center gap-2 text-[var(--bellum-text-primary)]"
      >
        <Building2 className="h-4 w-4 text-[var(--bellum-text-muted)]" />
        {t('technologies.title')}
      </Text>
      <div className="flex flex-wrap gap-2">
        {renderable.map((tech, i) => (
          <span
            key={`${tech.name}-${i}`}
            className="cursor-default rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-1 text-xs text-[var(--bellum-text-secondary)]"
          >
            {tech.usage ? `${tech.name} — ${tech.usage}` : tech.name}
          </span>
        ))}
      </div>
    </GlassCard>
  )
}
