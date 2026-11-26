/**
 * Ce que `AuditJournalModule` FOURNIT à ses services, sous forme de jeton
 * (#1666 — même gabarit que `business-metrics/module-tokens.ts`, #1645, et
 * `admin/client-health-tokens.ts`, #1652).
 *
 * POURQUOI UN JETON PLUTÔT QU'UN SERVICE INJECTÉ
 * GA-07 (`module-boundaries.spec.ts`) est un CLIQUET, et il est AU PLAFOND :
 * 254 imports service → service pour un plafond de 254, et **124 fichiers pour
 * un plafond de 124**. Un fichier NEUF qui importerait `SingletonLockService`
 * ferait donc tomber la garde sur son second compteur, quoi qu'il arrive au
 * premier. Le relever demanderait un arbitrage écrit — et il n'y a rien à
 * arbitrer : la purge de rétention n'a pas besoin du service de verrous, elle a
 * besoin de « ceci ne tourne qu'une fois, quel que soit le nombre de répliques ».
 *
 * La composition se fait donc dans `audit-journal.module.ts`, la couche prévue
 * pour ça et que GA-07 exempte explicitement, et le service ne connaît que la
 * FORME de ce qu'il reçoit.
 *
 * ⚠️ GA-76 exige une CHAÎNE DE PREUVE et non un nom : le membre appelé doit
 * être `@Inject(<JETON>)`, et un module du dépôt doit fournir ce jeton par une
 * fabrique qui appelle réellement `withSingletonLock`. Un jeton dont la fabrique
 * ne verrouille rien ne compte pas — et c'est bien ce que fait la fabrique de
 * `audit-journal.module.ts`.
 */

/** Le jeton du verrou. Une chaîne, pour rester lisible dans une erreur Nest. */
export const AUDIT_SINGLETON_LOCK = 'BACKOFFICE_AUDIT_SINGLETON_LOCK'

/**
 * « Exécute ceci une seule fois, quel que soit le nombre de répliques. »
 *
 * Sans verrou disponible, l'implémentation fournie exécute quand même — c'est
 * le comportement du dépôt (`withSingletonLock` dégrade sur un service absent),
 * et il est sûr ici : deux répliques qui purgent la même fenêtre effacent les
 * mêmes lignes, la seconde n'en trouve plus aucune. Le verrou évite la ligne de
 * journal en double, pas une corruption.
 */
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
