// L'état de la console au moment du signalement.
//
// Porté de l'application cliente (`apps/web/src/features/feedback/appContext.ts`),
// avec les deux différences que le back-office impose :
//
//  1. la VERSION vient de Vercel (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`) et non
//     d'une estampille de build Vite ;
//  2. le THÈME se lit sur l'attribut `data-theme` de `<html>`, que le script
//     inline du layout pose avant le premier rendu — et non sur une classe.
//
// Le champ qui porte tout le reste reste le même : sans le SHA du commit,
// « ligne 86 de tel fichier » désigne la ligne 86 d'AUJOURD'HUI, pas celle que
// la personne avait sous les yeux.

/**
 * ⚠️ NON exporté, contrairement à l'app cliente.
 *
 * Le widget du back-office envoie ces objets tels quels, sans jamais nommer
 * leur type — la forme qui TRANCHE vit au contrat de l'API. Un type exporté
 * que personne n'importe est ce que `pnpm lint:exports:types` refuse, et il
 * ferait une seconde déclaration à côté de celle qui décide.
 */
type AppContext = {
  buildVersion: string
  environment: string
  /** Chemin de la route, sans la query (qui peut porter des jetons). */
  route: string
  theme: 'dark' | 'light'
  language: string
  /** Fuseau du navigateur — un bug de date sur trois vient de là. */
  timeZone: string
  /** Le navigateur se croyait-il en ligne ? Distingue « API en panne » de « métro ». */
  online: boolean
  viewport: string
}

export function captureAppContext(): AppContext {
  return {
    buildVersion: buildVersion(),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    route: window.location.pathname,
    // Ce qui est RÉELLEMENT rendu, pas la préférence enregistrée : un rapport
    // sur un écran illisible doit dire ce que la personne voyait. Le layout
    // stampe `data-theme` avant le premier rendu, et le défaut historique est
    // le sombre.
    theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    language: document.documentElement.lang || navigator.language || 'unknown',
    timeZone: resolveTimeZone(),
    online: navigator.onLine,
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
  }
}

/**
 * `back-office+<sha10>`, ou `back-office+dev` quand la variable n'est pas posée.
 *
 * ⚠️ Le préfixe n'est pas décoratif : l'API relit le code AU COMMIT pour en
 * extraire l'extrait, et les deux applications ne vivent pas dans les mêmes
 * dossiers. Dire d'où vient la version évite de chercher un composant du
 * back-office dans `apps/web`.
 */
function buildVersion(): string {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  return sha ? `back-office+${sha.slice(0, 10)}` : 'back-office+dev'
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  } catch {
    return 'unknown'
  }
}
