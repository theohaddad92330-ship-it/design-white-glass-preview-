import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'
import { enrichmentCooldown, type EnrichmentTraceInput } from './contact-enrichment.js'

/**
 * Les cinq vues de la liste de contacts, et le coût d'une action de lot
 * (recette finale §37).
 *
 * Le rapport demande « des vues : À contacter, À enrichir, À vérifier, Déjà
 * connus, Masqués » et « afficher le coût avant action : révéler les
 * coordonnées de 10 profils — jusqu'à 10 crédits ».
 *
 * Ces vues ne sont pas des filtres de plus : ce sont les cinq TÂCHES qu'un
 * commercial fait sur une liste de contacts. Un filtre répond à « montre-moi
 * X » ; une vue répond à « qu'est-ce que je fais maintenant ». La différence
 * tient au fait qu'une vue a une action évidente attachée, et un filtre non.
 *
 * L'appartenance se DÉRIVE de l'état du contact, jamais d'une case à cocher :
 * un contact enrichi doit quitter « à enrichir » tout seul, sinon la liste
 * devient un inventaire à tenir à jour à la main — c'est-à-dire un inventaire
 * faux au bout d'une semaine.
 */

export const CONTACT_VIEWS = ['to_contact', 'to_enrich', 'to_verify', 'known', 'hidden'] as const
export type ContactView = (typeof CONTACT_VIEWS)[number]

/** Ce qu'il faut savoir d'un contact pour le ranger. */
export type ContactViewInput = {
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  /** Nom complet résolu ? Un profil au nom masqué reste « à vérifier ». */
  full_name?: string | null
  hidden?: boolean | null
  /** Déjà présent dans le CRM, ou déjà contacté. */
  crm_synced_at?: string | null
  email_sent_at?: string | null
  /**
   * Le statut de la relation (`contacts.user_status`) : `new` tant que personne
   * n'a rien tenté, puis `contacted` / `replied` / `meeting` / `refused` /
   * `silence`.
   *
   * Il est là parce que la liste `/contacts` ne transporte NI `email_sent_at` NI
   * `crm_synced_at` — elle transporte ce statut, et lui seul. Les trois disent la
   * MÊME chose : quelqu'un a déjà touché cette personne. Les deux issues qu'on
   * s'interdit sont symétriques — fabriquer un horodatage côté écran pour
   * satisfaire la signature aurait inventé une donnée, et refaire le test
   * « a-t-on déjà touché ce contact ? » dans le composant en aurait fait une
   * SECONDE dérivation, qui diverge le jour où un statut s'ajoute (GA-26).
   *
   * ⚠️ Volontairement typé `string` et non l'union fermée : ce fichier range des
   * contacts venus de trois projections (liste, fiche, import) dont une seule
   * porte l'enum. Une valeur inconnue se comporte comme `new` — elle ne conclut
   * rien.
   */
  user_status?: string | null
  /**
   * #2297.26 — trace de la dernière tentative d'enrichissement, reprise ici
   * SEULEMENT pour que {@link bulkEnrichmentExclusionReason} puisse appliquer
   * la même règle que {@link enrichmentCooldown} (idempotence serveur,
   * `contact-enrichment.ts`) : un contact que ce cooldown protège encore ne
   * rapporterait rien de neuf, donc n'entre pas dans le lot facturable.
   */
} & Partial<EnrichmentTraceInput>

function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * A-t-on déjà touché cette personne ?
 *
 * `new` est l'ABSENCE de relation, pas une relation à son premier stade : c'est
 * la seule valeur qui ne dit rien. Tout le reste — y compris `refused` et
 * `silence` — établit qu'un échange a eu lieu, et un échange raté compte autant
 * qu'un échange réussi pour la question posée ici : ne pas reproposer d'enrichir
 * ou de contacter quelqu'un qu'on a déjà travaillé.
 */
function alreadyEngaged(userStatus: string | null | undefined): boolean {
  return filled(userStatus) && userStatus?.trim().toLowerCase() !== 'new'
}

/**
 * Dans quelle vue ce contact tombe.
 *
 * L'ordre est celui du travail réel. « Masqué » d'abord, parce que c'est une
 * décision de l'utilisateur et qu'aucune tâche ne doit la contredire. « Déjà
 * connu » ensuite : reproposer d'enrichir ou de contacter quelqu'un qu'on a
 * déjà touché est la façon la plus sûre de faire perdre confiance en la liste.
 *
 * Puis la question de l'IDENTITÉ avant celle du CANAL : un profil dont on n'a
 * pas le nom complet n'est pas « à enrichir », il est « à vérifier ». Enrichir
 * un profil non identifié dépense un crédit sur une question mal posée.
 */
export function resolveContactView(contact: ContactViewInput): ContactView {
  if (contact.hidden === true) return 'hidden'
  if (filled(contact.crm_synced_at) || filled(contact.email_sent_at) || alreadyEngaged(contact.user_status))
    return 'known'
  if (!filled(contact.full_name)) return 'to_verify'
  if (filled(contact.email) || filled(contact.phone)) return 'to_contact'
  return 'to_enrich'
}

/** Répartit une liste dans les cinq vues, en un passage. */
export function groupByContactView<T extends ContactViewInput>(contacts: readonly T[]): Record<ContactView, T[]> {
  const out = Object.fromEntries(CONTACT_VIEWS.map(view => [view, [] as T[]])) as Record<ContactView, T[]>
  for (const contact of contacts) out[resolveContactView(contact)].push(contact)
  return out
}

/**
 * Ce que va coûter une action de lot, AVANT le clic.
 *
 * Le mot « jusqu'à » n'est pas une précaution de langage : l'enrichissement ne
 * débite que sur un résultat, donc le coût réel est inférieur ou égal au coût
 * annoncé. Annoncer le maximum est la seule formulation qui ne puisse pas
 * décevoir — un utilisateur qui paie moins que prévu ne se plaint jamais.
 *
 * Les contacts déjà pourvus d'une coordonnée sont exclus du compte : les
 * facturer serait payer deux fois pour la même information, et c'est le reproche
 * exact que le cooldown d'enrichissement corrige déjà côté serveur.
 */
export function bulkEnrichmentCost(
  contacts: readonly ContactViewInput[],
  now: Date = new Date(),
): { billable: number; maxCredits: number } {
  const billable = billableForEnrichment(contacts, now).length
  return { billable, maxCredits: billable * CREDIT_WEIGHTS.contact_enrichment }
}

/**
 * QUI part à l'enrichissement — et donc qui est compté par
 * {@link bulkEnrichmentCost}, qui ne fait que mesurer ce que cette fonction rend.
 *
 * Les deux ne peuvent pas diverger parce qu'il n'y a qu'un prédicat. C'est la
 * seule façon de tenir « le prix annoncé est le prix débité » : un écran qui
 * compte avec une règle et envoie avec une autre annonce un chiffre juste sur
 * une population fausse, et l'écart ne se voit que sur une facture.
 *
 * Le type de l'appelant est préservé : l'écran doit pouvoir enrichir SES objets
 * (id, nom de société…), pas une projection réduite à ce que ce fichier lit.
 */
export function billableForEnrichment<T extends ContactViewInput>(contacts: readonly T[], now: Date = new Date()): T[] {
  return contacts.filter(contact => bulkEnrichmentExclusionReason(contact, now) === null)
}

/**
 * #2297.25 / #2297.26 — pourquoi un contact ne part PAS à l'enrichissement de
 * lot. Jusqu'ici {@link billableForEnrichment} l'écartait en silence : la
 * confirmation annonçait le lot RETENU, jamais ce qui en manquait ni pourquoi.
 *
 * Même priorité que `resolveContactView` (l'IDENTITÉ avant le CANAL) : un
 * profil sans nom complet n'est pas « déjà pourvu », il est « à vérifier »
 * d'abord. `on_cooldown` (#2297.26) vient après les deux : un contact protégé
 * par le cooldown d'idempotence n'a ni identité à résoudre ni coordonnée déjà
 * là — sinon l'une des deux premières raisons l'aurait déjà écarté.
 */
export const BULK_ENRICHMENT_EXCLUSION_REASONS = [
  'identity_unresolved',
  'already_has_contact_info',
  'on_cooldown',
] as const
export type BulkEnrichmentExclusionReason = (typeof BULK_ENRICHMENT_EXCLUSION_REASONS)[number]

/** `null` ⇒ facturable — même prédicat que {@link billableForEnrichment}, un seul endroit (GA-26). */
export function bulkEnrichmentExclusionReason(
  contact: ContactViewInput,
  now: Date = new Date(),
): BulkEnrichmentExclusionReason | null {
  if (!filled(contact.full_name)) return 'identity_unresolved'
  if (filled(contact.email) || filled(contact.phone)) return 'already_has_contact_info'
  // #2297.26 — le serveur (`preflightEnrichment`) refuse déjà ce contact sans
  // débit via `enrichmentCooldown` : un enrichissement de lot qui le comptait
  // quand même annonçait un coût maximal faux et le laissait disparaître de
  // l'aperçu sans raison, alors que la mise en file l'aurait rejeté en silence.
  if (enrichmentCooldown(contact, now)) return 'on_cooldown'
  return null
}

/**
 * Décompte des exclusions d'un lot, par raison — ce que la confirmation
 * annonce à côté du coût. Une raison à zéro n'apparaît pas (une liste ne
 * porte jamais de ligne vide, doctrine « on n'affiche pas ce qu'on n'a
 * pas »), et l'ordre est stable (celui de {@link BULK_ENRICHMENT_EXCLUSION_REASONS}).
 */
export function bulkEnrichmentExclusions(
  contacts: readonly ContactViewInput[],
  now: Date = new Date(),
): { reason: BulkEnrichmentExclusionReason; count: number }[] {
  const counts = new Map<BulkEnrichmentExclusionReason, number>()
  for (const contact of contacts) {
    const reason = bulkEnrichmentExclusionReason(contact, now)
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return BULK_ENRICHMENT_EXCLUSION_REASONS.filter(reason => counts.has(reason)).map(reason => ({
    reason,
    count: counts.get(reason) as number,
  }))
}

/**
 * Un profil international doit-il être écarté de la priorisation automatique ?
 *
 * Le §37 est explicite : « ne pas auto-prioriser un profil international si la
 * géographie utilisateur est la France ». Le rapport le montre au §34 — une ESN
 * française voyait un Chief Data Officer en Chine dans ses quatre premières
 * actions.
 *
 * On n'EXCLUT pas le profil : il reste dans la liste, consultable et
 * contactable. On lui retire seulement le droit de remonter tout seul en tête,
 * ce qui est une décision différente — un commercial qui cherche un contact en
 * Chine doit pouvoir le trouver.
 */
export function deprioritisesInternational(userGeo: string | null | undefined): boolean {
  const geo = (userGeo ?? '').trim().toLowerCase()
  return geo === 'fr' || geo === 'france'
}
