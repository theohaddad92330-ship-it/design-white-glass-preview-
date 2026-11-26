import type { ApolloContactProfile, ApolloEnrichmentData, EnrichmentCoordinateStates } from '@bellum/contracts'
import { normalizeFullName } from '../contacts/contact-identity'

/**
 * Ce que le bouton « Enrichir » rend dans un espace de DÉMONSTRATION.
 *
 * Il rendait des coordonnées fictives (`prenom.nom@societe.example`, un numéro
 * hors plage attribuée, une adresse de profil). C'était juste tant que les
 * personnes étaient inventées.
 *
 * Les cinq dossiers portent désormais des SOCIÉTÉS RÉELLES, et leurs contacts
 * nommés sont des mandataires sociaux publiés au registre. Fabriquer une
 * coordonnée pour l'un d'eux — même impossible à joindre, même en `.example` —
 * reste une donnée inventée attribuée à une personne qui existe, publiée sur un
 * lien que n'importe qui peut ouvrir. Et l'autre option, inventer une personne
 * pour porter la coordonnée, serait pire.
 *
 * Donc le clic ne trouve RIEN, et le dit. Ce n'est pas une démonstration
 * amputée : c'est la promesse centrale du produit qui s'affiche à l'écran —
 * quand il n'y a pas de donnée, il n'y en a pas. Le geste, lui, se voit
 * entièrement : le bouton réagit, la fiche se complète de ce qui est vrai
 * (périmètre, ville, famille métier), aucun crédit n'est débité, et le message
 * dit ce que le même clic ferait sur un espace réel.
 */

/** Ce que la démonstration répond quand on lui demande des coordonnées. */
export const DEMO_ENRICHMENT_REASON =
  'Espace de démonstration : les sociétés de ce jeu sont réelles, donc aucune coordonnée personnelle n’y est publiée. ' +
  'Sur ton espace, ce clic interroge tes fournisseurs d’enrichissement et remplit l’e-mail professionnel et le téléphone.'

/**
 * Fabrique la réponse d'enrichissement d'un contact de démonstration.
 *
 * Déterministe et sans réseau : le même contact rend toujours la même chose,
 * donc une démonstration rejouée devant un client montre exactement la même
 * chose.
 */
export function demoEnrichment(
  contact: {
    id: string
    full_name: string | null
    title: string | null
    entity: string | null
  },
  /**
   * Profil déjà construit pour ce contact (ville, départements, périmètre —
   * {@link demoApolloProfile}). Optionnel : sans lui, la réponse reste la même,
   * en moins riche.
   */
  profile?: ApolloContactProfile,
): ApolloEnrichmentData {
  const parts = (contact.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    // Le profil d'abord, pour que les champs explicites ci-dessous — qui sont le
    // contrat d'enrichissement — gagnent toujours sur leurs homonymes.
    ...(profile ?? {}),
    // `false` : aucune correspondance n'a été établie, parce qu'aucune n'a été
    // cherchée. L'écran le lit comme « rien trouvé », ce qui est exact.
    matched: false,
    first_name: parts[0] ?? null,
    last_name: parts.slice(1).join(' ') || null,
    email: null,
    email_status: null,
    phone: null,
    phone_numbers: [],
    linkedin_url: null,
    title: contact.title,
    organization_name: contact.entity?.trim() || null,
    // Le contrat exige ici une URL absolue et il n'y a de toute façon aucun
    // portrait : ces personnes sont réelles.
    photo_url: null,
  }
}

/**
 * #2297.18 (27/09/2026) — les cas où la démo simule un FOURNISSEUR qui a
 * trouvé plusieurs personnes pour un même nom dans la même société.
 *
 * Recette du 26/09 : « aucun homonyme exact dans l'espace : pas prouvable
 * sans un nouvel enrichissement payant ». En réel, cette ambiguïté vient
 * TOUJOURS du fournisseur (People-Search rend plusieurs profils) — jamais de
 * deux fiches du même compte : l'index unique
 * `idx_contacts_account_normalized_name` (migration `ContactIdentityDedup`)
 * interdit à deux contacts actifs du même compte de partager un nom
 * normalisé, en démo comme en réel. Poser deux lignes « Mathis Fontenelle »
 * chez un même compte pour le démontrer violait donc cette contrainte — le second
 * contact était rejeté au semis (`DemoSeedService.saveDossierContacts`, #3104)
 * et l'écran n'affichait jamais que « rien trouvé ».
 *
 * Cette liste fige, à la place, l'ÉVÉNEMENT que le fournisseur produirait —
 * déterministe et sans réseau, propre à la démo : un contact dont le nom et
 * la société y figurent reçoit `ambiguous` au clic « Enrichir »
 * (`ContactsService.enrichContactInDemo`), la MÊME porte et la MÊME sortie que
 * l'identité ambiguë d'un espace réel (`ContactsService.enrichContact`,
 * ligne ~2990) — zéro coordonnée écrite, zéro crédit débité.
 */
const DEMO_AMBIGUOUS_PROVIDER_MATCHES: ReadonlyArray<{ fullName: string; entity: string }> = [
  { fullName: 'Mathis Fontenelle', entity: 'SNCF Voyageurs' },
]

/**
 * Ce contact simule-t-il une réponse fournisseur à PLUSIEURS candidats ?
 * Voir {@link DEMO_AMBIGUOUS_PROVIDER_MATCHES}. Normalisé (accents/casse) des
 * deux côtés, comme partout ailleurs où deux identités se comparent
 * (`normalizeFullName`, `contact-identity.ts`).
 */
export function isDemoAmbiguousProviderMatch(
  fullName: string | null | undefined,
  entity: string | null | undefined,
): boolean {
  const name = normalizeFullName(fullName)
  const company = normalizeFullName(entity)
  if (!name || !company) return false
  return DEMO_AMBIGUOUS_PROVIDER_MATCHES.some(
    match => normalizeFullName(match.fullName) === name && normalizeFullName(match.entity) === company,
  )
}

/**
 * E1 (#3698, #3822) — l’état par coordonnée après un clic « Enrichir » en démo :
 * les trois coordonnées FICTIVES sont posées, donc « trouvées ». Jamais une
 * source nommée — seulement compter (doctrine).
 */
export function demoEnrichmentCoordinatesAllFound(at: string): EnrichmentCoordinateStates {
  return {
    email: { state: 'found', sources_queried: 1, at },
    phone: { state: 'found', sources_queried: 1, at },
    linkedin: { state: 'found', sources_queried: 1, at },
  }
}
