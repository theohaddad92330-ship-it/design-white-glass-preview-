import { IMPORT_STEPS, type ImportStep } from '@bellum/contracts'

/**
 * Où en est l'assistant d'import, étape par étape (#1451.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `IMPORT_STEPS` — les sept étapes du §7.4 — était déclaré au contrat et n'avait
 * AUCUN consommateur dans `apps/web/src`. L'écran enchaînait « déposer »,
 * « simuler », « importer » sans jamais dire où on en était ni ce qui restait :
 * sur un fichier de 17 000 lignes, savoir qu'il reste UNE étape ou quatre change
 * la décision de commencer maintenant ou après la réunion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI PROUVE QU'UNE ÉTAPE EST FAITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque étape est adossée à un FAIT de l'écran, jamais à un compteur qu'on
 * avance à la main — un compteur diverge de l'état réel dès la première
 * correction. En particulier, « normaliser » et « dédupliquer » n'ont pas de
 * geste à eux : c'est la simulation qui les exécute côté serveur, et son rapport
 * en porte la preuve (les lignes écartées pour date ou adresse invalide, les
 * doublons repérés). Les marquer faites AVEC elle est un fait.
 *
 * Conséquence utile : une colonne re-rattachée invalide le rapport — le serveur
 * écrit avec le mapping SIMULÉ — donc ces trois étapes redeviennent à faire,
 * pendant que « reconnaître » reste faite. L'écran le montre au lieu de le taire.
 */
type ImportStepStatus = 'done' | 'current' | 'todo'

type ImportProgress = {
  /** Une source est choisie et sa session est ouverte. */
  sourceChosen: boolean
  /** Un fichier est en mémoire du navigateur. */
  fileLoaded: boolean
  /** Le serveur a proposé une correspondance de colonnes. */
  columnsRecognised: boolean
  /** Un rapport de simulation est en main. */
  simulated: boolean
  /** Une écriture a été TENTÉE. */
  written: boolean
}

function isDone(step: ImportStep, progress: ImportProgress): boolean {
  switch (step) {
    case 'choose_source':
      return progress.sourceChosen
    case 'upload':
      return progress.fileLoaded
    case 'map':
      return progress.columnsRecognised
    case 'normalise':
    case 'deduplicate':
    case 'simulate':
      return progress.simulated
    case 'apply':
      return progress.written
  }
}

/**
 * Les sept étapes avec leur état. « En cours » est la PREMIÈRE non faite — il y
 * en a donc au plus une, et aucune quand tout est fait.
 */
export function importStepStatuses(progress: ImportProgress): { step: ImportStep; status: ImportStepStatus }[] {
  let currentTaken = false
  return IMPORT_STEPS.map(step => {
    if (isDone(step, progress)) return { step, status: 'done' as const }
    if (currentTaken) return { step, status: 'todo' as const }
    currentTaken = true
    return { step, status: 'current' as const }
  })
}
