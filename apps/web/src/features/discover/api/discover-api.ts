import { apiFetch } from '@/lib/api'
import type {
  ContactListResponse,
  DiscoverCallListRequest,
  DiscoverCallListResponse,
  DiscoverCandidateFeedbackResponse,
  DiscoverCandidateNote,
  DiscoverCandidateNotesResponse,
} from '@bellum/contracts'
import { normalizeDiscoverResponse } from '@/features/discover/lib/discover-normalize'
import type { DiscoverPeopleSearchCriteria } from '@/features/discover/lib/discover-contact-rows'
import type {
  DiscoverRegistryQuery,
  DiscoverResponse,
  DiscoverSignalsQuery,
} from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  Couche de données Découvrir — volontairement mince.                 */
/*                                                                     */
/*  Les endpoints `/ia/discover/registry` et `/ia/discover/signals`     */
/*  sont construits en parallèle (lot API). Tout ce qui dépend de leur  */
/*  forme de transport est confiné ICI : les composants ne connaissent  */
/*  que `DiscoverResponse`. Remplacer le transport = toucher ce fichier.*/
/* ------------------------------------------------------------------ */

/**
 * Le reste de l'API NestJS répond tantôt à plat, tantôt enveloppé dans
 * `{ success, data }` (cf. `/ia/discover` v1). On accepte les deux plutôt que
 * de parier sur l'un — un mauvais pari donnerait un écran vide silencieux.
 */
function unwrapEnvelope(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    if (!('candidates' in record) && record.data && typeof record.data === 'object') return record.data
  }
  return payload
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<DiscoverResponse> {
  const raw = await apiFetch<unknown>({ path, method: 'POST', body, signal })
  return normalizeDiscoverResponse(unwrapEnvelope(raw))
}

export const discoverApi = {
  /**
   * #4419.8 — « Choisir l'entreprise » : le commercial tranche une homonymie pour SON espace (le choix gagne sur le
   * calcul). Écriture réservée aux membres qui peuvent ajouter un compte ; l'espace est celui de la session.
   */
  chooseEmployer(body: { employerName: string; siren: string; legalName?: string | null }): Promise<{ chosen: true }> {
    return apiFetch<{ chosen: true }>({ path: '/discover/employer-choice', method: 'PUT', body })
  },

  /** Liste depuis le REGISTRE : NAF × département × effectif × ancienneté. */
  registry(query: DiscoverRegistryQuery, signal?: AbortSignal): Promise<DiscoverResponse> {
    return post('/ia/discover/registry', query, signal)
  },

  /** Liste depuis le SIGNAL : AO ouverts (BOAMP), marchés attribués (DECP),
   *  recrutements (France Travail). */
  signals(query: DiscoverSignalsQuery, signal?: AbortSignal): Promise<DiscoverResponse> {
    return post('/ia/discover/signals', query, signal)
  },

  /**
   * #2165.7 — les PERSONNES que l'espace connaît déjà.
   *
   * Aucune route nouvelle : c'est `GET /contacts`, la liste que l'écran
   * Contacts lit déjà, relue avec les yeux de Découvrir. Lecture seule, aucun
   * crédit, aucune collecte — une recherche de personnes hors de l'espace
   * supposerait une source que la doctrine refuse.
   *
   * ⚠️ `URLSearchParams` et non une concaténation : un `&` non encodé dans un
   * terme de recherche COUPE la requête, et la coupure ressemble à une absence
   * de résultat.
   */
  people(
    params: { q?: string; limit: number; criteria?: DiscoverPeopleSearchCriteria },
    signal?: AbortSignal,
  ): Promise<ContactListResponse> {
    const search = new URLSearchParams()
    const q = params.q?.trim()
    if (q) search.set('q', q)
    search.set('limit', String(params.limit))
    // #4634 — les critères du volet CHERCHENT : ils partent dans la requête (`contactListQuerySchema`).
    for (const [key, value] of Object.entries(params.criteria ?? {})) if (value) search.set(key, value)
    return apiFetch<ContactListResponse>({ path: `/contacts?${search.toString()}`, method: 'GET', signal })
  },

  /**
   * #2545 / #3819 — la SOURCE UNIQUE des personnes et signaux connus pour les
   * entreprises d'une recherche : dix contacts classés par compte de l'espace,
   * coordonnées en clair, et signaux historisés. Lecture seule, aucun crédit.
   */
  callList(request: DiscoverCallListRequest, signal?: AbortSignal): Promise<DiscoverCallListResponse> {
    return apiFetch<DiscoverCallListResponse>({ path: '/contacts/call-list', method: 'POST', body: request, signal })
  },

  /**
   * #2151.59 — les notes de terrain LIBRES d'un candidat, avant qu'il ne
   * devienne un compte. Le backend (`DiscoverCandidateNotesService`) porte
   * déjà la reprise à la conversion — ces deux appels n'en savent rien, ils
   * lisent et écrivent sur le SIREN comme si c'était la clé stable qu'elle
   * est.
   */
  notes: {
    list(siren: string, signal?: AbortSignal): Promise<DiscoverCandidateNotesResponse> {
      return apiFetch<DiscoverCandidateNotesResponse>({
        path: `/discover/candidates/${encodeURIComponent(siren)}/notes`,
        method: 'GET',
        signal,
      })
    },
    create(siren: string, body: string, signal?: AbortSignal): Promise<DiscoverCandidateNote> {
      return apiFetch<DiscoverCandidateNote>({
        path: `/discover/candidates/${encodeURIComponent(siren)}/notes`,
        method: 'POST',
        body: { body },
        signal,
      })
    },
  },

  /**
   * #3671.2bis — « Mauvaise entreprise » : le signal affiché sur la carte
   * n'appartient pas à ce SIREN. Enregistré côté serveur, par espace — le
   * candidat ne sera plus rattaché aux recherches suivantes
   * (`withoutWrongCompanyCandidates`, `ia-proxy.controller.ts`).
   */
  feedback: {
    reportWrongCompany(siren: string, signal?: AbortSignal): Promise<DiscoverCandidateFeedbackResponse> {
      return apiFetch<DiscoverCandidateFeedbackResponse>({
        path: `/discover/candidates/${encodeURIComponent(siren)}/feedback`,
        method: 'POST',
        body: { verdict: 'wrong_company' },
        signal,
      })
    },
  },
}

/** Exporté pour le test de transport — non consommé par l'UI. */
export const __testing = { unwrapEnvelope }
