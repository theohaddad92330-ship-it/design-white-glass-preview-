import { i18n } from '@/i18n'
import { useAnalysisStore, type StepKey } from '@/stores/analysisStore'

/**
 * Le déroulé scripté d'une analyse de démonstration.
 *
 * Chaque entrée : l'étape de la checklist, le pourcentage atteint, et l'instant
 * (ms depuis le lancement) où elle tombe. Les durées sont calées sur ce qu'un
 * vrai run met à franchir ces phases — assez lent pour qu'on voie le produit
 * travailler, assez court pour tenir dans une démo commerciale.
 */
const SCRIPT: ReadonlyArray<{ at: number; step: StepKey; percent: number; done?: boolean }> = [
  { at: 900, step: 'scope', percent: 8 },
  { at: 4_200, step: 'scope', percent: 18, done: true },
  { at: 5_000, step: 'crosscheck', percent: 24 },
  { at: 9_500, step: 'crosscheck', percent: 34, done: true },
  { at: 10_200, step: 'account_sheet', percent: 40 },
  { at: 15_000, step: 'account_sheet', percent: 52, done: true },
  { at: 15_800, step: 'decision_makers', percent: 58 },
  { at: 21_000, step: 'decision_makers', percent: 68, done: true },
  { at: 21_800, step: 'orga_chain', percent: 74 },
  { at: 26_000, step: 'orga_chain', percent: 82, done: true },
  { at: 26_800, step: 'classification', percent: 87 },
  { at: 30_000, step: 'classification', percent: 92, done: true },
  { at: 30_800, step: 'messages', percent: 96 },
  { at: 34_000, step: 'messages', percent: 100, done: true },
]

/** Durée totale du déroulé (dernière étape + le temps de la lire). */
export const DEMO_RUN_DURATION_MS = SCRIPT[SCRIPT.length - 1]!.at + 600

/**
 * Joue une analyse de démonstration : la MÊME carte de progression qu'un vrai
 * run, alimentée par un script au lieu du flux Socket.IO.
 *
 * Pourquoi : en espace démo, rien n'est lancé côté serveur (aucun appel IA,
 * aucune dépense d'API, aucun crédit) — l'API renvoie directement le dossier
 * d'exemple à ouvrir. Sans ce déroulé, le clic « Analyser » afficherait le
 * dossier instantanément, ce qui ne montre RIEN du produit : le prospect ne
 * verrait ni les étapes, ni ce que Bellum va chercher.
 *
 * Ce qui est simulé, c'est le TEMPS — pas le contenu. Le dossier ouvert à la
 * fin est un dossier réellement persisté (fictif, et étiqueté comme tel), pas
 * une fabrication à la volée.
 *
 * La complétion passe par l'état `completed` du store, exactement comme un vrai
 * run : c'est l'effet existant de `useAnalysis` qui navigue, donc le chemin de
 * sortie est le même dans les deux cas.
 *
 * Renvoie une fonction d'annulation : sans elle, quitter l'écran laisserait des
 * timers marquer « terminé » un run abandonné.
 */
export function playDemoAnalysis(accountId: string, jobId: string, companyName: string): () => void {
  useAnalysisStore.getState().start(accountId, jobId, companyName)

  const t = i18n.getFixedT(null, 'analysis')
  const timers: ReturnType<typeof setTimeout>[] = []

  for (const entry of SCRIPT) {
    timers.push(
      setTimeout(() => {
        const store = useAnalysisStore.getState()
        store.setProgress(accountId, { percent: entry.percent })
        if (entry.done) store.markStepCompleted(accountId, entry.step)
        else store.setCurrentStep(accountId, entry.step)
        store.addEvent(accountId, {
          at: Date.now(),
          label: t(`previews.${entry.step}.title`, { defaultValue: entry.step }),
          percent: entry.percent,
          status: entry.done ? 'done' : 'running',
          key: `demo:${entry.step}:${entry.done ? 'done' : 'running'}`,
        })
      }, entry.at),
    )
  }

  timers.push(setTimeout(() => useAnalysisStore.getState().setComplete(accountId), DEMO_RUN_DURATION_MS))

  return () => {
    for (const timer of timers) clearTimeout(timer)
  }
}
