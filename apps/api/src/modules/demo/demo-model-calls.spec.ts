import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Aucun appel modèle depuis la salle de démonstration.
 *
 * Le bandeau de l'espace de démonstration promet « données fictives, aucun
 * crédit consommé, les analyses réelles sont désactivées ». Trois écrans le
 * démentaient en production le 03/08 — Découvrir interrogeait le registre RÉEL
 * et rendait de vrais SIREN, les appels d'offres faisaient une analyse Claude
 * complète sur le texte collé, et deux gestes débitaient un crédit.
 *
 * Le lien de démonstration est PUBLIC (`DEMO_PUBLIC`). Ce qui le rend tenable
 * n'est pas le secret mais ce qu'il y a au bout : rien qui parte vers un modèle,
 * un registre ou un fournisseur. Cette garde le vérifie mécaniquement plutôt que
 * de compter sur la relecture — c'est exactement la forme de `demo-coverage`,
 * pour la même raison : la prochaine fonctionnalité rebranchera le trou sans
 * qu'on s'en aperçoive.
 *
 * La règle : **tout service qui appelle `this.ia.*` doit savoir dire non en
 * démonstration** — en scriptant sa réponse ou en refusant. Un module qui ne le
 * fait pas doit figurer ci-dessous avec sa raison ÉCRITE.
 *
 * ⚠️ Déplacer une entrée ici pour faire passer le test est exactement ce que la
 * règle de parité démo interdit. La raison doit tenir devant un prospect.
 */

const MODULES_DIR = join(__dirname, '..')

/** Modules qui appellent l'IA sans garde démo — et pourquoi c'est acceptable. */
const EXEMPTED: Record<string, string> = {
  'mcp-api':
    'Serveur MCP : joignable seulement avec un jeton OAuth émis pour un vrai espace. Une salle de démonstration n’a pas de client MCP enregistré.',
  'internal-knowledge':
    'Synchro du Drive interne lancée par une tâche planifiée opérateur, jamais par une requête utilisateur : aucune session de démonstration ne peut l’atteindre. Elle appelle l’extraction de texte, le calcul d’embeddings et, quand le Drive a changé, UNE génération du digest interne (#3586 W2) — payée par l’éditeur, jamais débitée à un espace.',
  health: 'Sonde de disponibilité : elle vérifie que le service IA répond, sans rien lui faire produire.',
  supervision:
    'Tableau de supervision du back-office (dashboard-manager, derrière le secret interne) : il LIT le `/version` du service IA pour dire s’il répond et quel commit il sert — même geste que `health`, aucun modèle appelé, aucun crédit. Aucune salle de démonstration n’y a accès.',
  'tool-registry':
    'Lit l’état des intégrations (quelles clés sont posées). Aucun modèle, aucun fournisseur contacté, aucun coût.',
  'esn-profile':
    'Pré-remplissage du profil ESN, atteint pendant l’onboarding uniquement. Les salles de démonstration sont créées déjà onboardées et l’écran n’est pas joignable depuis le lien.',
  google: 'Connecteur OAuth. Sans compte connecté — et une salle de démonstration n’en a pas — rien ne part.',
  notion: 'Connecteur OAuth, même raison que le précédent.',
  'account-feedback':
    'Recalcul des axes de score, déclenché depuis un dossier réel après correction d’une note. Non atteint depuis la démonstration.',
  'esn-directory':
    'Résolution d’un nom d’ESN au registre public et lecture d’un territoire : aucun modèle, aucune facture. Le référentiel est PARTAGÉ entre espaces et se remplit par une routine de fond — une salle de démonstration le LIT, elle ne le produit pas.',
  'watchlist-refresh':
    '#3916.a / #3921.a (lot M03, 09/10) — `publicRegistryBodacc` et `publicRegistrySirene` LISENT deux registres PUBLICS (BODACC, Sirene) pour un SIREN, par un job planifié qui tourne hors de tout espace : aucun modèle appelé, aucun crédit débité, et le relevé écrit est partagé par SIREN — même raison que `esn-directory`. Une salle de démonstration ne déclenche pas ce job, elle LIT ce qu’il a écrit.',
  dataforge:
    'Résolution des comptes du pack DATAFORGE au registre public (recherche-entreprises) : aucun modèle, aucune facture. Référentiel PARTAGÉ rempli par un cron de fond, hors de tout espace — la démonstration n’y passe jamais.',
  companies:
    'Autocomplétion d’entreprises de l’écran « Nouvelle analyse », lui-même désactivé en démonstration : aucune analyse réelle n’y démarre.',
  'copilot-bridge':
    'UN seul appel, et c’est `territoryOverview` — la même lecture de territoire qu’`esn-directory`, pour la même raison : elle interroge quatre sources PUBLIQUES (registre, offres, marchés publics) et aucun modèle, donc aucun crédit. Elle est ici parce que le pont est le seul chemin du copilote vers l’API, et le score de débordement se pose côté NestJS. ⚠️ Cette exemption est vraie tant que c’est le SEUL appel : `demo-copilot-second-market.spec.ts` le vérifie nommément, et tombe si un second `this.ia.*` apparaît ici.',
  admin:
    '#2445.2 — `getModelRouting` LIT la politique de routage modèle déjà réglée côté IA (`GET /config/model-routing`), pour l’afficher dans la console d’administration. Aucun modèle appelé, aucun crédit débité. `AdminOpsController` vit sous `internal/admin`, derrière `InternalSecretGuard` : aucune salle de démonstration n’y a accès.',
  analytics:
    '#3223 (décision Louis 11/10/2026) — `ReasoningJudgeSamplingService` appelle `this.ia.judgeGenericRecommendations` depuis le passage du matin du back-office (tâche planifiée, hors de toute requête utilisateur), sur un échantillon de réponses d’espaces RÉELS seulement (`w.is_demo = false` dans sa requête) : aucune session de démonstration ne l’atteint, et aucune réponse d’une salle de démonstration n’est jamais jugée. Payé par l’éditeur, jamais débité à un espace.',
  'message-style':
    '#2369.11 — `previewCompare` (bouton « Comparer » sur un template) appelle `this.ia.generateMessage`, mais seulement s’il existe un template `active` à comparer. `message_style_templates` reste vide à dessein en démonstration (voir `demo-coverage.ts`) : aucun template ne s’y sème, donc le bouton ne s’affiche même pas et ce chemin n’est jamais atteint depuis le lien public.',
}

function listModules(): string[] {
  return readdirSync(MODULES_DIR).filter(entry => statSync(join(MODULES_DIR, entry)).isDirectory())
}

/** Tous les fichiers `.ts` d'un module, hors tests. */
function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(full)
  }
  return found
}

describe('la démonstration n’appelle aucun modèle', () => {
  const callers = listModules().filter(module => {
    const files = sourceFiles(join(MODULES_DIR, module))
    return files.some(file => /this\.ia\.[a-zA-Z]/.test(readFileSync(file, 'utf8')))
  })

  it('trouve bien les modules qui appellent le service IA', () => {
    // Filet du filet : si la détection casse, le test passerait sur une liste
    // vide en déclarant tout conforme.
    expect(callers.length).toBeGreaterThan(5)
  })

  it.each(callers)('%s sait dire non en démonstration', module => {
    const guarded = sourceFiles(join(MODULES_DIR, module)).some(file =>
      readFileSync(file, 'utf8').includes('isDemoWorkspace'),
    )
    if (guarded) return

    const reason = EXEMPTED[module]
    if (!reason) {
      throw new Error(
        `Le module « ${module} » appelle un modèle sans garde démo. Scripte sa réponse, refuse-la, ` +
          `ou inscris-le dans EXEMPTED (demo-model-calls.spec.ts) avec une raison écrite.`,
      )
    }
    // Une raison d'un mot n'est pas une raison : elle doit tenir devant un
    // prospect à qui on montre l'écran.
    expect(reason.length).toBeGreaterThan(40)
  })

  it('n’exempte aucun module qui n’appelle plus l’IA', () => {
    // Une exemption périmée est un mensonge tranquille : elle laisse croire que
    // la question a été posée pour du code qui n'existe plus.
    for (const module of Object.keys(EXEMPTED)) {
      expect(callers).toContain(module)
    }
  })
})
