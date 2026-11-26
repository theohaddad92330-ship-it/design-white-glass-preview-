/** #3468 — bornes des appels d'entrée en démo : une roue ne tourne jamais sans fin. */
export const DEMO_REDEEM_TIMEOUT_MS = 90_000
export const DEMO_TOUCH_TIMEOUT_MS = 15_000

/** #3578 — code machine du 503 « la démo se prépare » (`DemoLinkFailure.code`, côté API). */
export const DEMO_PREPARING_CODE = 'demo_preparing'
/** #3578 — on attend une préparation d'arrière-plan. #3747 (recette du 06/10) : elle a dépassé 5 min et l'écran
 *  affichait « Une erreur est survenue » alors que la salle s'ouvrait ensuite. On sonde jusqu'à 15 min — un
 *  garde-fou contre la boucle sans fin, jamais la durée annoncée. */
export const DEMO_PREPARING_MAX_MS = 15 * 60_000

/** Le serveur n'a pas répondu dans la borne : un état NOMMÉ, distinct d'une panne (5xx) ou d'un refus (401/403). */
export class DemoTimeoutError extends Error {
  constructor() {
    super('demo request timed out')
    this.name = 'DemoTimeoutError'
  }
}

/** Convertit l'abandon du signal borné en `DemoTimeoutError` ; toute autre erreur passe telle quelle. */
export async function withDemoDeadline<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await run(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new DemoTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
