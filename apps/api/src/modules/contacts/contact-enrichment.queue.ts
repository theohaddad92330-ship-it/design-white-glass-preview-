import type { JobsOptions } from 'bullmq'
import type { ApolloEnrichmentData, EnrichmentCoordinate } from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ContactFailure } from './contacts.service'

/**
 * Contrat BullMQ de l'enrichissement contact à la demande (bouton « Enrichir »).
 *
 * Pourquoi une file pour un clic : la cascade fournisseur est séquentielle
 * (Apollo People-Match → People-Search → élargissement d'org → SalesQL →
 * Dropcontact) et chaque leg peut d'abord attendre son jeton sur le throttle
 * Apollo partagé par tout le cluster. 30-50 s est le cas courant. Tenir ça dans
 * la requête du bouton faisait dépendre un résultat PAYÉ de tout ce qui peut
 * couper entre le navigateur et nous.
 */
export const CONTACT_ENRICHMENT_QUEUE = 'contact-enrichment'

/** Payload d'un job. Le `dto` est celui du bouton — les ancres org propres sont
 *  re-résolues depuis le COMPTE dans `ContactsService.enrichContact`, jamais
 *  figées ici (le compte peut avoir été ré-analysé entre le clic et le run). */
export type ContactEnrichmentJobData = {
  contactId: string
  userId: string
  first_name: string
  last_name?: string
  organization_name: string
  force?: boolean
  /**
   * #2988 — enrichissement ciblé PAR coordonnée : absent = comportement
   * historique (email ET téléphone). Présent, le worker le transmet à
   * `ContactsService.enrichContact`, qui ne persiste ni ne débite la
   * coordonnée non demandée (`foldReachability`), et le passe à son tour à
   * `EnrichmentProviders.enrich` pour sauter les fournisseurs de secours qui
   * ne peuvent structurellement pas la rendre (Hunter/Dropcontact = email
   * seul).
   */
  only?: EnrichmentCoordinate
  /** #3549 — rattrapage d'opérateur : gratuit pour le client (voir `ContactsService.enrichContact`). */
  free?: boolean
  /**
   * #1931 L2 (I3) — la réservation de crédit posée AU CLIC d'une carte de Laura.
   * Le worker la solde dès qu'il observe le débit (consommée) ou son absence
   * (libérée). Absente pour le bouton « Enrichir » de l'écran, qui ne réserve pas.
   */
  reservationReference?: string
  /**
   * R4 — l'espace de cette réservation. Le worker ne solde qu'avec lui : la même
   * référence peut vivre dans deux espaces. Attaché avec la référence, jamais seul.
   */
  reservationWorkspaceId?: string
}

/** Charge utile d'un enrichissement réussi — la MÊME que rendait l'appel
 *  synchrone (le contact à jour + le solde de crédits après débit), au détour
 *  près d'un aller-retour JSON par Redis (les dates deviennent des ISO, comme
 *  elles le devenaient déjà en sortant par HTTP). */
export type EnrichedContactPayload = ContactEntity & {
  enrichment: ApolloEnrichmentData
  credits_remaining: number
  /**
   * #1931 L2 (D3 / I4) — les crédits RÉELLEMENT débités par cette recherche :
   * 0 quand rien n'a été trouvé. Optionnel parce qu'un job mis en file avant le
   * déploiement ne le porte pas — et un champ absent se lit « non mesuré »,
   * jamais 0 (`enrichmentJobsPortFrom`).
   */
  credits_debited?: number
}

/** Ce que le worker rend. Un échec MÉTIER (crédits épuisés, cooldown, provider
 *  indisponible) est une valeur de retour, pas une exception : le job a fait son
 *  travail, la réponse est « non » — et BullMQ ne doit ni la retenter ni la
 *  compter comme incident. Seule une panne d'infra remonte en exception. */
export type ContactEnrichmentJobResult =
  | { ok: true; contact: EnrichedContactPayload }
  | { ok: false; failure: ContactFailure }

/**
 * Un job par contact. Deux propriétés en découlent :
 *  - deux clics rapprochés (ou deux onglets) partagent le même job — jamais deux
 *    cascades payées en parallèle sur la même personne ;
 *  - l'endpoint de suivi n'a besoin de rien d'autre que l'id du contact pour
 *    retrouver l'état, donc aucun identifiant opaque à trimballer côté client.
 *
 * Un job TERMINÉ garde son id jusqu'à son expiration : le service le retire
 * explicitement avant de relancer, sinon `add()` renverrait silencieusement
 * l'ancien résultat au clic suivant.
 *
 * ⚠️ AUCUN `:` : BullMQ l'utilise comme séparateur de clés Redis et REJETTE
 * (`Error: Custom Id cannot contain :`) tout jobId qui en contient sauf s'il a
 * exactement 3 segments (compat des anciens jobs répétables). Un `enrich:<uuid>`
 * (2 segments) sortait donc en 500 nu au tout premier clic. Le tiret est neutre.
 */
export function contactEnrichmentJobId(contactId: string): string {
  return `enrich-${contactId}`
}

export const CONTACT_ENRICHMENT_JOB_OPTIONS: JobsOptions = {
  // JAMAIS de retry : chaque tentative relance une cascade fournisseur payante
  // (même posture que `maxAttempts: 1` sur l'appel IA — un retry doublait le coût
  // et le temps d'attente). L'utilisateur re-clique s'il le veut.
  attempts: 1,
  // Le résultat doit survivre au polling du client (et à un rechargement de page
  // pendant la cascade) — une heure est large, et borne ce qu'on garde en Redis.
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
}
