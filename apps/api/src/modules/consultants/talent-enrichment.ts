import type { ApolloEnrichmentData, EnrichContactInput, SearchPeopleByNameResult } from '@bellum/contracts'
import { splitName } from '../crm/contact-crm-mapper'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'

/**
 * #2570 — « voir les consultants comme des contacts concernant
 * l'enrichissement » (retour bêta François Thomas, call du 17/09/2026).
 *
 * Pur, sans NestJS ni réseau : la partie qui doit se tester sans base, même
 * patron que `cv-rewrite-guard.ts` et `reverse-market.ts` dans ce module.
 * L'orchestration (charger la fiche, appeler `IaClient`, arbitrer et
 * persister) vit dans `ConsultantsService.enrichTalent`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PROFIL LINKEDIN EST EXIGÉ, ET PAS SEULEMENT LE NOM
 * ─────────────────────────────────────────────────────────────────────────
 * Le chemin d'enrichissement CONTACT réutilisé ici (`IaClient.enrichContact`,
 * même cascade fournisseur) n'accepte une recherche fiable que sur une clé
 * forte : un id Apollo, un profil LinkedIn, ou un nom ANCRÉ à un employeur
 * (`enrichContactInputSchema`, `@bellum/contracts`). Un contact a toujours un
 * compte pour ancrer sa recherche ; un consultant du vivier n'en a PAS — c'est
 * précisément ce qu'on cherche à découvrir (« où travaille-t-il maintenant ? »).
 * Sans profil LinkedIn enregistré, la seule requête possible serait
 * prénom+nom seuls : le rapprochement approximatif que la doctrine interdit
 * (deux homonymes existent). La fiche le dit plutôt que de deviner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #3831.1 — ENRICHIR SANS LINKEDIN : LA RECHERCHE LIBRE, PAS LA DEVINETTE
 * ─────────────────────────────────────────────────────────────────────────
 * Retour bêta (07/10/2026) : « on pourrait chercher des infos partout […] et
 * si ça colle on met ». La doctrine interdit le rapprochement par le seul nom
 * — mais `GET /consultants/search-by-name` (tier GRATUIT Apollo People-Search,
 * même capacité que #2727 côté contacts) existe déjà pour exactement ce besoin :
 * il rend des HOMONYMES distingués (poste, entreprise, ville), jamais une
 * coordonnée, et laisse un humain CHOISIR. L'`apolloId` de l'homonyme choisi
 * est alors une clé aussi forte qu'un profil LinkedIn (même `refine` que
 * `enrichContactInputSchema`) — `override.apolloId` ci-dessous la fait entrer
 * dans le même chemin, sans jamais chercher sur le nom seul.
 */

/** Pourquoi la cascade n'a pas pu être lancée — jamais une recherche devinée. */
type TalentEnrichmentBlockedReason = 'no_identity' | 'no_match_key'

/** #3831.1 — l'homonyme choisi à l'écran (`PersonNameSearchHit.id`), jamais
 *  une recherche sur le nom seul : voir le docblock ci-dessus. */
type TalentEnrichmentOverride = { apolloId?: string }

/**
 * Construit la requête d'enrichissement, ou dit pourquoi elle est impossible.
 *
 * `title` voyage comme INDICE de recherche seulement — jamais comme organe de
 * décision : la doctrine interdit qu'un champ noté (via un score) pèse sur le
 * rang d'une personne, et ici on ne note personne, on cherche une seule
 * personne déjà identifiée par son nom.
 */
export function buildEnrichmentInput(
  consultant: Pick<ConsultantEntity, 'full_name' | 'public_profile_url' | 'title'>,
  override?: TalentEnrichmentOverride,
): { ok: true; input: EnrichContactInput } | { ok: false; reason: TalentEnrichmentBlockedReason } {
  const fullName = consultant.full_name?.trim()
  if (!fullName) return { ok: false, reason: 'no_identity' }

  const { firstName, lastName } = splitName(fullName)
  if (!firstName) return { ok: false, reason: 'no_identity' }

  // #3831.1 — l'homonyme choisi l'emporte : c'est une clé plus récente et plus
  // sûre qu'un profil LinkedIn qui peut dater, et surtout la SEULE clé
  // disponible quand la fiche n'en a aucune.
  const apolloId = override?.apolloId?.trim() || undefined
  const linkedinUrl = consultant.public_profile_url?.trim() || undefined
  if (!apolloId && !linkedinUrl) return { ok: false, reason: 'no_match_key' }

  return {
    ok: true,
    input: {
      firstName,
      ...(lastName ? { lastName } : {}),
      ...(apolloId ? { apolloId } : { linkedinUrl: linkedinUrl! }),
      ...(consultant.title?.trim() ? { title: consultant.title.trim() } : {}),
    },
  }
}

/** Un champ réellement récupéré, prêt pour l'arbitre de provenance. Une chaîne
 *  vide ou blanche n'est PAS une valeur : un fournisseur muet sur un champ ne
 *  doit jamais écraser une saisie avec du vide (voir `decideFieldWrite`). */
export type TalentEnrichmentPatch = {
  title?: string
  email?: string
  phone?: string
  public_profile_url?: string
}

/** Ce que la réponse Apollo/Dropcontact apporte à la fiche — présent-seulement,
 *  jamais un champ deviné pour un champ absent de la réponse. */
export function enrichmentPatchFrom(data: ApolloEnrichmentData): TalentEnrichmentPatch {
  const patch: TalentEnrichmentPatch = {}
  if (data.title?.trim()) patch.title = data.title.trim()
  if (data.email?.trim()) patch.email = data.email.trim()
  if (data.phone?.trim()) patch.phone = data.phone.trim()
  if (data.linkedin_url?.trim()) patch.public_profile_url = data.linkedin_url.trim()
  return patch
}

/**
 * L'espace de DÉMONSTRATION (parité démo, craft rule 9) — zéro appel réseau,
 * zéro crédit, et le geste se montre quand même. Contrairement au parsing de
 * CV (`cv-parse-demo.ts`), il n'y a ici RIEN dans le texte source à citer :
 * un « poste actuel » est par nature une donnée EXTÉRIEURE à la fiche. La
 * valeur est donc clairement étiquetée `source: 'demo'` (jamais confondue
 * avec un résultat réel) et dérivée du TITRE DÉJÀ SUR LA FICHE — un « (poste
 * confirmé) » ajouté au texte existant, jamais un nom d'entreprise inventé.
 */
export function demoTalentEnrichmentPatch(consultant: Pick<ConsultantEntity, 'title'>): TalentEnrichmentPatch {
  const current = consultant.title?.trim()
  if (!current) return {}
  const suffix = ' (poste confirmé)'
  if (current.endsWith(suffix)) return { title: current }
  return { title: `${current}${suffix}` }
}

/**
 * #3831.1 — l'espace de DÉMONSTRATION de `GET /consultants/search-by-name`,
 * même court-circuit que `ContactsService.searchPeopleByNameInDemo` (#2727) :
 * AUCUN appel Apollo réel, un homonyme FICTIF dérivé du nom tapé — jamais une
 * vraie personne recherchée en démo.
 */
export function demoSearchPeopleByName(fullName: string, organizationName?: string): SearchPeopleByNameResult {
  const trimmed = fullName.trim()
  if (!trimmed) return { status: 'empty', hits: [] }
  const [demoFirstName, ...rest] = trimmed.split(/\s+/)
  const lastInitial = rest.length ? rest[rest.length - 1]!.charAt(0) : ''
  return {
    status: 'ok',
    hits: [
      {
        id: 'demo-apollo-1',
        firstName: demoFirstName ?? '',
        lastNameObfuscated: lastInitial ? `${lastInitial}***` : '',
        title: 'Poste actuel inconnu',
        organizationName: organizationName?.trim() || 'Nordia',
        city: 'Paris',
        country: 'France',
        hasEmail: true,
        hasPhone: false,
      },
    ],
  }
}
