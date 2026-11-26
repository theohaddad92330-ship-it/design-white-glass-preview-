import type { AccountHygieneByAccount } from '../api'

/**
 * Le verdict d'un contrôle de qualité SUR UN COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne CALCULE rien. Le contrôle est calculé côté serveur, avec les prédicats
 * du cockpit au caractère près (`account-hygiene.sql.ts`, garde GA-53) ;
 * refaire ici « ce compte n'a aucune tâche à venir » installerait une seconde
 * copie de la règle, qui divergerait au premier changement — elle divergerait
 * même déjà, `taskBucket` des contrats excluant les tâches annulées là où le
 * contrôle les compte comme une action programmée.
 *
 * Ce que ce module fait est plus petit et plus important : il traduit une
 * réponse en TROIS états, pour qu'aucun écran ne puisse en oublier un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, JAMAIS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **`unmeasured`** — on ne sait pas. La lecture n'a pas abouti, ou elle
 *    s'est arrêtée à sa borne avant d'atteindre ce compte. Ce n'est PAS
 *    « conforme » : un verdict tiré d'un silence est le défaut que ce chantier
 *    corrige ;
 *  - **`clear`** — mesuré, et rien à signaler. Le compte était dans le champ de
 *    la lecture et n'en est pas ressorti ;
 *  - **`breached`** — le serveur désigne CE compte.
 */

type NextActionVerdict = { state: 'unmeasured' } | { state: 'clear' } | { state: 'breached' }

type ContactsEmailVerdict =
  | { state: 'unmeasured' }
  | { state: 'clear' }
  /** Le dénominateur voyage avec le compte : « 3 » ne se lit pas, « 3 sur 7 » si. */
  | { state: 'breached'; count: number; total: number }

const UNMEASURED = { state: 'unmeasured' } as const
const CLEAR = { state: 'clear' } as const

/** Ce compte est-il l'un des « comptes suivis sans prochaine action » ? */
export function nextActionVerdict(data: AccountHygieneByAccount | undefined, accountId: string): NextActionVerdict {
  const read = data?.withoutNextAction
  if (!read) return UNMEASURED
  if (read.ids.includes(accountId)) return { state: 'breached' }
  // Absent d'une lecture BORNÉE : « on s'est arrêté avant lui » n'est pas
  // « il va bien ».
  return read.truncated ? UNMEASURED : CLEAR
}

/** Combien des contacts de ce compte n'ont pas d'adresse — et sur combien. */
export function contactsEmailVerdict(
  data: AccountHygieneByAccount | undefined,
  accountId: string,
): ContactsEmailVerdict {
  const read = data?.contactsWithoutEmail
  if (!read) return UNMEASURED
  const line = read.byAccount[accountId]
  if (line) return { state: 'breached', count: line.count, total: line.total }
  return read.truncated ? UNMEASURED : CLEAR
}
