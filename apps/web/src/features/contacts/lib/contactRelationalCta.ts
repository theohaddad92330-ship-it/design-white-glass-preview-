import { isContactIdentityComplete, type Contact } from '@bellum/contracts'

type ContactRelationalCtaKey = 'handle_reply' | 'verify_job_change' | 'reactivation' | 'first_approach'

type ContactRelationalCta = {
  key: ContactRelationalCtaKey
  /** L'id du bloc EXISTANT vers lequel le clic scroll — jamais un second
   *  moteur, la même carte que le reste de la fiche déjà monte. `null` : le
   *  geste n'a pas de bloc à montrer, il ouvre le composeur commun (#3689 —
   *  la carte d'accroches, ancienne cible, a quitté la fiche). */
  scrollTargetId: string | null
}

/**
 * #2160.15/.16/.17/.19 — « un CTA contextuel selon l'état relationnel ».
 *
 * L'état est déjà CALCULÉ ailleurs — cette fonction ne fait que le LIRE et
 * choisir le libellé qui correspond, jamais un second calcul :
 *  - `user_status === 'replied'` (#2160.17) — quelqu'un a répondu, prioritaire
 *    sur tout le reste (une réponse qui attend coûte plus qu'un signal
 *    incertain de changement de poste).
 *  - `lifecycle_state === 'historique'` (#2160.19) — le même fait que la
 *    routine CRM « changement de poste peut-être détecté »
 *    (`routine-executors.ts` `contactJobChange`), mais calculé PAR CONTACT via
 *    `computeContactLifecycleState`/`employerMismatch` (Apollo), toujours
 *    disponible à la lecture d'UNE fiche — les deux mécanismes restent
 *    DISJOINTS (#2160.2, décision Louis 17/09), celui-ci ne fusionne rien, il
 *    lit un fait déjà nommé ailleurs pour driver CE bouton.
 *  - `user_status === 'silence'` (#2160.16) — relation dormante au niveau
 *    contact (distinct du `dormant` COMPTE, `commercial_status`).
 *  - `user_status === 'new'` (#2160.15) — jamais travaillé, SEULEMENT si
 *    l'identité est complète (même porte que le bouton Contacter : un
 *    contact non identifié ne se message pas).
 *  - `contacted` / `meeting` / `refused` — aucun signal à faire remonter ici,
 *    `null` (ce n'est pas un « 0 » — l'absence de CTA n'affirme rien).
 */
export function contactRelationalCta(contact: Contact): ContactRelationalCta | null {
  if (contact.user_status === 'replied') {
    return { key: 'handle_reply', scrollTargetId: 'contact-timeline' }
  }
  if (contact.lifecycle_state === 'historique') {
    return { key: 'verify_job_change', scrollTargetId: 'contact-apollo-profile' }
  }
  if (contact.user_status === 'silence') {
    return { key: 'reactivation', scrollTargetId: null }
  }
  if (contact.user_status === 'new' && identityComplete(contact)) {
    return { key: 'first_approach', scrollTargetId: null }
  }
  return null
}

function identityComplete(contact: Contact): boolean {
  return isContactIdentityComplete({
    fullName: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    role: contact.decision_role,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
}
