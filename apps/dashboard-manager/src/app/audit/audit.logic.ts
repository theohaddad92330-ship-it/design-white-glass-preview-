import {
  BACKOFFICE_AUDIT_CATEGORIES,
  type BackofficeAuditCategory,
  type BackofficeAuditOutcome,
} from '@bellum/contracts'
import type { FiltreAudit, LigneAudit } from '@/lib/journal-audit'

/**
 * Ce que l'écran d'audit CALCULE, séparé de ce qu'il rend (#1666).
 *
 * Tout est pur : aucune horloge lue, aucune requête. C'est ce qui permet de
 * tester les seuls endroits où un mensonge pourrait s'écrire — une catégorie
 * qui disparaît d'un filtre, un « permanent » affiché « 0 mois », un sujet vide
 * rendu comme un sujet connu.
 */

/** Le libellé français d'une catégorie. La clé, elle, reste stable et anglaise-neutre. */
const CATEGORIES_FR: Record<BackofficeAuditCategory, string> = {
  ordinaire: 'Actions ordinaires',
  permission: 'Changements de permission',
  export: 'Exports de données',
  suppression: 'Suppressions',
  impersonation: 'Impersonations',
}

export function libelleCategorie(category: BackofficeAuditCategory): string {
  return CATEGORIES_FR[category]
}

const RESULTATS_FR: Record<BackofficeAuditOutcome, string> = {
  succes: 'Réussi',
  refus: 'Refusé',
  echec: 'Échec',
}

export function libelleResultat(outcome: BackofficeAuditOutcome): string {
  return RESULTATS_FR[outcome]
}

/**
 * La durée de conservation, en clair.
 *
 * ⚠️ `null` se DIT « permanent ». Le rendre « 0 mois » — ou pire, le laisser
 * vide — ferait de la seule catégorie qu'on garde pour toujours celle qui a
 * l'air de ne pas être gardée du tout.
 */
export function libelleRetention(months: number | null): string {
  return months === null ? 'permanent' : `${months} mois`
}

/**
 * De quoi la ligne PARLE, en une chaîne.
 *
 * ⚠️ Rend `'—'` quand il n'y a rien, jamais une chaîne construite à moitié
 * (`'user · '`), qui donnerait l'impression d'un sujet qu'on connaîtrait sans
 * savoir lequel.
 */
export function sujetLisible(ligne: Pick<LigneAudit, 'subject_type' | 'subject_id' | 'subject_label'>): string {
  const morceaux = [ligne.subject_label, ligne.subject_id].filter((v): v is string => Boolean(v && v.trim()))
  if (morceaux.length === 0) return ligne.subject_type?.trim() || '—'
  const nature = ligne.subject_type?.trim()
  return nature ? `${nature} · ${morceaux[0] as string}` : (morceaux[0] as string)
}

/**
 * D'OÙ le geste est parti — l'IP et le pays, quand le bord les a fournis.
 *
 * ⚠️ « Non mesuré » n'est pas « depuis nulle part » : une origine absente
 * s'écrit `'—'`. Vercel les fournit presque toujours, et « presque » n'est pas
 * « toujours » — hors de son réseau il n'y a rien à lire.
 */
export function origineLisible(ligne: Pick<LigneAudit, 'ip' | 'country'>): string {
  const morceaux = [ligne.ip, ligne.country].filter((v): v is string => Boolean(v && v.trim()))
  return morceaux.length > 0 ? morceaux.join(' · ') : '—'
}

/**
 * Le lien d'un filtre — et c'est ici que se joue « aucun filtre qui masque une
 * catégorie entière ».
 *
 * ⚠️ Un filtre RESTREINT la page, il ne supprime rien : cliquer une catégorie
 * déjà active la RETIRE (retour au journal entier), et la pastille garde son
 * compte dans les deux cas. Il n'existe aucun chemin par lequel une catégorie
 * sort de la barre de filtres.
 *
 * ⚠️ Tout changement de filtre remet la PAGE à 1. Rester en page 4 d'un filtre
 * qui n'a que deux pages afficherait un tableau vide, qui se lirait comme
 * « aucune impersonation » alors qu'il y en a quarante.
 */
export function hrefFiltre(filtre: FiltreAudit, patch: Partial<FiltreAudit>): string {
  const fusion: FiltreAudit = { ...filtre, ...patch }
  const params = new URLSearchParams()
  if (fusion.category) params.set('category', fusion.category)
  if (fusion.outcome) params.set('outcome', fusion.outcome)
  if (fusion.actorEmail) params.set('actorEmail', fusion.actorEmail)
  if (fusion.operation) params.set('operation', fusion.operation)
  // La page ne se recopie que si le patch la fixe explicitement.
  if (patch.page !== undefined && patch.page > 1) params.set('page', String(patch.page))
  const query = params.toString()
  return query ? `/audit?${query}` : '/audit'
}

/** Bascule d'une catégorie : la même ⇒ on l'enlève, une autre ⇒ on la met. */
export function hrefCategorie(filtre: FiltreAudit, category: BackofficeAuditCategory | null): string {
  if (category === null) return hrefFiltre(filtre, { category: undefined })
  return hrefFiltre(filtre, { category: filtre.category === category ? undefined : category })
}

/**
 * Lit les paramètres d'URL sans jamais faire confiance à leur forme.
 *
 * ⚠️ Une catégorie inconnue est IGNORÉE, pas refusée : une faute de frappe dans
 * une URL ne doit pas produire une page d'erreur sur le seul écran qui doit
 * toujours répondre. Elle rend le journal ENTIER — plus, jamais moins.
 */
export function lireFiltre(params: Record<string, string | string[] | undefined>): FiltreAudit {
  const un = (clef: string): string | undefined => {
    const brut = params[clef]
    const valeur = Array.isArray(brut) ? brut[0] : brut
    return valeur?.trim() || undefined
  }
  const category = un('category')
  const page = Number(un('page') ?? '1')
  return {
    ...((BACKOFFICE_AUDIT_CATEGORIES as readonly string[]).includes(category ?? '') ? { category } : {}),
    ...(un('outcome') ? { outcome: un('outcome') as string } : {}),
    ...(un('actorEmail') ? { actorEmail: (un('actorEmail') as string).toLowerCase() } : {}),
    ...(un('operation') ? { operation: un('operation') as string } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** La phrase de pagination : « 51 – 100 sur 412 ». */
export function libellePlage(offset: number, montrees: number, correspondantes: number): string {
  if (montrees === 0) return `0 sur ${correspondantes}`
  return `${offset + 1} – ${offset + montrees} sur ${correspondantes}`
}

/** Y a-t-il une page suivante ? */
export function aUnePageSuivante(offset: number, montrees: number, correspondantes: number): boolean {
  return offset + montrees < correspondantes
}
