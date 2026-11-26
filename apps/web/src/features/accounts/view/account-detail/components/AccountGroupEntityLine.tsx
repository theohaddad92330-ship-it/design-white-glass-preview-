import { readEntityResolution } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

// Les natures qui sont UNE PARTIE d'un ensemble : le compte analysé n'est pas le groupe lui-même.
const PART_OF_GROUP_KINDS = new Set(['subsidiary', 'business_unit', 'business_direction', 'site', 'brand', 'program'])

/**
 * #4988.1 — le groupe et l'entité analysée, lus de la résolution d'entité du dossier (`raw_analysis.entity_resolution`,
 * la MÊME lecture que le panneau de la Vue d'ensemble). Rien si le compte est le groupe, si la nature est inconnue ou
 * si aucun groupe n'est connu : on n'invente pas de groupe.
 */
export function groupEntityOf(
  rawAnalysis: Record<string, unknown> | null | undefined,
): { group: string; entity: string } | null {
  const resolution = readEntityResolution(rawAnalysis)
  if (!resolution?.kind || !PART_OF_GROUP_KINDS.has(resolution.kind)) return null
  const group = resolution.parent_names.find(name => name.trim() !== '')?.trim()
  if (!group) return null
  return { group, entity: resolution.commercial_name }
}

export function AccountGroupEntityLine({ rawAnalysis }: { rawAnalysis: Record<string, unknown> | null | undefined }) {
  const { t } = useTranslation('accounts')
  const found = groupEntityOf(rawAnalysis)
  if (!found) return null
  return (
    <Text data-testid="account-group-entity" size="sm" className="text-[var(--bellum-text-secondary)]">
      {t('hero.groupEntity', found)}
    </Text>
  )
}
