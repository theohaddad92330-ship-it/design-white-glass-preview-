import {
  deriveOutreachDisplayStatus,
  OUTREACH_SEQUENCE_TEMPLATES,
  type OutreachDisplayStatus,
  type OutreachSequence,
} from '@bellum/contracts'

/**
 * LE COCKPIT DES SÉQUENCES — la logique, séparée de l'écran (#1509, #1515).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL PRÉDICAT PAR SEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande quatre compteurs en tête, et que chacun FILTRE la liste au
 * clic. C'est exactement la forme d'un défaut que ce dépôt a déjà payé : un
 * compteur JUSTE au-dessus d'un filtre FAUX. Il suffit que le compte et le
 * filtre soient écrits à deux endroits pour qu'ils divergent — et l'écran dit
 * alors « 7 en attente » au-dessus de cinq lignes, sans que rien ne tombe.
 *
 * D'où {@link bucketsOf}, la SEULE fonction qui décide dans quels seaux tombe
 * une séquence. Le compteur additionne ce qu'elle rend ; le filtre garde ce
 * qu'elle rend. Ils ne peuvent pas se contredire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE STATUT NE SE RECALCULE PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `deriveOutreachDisplayStatus` est la source unique — la même que la fiche
 * contact et que la ligne du tableau. Un seau qui lirait `sequence.status` brut
 * dirait « active » d'une séquence dont la prochaine étape est un e-mail que
 * personne ne peut envoyer : c'est précisément le mensonge que le statut
 * d'affichage existe pour éviter.
 */

/** Les quatre seaux du retour, dans son ordre. */
export const SEQUENCE_BUCKETS = ['active', 'dueToday', 'replied', 'blocked'] as const
export type SequenceBucket = (typeof SEQUENCE_BUCKETS)[number]

/** Le statut d'affichage d'une séquence — dérivé, jamais lu d'une colonne. */
export function displayStatusOf(sequence: OutreachSequence, now: Date): OutreachDisplayStatus {
  const nextStep = sequence.steps.find(step => step.status === 'pending') ?? null
  return deriveOutreachDisplayStatus({
    status: sequence.status,
    nextStep: nextStep ? { due_at: nextStep.due_at, kind: nextStep.kind } : null,
    canSend: sequence.can_send,
    hasProgress: sequence.steps.some(step => step.status !== 'pending'),
    hasReply: sequence.contact_replied,
    // #2202.48/#2202.51 — la cause de l'arrêt, quand il y en a une : c'est ce
    // qui distingue « refused »/« bounced » d'un « cancelled » générique.
    cancelReason: sequence.cancel_reason,
    now,
  })
}

/**
 * Les seaux d'une séquence — zéro, un ou plusieurs.
 *
 * ⚠️ Une séquence peut être dans DEUX seaux : une échéance due aujourd'hui sur
 * une séquence qui court est à la fois « active » et « à faire aujourd'hui ».
 * Les rendre exclusifs ferait un total qui n'est pas le nombre de séquences, et
 * quatre compteurs qui s'additionnent à autre chose que la liste sont quatre
 * compteurs qu'on cesse de croire.
 *
 * ⚠️ « A répondu » SORT de « active », et c'est la règle du produit : une
 * séquence dont l'interlocuteur vient de répondre s'arrête. La compter parmi
 * ce qui court dirait le contraire de ce que l'écran affiche sur sa ligne.
 */
export function bucketsOf(
  sequence: OutreachSequence,
  now: Date,
  blockedContactIds: ReadonlySet<string> = NO_BLOCKED_CONTACTS,
): SequenceBucket[] {
  const status = displayStatusOf(sequence, now)
  const buckets: SequenceBucket[] = []

  if (status === 'responded') buckets.push('replied')
  else if (sequence.status === 'active') buckets.push('active')

  // Dû AUJOURD'HUI, pas « dû ou en retard un jour donné » : la borne est la fin
  // de la journée locale du lecteur. Une échéance dépassée compte aussi — elle
  // est due, et plus encore.
  if (sequence.status === 'active' && status !== 'responded' && sequence.next_step) {
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    if (new Date(sequence.next_step.due_at).getTime() <= endOfDay.getTime()) buckets.push('dueToday')
  }

  // #2877 — UNE source avec le centre d'approbation : un message bloqué (`view:
  // 'blocked'`) bloque la séquence qui court de son contact. Sans cela, l'onglet
  // « Bloqués » disait 6 et la carte « Bloquées » 0, deux définitions du même mot.
  const blockedByMessage = sequence.status === 'active' && blockedContactIds.has(sequence.contact_id)
  if (status === 'awaiting_connection' || status === 'failed' || blockedByMessage) buckets.push('blocked')

  return buckets
}

const NO_BLOCKED_CONTACTS: ReadonlySet<string> = new Set()

/** Combien de séquences dans chaque seau. Le compteur de l'entête. */
export function bucketCounts(
  sequences: readonly OutreachSequence[],
  now: Date,
  blockedContactIds: ReadonlySet<string> = NO_BLOCKED_CONTACTS,
): Record<SequenceBucket, number> {
  const counts: Record<SequenceBucket, number> = { active: 0, dueToday: 0, replied: 0, blocked: 0 }
  for (const sequence of sequences) {
    for (const bucket of bucketsOf(sequence, now, blockedContactIds)) counts[bucket] += 1
  }
  return counts
}

/**
 * La liste filtrée — la MÊME fonction que le compteur.
 *
 * `null` = aucun filtre. C'est ce qui rend la propriété testable en une ligne :
 * le nombre de lignes gardées par un seau EST son compteur.
 */
export function filterByBucket(
  sequences: readonly OutreachSequence[],
  bucket: SequenceBucket | null,
  now: Date,
  blockedContactIds: ReadonlySet<string> = NO_BLOCKED_CONTACTS,
): OutreachSequence[] {
  if (!bucket) return [...sequences]
  return sequences.filter(sequence => bucketsOf(sequence, now, blockedContactIds).includes(bucket))
}

/** L'avancement d'une séquence — « 2 / 4 ». Les étapes SKIPPÉES comptent comme
 *  jouées : une réponse ou un opt-out les a coupées, elles ne reviendront pas. */
export function progressOf(sequence: OutreachSequence): { done: number; total: number } {
  return {
    done: sequence.steps.filter(step => step.status !== 'pending').length,
    total: sequence.steps.length,
  }
}

/**
 * #2798 — LE MODE DE CAMPAGNE (le gabarit choisi à la création) — visible.
 *
 * Recette écran 27/09 : la cadence nurturing est bien DISTINCTE de l'outreach
 * classique (#2374.4/.21), mais rien à l'écran des séquences ne le MONTRE —
 * `template_key` est en base depuis #2378.6/.7, jamais lu ici avant ce lot.
 *
 * Le libellé (`OUTREACH_SEQUENCE_TEMPLATES[key].name`) reste en FRANÇAIS quelle
 * que soit la langue de l'écran — même règle que les `label` d'étape (#1510) :
 * c'est un enregistrement, pas un texte d'interface. `null` quand la séquence
 * n'a pas de gabarit connu — jamais un mode deviné.
 */
export function campaignModeLabel(sequence: OutreachSequence): string | null {
  const key = sequence.template_key
  if (!key) return null
  const template = (OUTREACH_SEQUENCE_TEMPLATES as Record<string, { name: string } | undefined>)[key]
  return template?.name ?? null
}

/**
 * #3421 — la clé i18n de la CONDITION D'ARRÊT d'une séquence, ou `null` quand
 * il n'y a rien de vrai à dire. Décidée ici, une seule fois : vivante (active
 * ou en pause) → ce qui l'arrêtera ; arrêtée sur un refus ferme ou une adresse
 * en échec → pourquoi plus rien ne part. Terminée, ou arrêtée sans cause
 * connue : `null` — jamais une cause devinée.
 */
export function stopConditionKey(status: OutreachSequence['status'], display: OutreachDisplayStatus): string | null {
  if (status === 'active' || status === 'paused') return 'detail.stopCondition.live'
  if (display === 'refused') return 'detail.stopCondition.refused'
  if (display === 'bounced') return 'detail.stopCondition.bounced'
  return null
}
