import { launcherTypeOf, runsOfType, type LauncherTypeKey } from '@bellum/contracts'

/**
 * Ce que fait Entrée dans le lanceur — une fonction PURE.
 *
 * Elle vit hors du composant parce que c'est ici que se joue la seule chose
 * qui puisse coûter quelque chose à quelqu'un : sur quelle voie on part. Un
 * `if` enfoui dans un `onKeyDown` ne se teste qu'à la main, et ce qui ne se
 * teste qu'à la main finit par changer sans qu'on s'en aperçoive.
 *
 * La règle qui porte tout : **sans type choisi, on va chez Laura** — gratuit,
 * borné, aucune écriture. On ne tombe jamais dans un run facturé par accident ;
 * il faut avoir cliqué un chip.
 */

/**
 * La borne du texte envoyé à une LISTE.
 *
 * Un nom d'entreprise, un nom de personne ou une compétence tiennent largement
 * dedans. Au-delà, c'est un collage accidentel : la liste rendrait zéro
 * résultat à coup sûr, et l'URL deviendrait impartageable. La question posée à
 * Laura, elle, n'est jamais tronquée — couper la phrase de quelqu'un produirait
 * une réponse à côté sans dire pourquoi.
 */
export const RUN_QUERY_MAX_CHARS = 200

/* Non exporté : il n'est consommé que par `launcherIntent`, dont le type de
   retour est inféré. Exporter un type que personne n'importe est ce que
   `pnpm lint:exports:types` refuse. */
type LauncherIntent =
  /** Rien à faire — champ vide et aucun type. Entrée ne doit pas « échouer ». */
  | { kind: 'idle' }
  /** La voie gratuite. `ask` part tel quel dans `/chat?ask=`, qui ENVOIE. */
  | { kind: 'laura'; ask: string }
  /** La voie gouvernée : on navigue, la destination porte déjà sa confirmation. */
  | { kind: 'run'; runKey: string; to: string; search: Record<string, string> }

type LauncherInput = {
  typeKey: LauncherTypeKey | null
  runKey: string | null
  text: string
}

/** Au-delà, ce n'est plus un nom (« Société Générale Corporate Banking » en a 4). */
const NAME_MAX_WORDS = 4

const INTERROGATIVE_HEAD =
  /^(quel|quelle|quels|quelles|qui|que|quoi|comment|pourquoi|ou|quand|combien|est-ce|qu|lequel|laquelle|what|who|whom|whose|how|why|where|when|which)$/

/**
 * #3648 — une QUESTION (ou une phrase) est adressée à Laura : jamais une
 * recherche de contact, jamais un panneau « 1 crédit si trouvé ». La
 * recherche d'entité ne garde que ce qui ressemble à un NOM : « Marie
 * Dupont », « Société Générale ». Mesuré en prod le 05/10 : « Quelles sont mes
 * opportunités… » tapé dans le composeur ouvrait `/contacts?q=…` et le
 * message était perdu. Un champ vide n'est pas une question.
 */
export function isQuestionForLaura(text: string, { armed = false }: { armed?: boolean } = {}): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.includes('?')) return true
  const words = trimmed.split(/\s+/)
  // Chip EXPLICITEMENT armé : seuls « ? » ou un mot interrogatif en tête renvoient
  // à Laura — un nom d'entreprise long (« Société Générale Corporate Banking
  // France ») garde le run. La borne des mots ne vaut que SANS chip armé.
  if (!armed && words.length > NAME_MAX_WORDS) return true
  const head = words[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/['’]/)[0]
  return words.length > 1 && INTERROGATIVE_HEAD.test(head)
}

export function launcherIntent({ typeKey, runKey, text }: LauncherInput): LauncherIntent {
  const trimmed = text.trim()
  // #3648 — une question ne part JAMAIS sur une voie facturée ni une recherche.
  if (isQuestionForLaura(trimmed, { armed: Boolean(typeKey && launcherTypeOf(typeKey)) }))
    return { kind: 'laura', ask: trimmed }

  // Une clé de type peut venir d'un lien collé ou d'un état abîmé. Le repli est
  // la voie gratuite : elle ne peut rien casser, et surtout elle RÉPOND — une
  // erreur « type inconnu » n'apprendrait rien à qui n'a pas choisi de type.
  const type = typeKey ? launcherTypeOf(typeKey) : undefined

  if (!type) {
    return trimmed ? { kind: 'laura', ask: trimmed } : { kind: 'idle' }
  }

  const runs = runsOfType(type.key)
  // Le premier run du type quand aucun n'est choisi : l'ordre du catalogue est
  // une décision (sur un compte, analyser est le geste dominant). Faire échouer
  // Entrée après un clic sur un chip donnerait un lanceur qui a l'air cassé.
  const run = runs.find(candidate => candidate.key === runKey) ?? runs[0]
  if (!run) return trimmed ? { kind: 'laura', ask: trimmed } : { kind: 'idle' }

  const search: Record<string, string> = {}
  if (run.queryParam && trimmed) {
    search[run.queryParam] = trimmed.slice(0, RUN_QUERY_MAX_CHARS)
  }

  return { kind: 'run', runKey: run.key, to: run.to, search }
}
