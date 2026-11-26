/**
 * #4073 — la fabrication du PDF tourne dans le navigateur : si le moteur ne
 * rend jamais la main, l'attente doit finir par un échec NOMMÉ, pas par un
 * bouton figé. La promesse d'origine n'est pas annulable ; on cesse seulement
 * de l'attendre.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    work.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
