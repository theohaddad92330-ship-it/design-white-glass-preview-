import { HttpStatus, ServiceUnavailableException } from '@nestjs/common'
import { redactSecrets } from './observability-privacy'

/**
 * #2084 — La forme COMMUNE d'un état d'erreur du parcours d'onboarding.
 *
 * Avant ce fichier, un échec de sauvegarde levait un `BadRequestException`
 * brut (400 — comme si c'était la faute du client) qui ne disait ni ce qui
 * s'était passé, ni ce qui avait été conservé, ni si la reprise automatique
 * était sûre. Trente-neuf états d'écran auraient chacun réinventé sa propre
 * phrase : c'est exactement le défaut que ce fichier ferme, à UN seul
 * endroit — les écrans du parcours le CONSOMMENT, ils ne le réécrivent pas.
 *
 * Doctrine tenue ici (CLAUDE.md) :
 *  — « Un timeout n'est PAS un échec » : la seule question qui tranche est
 *    « la requête a-t-elle pu PARTIR ? ». Une connexion jamais établie est
 *    rejouable ; une requête partie sans réponse est `unknown` et ARRÊTE la
 *    reprise automatique. `UND_ERR_CONNECT_TIMEOUT` n'est PAS un timeout au
 *    sens qui compte — see {@link classifyNetworkFailure}.
 *  — « Non mesuré n'est jamais 0 » : `preserved` et `supportUrl` valent un
 *    tableau vide / `null` quand ils n'ont rien à dire, jamais une valeur
 *    inventée.
 *  — « Une erreur ne porte aucune donnée sensible » : {@link redactSecrets}
 *    passe sur `whatHappened` et `notDone` avant que l'état ne quitte cette
 *    fonction.
 */

export type JourneyErrorCode = 'registry_unavailable' | 'save_failed'

export type JourneyErrorState = {
  statusCode: number
  error: string
  /** Le code STABLE que le navigateur peut lire pour brancher son écran. */
  code: JourneyErrorCode
  /** Une phrase lisible pour tout consommateur qui ne lit que `message`
   *  (convention existante de `apps/web/src/lib/api-error.ts`). */
  message: string
  /** #2084.16 — ce qui s'est passé. */
  whatHappened: string
  /** #2084.17 — ce qui a été CONSERVÉ malgré l'échec. Vide, jamais absent. */
  preserved: string[]
  /** #2084.18 — ce qui N'A PAS été fait, précisément. */
  notDone: string
  /** #2084.20 — l'action que la personne peut faire maintenant. */
  nextAction: string
  /** #2084.21 — un lien de support, seulement quand il y en a un à proposer. */
  supportUrl: string | null
  /** #2084.7 — `false` pour un `unknown` (requête partie, pas de réponse) :
   *  une reprise AUTOMATIQUE ne doit pas rejouer cet appel. N'empêche pas un
   *  geste MANUEL de l'utilisateur, qui reste toujours possible. */
  retryable: boolean
}

export type JourneyErrorInput = {
  code: JourneyErrorCode
  whatHappened: string
  preserved?: readonly string[]
  notDone: string
  nextAction: string
  supportUrl?: string | null
  retryable: boolean
}

/** #2084.16-.21/.22 — construit l'état commun. Jamais nu : les quatre champs
 *  de la doctrine sont posés par le TYPE (`JourneyErrorInput`), pas par
 *  convention — un appelant qui en oublie un ne compile pas. */
export function journeyError(input: JourneyErrorInput): JourneyErrorState {
  const whatHappened = redactSecrets(input.whatHappened)
  const notDone = redactSecrets(input.notDone)
  const message = `${whatHappened} ${input.nextAction}`.trim()
  return {
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    error: 'Service Unavailable',
    code: input.code,
    message,
    whatHappened,
    preserved: [...(input.preserved ?? [])],
    notDone,
    nextAction: input.nextAction,
    supportUrl: input.supportUrl ?? null,
    retryable: input.retryable,
  }
}

/** Le raccourci à lever depuis un contrôleur ou un service du parcours. */
export function journeyErrorException(input: JourneyErrorInput): ServiceUnavailableException {
  return new ServiceUnavailableException(journeyError(input))
}

type NetworkFailureClass = 'retryable' | 'unknown'

/**
 * #2084.7 — Les codes qui veulent dire « la connexion n'a JAMAIS pu
 * s'établir » : rien n'est parti, donc rejouer ne double aucun effet.
 *
 * ⚠️ `UND_ERR_CONNECT_TIMEOUT` est ICI et pas dans la classe `unknown` : le
 * nom contient « TIMEOUT » mais désigne l'échec d'une TENTATIVE de connexion
 * — c'est un `ECONNREFUSED` au ralenti, pas une requête sans réponse.
 * `UND_ERR_HEADERS_TIMEOUT` / `UND_ERR_BODY_TIMEOUT`, eux, arrivent une fois
 * la requête ENVOYÉE : ils restent `unknown` par défaut, volontairement.
 */
const CONNECTION_NEVER_ESTABLISHED_CODES: ReadonlySet<string> = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
])

/** Profondeur maximale suivie dans `.cause` — le `fetch` natif enveloppe son
 *  code réseau réel un cran plus bas (`TypeError: fetch failed` → `.cause`). */
const MAX_CAUSE_DEPTH = 4

function readErrorCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
    if (typeof current === 'object' && current !== null && 'code' in current) {
      const raw = (current as { code?: unknown }).code
      if (typeof raw === 'string') return raw
    }
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return null
}

/**
 * #2084.7 — Classe un échec réseau selon la SEULE question qui tranche : la
 * requête a-t-elle pu PARTIR ?
 *
 * Défaut sûr : tout ce qui n'est pas reconnu comme « connexion jamais
 * établie » est `unknown` — on ne SAIT PAS, donc on n'affirme pas que
 * rejouer est sans risque.
 */
export function classifyNetworkFailure(error: unknown): NetworkFailureClass {
  const code = readErrorCode(error)
  return code !== null && CONNECTION_NEVER_ESTABLISHED_CODES.has(code) ? 'retryable' : 'unknown'
}

/* ---------------------------------------------------------------------- */
/*  #2084.37 — aucune erreur ne porte un secret, un IBAN, un identifiant   */
/*  d'infrastructure.                                                     */
/*                                                                        */
/*  #2442.7 — les motifs eux-mêmes vivent dans `observability-privacy.ts`  */
/*  et plus ici : la console, Sentry et les erreurs du parcours lisent     */
/*  désormais la MÊME liste (GA-26 — un réglage vit à un seul endroit).    */
/*  Tant qu'elle vivait ici, une erreur d'onboarding était caviardée et    */
/*  la même chaîne journalisée par un service ne l'était pas.              */
/* ---------------------------------------------------------------------- */
