// #2445.12 (épopée #2766) — le corps envoyé par `IncidentOpsRow` en journalisant
// une action ou une communication. `workspaceId` ne compte que pour une
// COMMUNICATION (une action n'a pas de destinataire) : un opérateur qui cible un
// client précis passe encore par l'API directement (le champ existe côté
// serveur, `logIncidentCommunication`, depuis le lot SRC5) — cette fonction
// l'expose enfin au formulaire de la console.
export function incidentLogRequestBody(
  kind: 'action' | 'communication',
  note: string,
  workspaceId: string,
): { note: string; workspaceId?: string } {
  const trimmedNote = note.trim()
  if (kind === 'action') return { note: trimmedNote }
  const trimmedWorkspaceId = workspaceId.trim()
  return trimmedWorkspaceId ? { note: trimmedNote, workspaceId: trimmedWorkspaceId } : { note: trimmedNote }
}
