import type { MissionStatus } from '@bellum/contracts'

/**
 * Les statuts d'une mission FINIE, et rien d'autre.
 *
 * La liste est POSITIVE — on nomme ce qui est terminé, jamais ce qui tourne — et
 * c'est ce qui rend le filtre sûr : `onboarding`, `active`, `paused` et
 * `renewed` décrivent tous une mission vivante (une mission suspendue attend sa
 * reprise, elle n'est pas close), et un statut qu'on ne reconnaît PAS retombe
 * du côté vivant.
 *
 * ⚠️ **Un statut inconnu n'est pas un statut terminé.** Une valeur ajoutée à
 * l'énumération, ou une réponse d'un serveur plus récent que ce navigateur,
 * laisse la mission VISIBLE. Faire disparaître une ligne d'une liste est
 * beaucoup plus grave que de l'y laisser : personne ne cherche ce qu'il ne voit
 * pas, alors qu'une mission de trop se remarque au premier coup d'œil — c'est
 * exactement ce qui a permis de trouver ce défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS UNE CONSTANTE DANS CHAQUE ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * La dérivation vivait dans `MissionsPage.tsx`, en privé. La planification a
 * exactement le même besoin — une mission terminée ne se planifie pas — et la
 * recopier garantissait qu'elles divergent le jour où l'une gagne un statut.
 *
 * ⚠️ Il existe une AUTRE liste du même nom, côté contrats
 * (`packages/contracts/src/schemas/account-missions.ts`), et elle ne dit PAS la
 * même chose : elle range `renewed` avec les missions finies. Les deux ne sont
 * pas interchangeables — ici « renouvelée » veut dire « elle continue », et une
 * mission renouvelée qu'on retirerait de la frise disparaîtrait de la
 * planification le jour même où elle vient d'être prolongée. La divergence est
 * signalée plutôt qu'unifiée à l'aveugle : les deux listes ont des appelants
 * différents, et il faudrait mesurer chacun avant de trancher.
 */
const FINISHED_MISSION_STATUSES: ReadonlySet<string> = new Set<MissionStatus>(['ended', 'terminated'])

export function isFinishedMission(status: string | null | undefined): boolean {
  return status != null && FINISHED_MISSION_STATUSES.has(status)
}
