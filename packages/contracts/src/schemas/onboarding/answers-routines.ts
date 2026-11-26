import { z } from 'zod'

/**
 * La continuité des dossiers — #2051 (lot L19).
 *
 * Ce que ces deux champs cherchent : ce qui fait qu'un compte ne retombe PAS à
 * zéro entre deux personnes ou deux semaines. Le questionnaire savait déjà ce
 * que l'ESN vend et à qui ; il ne savait rien dire de ce qui SURVIT quand la
 * personne qui suivait le dossier est absente — et c'est précisément là que le
 * travail déjà fait se perd.
 *
 * ⚠️ DISTINCT DE `sales_routine` (profil progressif, `answers-profil.ts`), et ce
 * n'est pas un doublon de réglage (GA-26) : `sales_routine` décrit le RYTHME
 * PERSONNEL du vendeur (« appels quotidiens », « contenu LinkedIn »), une
 * habitude qui disparaît avec lui. Les habitudes ci-dessous sont celles qui
 * TIENNENT SANS LUI — une trace écrite, une prochaine action datée, un backlog
 * repris par quelqu'un d'autre. Deux questions différentes, deux réponses
 * différentes : fondre les deux rendrait impossible de distinguer « Sarah
 * appelle tous les jours » de « le dossier survit à l'absence de Sarah ».
 *
 * ⚠️ Ce sont des réponses d'ENTREPRISE, pas de personne : elles décrivent ce que
 * l'ESN tient collectivement. Elles ne rejoignent donc PAS
 * `ESN_PERSONAL_ANSWER_KEYS` — la fiche canonique de l'espace les porte, et un
 * coéquipier hérite de la réponse de l'espace plutôt que de repartir de zéro,
 * ce qui est exactement le sujet de cette issue.
 *
 * Colonnes ADDITIVES, jamais bloquantes : une question passée reste absente,
 * jamais devinée, et une liste vide ne se lit pas « aucune routine » — l'option
 * « Aucune … ne tient aujourd'hui » existe pour que ce constat soit DÉCLARÉ.
 */

/**
 * #2051.1 à #2051.9 — les neuf points de continuité, dans l'ordre du retour.
 *
 * Certains ont déjà un module qui sait les TENIR une fois branchés (la prochaine
 * action datée : `modules/action-os` ; les relances : `modules/outreach` ; le
 * suivi de mission : `modules/delivery`) — d'où l'intérêt de savoir lesquels
 * manquent AUJOURD'HUI chez la personne. La réponse décrit l'existant, elle ne
 * promet rien : brancher une routine sur ce constat est un geste séparé, et
 * « rien n'écrit tout seul ».
 *
 * #2051.16 — DEPUIS LE 16/09/2026, l'audit RAPPROCHE les deux listes :
 * `AUDIT_PRACTICE_BY_CONTINUITY_BREAK` (`../commercial-audit-signals.ts`) fait
 * correspondre chaque rupture déclarée à l'habitude de CE catalogue qui la
 * tiendrait, et dit si la personne la tient déjà. Il PROPOSE — aucune routine ne
 * se crée ici, et une rupture qu'aucune habitude ne tient ressort NOMMÉE plutôt
 * que comblée.
 */
export const DOSSIER_CONTINUITY_PRACTICES = [
  'Une revue hebdomadaire du portefeuille',
  'Un suivi tenu à jour dans le CRM',
  'Une prochaine action datée sur chaque compte',
  'Des relances planifiées, pas laissées à la mémoire',
  'Une répartition écrite de qui fait quoi sur un compte',
  'Un backlog des comptes à reprendre',
  'Un compte rendu écrit après chaque entretien candidat',
  'Une mise à jour régulière du vivier',
  'Un suivi de mission une fois le consultant placé',
  'Aucune de ces habitudes ne tient aujourd’hui',
] as const

/**
 * #2051.10 à #2051.15 — les six ruptures : l'endroit où le dossier décroche.
 *
 * Elles sont NOMMÉES, jamais chiffrées : pas de « 30 % des dossiers décrochent
 * ici », pas de probabilité de perte (doctrine `c26_probabilite`). Localiser la
 * rupture est utile ; lui coller un pourcentage inventé ne l'est pas.
 *
 * « Je ne sais pas encore où ça décroche » est une réponse HONNÊTE et non un
 * vide : sans elle, une liste laissée vide se lirait « aucune rupture », qui est
 * l'inverse de ce que la personne voulait dire.
 */
export const DOSSIER_CONTINUITY_BREAKS = [
  'Une information connue n’est pas suivie',
  'Un besoin est mal qualifié au départ',
  'Un candidat n’est pas sécurisé à temps',
  'Un compte reste sans prochaine action',
  'Une activité s’interrompt sans qu’on le voie',
  'Un retour client ou candidat n’est pas capturé',
  'Je ne sais pas encore où ça décroche',
] as const

export const ROUTINES_ANSWER_FIELDS = {
  // #2051.1 à #2051.9 — aucun plafond : une ESN structurée peut tenir les neuf,
  // et un inventaire tronqué à six se lirait « il lui en manque trois ».
  dossier_continuity_practices: z.array(z.string()).optional(),
  // #2051.10 à #2051.15
  dossier_continuity_breaks: z.array(z.string()).optional(),
}
