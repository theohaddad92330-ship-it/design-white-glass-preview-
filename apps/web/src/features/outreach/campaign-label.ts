import type { OutreachSequence } from '@bellum/contracts'

/**
 * #2203.32 → .38 / #2153.29 — L'ÉTIQUETTE DE CAMPAGNE (arbitrage de Louis,
 * 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN ÉTIQUETAGE, PAS UN OBJET
 * ─────────────────────────────────────────────────────────────────────────
 * #2203 décrivait une séquence-CAMPAGNE : un tableau d'audience multi-contacts,
 * une ligne par personne. Le moteur crée UNE séquence PAR contact, et c'est le
 * bon modèle — c'est ce qui lui permet de s'arrêter quand CETTE personne
 * répond. Ce qui manquait n'était pas un objet : c'était de quoi répondre à
 * « où en est ma campagne ? ». Les séquences lancées ensemble partagent donc
 * une ÉTIQUETTE, et le tableau filtre dessus.
 *
 * Ce qu'on n'a PAS fait, et qui se décidera après usage : pas de table
 * « campagne », pas de cadence commune, pas d'ajout de contact après coup.
 * « Retirer ce contact » (#2203.59) reste « annuler UNE des séquences », qui
 * existe déjà.
 *
 * La dérivation vit ICI et nulle part ailleurs : deux endroits qui fabriquent
 * l'étiquette, et deux lancements du même geste se retrouvent dans deux
 * campagnes.
 */

/** Ce dont l'étiquette d'un lancement a besoin — rien de plus. */
type CampaignLabelInput = {
  /** Combien de contacts partent de ce geste. */
  contactCount: number
  /** Le nom saisi pour la séquence, s'il y en a un. */
  name: string
  /** L'objectif d'une campagne préparée par Laura, s'il y en a un. */
  objective?: string | null
  /** Le libellé du gabarit choisi — le dernier recours, jamais une clé. */
  templateLabel: string
  /** Le moment du lancement : ce qui sépare deux campagnes du même gabarit. */
  at: Date
}

/** Une chaîne blanche n'est pas un nom : elle vaut « rien ». */
function written(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  return value || null
}

/**
 * L'étiquette d'un lancement groupé, ou `null`.
 *
 * ⚠️ `null` sous DEUX contacts, et c'est le cœur de la règle : une séquence
 * lancée seule n'appartient à aucune campagne. Lui en fabriquer une ferait de
 * chaque envoi solitaire une « campagne d'une personne » dans le filtre — le
 * filtre deviendrait alors une liste de tous les contacts, c'est-à-dire rien.
 *
 * Le dernier recours porte l'HEURE, pas seulement la date : deux campagnes du
 * même gabarit le même jour sont deux campagnes, et les fondre dans une seule
 * étiquette ferait mentir « où en est ma campagne ? ».
 */
export function campaignLabelFor(input: CampaignLabelInput): string | null {
  if (input.contactCount < 2) return null
  const chosen = written(input.name) ?? written(input.objective)
  if (chosen) return chosen.slice(0, 120)
  const stamp = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(input.at)
  return `${input.templateLabel} · ${stamp}`.slice(0, 120)
}

/** Une campagne telle que le tableau la lit : son étiquette et ce qu'elle porte. */
type CampaignOption = {
  label: string
  /** Combien de séquences la portent — l'AUDIENCE, une ligne par personne. */
  count: number
}

/**
 * Les campagnes présentes dans les séquences lues, la plus fournie en tête.
 *
 * Les séquences sans étiquette n'entrent PAS dans la liste : elles ne sont pas
 * une campagne « (sans nom) », elles ont été lancées seules. Les compter
 * ensemble inventerait un groupe que personne n'a formé.
 */
export function campaignOptions(sequences: readonly OutreachSequence[]): CampaignOption[] {
  const counts = new Map<string, number>()
  for (const sequence of sequences) {
    const label = written(sequence.campaign_label)
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Les séquences d'une campagne. `null` = aucun filtre, on rend tout — et non
 * « celles qui n'ont pas d'étiquette » : le filtre absent et le filtre vide ne
 * se disent pas de la même façon.
 */
export function filterByCampaign(
  sequences: readonly OutreachSequence[],
  label: string | null,
): readonly OutreachSequence[] {
  if (!label) return sequences
  return sequences.filter(sequence => written(sequence.campaign_label) === label)
}
