import { isContactIdentityComplete } from '@bellum/contracts'

/** Les champs d'identité que la règle lit — satisfaits par une ligne de contact. */
type ContactIdentityInput = {
  full_name?: string | null
  title?: string | null
  entity?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  /** Le nom de famille tel que la source le masque sur son offre gratuite. */
  last_name_obfuscated?: string | null
  raw_data?: Record<string, unknown> | null
}

/**
 * Ce que le copilote a le droit d'appeler « le nom » de ce contact.
 *
 * Signalé en bêta : le copilote écrivait « Maximilian » — un prénom seul,
 * présenté exactement comme il aurait présenté « Maximilian Dupont ». Le
 * commercial lit un nom, et rien ne lui dit qu'il n'en a que la moitié.
 *
 * Les écrans savent déjà le dire : la liste de contacts affiche « Nom à
 * révéler » sur ces demi-identités. Le copilote, lui, recevait `full_name`
 * brut. Le résumé qu'on lui envoie porte donc désormais l'état de l'identité —
 * un modèle ne peut pas deviner qu'une chaîne est incomplète, et lui laisser
 * croire l'inverse produit une phrase fausse dans un contexte de prospection.
 *
 * Rien n'est inventé : on ne complète pas le nom, on dit qu'il manque.
 */
export function contactIdentityLabel(contact: ContactIdentityInput): string {
  const fullName = String(contact.full_name ?? '').trim()
  const complete = isContactIdentityComplete({
    fullName,
    title: contact.title,
    entity: contact.entity,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
  if (complete) return fullName || '?'

  // Demi-identité : la source a publié le prénom et la première lettre du nom.
  // On rend cette lettre — c'est une information de plus sur la MÊME personne,
  // pas une supposition — en disant que le reste manque.
  const rawMask = contact.raw_data?.['lastNameObfuscated']
  const mask = contact.last_name_obfuscated ?? (typeof rawMask === 'string' ? rawMask : '')
  const maskedInitial = mask.trim().match(/\p{L}/u)?.[0]
  // c81 (Louis 04/10/2026) — un nom COMPLET déjà en base se donne en clair :
  // l'initiale ne remplace qu'un prénom seul, jamais un nom qu'on tient.
  const holdsFullName = fullName.split(/\s+/).filter(Boolean).length >= 2
  if (maskedInitial && fullName && !holdsFullName) {
    return `${fullName} ${maskedInitial.toUpperCase()}. (nom de famille non révélé)`
  }

  // Pas de personne confirmée : c'est le RÔLE qui tient lieu d'identité. Donner
  // le prénom d'appoint reviendrait à nommer quelqu'un qui n'existe pas encore.
  const role = String(contact.title ?? '').trim()
  if (role) return `${role} (personne à identifier)`

  return fullName ? `${fullName} (identité incomplète)` : '?'
}
