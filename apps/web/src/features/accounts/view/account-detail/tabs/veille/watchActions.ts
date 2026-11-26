import type { UserAttackAngle } from '@bellum/contracts'
import type { OpportunityDraft } from '@/features/projects/model/opportunityDraft'
import { i18n } from '@/i18n'
import type { WatchSignal } from '@/features/accounts/model/watch'
import type { PlanActionInput } from '@/features/actions/planItems.api'
import { deadlineCalendarValue } from '@/lib/deadline'
import { formatSignalDate } from '@/lib/signal-date'

/**
 * #2123.46 — « cette semaine », l'échéance que la veille a toujours donnée à
 * « qualifier un signal », dans la grammaire des échéances du produit (une
 * semaine). Elle s'écrivait en PROSE dans `raw_analysis.user_plan_actions` ;
 * sur la ligne canonique elle devient une date, ce qui la fait apparaître dans
 * « Mes relances » et sur `/actions` au lieu d'un texte que rien ne relit.
 */
const WATCH_SIGNAL_DEADLINE = 'S+1'

/**
 * « Ajouter au plan » depuis un signal de veille.
 *
 * #2123.46 — le corps de la ligne canonique (`POST /plan-items`). Rien de ce
 * que l'ancien objet portait ne se perd : le résultat attendu garde son champ,
 * l'échéance devient une date, la source du signal devient la raison. Aucun
 * objet n'est deviné (`target: null`) : un signal n'est aucun des huit
 * référentiels, et l'écran nommera le manque.
 */
export function watchSignalToPlanAction(signal: WatchSignal, now: Date = new Date()): PlanActionInput {
  return {
    label: i18n.t('accountWatch:actions.qualifySignal', { signal: signal.signal }),
    target: null,
    // #2617.2 — « ne pas ressaisir type/source/date/impact » : la raison ne
    // portait que la SOURCE. Le type et la date du signal disparaissaient à la
    // bascule vers le plan — à retrouver à la main en rouvrant l'onglet
    // Signaux. Les deux vivent maintenant dans la même ligne, en prose comme
    // le reste de ce champ (`reason` n'a pas de sous-champs dans le contrat).
    reason: i18n.t('accountWatch:actions.signalReason', {
      source: signal.source,
      type: signal.type,
      date: formatSignalDate(signal.date),
    }),
    // #2395.8 — requis à la création : l'implication commerciale du signal, à défaut un gabarit (jamais vide).
    expected_outcome: signal.sales_implication?.trim() || i18n.t('accountWatch:actions.signalOutcome'),
    due_date: deadlineCalendarValue(WATCH_SIGNAL_DEADLINE, now.toISOString()),
  }
}

export function watchSignalToAttackAngle(signal: WatchSignal): UserAttackAngle {
  // #2617.2 — même défaut côté angle : `entry_point` gardait déjà le TYPE et
  // `description` l'IMPACT, mais la SOURCE et la DATE du signal n'étaient
  // écrites nulle part — perdues dès qu'on quittait l'onglet Signaux.
  // `userAttackAngleSchema` n'a pas de champ dédié : la provenance rejoint la
  // description, toujours écrite (contrairement à l'impact, absent d'un
  // signal sur deux).
  const provenance = i18n.t('accountWatch:actions.angleProvenance', {
    source: signal.source,
    date: formatSignalDate(signal.date),
  })
  const impact = signal.sales_implication?.trim()
  return {
    title: i18n.t('accountWatch:actions.angleTitle', { signal: signal.signal }),
    description: impact ? `${impact}\n\n${provenance}` : provenance,
    entry_point: signal.type,
    offer: i18n.t('accountWatch:actions.angleOffer'),
    estimated_deal_size: i18n.t('accountWatch:actions.dealSizeToQualify'),
    recommended: (signal.score ?? 0) >= 85,
  }
}

/**
 * #3683.2 — « Préparer une opportunité » depuis un signal sans projet : le BROUILLON, rien n'est créé.
 * Reprend ce que le signal porte (fait, source, date, type, lecture commerciale) ; le montant, la clôture,
 * le porteur et l'interlocuteur n'y sont pas — le brouillon les dit manquants au lieu de les inventer.
 */
export function watchSignalToOpportunityDraft(signal: WatchSignal): OpportunityDraft {
  const label = signal.signal.trim().slice(0, 200)
  const implication = signal.sales_implication?.trim() || null
  const facts: OpportunityDraft['facts'] = []
  if (signal.source.trim()) facts.push({ key: 'source', value: signal.source.trim() })
  facts.push({ key: 'date', value: formatSignalDate(signal.date) })
  if (signal.type.trim()) facts.push({ key: 'type', value: signal.type.trim() })
  const detail = [
    signal.signal.trim(),
    ...facts.map(fact => i18n.t(`accountWatch:actions.opportunityFact.${fact.key}`, { value: fact.value })),
    implication,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)
  return {
    label,
    objective: implication ? implication.slice(0, 500) : null,
    detail,
    facts,
    missing: ['amount', 'closeOn', 'owner', 'contact'],
  }
}

/**
 * #4755 (lot 761) — « Au plan » depuis une ligne du tableau des signaux : la MÊME action de plan que depuis un
 * signal de veille (libellé, échéance d'une semaine), avec la personne à contacter quand la ligne en propose une.
 * La raison dit le type et la date du fait — jamais sa source (décision 2 du lot : les sources ne se nomment pas).
 */
export function signalLineToPlanAction(
  line: { title: string; date: string; type: string },
  contactName: string | null,
  now: Date = new Date(),
): PlanActionInput {
  return {
    label: contactName
      ? i18n.t('projects:signalTable.plan.labelWithContact', { signal: line.title, name: contactName })
      : i18n.t('accountWatch:actions.qualifySignal', { signal: line.title }),
    target: null,
    reason: i18n.t('projects:signalTable.plan.reason', {
      type: i18n.t(`projects:signalTable.types.${line.type}`),
      date: formatSignalDate(line.date),
    }),
    expected_outcome: i18n.t('accountWatch:actions.signalOutcome'),
    due_date: deadlineCalendarValue(WATCH_SIGNAL_DEADLINE, now.toISOString()),
  }
}
