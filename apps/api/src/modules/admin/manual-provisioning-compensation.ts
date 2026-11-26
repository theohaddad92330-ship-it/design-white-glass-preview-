/**
 * Ce qu'on DÉFAIT quand le provisionnement d'un client échoue à mi-chemin — et
 * ce qu'on refuse de défaire (#1665, règle 1 : « si une étape échoue, TOUT est
 * annulé. Pas d'espace orphelin », test T1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TRANSACTION SQL NE SUFFIT PAS, ET CE QUE ÇA CHANGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six étapes ne vivent pas dans une seule base :
 *
 *   · l'espace, l'adhésion, l'offre, les crédits, les conditions et la première
 *     facture sont en Postgres → UNE transaction, un `ROLLBACK`, rien à décider ;
 *   · le compte du propriétaire est dans **Supabase Auth**, un autre système →
 *     aucun `ROLLBACK` ne l'atteint, il faut une COMPENSATION explicite ;
 *   · les e-mails d'invitation sont partis chez des gens → **rien** ne les défait,
 *     ce qui est précisément pourquoi ils partent APRÈS le commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LA COMPENSATION N'EST PAS TOUJOURS LE BON GESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt : **un timeout n'est pas un échec**. La seule question
 * qui compte est « la requête a-t-elle pu PARTIR ? » — une connexion jamais
 * établie est un échec rejouable, une requête partie sans réponse est un
 * `unknown`, et `unknown` ARRÊTE la reprise. Ici la conséquence est plus dure
 * qu'ailleurs : si la transaction SQL rend un `unknown`, elle a peut-être été
 * COMMISE. Supprimer le compte du propriétaire détruirait alors le propriétaire
 * d'un espace bien réel, avec ses membres et son abonnement.
 *
 * On préfère donc, dans ce cas précis, laisser un compte peut-être orphelin et
 * le NOMMER, plutôt que supprimer un compte peut-être vivant. Un orphelin se
 * nettoie ; un propriétaire supprimé se reconstruit à la main.
 *
 * Pur et sans dépendance de base : la décision de défaire une écriture ne doit
 * pas exiger une base pour être testée.
 */

import { dispatchFailureOutcome, type DispatchFailureOutcome } from '@bellum/contracts'

/** Ce qu'une écriture est devenue. `unknown` = partie sans réponse. */
export type WriteOutcome = 'done' | DispatchFailureOutcome

/**
 * L'issue d'un appel qui a jeté.
 *
 * ⚠️ Une seule dérivation : `dispatchFailureOutcome` (`@bellum/contracts`) est LA
 * fonction du dépôt qui répond à « la requête a-t-elle pu partir ? ». En écrire
 * une seconde ici la ferait diverger — et `UND_ERR_CONNECT_TIMEOUT`, qui porte
 * le mot « timeout » sans en être un, est exactement le cas où deux versions se
 * mettraient à répondre différemment.
 */
export function outcomeOfFailure(error: unknown): DispatchFailureOutcome {
  return dispatchFailureOutcome(error)
}

/** L'état du provisionnement au moment où quelque chose a mal tourné. */
interface CompensationInput {
  /** `true` seulement si CE provisionnement a créé le compte d'authentification. */
  ownerAccountCreatedHere: boolean
  /** L'identifiant du compte, quand on le connaît. */
  ownerUserId: string | null
  /** Ce que la transaction SQL est devenue. */
  sqlOutcome: WriteOutcome
}

export type CompensationDecision =
  /** Rien à défaire : soit tout a réussi, soit rien n'a été créé hors SQL. */
  | { action: 'nothing'; reason: string }
  /** Supprimer le compte d'authentification créé à l'instant. */
  | { action: 'delete_owner_account'; userId: string; reason: string }
  /** Ne RIEN toucher et le dire : on ne compense pas à l'aveugle. */
  | { action: 'stop'; reason: string }

/**
 * Que faire de ce qui a été écrit hors de la transaction.
 *
 * Les quatre cas, et pourquoi chacun tombe comme il tombe :
 *  1. La transaction a réussi → rien à défaire, le client existe.
 *  2. Le compte préexistait → il n'est JAMAIS supprimé. Ce n'est pas notre
 *     compte : quelqu'un s'en sert peut-être depuis six mois.
 *  3. On a créé le compte ET la transaction a échoué SANS ambiguïté → on le
 *     supprime. C'est le cas T1 de l'issue : échec à l'étape 4, aucun espace,
 *     aucun utilisateur.
 *  4. La transaction est `unknown` → on s'arrête. Elle a peut-être été commise.
 */
export function decideCompensation(input: CompensationInput): CompensationDecision {
  if (input.sqlOutcome === 'done') {
    return { action: 'nothing', reason: 'Les écritures SQL ont été commises — il n’y a rien à défaire.' }
  }

  if (input.sqlOutcome === 'unknown') {
    return {
      action: 'stop',
      reason:
        'La transaction est partie sans réponse : elle a peut-être été COMMISE. ' +
        'Supprimer le compte du propriétaire détruirait alors un espace vivant. Rien n’est défait.',
    }
  }

  if (!input.ownerAccountCreatedHere || !input.ownerUserId) {
    return {
      action: 'nothing',
      reason:
        'Le compte du propriétaire existait avant ce provisionnement : il n’est jamais supprimé. ' +
        'La transaction ayant été annulée, il ne reste aucun espace orphelin.',
    }
  }

  return {
    action: 'delete_owner_account',
    userId: input.ownerUserId,
    reason:
      'La transaction a été annulée sans ambiguïté. Le compte d’authentification créé à l’instant ' +
      'est supprimé pour qu’il ne reste ni espace ni utilisateur (T1).',
  }
}

/** Ce que l'opérateur doit lire quand le provisionnement a échoué. */
interface FailureReport {
  /** Le message rendu à l'appelant. Il nomme ce qui reste, quand il reste quelque chose. */
  message: string
  /** `true` quand l'état est réellement revenu à l'avant. */
  fullyRolledBack: boolean
  /** Ce qu'un humain doit aller vérifier ou nettoyer. Vide = rien à faire. */
  manualCleanup: string[]
}

/**
 * Le compte rendu honnête d'un échec.
 *
 * ⚠️ « Tout a été annulé » est une PHRASE DE CONFIANCE : la dire quand ce n'est
 * pas vrai est pire que ne rien dire, parce que personne n'ira vérifier. Elle
 * n'est donc rendue que lorsque la décision était `nothing` (rien à défaire) ou
 * que la compensation a réellement abouti.
 *
 * `compensationOutcome` est l'issue de la compensation elle-même : elle peut
 * échouer, et elle peut être `unknown` — un `DELETE` parti sans réponse a
 * peut-être supprimé le compte.
 */
export function buildFailureReport(input: {
  cause: string
  decision: CompensationDecision
  compensationOutcome: WriteOutcome | null
  ownerEmail: string
}): FailureReport {
  const { decision } = input

  if (decision.action === 'nothing') {
    return {
      message: `${input.cause} Aucune écriture n’a été conservée : ${decision.reason}`,
      fullyRolledBack: true,
      manualCleanup: [],
    }
  }

  if (decision.action === 'stop') {
    return {
      message:
        `${input.cause} ⚠️ L’état n’est PAS certain : ${decision.reason} ` +
        `Vérifiez à la main si l’espace de ${input.ownerEmail} existe avant de relancer.`,
      fullyRolledBack: false,
      manualCleanup: [
        `Vérifier dans la console si un espace a été créé pour ${input.ownerEmail}, et le compléter ou le supprimer selon le cas.`,
      ],
    }
  }

  if (input.compensationOutcome === 'done') {
    return {
      message: `${input.cause} Tout a été annulé : ni espace ni compte ne subsistent pour ${input.ownerEmail}.`,
      fullyRolledBack: true,
      manualCleanup: [],
    }
  }

  const nuance =
    input.compensationOutcome === 'unknown'
      ? 'la suppression est partie sans réponse — le compte a peut-être été supprimé, peut-être pas'
      : 'la suppression a échoué'

  return {
    message:
      `${input.cause} Les écritures SQL ont bien été annulées, mais ${nuance} : ` +
      `le compte ${input.ownerEmail} peut subsister sans espace.`,
    fullyRolledBack: false,
    manualCleanup: [
      `Supprimer le compte d’authentification ${input.ownerEmail} (id ${decision.userId}) s’il existe encore — il n’a plus d’espace.`,
    ],
  }
}
