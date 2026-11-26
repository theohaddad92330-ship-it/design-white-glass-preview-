import type { EsnAnswers } from '@bellum/contracts'
import { i18n } from '@/i18n'

/** One line of the "Ton profil BellumAI" summary card. */
type WelcomeProfileRow = { label: string; value: string }

/** Shown when the underlying answer is empty — the card never renders a blank.
 *  Résolu à l'import (langue de boot) — ne sert qu'aux tests ; les lignes du
 *  résumé résolvent leur fallback à l'appel. */
export const WELCOME_SUMMARY_FALLBACK = i18n.t('welcome:summary.fallback')

const MAX_ITEMS = 3

/**
 * Join a multi-select answer into a compact, human string, capped at
 * {@link MAX_ITEMS} with a "+N" overflow marker. Empty/blank entries are
 * dropped (Supabase arrays can carry stray empties). Returns '' when nothing
 * usable remains so callers can apply their own fallback.
 */
function joinTop(values: readonly string[] | null | undefined): string {
  const cleaned = (values ?? []).map(v => v.trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  const head = cleaned.slice(0, MAX_ITEMS).join(' · ')
  const extra = cleaned.length - MAX_ITEMS
  return extra > 0 ? `${head} +${extra}` : head
}

/**
 * Derive the four-row profile summary (ESN, size, offers, targets) from the
 * Temps-1 questionnaire answers. Pure — every field degrades to
 * {@link WELCOME_SUMMARY_FALLBACK} so the welcome card is always complete,
 * even mid-onboarding or while the answers query is still resolving.
 */
export function toWelcomeProfileSummary(answers: EsnAnswers | null | undefined): readonly WelcomeProfileRow[] {
  const esnName = answers?.esn_name?.trim() || ''
  const size = answers?.consultant_size?.trim() || ''
  const offers = joinTop(answers?.expertise_areas)
  const targets = joinTop([...(answers?.target_sectors ?? []), ...(answers?.target_company_types ?? [])])
  const fallback = i18n.t('welcome:summary.fallback')

  return [
    { label: i18n.t('welcome:summary.esnName'), value: esnName || fallback },
    {
      label: i18n.t('welcome:summary.sizeLabel'),
      value: size ? i18n.t('welcome:summary.sizeValue', { size }) : fallback,
    },
    { label: i18n.t('welcome:summary.expertiseLabel'), value: offers || fallback },
    { label: i18n.t('welcome:summary.targetsLabel'), value: targets || fallback },
  ]
}
