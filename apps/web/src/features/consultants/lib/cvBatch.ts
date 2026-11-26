/**
 * Le dépôt de CV EN MASSE (#1116).
 *
 * « J'ai environ 2-3000 CV depuis que je travaille. J'ai envie de tous les
 * charger dans l'outil et que ça me génère une base de données Nom, prénom,
 * téléphone, compétence… Ça permet de ne pas rentrer 1 par 1. »
 *
 * ── Pourquoi une file CÔTÉ NAVIGATEUR ────────────────────────────────────
 *
 * Elle rejoue le dépôt d'UN CV, celui qui existe déjà, autant de fois qu'il y a
 * de fichiers. Aucune seconde route d'ingestion : les refus, la recherche de
 * doublon et la création de fiche restent exactement ceux du dépôt unitaire, et
 * ne peuvent donc pas diverger. C'est aussi ce qui rend le geste ARRÊTABLE — le
 * lot vit sous les yeux de celui qui l'a lancé.
 *
 * ── Les quatre règles, et l'accident que chacune évite ───────────────────
 *
 * 1. **Un échec n'arrête pas le lot.** Un CV illisible sur trois mille ne doit
 *    pas emporter les 2 999 autres. Chaque fichier a son issue, et le lot va
 *    au bout.
 * 2. **Un doublon est SAUTÉ, jamais fusionné ni créé en double.** En unitaire,
 *    un doublon ouvre une question ; poser trois mille questions n'est pas une
 *    fonctionnalité. On saute, on NOMME, et la personne tranche après — c'est
 *    la même discipline que le rapprochement CRM : on propose, on ne fusionne
 *    jamais seul.
 * 3. **Concurrence BORNÉE.** Trois à la fois : chaque fichier traverse une
 *    extraction de texte côté serveur, et trois mille en parallèle ne
 *    ralentissent pas le lot — ils tombent le service pour tout le monde.
 * 4. **On peut arrêter.** Le drapeau est lu AVANT chaque fichier : arrêter
 *    laisse ce qui est déjà créé, et ne crée rien de plus. Jamais une annulation
 *    qui défait ce qui a marché.
 *
 * ⚠️ Ce que le lot NE fait PAS : lire les CV. `intake` extrait le TEXTE et crée
 * la fiche — sans appel de modèle et sans crédit. La lecture des treize blocs
 * (nom, téléphone, compétences…) reste le geste séparé de la revue de CV, fiche
 * par fiche. Promettre l'inverse ici ferait croire à une base remplie alors
 * qu'elle serait faite de fiches à un seul champ.
 */

/** Ce qu'un fichier est devenu. */
export type CvBatchOutcome =
  | { file: string; status: 'created'; consultantId: string }
  /** Une fiche existe déjà pour cette personne — on n'a rien écrit. */
  | { file: string; status: 'duplicate'; matched: string[] }
  | { file: string; status: 'too_big' }
  /** Refus du serveur, avec SA raison : « probablement un scan », etc. */
  | { file: string; status: 'failed'; reason: string }

export type CvBatchProgress = {
  done: number
  total: number
  outcomes: CvBatchOutcome[]
}

/** Trois à la fois. Voir la règle 3. */
export const CV_BATCH_CONCURRENCY = 3

/** Les formats reconnus pour un CV — les mêmes que le dépôt unitaire
 *  (`accept` de l'input, `CvDropZone.tsx`). Une seule liste : la dupliquer
 *  aurait laissé les deux diverger. */
export const CV_BATCH_ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.rtf',
  '.txt',
  '.md',
  // #3935.5 — un CV photographié ou capturé : lu par l'OCR côté IA.
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const

/**
 * #2183.4 — un DOSSIER entier (`webkitdirectory`), pas seulement une
 * sélection multiple de fichiers.
 *
 * `webkitdirectory` ignore l'attribut `accept` : un dossier réel porte des
 * fichiers système (`.DS_Store`), des fichiers cachés, des captures d'écran,
 * des tableurs — les envoyer au lot les compterait comme des ÉCHECS alors que
 * ce ne sont simplement pas des CV. On les ÉCARTE ici, avant tout appel
 * réseau, plutôt que de laisser le serveur les refuser un par un : le rapport
 * de fin ne doit nommer que de vrais échecs, pas des `.DS_Store`.
 *
 * Une extension non reconnue est écartée EN SILENCE, jamais devinée — même
 * discipline que `mapColumn` (`csv-import.ts`).
 */
export function filterCvBatchFiles(files: readonly File[]): File[] {
  return files.filter(file => {
    const name = file.name.toLowerCase()
    if (name.startsWith('.')) return false
    return CV_BATCH_ACCEPTED_EXTENSIONS.some(extension => name.endsWith(extension))
  })
}

/**
 * Ce que le lot demande au serveur pour UN fichier. Volontairement étroit :
 * la file ne connaît ni l'API ni React, ce qui la rend testable telle quelle.
 */
type CvBatchUploader = (file: File) => Promise<CvBatchOutcome>

/**
 * Déroule la file. Rend les issues DANS L'ORDRE des fichiers — un rapport qui
 * suit l'ordre d'arrivée se relit ; un rapport dans l'ordre d'achèvement, non.
 */
export async function runCvBatch(
  files: readonly File[],
  upload: CvBatchUploader,
  options: {
    onProgress?: (progress: CvBatchProgress) => void
    /** Lu AVANT chaque fichier. Voir la règle 4. */
    shouldStop?: () => boolean
    concurrency?: number
  } = {},
): Promise<CvBatchOutcome[]> {
  const outcomes: (CvBatchOutcome | undefined)[] = new Array(files.length).fill(undefined)
  let next = 0
  let done = 0

  const report = () =>
    options.onProgress?.({
      done,
      total: files.length,
      outcomes: outcomes.filter((outcome): outcome is CvBatchOutcome => outcome !== undefined),
    })

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.shouldStop?.()) return
      const index = next
      next += 1
      const file = files[index]
      if (!file) return
      try {
        outcomes[index] = await upload(file)
      } catch (error) {
        // Règle 1 : un échec n'arrête pas le lot, et il porte SA raison — le
        // serveur tient la vraie (« probablement un scan »), et la remplacer
        // par « une erreur est survenue » ferait redéposer le même fichier.
        outcomes[index] = {
          file: file.name,
          status: 'failed',
          reason: error instanceof Error && error.message ? error.message : 'Échec inconnu',
        }
      }
      done += 1
      report()
    }
  }

  const lanes = Math.max(1, Math.min(options.concurrency ?? CV_BATCH_CONCURRENCY, files.length))
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  return outcomes.filter((outcome): outcome is CvBatchOutcome => outcome !== undefined)
}

/**
 * #2183.43 — « temps restant », un FAIT calculé sur ce qui vient d'être
 * mesuré, jamais un pourcentage inventé.
 *
 * Extrapolation LINÉAIRE simple : le temps moyen des fichiers déjà traités,
 * multiplié par ceux qui restent. Pas de fenêtre glissante ni de moyenne
 * pondérée — un lot de CV n'a pas de raison de ralentir ou d'accélérer en
 * cours de route, et une formule plus fine ne ferait que déplacer l'erreur
 * sans la réduire.
 *
 * `null` tant qu'aucun fichier n'est traité (rien à extrapoler), une fois le
 * lot fini (rien à attendre), ou si l'horloge recule d'un poil (deux lectures
 * de `Date.now()` très rapprochées peuvent, sur certains runtimes, ne pas
 * être strictement croissantes) — jamais un temps négatif affiché.
 */
export function estimateRemainingMs({
  startedAt,
  now,
  done,
  total,
}: {
  startedAt: number
  now: number
  done: number
  total: number
}): number | null {
  if (done <= 0 || done >= total) return null
  const elapsed = now - startedAt
  if (elapsed <= 0) return null
  const msPerFile = elapsed / done
  return Math.round(msPerFile * (total - done))
}

/**
 * #2183.43 — `estimateRemainingMs` n'avait aucun appelant côté écran
 * (`cfd96f846`, agent interrompu) : ce pont choisit l'UNITÉ affichée.
 *
 * Secondes sous 90 s — une minute arrondie dirait « 1 min » pour un lot de
 * 3 CV qui finit en 20 s, ce qui se lirait comme une estimation inventée.
 * Jamais 0 : un reste sous la seconde reste « 1 », pour ne pas laisser croire
 * que le lot est déjà fini.
 */
export function formatRemainingCv(ms: number): { unit: 'seconds' | 'minutes'; count: number } {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 90) return { unit: 'seconds', count: totalSeconds }
  return { unit: 'minutes', count: Math.round(totalSeconds / 60) }
}

/** Le compte par issue, pour le rapport de fin. */
export function summariseCvBatch(outcomes: readonly CvBatchOutcome[]): Record<CvBatchOutcome['status'], number> {
  return outcomes.reduce((acc, outcome) => ({ ...acc, [outcome.status]: acc[outcome.status] + 1 }), {
    created: 0,
    duplicate: 0,
    too_big: 0,
    failed: 0,
  })
}
