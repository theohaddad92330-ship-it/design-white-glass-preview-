import { getEsnArchetypeLabels, getSellingPostureLabels } from '@/features/profile-context/lib/labels'
import type { AuditHeadline } from './build-audit'

type AuditHeadlineTranslate = (key: string, options?: Record<string, unknown>) => string

/**
 * #2090.35 / #2074.9 — EXTRAIT de `AuditHero.tsx` (`renderHeadline`) pour que
 * l'export PDF de l'audit (`lib/audit-pdf/AuditPdfDocument.tsx`) rende
 * EXACTEMENT le même texte que l'écran, jamais une deuxième traduction du
 * même fait écrite à côté (GA-26 — un réglage vit à un seul endroit).
 */
export function renderAuditHeadlineText(value: NonNullable<AuditHeadline['value']>, t: AuditHeadlineTranslate): string {
  switch (value.kind) {
    case 'posture':
      return getSellingPostureLabels()[value.posture]
    case 'archetype':
      return getEsnArchetypeLabels()[value.archetype]
    case 'target':
      return t('target.value', {
        size: t(`discover:sidebar.size.${value.size}`),
        level: t(`discover:sidebar.level.${value.decisionLevel}`),
        strategy: t(`strategy.${value.entryStrategy}`),
      })
    case 'text':
      return value.text
    case 'cadence':
      // Un zéro MESURÉ s'affiche « 0 analyse par semaine » : le bloc est là,
      // il dit zéro, et c'est un fait — pas un trou comblé.
      return [
        t('cadence.analyses', { count: value.analysesPerWeek }),
        t('cadence.messages', { count: value.messagesPerDay }),
        t('cadence.followUps', { count: value.followUpsPerWeek }),
      ].join(' · ')
  }
}
