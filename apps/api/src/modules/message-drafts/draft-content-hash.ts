import { createHash } from 'node:crypto'

type DraftContent = {
  subject: string | null
  body: string
  edited_subject: string | null
  edited_body: string | null
}

/** Le contenu EFFECTIF d'une version : la correction du commercial si elle existe, sinon le texte préparé. */
export function effectiveDraftContent(version: DraftContent): { subject: string | null; body: string } {
  return { subject: version.edited_subject ?? version.subject, body: version.edited_body ?? version.body }
}

/**
 * Théo B C6.N2 — l'empreinte de ce que le commercial a relu (sha-256 hex du sujet + corps EFFECTIFS). Un seul calcul
 * (GA-26) : la validation la pose, l'envoi programmé (Théo M2) la relit au départ — un texte qui ne correspond plus
 * ne part pas.
 */
export function draftContentHash(version: DraftContent): string {
  const { subject, body } = effectiveDraftContent(version)
  return createHash('sha256')
    .update(`${subject ?? ''}\n${body}`)
    .digest('hex')
}
