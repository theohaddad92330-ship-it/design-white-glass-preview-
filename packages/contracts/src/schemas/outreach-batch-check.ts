/**
 * LE CONTRÔLE DE MASSE — #2947/#2204.73 (« rejeter un message identique pour
 * cinquante personnes »).
 *
 * `preSendCheck` (`pre-send-check.ts`) juge UN message contre sa checklist ; il
 * ne voit jamais les autres messages du même envoi, donc ne peut pas répondre à
 * la question que pose #2204.73 : est-ce que CE lot envoie le même texte à
 * plusieurs contacts ? C'est la lacune que note le registre d'investigation
 * (#2947, commentaire du 25/09) : « aucun contrôle automatique de similarité
 * inter-messages ».
 *
 * Deux corps sont LE MÊME message dès qu'ils sont identiques une fois la
 * casse, les accents et les espaces normalisés — aucun score de ressemblance
 * deviné, aucune probabilité (doctrine : aucune PROBABILITÉ affichée). Une
 * reformulation triviale (majuscules, espaces doublés) ne masque pas un envoi
 * de masse ; un texte réellement différent, même proche, n'est pas accusé.
 */

export type OutreachBatchMessage = {
  readonly contactId: string
  readonly body: string
}

/** Un groupe de contacts partis avec EXACTEMENT le même corps de message. */
export type OutreachDuplicateGroup = {
  readonly contactIds: readonly string[]
  readonly body: string
}

/** En dessous de deux destinataires, il n'y a rien à comparer. */
const MIN_GROUP_SIZE = 2

function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizedForDuplicate(body: string): string {
  return deaccent(body).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Les groupes de contacts qui reçoivent le même message, dans l'ORDRE
 * d'apparition du premier exemplaire — jamais un score, jamais un pourcentage :
 * soit deux corps sont le même message, soit ils ne le sont pas.
 */
export function outreachDuplicateGroups(messages: readonly OutreachBatchMessage[]): OutreachDuplicateGroup[] {
  const byBody = new Map<string, { body: string; contactIds: string[] }>()
  for (const message of messages) {
    const key = normalizedForDuplicate(message.body)
    if (key.length === 0) continue
    const existing = byBody.get(key)
    if (existing) {
      existing.contactIds.push(message.contactId)
    } else {
      byBody.set(key, { body: message.body, contactIds: [message.contactId] })
    }
  }
  return [...byBody.values()]
    .filter(group => group.contactIds.length >= MIN_GROUP_SIZE)
    .map(group => ({ contactIds: group.contactIds, body: group.body }))
}
