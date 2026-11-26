/**
 * Récupération après un redéploiement pendant qu'un onglet est ouvert.
 *
 * L'app est découpée en chunks hashés (`autoCodeSplitting`), et l'hébergeur ne
 * sert QUE les assets du dernier build. Un onglet resté ouvert pendant un
 * déploiement garde donc un `index.html` qui référence des fichiers disparus :
 * la première navigation vers un écran pas encore chargé demande un chunk en
 * 404, l'import dynamique rejette, et l'utilisateur reçoit l'écran « Oups »
 * alors que RIEN n'est cassé — sa page est simplement périmée.
 *
 * Le remède est le rechargement : il va chercher le nouvel `index.html` et donc
 * les nouveaux chunks. On l'automatise, avec un garde-fou temporel pour qu'un
 * chunk réellement introuvable (asset corrompu, CDN en panne) ne transforme pas
 * la page en boucle de rechargement.
 */

import { runOrDeferWhileCriticalOperation } from '@/lib/critical-operation-guard'

/** Marqueur (horodatage ms) du dernier rechargement déclenché ici. */
export const STALE_BUILD_RELOAD_KEY = 'bellum:stale-build-reloaded-at'

/**
 * Deux rechargements ne peuvent pas s'enchaîner en moins de ça. Assez long pour
 * qu'une page cassée s'arrête après UN essai, assez court pour que le déploiement
 * suivant (des heures plus tard, ou dix minutes ici) soit à nouveau rattrapé.
 */
const RELOAD_COOLDOWN_MS = 60_000

/**
 * Les formulations d'un import de module en échec, par moteur — le message est
 * la seule chose que le navigateur nous donne (pas de code d'erreur typé).
 */
const STALE_BUILD_PATTERNS: RegExp[] = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // helper de préchargement Vite
  /loading chunk \S+ failed/i, // formulation historique (bundles tiers)
  /module script but the server responded with a mime type/i, // fallback SPA → index.html
]

/** Le message d'une valeur lancée, quelle que soit sa forme (on attrape aussi
 *  bien un `Error` qu'une valeur nue remontée d'un import). */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return ''
}

/** Cette erreur dit-elle « ton build est périmé » plutôt que « le code a un bug » ? */
export function isStaleBuildError(error: unknown): boolean {
  const message = messageOf(error)
  if (!message) return false
  return STALE_BUILD_PATTERNS.some(pattern => pattern.test(message))
}

/** Lecture/écriture du marqueur — un `sessionStorage` indisponible (mode privé
 *  verrouillé, iframe cloisonnée) ne doit jamais empêcher le rechargement. */
function lastReloadAt(): number | null {
  try {
    const raw = sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function rememberReload(at: number): void {
  try {
    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, String(at))
  } catch {
    /* pas de mémoire → au pire un rechargement de plus, jamais une boucle
       infinie : la page rechargée repart d'un index.html neuf. */
  }
}

/**
 * Recharge l'app pour récupérer le build courant. Renvoie `true` si le
 * rechargement a été déclenché, `false` s'il vient d'avoir lieu (auquel cas
 * l'appelant doit montrer un écran, pas retenter).
 *
 * #3822.5 — ne recharge jamais PENDANT un lot payant en vol (enrichissement de
 * masse, …) : `runOrDeferWhileCriticalOperation` rejoue le rechargement dès
 * que le dernier lot se termine, plutôt que de l'interrompre en silence.
 */
export function recoverFromStaleBuild(): boolean {
  const previous = lastReloadAt()
  const now = Date.now()
  if (previous !== null && now - previous < RELOAD_COOLDOWN_MS) return false

  rememberReload(now)
  runOrDeferWhileCriticalOperation(() => window.location.reload())
  return true
}

let installed = false

/**
 * Branche la récupération sur l'événement que Vite émet quand le préchargement
 * d'un module échoue — c'est le signal le plus précoce, avant même que le
 * routeur ne fasse remonter l'erreur jusqu'à la frontière d'erreur.
 *
 * #4009.2 — JAMAIS `preventDefault()`. Vite ne relance l'erreur que si personne n'a empêché le
 * comportement par défaut ; sinon son assistant de préchargement résout l'`import()` avec `undefined`, et
 * le routeur lit `undefined.component` (« Cannot read properties of undefined (reading 'component') »,
 * recette prod 11/10, 1er chargement à froid de `/accounts/<id>?tab=veille`). L'erreur d'import d'origine
 * remonte donc à la frontière d'erreur, qui la reconnaît (`isStaleBuildError`) et montre l'écran « version
 * périmée » ; le rechargement part en parallèle. Renvoie un teardown ; un second appel est un no-op (aucun écouteur empilé).
 */
export function installStaleBuildRecovery(): () => void {
  if (typeof window === 'undefined' || installed) return () => {}
  installed = true

  const onPreloadError = () => {
    recoverFromStaleBuild()
  }
  window.addEventListener('vite:preloadError', onPreloadError)

  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError)
    installed = false
  }
}
