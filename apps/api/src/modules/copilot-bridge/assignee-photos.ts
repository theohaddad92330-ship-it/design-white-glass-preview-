/**
 * LA PHOTO D'UN CONSULTANT NE MONTE PAS AU MODÈLE — doctrine `c58`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `assignees` a changé de forme le 04/09/2026 : il rendait `string[]`, il rend
 * `{ id, fullName, photoUrl }[]` pour que la liste des missions puisse dessiner
 * un avatar et ouvrir le profil (#1350, #1363).
 *
 * Ces deux routes-ci ne servent pas un écran : elles servent un PROMPT. Et la
 * doctrine est explicite — « un champ n'a pas besoin d'être multiplié par un
 * poids pour peser dans un classement, il suffit qu'il soit dans le prompt qui
 * note ». C'est exactement ainsi que `photoUrl` voyageait jusqu'à
 * `bellum_contacts` sans qu'aucune ligne ne le « lise ».
 *
 * L'identité et le nom RESTENT : le copilote doit pouvoir dire « Salomé est
 * dessus ». C'est l'image qui part, parce qu'elle n'apprend rien au modèle et
 * qu'elle est un critère protégé.
 *
 * ⚠️ Le retrait se fait ICI, sur le pont, et pas dans `DeliveryService` : la
 * liste des missions de l'écran a BESOIN de la photo. Retirer le champ à la
 * source reviendrait à retirer la capacité pour se protéger de son usage.
 */
export function withoutAssigneePhotos<T extends { assignees: { id: string; fullName: string }[] | null }>(
  mission: T,
): T {
  if (mission.assignees === null) return mission
  return { ...mission, assignees: mission.assignees.map(({ id, fullName }) => ({ id, fullName })) }
}
