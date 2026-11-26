/**
 * Un `Promise.all` BORNÉ.
 *
 * Pourquoi ce fichier existe : `Promise.all(ids.map(fetchOne))` lance TOUT en
 * même temps. Sur soixante identifiants de messages, cela fait soixante requêtes
 * simultanées vers le même compte utilisateur — et Gmail répond alors
 * « Too many concurrent requests for user », ce qui fait tomber l'appel entier,
 * y compris les messages qu'il aurait pu rendre. Le défaut ne se voit pas en
 * test (les doublures répondent instantanément) et ne se voit pas non plus sur
 * une petite boîte : il apparaît en production, sur la boîte de quelqu'un qui a
 * du courrier.
 *
 * La borne est un CHOIX de politesse envers le fournisseur, pas une optimisation
 * de vitesse : cinq requêtes en vol suffisent à saturer la latence réseau, et
 * au-delà on ne gagne rien qu'un risque de 429.
 *
 * L'ORDRE des résultats suit celui des entrées, comme `Promise.all` — un
 * appelant qui dédoublonne « le plus récent par fil » dépend de cet ordre.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.trunc(limit))
  const results = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      // `items[index]` est défini : `index` est borné par `items.length`.
      results[index] = await fn(items[index] as T, index)
    }
  }

  // Jamais plus d'ouvriers que d'articles : lancer cinq ouvriers pour deux
  // éléments crée trois promesses qui ne font que constater la fin.
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()))
  return results
}

/**
 * Les refus de DÉBIT, ceux qu'il vaut la peine de retenter.
 *
 * On reconnaît le message plutôt que le code : Gmail rend « Too many concurrent
 * requests for user » sous un 403 et non un 429, et un appelant qui n'attendrait
 * que le 429 laisserait passer exactement le cas qui nous occupe. Les autres
 * erreurs — jeton périmé, portée manquante, message introuvable — ne sont PAS
 * retentées : les rejouer ne changerait rien et retarderait l'échec honnête.
 */
export function isThrottleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /too many concurrent|rate ?limit|rateLimitExceeded|userRateLimitExceeded|\b429\b|quota ?exceeded/i.test(
    message,
  )
}

/**
 * Comme {@link mapWithConcurrency}, mais un article qui échoue vaut `null` au
 * lieu de faire tomber les autres.
 *
 * Constaté en production le 17/08 : la routine « relances sans réponse » a rendu
 * « Échec : Gmail get message failed: Too many concurrent requests for user »,
 * alors que la borne de simultanéité était déjà en place. Elle avait suffi à
 * rendre le refus RARE, pas impossible — et il restait fatal : un seul message
 * illisible sur soixante rejetait le `Promise.all`, donc la recherche entière,
 * donc la routine du matin. Le commercial lisait « échec » là où
 * cinquante-neuf fils étaient parfaitement lisibles.
 *
 * `null` plutôt qu'une valeur de remplissage : l'appelant DOIT décider quoi
 * faire du trou, et l'ordre des indices est conservé pour que les appelants qui
 * dédoublonnent « le plus récent par fil » continuent de fonctionner.
 */
export async function mapWithConcurrencySettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onError?: (error: unknown, item: T, index: number) => void,
): Promise<Array<R | null>> {
  return mapWithConcurrency<T, R | null>(items, limit, async (item, index) => {
    try {
      return await fn(item, index)
    } catch (error) {
      onError?.(error, item, index)
      return null
    }
  })
}

/**
 * Retente une opération quand — et seulement quand — le fournisseur a refusé
 * pour cause de débit.
 *
 * L'attente double à chaque essai. Elle est passée en paramètre pour que le test
 * n'ait pas à dormir : une temporisation lue dans l'horloge ne se teste pas, et
 * c'est précisément celle qu'on veut vérifier.
 */
export async function retryOnThrottle<R>(
  fn: () => Promise<R>,
  options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<R> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const baseDelayMs = options.baseDelayMs ?? 250
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      // Dernier essai, ou refus qui ne vient pas du débit : on rend la main tout
      // de suite. Retenter un jeton périmé trois fois ne fait que tripler le
      // temps que l'utilisateur attend avant de lire « reconnecte-toi ».
      if (attempt === attempts - 1 || !isThrottleError(error)) throw error
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
  throw lastError
}
