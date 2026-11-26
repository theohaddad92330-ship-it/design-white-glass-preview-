import { Button, cn, Text } from '@bellum/ui'
import type { AnalysisHierarchyLevel, CadrageAppliedPart } from '@bellum/contracts'
import { cadrageApplied } from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'

/** Clé i18n (`search:confirm.contactLevel.levels.*`) de chaque niveau — les libellés de l'écran « Cadrer ». */
const LEVEL_KEYS: Record<AnalysisHierarchyLevel, string> = {
  c_level: 'confirm.contactLevel.levels.cLevel',
  n1: 'confirm.contactLevel.levels.n1',
  n2: 'confirm.contactLevel.levels.n2',
  operational: 'confirm.contactLevel.levels.operational',
  purchasing: 'confirm.contactLevel.levels.purchasing',
}

/**
 * Cadrage analyse (retour Louis 15/10, décision D) — « Cadrage appliqué : … »
 * en tête du dossier : UNE ligne qui dit ce que le cadrage du DERNIER run a
 * filtré ou classé, avec les mots de l'écran « Cadrer ». La liste vient du
 * contrat (`cadrageApplied`) : un run d'avant la feature, ou sans cadrage, ne
 * fabrique aucune ligne — on n'affiche pas ce qu'on n'a pas.
 */
export function CadrageApplied({ accountId, className }: { accountId: string; className?: string }) {
  const { t } = useTranslation('accounts')
  const { t: tSearch } = useTranslation('search')
  const { data: runs } = useAccountRuns(accountId)
  const latestRun = runs?.[0]
  const parts = cadrageApplied(latestRun?.scope_selection ?? null)
  // Théo B r1-recherche.N6 — « Voir le cadrage / Masquer ce rappel » : le rappel se déplie (chaque réglage sur sa ligne)
  // et se masque POUR CE RUN — une nouvelle analyse le ramène. Le stockage du navigateur peut manquer : le rappel reste.
  const [expanded, setExpanded] = useState(false)
  const dismissKey = `bellum:cadrage-applied-dismissed:${accountId}:${latestRun?.id ?? ''}`
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissKey))
  if (parts.length === 0 || dismissed) return null

  const describe = (part: CadrageAppliedPart): string => {
    // Théo B r1-recherche.N6 — « Cadrage conservé » : les objectifs choisis et l'angle suivent le dossier ouvert.
    if (part.key === 'objectives') {
      return t('cadrageApplied.parts.objectives', {
        values: part.objectives.map(key => tSearch(`frame.objectives.${key}`)).join(', '),
      })
    }
    if (part.key === 'angle') return t('cadrageApplied.parts.angle', { values: part.value })
    if (part.key === 'geo') {
      const zone = [tSearch(`confirm.geo.perimeters.${part.geo}`), ...part.values].join(' · ')
      return t('cadrageApplied.parts.geo', { zone })
    }
    if (part.key === 'levels') {
      return t('cadrageApplied.parts.levels', {
        values: part.levels.map(level => tSearch(LEVEL_KEYS[level])).join(' › '),
      })
    }
    return t(`cadrageApplied.parts.${part.key}`, { values: part.values.join(', ') })
  }
  const text = parts.map(describe).join(' · ')

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <Text role="note" size="xs" className="min-w-0 flex-1 truncate text-[var(--bellum-text-muted)]" title={text}>
          {t('cadrageApplied.label')} {text}
        </Text>
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('cadrageApplied.hide') : t('cadrageApplied.show')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            writeDismissed(dismissKey)
            setDismissed(true)
          }}
        >
          {t('cadrageApplied.dismiss')}
        </Button>
      </div>
      {expanded ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--bellum-text-secondary)]">
          {parts.map(part => (
            <li key={part.key}>{describe(part)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Stockage indisponible (navigation privée) : le rappel se masque pour cette visite seulement.
  }
}
