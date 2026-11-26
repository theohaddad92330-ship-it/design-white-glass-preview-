import type { Request, Response } from 'express'

/**
 * #4490.2 — le navigateur qui coupe sa requête (« Arrêter ») coupe aussi l'appel au moteur : sans cela le service IA
 * allait au bout, et ses sources payantes avec. Une fermeture APRÈS l'envoi de la réponse n'est pas un arrêt.
 * `release` détache l'écouteur dès que l'appel est fini.
 */
export function abortOnClientClose(
  req: Pick<Request, 'once' | 'off'>,
  res: Pick<Response, 'writableEnded'>,
): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController()
  const onClose = (): void => {
    if (!res.writableEnded) controller.abort()
  }
  req.once('close', onClose)
  return { signal: controller.signal, release: () => req.off('close', onClose) }
}
