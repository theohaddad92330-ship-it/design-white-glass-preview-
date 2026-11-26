/**
 * #5212 — la première recherche Découvrir dépasse 40-60 s : chaque lecture de source qui précède le moteur
 * journalise SA durée (une ligne par source, nom + millisecondes + issue), jamais une donnée personnelle
 * (ni identifiant, ni critère, ni résultat). Le résultat — ou l'erreur — de la lecture passe tel quel.
 */
export type DiscoverSourceLog = (line: string) => void

export async function timedDiscoverSource<T>(
  source: string,
  read: () => Promise<T>,
  log: DiscoverSourceLog,
  now: () => number = Date.now,
): Promise<T> {
  const started = now()
  try {
    const value = await read()
    log(`discover source=${source} ms=${now() - started} ok`)
    return value
  } catch (error) {
    log(`discover source=${source} ms=${now() - started} failed`)
    throw error
  }
}
