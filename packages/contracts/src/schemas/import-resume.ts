import type { DispatchFailureOutcome } from './dispatch-failure.js'
import type { ImportSessionState } from './import.js'

/**
 * La reprise d'un import interrompu — angle mort n°6 du tome 8 §33.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE TOME 8 REPROCHE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « **La reprise après un import raté** : le rollback est spécifié ; **la
 * reprise ne l'est pas** — que fait-on des 900 objets corrects ? »
 *
 * Mesuré dans ce dépôt le 29/08/2026 : un import qui s'arrête à la ligne 4 000
 * sur 17 000 laisse les 4 000 lignes EN BASE et n'en garde **aucune trace**.
 * `markApplied` n'est jamais appelé, donc l'instantané est perdu, les compteurs
 * restent à 0, l'état reste `simulated` — et `planRollback` refuse d'annuler un
 * import qui « n'a rien écrit ». La seule garde du scénario le plus grave du
 * PDF 9 est inatteignable dans le cas exact pour lequel elle a été écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE CLÉ DE DÉDUPLICATION QUI SOIT SÛRE
 * ─────────────────────────────────────────────────────────────────────────────
 * **(session d'import + numéro de ligne)**, et rien d'autre. Pas une
 * ressemblance de noms : on PROPOSE une fusion de doublons, on ne fusionne
 * jamais, et deux homonymes chez deux sociétés différentes ne sont pas
 * rapprochés.
 *
 * Un numéro de ligne ne veut rien dire hors de SON fichier. C'est pourquoi
 * l'empreinte du contenu est enregistrée avec le point de reprise, et pourquoi
 * elle est vérifiée AVANT de sauter la moindre ligne : sauter 4 000 lignes d'un
 * autre fichier perdrait 4 000 lignes réelles, en silence — un mal pire que le
 * doublon qu'on cherche à éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CAS QUI N'A PAS DE BONNE RÉPONSE AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * « **Un timeout n'est pas un échec** : `unknown` ARRÊTE la reprise. La seule
 * question : la requête a-t-elle pu PARTIR ? » — la doctrine du dépôt, tenue
 * ici par `dispatchFailureOutcome`, qui est le SEUL endroit où ce classement
 * vit. Quand la ligne 4 000 est partie sans réponse, la rejouer la doublonne
 * peut-être et la sauter la perd peut-être : la reprise automatique s'arrête,
 * la ligne est NOMMÉE, et c'est un humain qui tranche.
 */

/**
 * Tous les combien le point de reprise est écrit en base.
 *
 * Un point de reprise posé uniquement à la fin ne survit à rien : c'est
 * précisément la fin qui n'arrive pas. 200 lignes, c'est ~85 écritures pour un
 * fichier de 17 000 lignes — assez rare pour ne pas peser, assez fréquent pour
 * qu'une reprise ne rejoue jamais plus de 199 lignes déjà écrites.
 */
export const IMPORT_CHECKPOINT_ROWS = 200

/**
 * Une empreinte du fichier déposé, pour prouver qu'une reprise saute des lignes
 * DU MÊME fichier.
 *
 * Deux accumulateurs FNV-1a et la longueur : purement arithmétique, donc
 * identique côté navigateur et côté serveur, et sans dépendance — le calcul qui
 * autorise à sauter des lignes ne doit pas exiger un runtime particulier pour
 * être testé.
 *
 * ⚠️ Ce n'est pas une empreinte cryptographique et elle ne prétend pas l'être :
 * elle répond à « est-ce le même fichier ? », pas à « quelqu'un a-t-il forgé un
 * fichier de même empreinte ? ». Le pire cas d'une collision est une reprise
 * qui saute des lignes du mauvais fichier ; la longueur en octets est donc
 * incluse EN CLAIR dans le résultat, ce qui écarte à lui seul l'immense
 * majorité des collisions possibles.
 */
export function importContentFingerprint(content: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 0x01000193)
    // Le second accumulateur mélange aussi la POSITION : sans elle, deux lignes
    // permutées donnent la même empreinte, et la reprise sauterait les
    // mauvaises.
    h2 = Math.imul(h2 ^ (code + index), 0x85ebca6b)
  }
  return `${content.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}

/**
 * Ce qu'on fait du fichier redéposé sur une session d'import.
 *
 * Cinq refus et deux feux verts. Les refus ne sont pas des variantes d'un même
 * « non » : chacun se dit à l'utilisateur avec sa propre phrase, parce que le
 * geste qui les répare diffère.
 */
export type ImportResumeDecision =
  /** Rien n'a été écrit : on écrit tout, depuis la première ligne. */
  | { kind: 'start' }
  /** `fromRow` lignes sont durables en base. On reprend à cet index. */
  | { kind: 'resume'; fromRow: number }
  /** La session est terminale — appliquée ou annulée. Il n'y a rien à reprendre. */
  | { kind: 'done' }
  /** La ligne est partie sans réponse : la reprise automatique s'ARRÊTE. */
  | { kind: 'ask_unknown'; uncertainRow: number }
  /** Le fichier redéposé n'est pas celui qui a été écrit. */
  | { kind: 'different_file' }
  /** Aucune empreinte enregistrée : on ne PROUVE pas que c'est le même fichier. */
  | { kind: 'unverifiable' }
  /** Des lignes ont été écrites, on ne sait pas combien. « Inconnu » n'est pas « zéro ». */
  | { kind: 'unknown_progress' }

export function importResumeDecision(input: {
  state: ImportSessionState
  /** Le nombre de lignes DURABLES. `null` = on ne sait pas — jamais « 0 ». */
  processedRows: number | null
  failedAtRow: number | null
  resumeOutcome: DispatchFailureOutcome | null
  storedFingerprint: string | null
  incomingFingerprint: string
}): ImportResumeDecision {
  if (input.state === 'applied' || input.state === 'rolled_back') return { kind: 'done' }

  // Rien de durable enregistré ET aucun état de reprise : c'est un premier
  // passage. Le seul cas où l'on écrit à partir de la ligne 0.
  if (input.processedRows === null && input.state !== 'partial') return { kind: 'start' }

  // À partir d'ici, la session a écrit quelque chose. On ne saute AUCUNE ligne
  // tant qu'on n'a pas prouvé que le fichier est le même : c'est le contrôle
  // qui passe avant tous les autres, parce qu'un numéro de ligne ne veut rien
  // dire dans un autre fichier.
  if (input.storedFingerprint === null) return { kind: 'unverifiable' }
  if (input.storedFingerprint !== input.incomingFingerprint) return { kind: 'different_file' }

  // « On ne sait pas combien de lignes ont été écrites » n'est pas « zéro ligne
  // a été écrite ». Reprendre à 0 redoublonnerait tout ce qui n'a pas de clé.
  if (input.processedRows === null) return { kind: 'unknown_progress' }

  // La requête est partie sans réponse : la rejouer la doublonne peut-être, la
  // sauter la perd peut-être. La reprise automatique s'arrête ici.
  if (input.resumeOutcome === 'unknown') {
    return { kind: 'ask_unknown', uncertainRow: input.failedAtRow ?? input.processedRows }
  }

  return { kind: 'resume', fromRow: input.processedRows }
}
