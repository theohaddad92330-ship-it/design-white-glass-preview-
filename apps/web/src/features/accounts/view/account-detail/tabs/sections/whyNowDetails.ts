import type { LucideIcon } from 'lucide-react'
import type { DiscoverOfferRequester } from '@/features/discover/lib/discover-types'
import { AlertTriangle, CalendarClock, CheckCircle2, Flame, Gauge, Zap } from 'lucide-react'
import { i18n } from '@/i18n'

export type WhyNowDetailRow = {
  label: string
  value: string
  icon?: LucideIcon
  iconClassName?: string
}

export type WhyNowItem = {
  id: string
  title: string
  details: WhyNowDetailRow[]
  /** #3925 — le lien vers la source, posé seulement quand une URL http(s) existe (sinon aucune ligne). */
  source?: { url: string; sourceKind: string | null }
  /** #3917.1 — « média · date » sous la ligne ; absent quand ni l'un ni l'autre n'est connu (rien d'inventé). */
  meta?: string
  /** #3668.7 — jamais replié derrière « Voir plus » (le contexte reste visible, rangé après les pistes). */
  pinned?: boolean
  /** #4286.11 — le dossier « qui demande ce profil ? » d'une offre ; absent = non composé, aucune ligne. */
  requester?: DiscoverOfferRequester
}

type DetailRowInput = {
  label: string
  value: string | null | undefined
  icon?: LucideIcon
  iconClassName?: string
}

type LevelTone = 'critical' | 'high' | 'medium' | 'low' | 'default'

// Raw level (serveur, FR/EN mélangés) → clé i18n. Les libellés sont résolus via
// i18n à l'appel (jamais au chargement du module) pour suivre la langue.
// i18n keys: level.critical | level.immediate | level.high | level.medium | level.low | level.strategic
const LEVEL_LABEL_KEYS: Record<string, string> = {
  critical: 'critical',
  critique: 'critical',
  urgent: 'critical',
  immediat: 'immediate',
  immediate: 'immediate',
  high: 'high',
  haute: 'high',
  medium: 'medium',
  moyenne: 'medium',
  moderate: 'medium',
  low: 'low',
  basse: 'low',
  faible: 'low',
  strategique: 'strategic',
  strategic: 'strategic',
}

const LEVEL_TONES: Record<string, LevelTone> = {
  critical: 'critical',
  critique: 'critical',
  urgent: 'critical',
  immediat: 'critical',
  immediate: 'critical',
  high: 'high',
  haute: 'high',
  medium: 'medium',
  moyenne: 'medium',
  moderate: 'medium',
  low: 'low',
  basse: 'low',
  faible: 'low',
  strategique: 'high',
  strategic: 'high',
}

const LEVEL_ICON_CLASS_NAMES: Record<LevelTone, string> = {
  critical: 'text-[var(--bellum-danger)]',
  high: 'text-[var(--bellum-warning-text)] dark:text-[var(--bellum-warning)]',
  medium: 'text-[var(--bellum-primary-500)] dark:text-[var(--bellum-primary-400)]',
  low: 'text-[var(--bellum-success)]',
  default: 'text-[var(--bellum-text-secondary)]',
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function levelTone(value: string): LevelTone {
  return LEVEL_TONES[normalizeKey(value)] ?? 'default'
}

function levelIcon(value: string, preferredHighIcon: LucideIcon): LucideIcon {
  const tone = levelTone(value)
  if (tone === 'critical' || tone === 'high') return preferredHighIcon
  if (tone === 'medium') return AlertTriangle
  if (tone === 'low') return CheckCircle2
  return Gauge
}

export function normalizeLevelLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const labelKey = LEVEL_LABEL_KEYS[normalizeKey(value)]
  return labelKey ? i18n.t(`accountDetail:level.${labelKey}`) : value
}

export function createUrgencyDetailRow(value: string | null | undefined): DetailRowInput {
  const normalizedValue = normalizeLevelLabel(value)
  return {
    label: i18n.t('accountDetail:detail.urgency'),
    value: normalizedValue,
    icon: typeof value === 'string' && value.length > 0 ? levelIcon(value, Flame) : Flame,
    iconClassName: typeof value === 'string' && value.length > 0 ? LEVEL_ICON_CLASS_NAMES[levelTone(value)] : undefined,
  }
}

export function createSeverityDetailRow(value: string | null | undefined): DetailRowInput {
  const normalizedValue = normalizeLevelLabel(value)
  return {
    label: i18n.t('accountDetail:detail.severity'),
    value: normalizedValue,
    icon: typeof value === 'string' && value.length > 0 ? levelIcon(value, Zap) : Zap,
    iconClassName: typeof value === 'string' && value.length > 0 ? LEVEL_ICON_CLASS_NAMES[levelTone(value)] : undefined,
  }
}

export function createTimeframeDetailRow(value: string | null | undefined): DetailRowInput {
  return {
    label: i18n.t('accountDetail:detail.timeframe'),
    value: normalizeLevelLabel(value),
    icon: CalendarClock,
  }
}

export function createDetailRows(rows: DetailRowInput[]): WhyNowDetailRow[] {
  return rows.filter((row): row is WhyNowDetailRow => typeof row.value === 'string' && row.value.length > 0)
}
