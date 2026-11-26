import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import type { Contact, EnrichmentCoordinate } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys } from '@/features/accounts/api'
import { contactAccountQueryKeys } from '@/features/contacts/lib/contactAccountKeys'
import { contactKeys, contactsApi, pollEnrichment, type EnrichContactResponse } from '@/features/contacts/api'
import { ApiError } from '@/lib/api'
import { parseApiStatus } from '@/lib/rate-limit-toast'
import { softBrakeToast } from '@/features/credits/lib/soft-brake'
import { followCoordinateConclusion } from '@/features/contacts/lib/followCoordinateConclusion'

type EnrichInput = {
  contact: Contact
  /** Account `company_name` — used as Apollo's `organization_name` fallback when
   *  the contact's `entity` is empty. */
  accountCompanyName: string
  /** Manual identity completion from the « identité incomplète » resolve dialog:
   *  the rep supplies the real full name so Apollo can match reliably. When set,
   *  it replaces the (possibly placeholder) `contact.full_name` as the match key. */
  fullNameOverride?: string
  /**
   * Enrichissement de MASSE : la notification par contact est supprimée.
   *
   * Dix contacts produisaient dix notifications empilées, et le seul chiffre qui
   * compte — combien trouvés, combien sans résultat, combien de crédits — n'était
   * dit nulle part. L'appelant en émet UNE, agrégée, à la fin (PDF 2 §5.4).
   */
  silent?: boolean
  /** « Réessayer quand même » : outrepasse le délai d'idempotence côté serveur.
   *  Toujours précédé d'une confirmation qui annonce le coût. */
  force?: boolean
  /**
   * #2988.1 — enrichissement séparé par coordonnée (email pro OU téléphone
   * pro) : le pipeline serveur le filtre déjà de bout en bout (queue, worker,
   * fournisseurs), mais rien à l'écran ne l'envoyait encore. Absent = les
   * deux coordonnées, comportement inchangé.
   */
  only?: EnrichmentCoordinate
  /**
   * #4063.1 — reprise du suivi d'un job DÉJÀ en vol (retour sur la fiche) : pas de POST, donc
   * aucun second débit ; on rejoint le job et on rend le même toast / le même résultat.
   */
  resume?: boolean
}

/** Best-effort split of "Prénom Nom" into first / last. Apollo expects both. */
function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return { first_name: '', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0]!, last_name: '' }
  return { first_name: parts[0]!, last_name: parts.slice(1).join(' ') }
}

/** Un seul bandeau par contact : le chargement et son résultat partagent leur
 *  identifiant, si bien que le second REMPLACE le premier. Deux clics sur le
 *  même contact ne produisent donc pas deux piles. */
const enrichToastId = (contactId: string): string => `enrich:${contactId}`

/**
 * #3850.3 — une coordonnée encore EN VOL au moment où ce tour se termine :
 * une révélation Apollo pas encore livrée (`pending`, webhook — #3782) ou une
 * sonde FullEnrich qui n'a pas conclu (`unknown` — #3850.2, « un timeout
 * n'est pas un échec »). Dans les deux cas, le silence du fournisseur n'est
 * pas une réponse négative — le toast ne doit donc jamais lire ce tour comme
 * « rien trouvé ».
 */
function searchStillInFlight(result: Pick<EnrichContactResponse, 'enrichment_coordinates'>): boolean {
  const phoneState = result.enrichment_coordinates?.phone?.state
  const emailState = result.enrichment_coordinates?.email?.state
  return phoneState === 'pending' || phoneState === 'unknown' || emailState === 'pending' || emailState === 'unknown'
}

/** #4063 — la coordonnée (téléphone d'abord) qui attend encore sa réponse, limitée à ce qui était demandé. */
function pendingCoordinate(
  result: Pick<EnrichContactResponse, 'enrichment_coordinates'>,
  only: EnrichmentCoordinate | undefined,
): 'phone' | 'email' | null {
  const open = (state: string | undefined) => state === 'pending' || state === 'unknown'
  if (only !== 'email' && open(result.enrichment_coordinates?.phone?.state)) return 'phone'
  if (only !== 'phone' && open(result.enrichment_coordinates?.email?.state)) return 'email'
  return null
}

/**
 * Apollo enrichment of a single contact (email + phone). Charges 1 enrichment
 * credit, but only if Apollo found something useful — see backend
 * `ContactsService.enrichContact`.
 *
 * Side effects on success:
 * - invalidates the contacts list for the account so the new email/phone show
 * - invalidates `['credits']` so the navbar / billing page reflect the debit
 * - shows a sonner toast with credits remaining
 *
 * On 402 (out of credits), shows an upsell toast pointing to /billing.
 */
export function useEnrichContact() {
  const qc = useQueryClient()

  return useMutation<EnrichContactResponse, Error, EnrichInput>({
    mutationKey: ['contacts', 'enrich'],
    // #1077 « je clique sur enrichissement, et rien ne se passe » / #1094 « à
    // voir si vous ne faites pas quelque chose comme ça, pour afficher que ça
    // travaille ».
    //
    // Le clic déclenche un job SERVEUR (202) que le client suit en boucle. La
    // cascade dure de quelques secondes à une minute et demie, et pendant tout
    // ce temps le seul signe de vie était le petit disque du bouton — invisible
    // dès qu'on regarde ailleurs sur la fiche. Une notification persistante dit
    // que ça tourne, remplacée par le résultat quand il tombe (même `id` →
    // sonner substitue au lieu d'empiler).
    //
    // Ce qu'elle NE dit pas : la liste des fournisseurs interrogés. On nomme la
    // capacité, jamais l'éditeur (arbitrage du 02/08), et énumérer une cascade
    // dont certains maillons sont sautés sur budget de temps décrirait une
    // recherche qui n'a pas eu lieu.
    onMutate: ({ contact, silent }) => {
      if (silent) return
      // ⚠️ #1119 — CE toast est permanent par construction, et sonner CONSERVE
      // la durée quand on le remplace par son résultat via le même `id`. Chaque
      // toast qui le remplace, plus bas, REDONNE donc sa durée. Sans ça, le
      // succès reste à l'écran pour toujours — et rien ne le signale.
      toast.loading(i18n.t('contacts:enrich.running', { name: contact.full_name }), {
        id: enrichToastId(contact.id),
        description: i18n.t('contacts:enrich.runningDescription'),
        duration: Number.POSITIVE_INFINITY,
      })
    },
    mutationFn: ({ contact, accountCompanyName, fullNameOverride, force, only, resume }) => {
      if (resume) return pollEnrichment(contact.id)
      // A manual override (resolve-identity dialog) wins as the match key; else
      // fall back to the contact's stored name (may be a role-persona placeholder,
      // which the server then resolves via a role+org People-Search).
      const { first_name, last_name } = splitFullName(fullNameOverride?.trim() || contact.full_name)
      return contactsApi.enrich(contact.id, {
        first_name,
        // Omit rather than send "" for mononyms — an empty last_name is
        // rejected by the contract (min(1)) and would be a literal filter
        // for Apollo. first_name + org is a valid match key on its own.
        ...(last_name ? { last_name } : {}),
        organization_name: contact.entity || accountCompanyName,
        ...(force ? { force: true } : {}),
        ...(only ? { only } : {}),
      })
    },
    // ⚠️ Trouvé en recette de production : sonner FUSIONNE sur l'identifiant
    // (`{...ancien, ...nouveau}`), si bien que la description du bandeau
    // d'attente survivait au résultat — « ça prend de quelques secondes à une
    // minute » restait affiché au-dessus d'un email déjà trouvé, et se lisait
    // « c'est encore en cours ». Chaque notification terminale déclare donc la
    // sienne, `undefined` compris.
    onSuccess: (result, { contact, silent, only }) => {
      // 1) Écrire le résultat DÉJÀ en main directement dans le cache de la fiche,
      // au lieu d'attendre un refetch. C'est ce qui manquait : « email récupéré
      // puis plus rien » = le toast tombait (onSuccess a le résultat) mais l'UI
      // dépendait d'un aller-retour qui, parfois, ne rafraîchissait pas la carte.
      // On superpose UNIQUEMENT les champs que l'enrichissement peut changer
      // (present-only, jamais d'écrasement par `undefined`) pour ne pas perdre les
      // champs calculés côté serveur (score, favori…) que porte la fiche.
      qc.setQueryData<Contact>(contactKeys.detail(contact.id), previous => {
        if (!previous) return previous
        const patch: Partial<Contact> = {}
        if (result.email) patch.email = result.email
        if (result.email_verified) patch.email_verified = result.email_verified
        if (result.phone) patch.phone = result.phone
        if (result.linkedin_url) patch.linkedin_url = result.linkedin_url
        if (result.title) patch.title = result.title
        if (result.photo_url) patch.photo_url = result.photo_url
        if (result.seniority) patch.seniority = result.seniority
        if (result.location) patch.location = result.location
        if (result.source) patch.source = result.source
        // L'identité complétée (rôle-persona → vraie personne) — c'est ce qui
        // fait disparaître le badge « Nom à révéler » et débloque les accroches.
        if (result.full_name?.trim()) patch.full_name = result.full_name
        return { ...previous, ...patch }
      })

      // 2) Réconcilier + rafraîchir TOUT ce que la fiche affiche autour du contact,
      // pas seulement la carte principale. Sans ça : « Cycle de vie » restait figé
      // sur « Détecté », « Email disponible — enrichir pour révéler » ne basculait
      // pas, et la cadence gardait son ancien ton — jusqu'au F5.
      qc.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.lifecycle(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.cadence(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.sendability(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.list })
      // #1473 — un contact à qualifier n'a pas de compte : rien à rafraîchir
      // de ce côté, et surtout pas une clé bâtie sur un identifiant absent.
      for (const key of contactAccountQueryKeys(contact.account_id)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['credits'] })
      // #2120.57 (c) — mesuré en production : le dialogue de confirmation
      // rouvert plusieurs fois entre des enrichissements réussis affichait
      // EXACTEMENT le même texte (le `staleTime` de 5 min de
      // `useEnrichmentDurationEstimate` sert le cache tant que rien ne
      // l'invalide). Un enrichissement qui vient de se terminer est
      // exactement l'événement qui doit faire bouger cette médiane.
      qc.invalidateQueries({ queryKey: ['contacts', 'enrichment-duration-estimate'] })

      if (silent) return
      const toastId = enrichToastId(contact.id)

      // #4063.3 — le toast dit EXACTEMENT ce qui a été demandé ET trouvé : « Téléphone
      // seulement » n'annonce jamais un email que le résultat porte déjà de la fiche.
      const found = [
        only !== 'phone' && result.email && i18n.t('contacts:enrich.email'),
        only !== 'email' && result.phone && i18n.t('contacts:enrich.phone'),
      ]
        .filter(Boolean)
        .join(' + ')
      // The server may have completed the identity (« incomplète » → real name)
      // via the People-Search fallback — surface that so the rep sees why the
      // name changed + the badge disappeared.
      const identityResolved = Boolean(result.full_name?.trim()) && result.full_name.trim() !== contact.full_name.trim()
      if (identityResolved && found) {
        toast.success(
          i18n.t('contacts:enrich.resolvedFoundToast', {
            name: result.full_name,
            found,
          }),
          { id: toastId, description: undefined, duration: TOAST_SUCCESS_MS },
        )
      } else if (identityResolved) {
        toast.success(i18n.t('contacts:enrich.resolvedToast', { name: result.full_name }), {
          id: toastId,
          description: undefined,
          duration: TOAST_SUCCESS_MS,
        })
      } else if (found) {
        toast.success(i18n.t('contacts:enrich.foundToast', { found }), {
          id: toastId,
          description: undefined,
          duration: TOAST_SUCCESS_MS,
        })
      } else if (result.last_enrichment_result === 'ambiguous') {
        // #2120.61 — deux fiches actives du même compte partagent le nom
        // qu'on s'apprêtait à retenir : le serveur n'a RIEN écrit (on ne sait
        // pas laquelle des deux personnes le fournisseur a trouvée). On le dit
        // plutôt que de laisser croire à un « rien trouvé » ordinaire.
        //
        // #2297.18 — un toast qu'on lit et qu'on oublie n'EXIGE rien : le
        // serveur ne renvoie que le FAIT de la collision, jamais l'autre
        // fiche (`homonymFound` ne porte pas son id) — impossible de choisir
        // ici. L'action ouvre donc l'onglet Contacts du compte, filtré sur ce
        // nom : la sélection se fait À L'ÉCRAN, où les deux fiches sont
        // visibles côte à côte, jamais devinée dans ce toast.
        toast.warning(i18n.t('contacts:enrich.ambiguous', { name: contact.full_name }), {
          id: toastId,
          description: i18n.t('contacts:enrich.ambiguousDescription'),
          duration: TOAST_PROBLEM_MS,
          ...(contact.account_id
            ? {
                action: {
                  label: i18n.t('contacts:enrich.ambiguousSelectAction'),
                  onClick: () =>
                    window.location.assign(
                      `/accounts/${contact.account_id}?tab=contacts&q=${encodeURIComponent(contact.full_name)}`,
                    ),
                },
              }
            : {}),
        })
      } else if (result.last_enrichment_result === 'newer_data_exists') {
        // #2120.64 — le fournisseur A renvoyé quelque chose, mais une
        // correction humaine (ou un connecteur) protège la valeur déjà en
        // base : « une correction humaine gagne toujours, quelle que soit sa
        // date ». Rien n'a été écrasé, et ce n'est pas un « rien trouvé ».
        toast.message(i18n.t('contacts:enrich.newerDataExists'), {
          id: toastId,
          description: i18n.t('contacts:enrich.newerDataExistsDescription'),
          duration: TOAST_PROBLEM_MS,
        })
      } else if (result.enrichment?.truncated) {
        // La cascade s'est arrêtée sur son budget de temps : on n'a pas fini de
        // chercher. Dire « aucune personne trouvée » ici serait une conclusion
        // qu'on n'a pas le droit de tirer — et le serveur, pour la même raison,
        // n'a rien journalisé, donc le bouton reste disponible.
        toast.message(i18n.t('contacts:enrich.truncated'), {
          id: toastId,
          description: i18n.t('contacts:enrich.truncatedDescription'),
          duration: TOAST_PROBLEM_MS,
        })
      } else if (searchStillInFlight(result)) {
        // #3850.3 — retour bêta mesuré le 08/10 : le toast concluait « Aucune
        // personne trouvée » puis un numéro apparaissait quelques instants
        // après (révélation Apollo en vol, `enrichment_coordinates.phone.state
        // === 'pending'` — #3782 — ou sonde FullEnrich qui n'a pas conclu,
        // `=== 'unknown'` — #3850.2). Ni l'un ni l'autre n'est un « rien
        // trouvé » : le fournisseur n'a tout simplement pas fini de répondre.
        toast.message(i18n.t('contacts:enrich.searchInProgress'), {
          id: toastId,
          description: i18n.t('contacts:enrich.searchInProgressDescription'),
          duration: TOAST_PROBLEM_MS,
        })
        // #4063 (recette R15) — la conclusion arrive ENSUITE, sans geste : on relit la fiche jusqu'à ce
        // que le serveur conclue (webhook / rattrapage), puis on dit « récupéré » ou « introuvable ».
        const pendingChannel = pendingCoordinate(result, only)
        if (pendingChannel) {
          void followCoordinateConclusion({
            channel: pendingChannel,
            fetchContact: () => contactsApi.getOne(contact.id),
          }).then(conclusion => {
            if (conclusion === 'open') return
            qc.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
            qc.invalidateQueries({ queryKey: contactKeys.list })
            for (const key of contactAccountQueryKeys(contact.account_id)) qc.invalidateQueries({ queryKey: key })
            const label = i18n.t(`contacts:enrich.${pendingChannel}`)
            if (conclusion === 'found') {
              toast.success(i18n.t('contacts:enrich.followFound', { found: label }), {
                id: toastId,
                description: undefined,
                duration: TOAST_SUCCESS_MS,
              })
            } else {
              toast.message(i18n.t('contacts:enrich.followNotFound', { found: label }), {
                id: toastId,
                description: undefined,
                duration: TOAST_PROBLEM_MS,
              })
            }
          })
        }
      } else {
        toast.message(i18n.t('contacts:enrich.notFound'), {
          id: toastId,
          description: i18n.t('contacts:enrich.notFoundDescription'),
          duration: TOAST_PROBLEM_MS,
        })
      }
    },
    onError: (err, { contact, silent }) => {
      if (silent) return
      const toastId = enrichToastId(contact.id)
      if (parseApiStatus(err) === 402) {
        // #4464 — « essai terminé » garde sa phrase (un accès fermé n'est pas un solde) ;
        // un solde épuisé devient le frein doux : aucun chiffre, un contact, jamais « recharger ».
        const trialEnded = err instanceof ApiError && err.code === 'trial_ended'
        if (!trialEnded) {
          softBrakeToast(toastId)
          return
        }
        toast.warning(i18n.t('contacts:enrich.trialEnded'), {
          id: toastId,
          description: i18n.t('contacts:enrich.trialEndedDescription'),
          action: { label: i18n.t('contacts:enrich.seePlans'), onClick: () => window.location.assign('/billing') },
          duration: 8_000,
        })
        return
      }
      toast.error(i18n.t('contacts:enrich.failed', { name: contact.full_name }), {
        id: toastId,
        description: enrichErrorDescription(err),
        duration: TOAST_PROBLEM_MS,
      })
    },
  })
}

/**
 * Turns an enrichment failure into a sentence a seller can act on.
 *
 * Mirrors `sendEmailErrorDescription`: the server tags provider failures with a
 * stable `code` from the shared `DegradeReason` vocabulary, and we localise it
 * here rather than echoing a server sentence.
 *
 * The distinction this exists to protect: « aucune donnée trouvée pour ce
 * contact » and « le fournisseur est indisponible » lead to different actions —
 * fix the name versus wait and retry — and before this, both (plus a rejected
 * credential, plus an exhausted quota) rendered as the same two words: « API
 * error ». Every branch also states that no credit was charged, because the
 * first thing a seller wonders when an action fails is whether it still cost
 * them something.
 */
export function enrichErrorDescription(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined
  switch (code) {
    case 'missing_api_key':
      return i18n.t('contacts:enrich.error.missingApiKey')
    case 'unauthorized':
      return i18n.t('contacts:enrich.error.unauthorized')
    case 'quota_exceeded':
      return i18n.t('contacts:enrich.error.quotaExceeded')
    case 'rate_limited':
      return i18n.t('contacts:enrich.error.rateLimited')
    case 'network_error':
      return i18n.t('contacts:enrich.error.networkError')
    case 'upstream_error':
      return i18n.t('contacts:enrich.error.upstreamError')
    default:
      // No code: either an endpoint that doesn't explain itself yet, or a
      // transport failure. The server message (now always present, and itself
      // localized when it comes from `extractError`) beats a generic line.
      return error instanceof Error && error.message ? error.message : i18n.t('contacts:enrich.error.unknown')
  }
}
