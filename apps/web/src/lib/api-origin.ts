/**
 * Le repli d'origine — quand la passerelle du client bloque le domaine de l'API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, MESURÉ EN PRODUCTION LE 25/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Les passerelles de sécurité d'entreprise (Cato, Zscaler, Netskope…) classent
 * tout domaine récent en `Uncategorized` et l'avertissent ou le bloquent. Elles
 * fonctionnent souvent en mode AVERTISSEMENT, avec un bouton « PROCEED » :
 *
 *   - une PAGE s'ouvre — l'utilisateur clique, et le front se charge ;
 *   - un `fetch()` **n'a personne pour cliquer**, et il est refusé en silence.
 *
 * L'utilisateur voit alors « Failed to fetch » sur la page de connexion, avec
 * des identifiants parfaitement valides. Vérifié le 25/08 : le compte existe,
 * le mot de passe est bon, le même compte se connecte depuis un autre réseau.
 * Le serveur, lui, n'a jamais reçu la requête — les logs sont vides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPLI, ET POURQUOI IL EST SÛR
 * ─────────────────────────────────────────────────────────────────────────────
 * `app.bellum-ai.com/api/*` est réécrit vers l'API par Vercel. Ce chemin est
 * SUR L'ORIGINE DE L'APPLICATION : si la page s'affiche, il passe. Il n'y a
 * alors plus qu'un domaine à faire autoriser, et c'est celui que l'utilisateur
 * voit dans sa barre d'adresse.
 *
 * Trois propriétés, chacune pour un accident précis :
 *
 * 1. **Le repli ne s'arme que sur un ÉCHEC RÉSEAU.** Personne ne bascule sans
 *    avoir été bloqué : les utilisateurs sans passerelle gardent l'appel direct,
 *    et donc leurs WebSockets — que les réécritures Vercel ne proxifient pas.
 *    Basculer tout le monde ferait perdre le temps réel à ceux qui vont bien.
 *
 * 2. **Seules les requêtes SÛRES déclenchent la détection.** Un `fetch` qui
 *    échoue ne dit PAS si la requête est partie ; rejouer un POST pourrait donc
 *    envoyer deux fois. C'est la règle du dépôt sur `unknown` — « la requête
 *    a-t-elle pu PARTIR ? » — appliquée au navigateur. La détection se fait sur
 *    un GET ; les écritures profitent ensuite de la bascule sans jamais être
 *    rejouées.
 *
 * 3. **La bascule dure la SESSION.** Une fois établie, plus aucun appel ne paie
 *    le double aller-retour. `sessionStorage` et non `localStorage` : un
 *    utilisateur nomade qui rentre chez lui repart sur le chemin direct.
 */

const FALLBACK_PATH = '/api'
const STORAGE_KEY = 'bellum.api.fallback'

const DIRECT_ORIGIN: string = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/** Le stockage peut lever (navigation privée stricte, site data bloqué). */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let armed = readFlag()

/** L'origine à utiliser pour le prochain appel. */
export function apiBase(): string {
  return armed ? FALLBACK_PATH : DIRECT_ORIGIN
}

/** Le repli est-il déjà armé ? Exporté pour les tests et le bandeau de debug. */
export function isFallbackArmed(): boolean {
  return armed
}

/**
 * Une URL ABSOLUE vers l'API, quel que soit l'état du repli.
 *
 * ⚠️ `new URL(path, apiBase())` NE MARCHE PAS : une base relative (`/api`) fait
 * lever `new URL`. C'est le même piège que `new URL(VITE_API_URL)` dans le
 * rebond OAuth — une valeur relative casse tout code qui la traite en origine.
 *
 * Ici on résout contre l'origine du document, ce qui couvre les deux cas :
 * une base absolue l'emporte sur la base fournie, une base relative s'y colle.
 *
 * À utiliser partout où l'on a besoin d'une URL à poser dans un attribut
 * (`<img src>`, un lien de téléchargement) plutôt que d'un appel `fetch`.
 */
export function apiUrl(path: string): URL {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return new URL(`${apiBase()}${path}`, base)
}

/**
 * Arme le repli pour toute la session.
 *
 * Idempotent : le second appel ne fait rien, ce qui rend sûr de l'appeler depuis
 * plusieurs requêtes concurrentes qui échouent en même temps.
 */
export function armFallback(): void {
  if (armed) return
  armed = true
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Le repli tient quand même pour la durée de vie de l'onglet : la variable
    // en mémoire suffit. Perdre la persistance ne doit pas perdre la bascule.
  }
}

/** Uniquement pour les tests — remet l'état d'origine. */
export function resetFallbackForTests(): void {
  armed = false
  probe = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* rien à faire */
  }
}

let probe: Promise<void> | null = null

/**
 * La sonde de démarrage — sans elle, le repli ne s'armerait jamais à temps.
 *
 * ⚠️ C'est le détail qui décide si tout ce mécanisme sert à quelque chose.
 *
 * Le repli ne s'arme que sur un échec de méthode SÛRE, or l'écran de connexion
 * ne fait qu'un POST. Et le premier GET de l'application, `/auth/session`, n'est
 * tiré que si le cookie sentinelle existe — c'est-à-dire seulement pour
 * quelqu'un qui a DÉJÀ réussi à se connecter une fois. Un nouvel utilisateur
 * derrière une passerelle n'émettrait donc jamais la requête qui révèle le
 * blocage : il resterait sur « Failed to fetch », exactement comme avant.
 *
 * Cette sonde touche `/version` — public, trivial, sans authentification. Elle
 * ne s'exécute qu'UNE fois, et pas du tout si le repli est déjà armé : le coût
 * pour les utilisateurs qui vont bien est un appel de quelques octets au
 * démarrage, une seule fois par session.
 *
 * Elle ne rejette JAMAIS. Une sonde qui ferait tomber le démarrage de
 * l'application serait pire que le problème qu'elle détecte.
 */
export function ensureApiReachable(): Promise<void> {
  if (armed) return Promise.resolve()
  if (probe) return probe
  probe = (async () => {
    try {
      await fetch(`${DIRECT_ORIGIN}/version`, { method: 'GET', credentials: 'omit' })
    } catch (error) {
      if (!isNetworkFailure(error)) return
      try {
        const res = await fetch(`${FALLBACK_PATH}/version`, { method: 'GET', credentials: 'omit' })
        // Une réécriture absente rendrait le HTML de l'application avec un 200 :
        // on n'arme que si la réponse est bien celle de l'API.
        if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) armFallback()
      } catch {
        // Les deux chemins sont morts : ce n'est pas un problème d'origine, et
        // armer le repli ne ferait qu'ajouter un aller-retour à chaque appel.
      }
    }
  })()
  return probe
}

/**
 * Cette erreur est-elle un échec de TRANSPORT — et non une réponse du serveur ?
 *
 * `fetch` ne rejette que si la requête n'a pas abouti : DNS, TLS, connexion
 * refusée, requête bloquée par une extension ou une passerelle. Un 4xx ou un
 * 5xx RÉSOUT la promesse — donc tout ce qui arrive ici n'a jamais été servi.
 *
 * ⚠️ Un `AbortError` est EXCLU : il vient de nous (un composant démonté, une
 * recherche annulée). Le traiter comme un blocage armerait le repli sur le
 * fonctionnement normal de l'application.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
    return false
  }
  if (error instanceof Error && error.name === 'AbortError') return false
  return error instanceof TypeError
}

/** Une méthode qu'on peut rejouer sans risque d'écrire deux fois. */
export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}
