import { z } from 'zod'

/**
 * #2705 — le formulaire obligatoire de `/demo` : une adresse PERSONNELLE ne
 * doit pas pouvoir s'y inscrire, ni depuis l'interface, ni en appelant l'API
 * directement.
 *
 * GA-26 — un réglage vit à UN seul endroit. Cette liste EST celle que
 * `apps/api/src/modules/activities/activity-linking.ts` utilisait déjà pour
 * décider si le domaine d'un contact prouve un rattachement à un compte
 * (`isPublicEmailDomain`, depuis #2110). Elle est déplacée ici, dans le
 * package partagé, parce que #2705 a besoin de la MÊME décision côté
 * NAVIGATEUR (désactiver le bouton, message d'erreur immédiat) — un fichier
 * de `apps/api` n'est pas importable depuis `apps/web`. `activity-linking.ts`
 * réimporte cette liste au lieu d'en garder une copie : voir son propre
 * fichier, la fonction `isPublicEmailDomain` y garde le même nom et la même
 * signature, aucun appelant existant n'a dû changer.
 *
 * Volontairement courte (voir la raison d'origine dans `activity-linking.ts`) :
 * les domaines nommés par Théo (22/09/2026) — Gmail, Hotmail, Outlook, Yahoo,
 * iCloud, Proton, Orange, Free, La Poste, SFR, GMX, Yandex… — y sont déjà
 * tous.
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'ymail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'laposte.net',
  'sfr.fr',
  'bbox.fr',
  'numericable.fr',
  'gmx.com',
  'gmx.fr',
  'yandex.com',
  'mail.com',
])

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase())
}

/** Le domaine d'une adresse, en minuscules. `null` si ce n'est pas une adresse. */
export function emailDomainOf(value: string): string | null {
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return null
  return value
    .slice(at + 1)
    .trim()
    .toLowerCase()
}

/**
 * Une adresse e-mail PROFESSIONNELLE (#2705) : un format valide, ET un domaine
 * qui n'est pas dans {@link PUBLIC_EMAIL_DOMAINS}. Utilisée CÔTÉ SERVEUR (le
 * DTO de `POST /demo/lead`, `packages/contracts/src/schemas/demo-lead.ts`) —
 * l'interface web fait sa propre vérification immédiate avec
 * {@link isPublicEmailDomain} pour afficher le message localisé (FR/EN) SANS
 * appeler l'API à chaque frappe ; les deux lisent la MÊME liste.
 *
 * Le message ci-dessous est un détail d'API (utile en `curl`, jamais montré
 * tel quel à un visiteur) — le texte que voit un prospect vit dans
 * `demo.entry.form.professionalEmailError` (FR + EN), pas ici.
 */
export const professionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine(value => !isPublicEmailDomain(emailDomainOf(value) ?? ''), {
    message: 'Adresse e-mail personnelle refusée : merci de fournir une adresse professionnelle.',
  })
