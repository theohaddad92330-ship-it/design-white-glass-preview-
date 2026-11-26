// L'état de l'application au moment du signalement.
//
// Le champ qui porte tout le reste est `buildVersion` : il contient le SHA du
// commit déployé (`YY.MM.DD-tsUNIX+gitSHA10`). Sans lui, « ligne 86 de
// CustomerPageContent.tsx » désigne la ligne 86 d'AUJOURD'HUI, pas celle que la
// personne avait sous les yeux — et après trois merges, ce n'est plus le même
// code. Avec lui, l'API va relire le fichier À CE COMMIT.

export type AppContext = {
  /** Version du build web (contient le SHA git quand le déploiement l'a posée). */
  buildVersion: string
  /** `prod`, `preview`, `dev`… tel que déclaré au build. */
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
    buildVersion: typeof __CODE_VERSION_ID__ === 'string' && __CODE_VERSION_ID__ ? __CODE_VERSION_ID__ : 'dev',
    environment: import.meta.env.VITE_ENV || import.meta.env.MODE || 'unknown',
    route: window.location.pathname,
    // Le thème est appliqué par une classe sur <html> (theme-provider) : on lit
    // ce qui est RÉELLEMENT rendu, pas la préférence enregistrée — un rapport
    // sur un écran illisible doit dire ce que la personne voyait.
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    language: document.documentElement.lang || navigator.language || 'unknown',
    timeZone: resolveTimeZone(),
    online: navigator.onLine,
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
  }
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  } catch {
    return 'unknown'
  }
}
