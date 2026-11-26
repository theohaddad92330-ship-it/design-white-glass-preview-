/**
 * #2994 — LE BOUTON EXPORTER DU BRIEF « AUJOURD'HUI », sur le patron déjà posé
 * par `agenda.brief.export` (`MeetingPrepDialog.tsx:475`) : un texte copié
 * dans le presse-papiers, RIEN n'est envoyé — le copilote prépare, il n'envoie
 * jamais seul (doctrine).
 *
 * Une absence ne fabrique jamais une ligne : sans priorité, le texte s'arrête
 * à l'en-tête plutôt que d'écrire « 0 priorité aujourd'hui » (GA-18/19).
 */
export function buildBriefingExportText(params: { dayLabel: string; priorityLines: readonly string[] }): string {
  const numbered = params.priorityLines.map((line, index) => `${index + 1}. ${line}`)
  return [params.dayLabel, ...(numbered.length > 0 ? ['', ...numbered] : [])].join('\n')
}
