/**
 * #4600 — une boîte GÉNÉRIQUE (`contact@`, `info@`, `recrutement@`) est partagée par toute une équipe : deux fiches
 * qui la portent ne sont pas « la même personne ». Un réglage vit à UN seul endroit (GA-26) : les détecteurs de
 * doublons (contacts et comptes) lisent cette liste, aucun n'en garde une copie.
 */
const GENERIC_LOCAL_PARTS = new Set([
  'contact',
  'contacts',
  'info',
  'infos',
  'information',
  'hello',
  'bonjour',
  'accueil',
  'admin',
  'administration',
  'office',
  'bureau',
  'secretariat',
  'direction',
  'recrutement',
  'recruitment',
  'recrutements',
  'candidature',
  'candidatures',
  'rh',
  'hr',
  'jobs',
  'job',
  'careers',
  'carriere',
  'carrieres',
  'commercial',
  'sales',
  'vente',
  'ventes',
  'marketing',
  'communication',
  'presse',
  'press',
  'support',
  'service',
  'equipe',
  'team',
  'compta',
  'comptabilite',
  'facturation',
  'billing',
  'mail',
  'noreply',
  'no-reply',
  'donotreply',
  'postmaster',
  'webmaster',
])

export function isGenericMailbox(email: string | null | undefined): boolean {
  const raw = (email ?? '').trim().toLowerCase()
  const at = raw.lastIndexOf('@')
  if (at <= 0) return false
  const local = raw.slice(0, at)
  const plus = local.indexOf('+')
  return GENERIC_LOCAL_PARTS.has(plus > 0 ? local.slice(0, plus) : local)
}
