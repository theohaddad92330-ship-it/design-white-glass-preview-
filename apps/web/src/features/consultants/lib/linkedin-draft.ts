import type { LinkedinDraft } from '@bellum/contracts'
import type { ConsultantFormState } from './consultantForm'

/**
 * H-DECISIONS #4348 — pose le brouillon d'un profil LinkedIn dans le formulaire
 * d'ajout. Il PRÉ-REMPLIT, il n'écrase pas : un champ déjà saisi garde sa
 * valeur (une correction humaine gagne toujours), un champ que le brouillon ne
 * porte pas reste tel quel (jamais vidé, jamais deviné — les compétences que le
 * fournisseur ne rend pas restent à saisir). Tout reste éditable avant
 * l'enregistrement.
 */
export function applyLinkedinDraft(form: ConsultantFormState, draft: LinkedinDraft): ConsultantFormState {
  const fill = (current: string, incoming: string | null): string => (current.trim() ? current : (incoming ?? current))
  return {
    ...form,
    full_name: fill(form.full_name, draft.full_name),
    title: fill(form.title, draft.title),
    email: fill(form.email, draft.email),
    phone: fill(form.phone, draft.phone),
    cv_text: fill(form.cv_text, draft.cv_text),
    stack: fill(form.stack, draft.stack.length > 0 ? draft.stack.join(', ') : null),
    // L'adresse collée est celle que la personne a vérifiée : elle est posée telle quelle.
    public_profile_url: draft.public_profile_url,
    source: draft.source,
  }
}
