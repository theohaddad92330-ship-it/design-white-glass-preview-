import { INTERACTION_ACTIVITY_KINDS } from '@bellum/contracts'

/**
 * #2556 — UN COMPTE « CONNU » DOIT VALOIR MIEUX QU'UN ANNUAIRE.
 *
 * Retour client (François Thomas, call bêta du 17/09/2026) : sur un compte que
 * le commercial connaît déjà, la moindre donnée manquante détruit la
 * confiance — produire « quelque chose » à tout prix sur ce compte est
 * exactement ce qui la détruirait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION — Louis, 18/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Un premier passage avait rendu ce point entièrement `à trancher` : ni un
 * booléen « compte connu », ni un repère « dernière visite » n'existent dans
 * le dépôt, et inventer un écran de déclaration n'était pas le mandat. Décision
 * : ON NE DEMANDE RIEN À L'UTILISATEUR, ON LE DÉDUIT — un compte est « connu »
 * s'il porte déjà une trace de l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RISQUE ASSUMÉ, ET CE QUE CE FICHIER EN FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La déduction se trompe sur un compte importé en masse et jamais travaillé :
 * il porte des contacts sans qu'on l'ait jamais approché. Une trace PASSIVE
 * (des contacts importés, une fiche créée) ne suffit donc PAS — il faut une
 * trace D'ACTIVITÉ : une mission, un contact réellement sollicité, une note
 * écrite par quelqu'un, un échange. `isAccountKnownFromTraces` ci-dessous
 * n'accepte que ces deux compteurs, jamais un nombre de contacts.
 */

/**
 * Les natures d'activité qui comptent comme une trace D'ACTIVITÉ sur un
 * compte — pas une trace passive.
 *
 * `INTERACTION_ACTIVITY_KINDS` (email/call/meeting/linkedin) est la liste
 * PARTAGÉE de « ce qui compte comme un échange avec le compte » (#1581.1,
 * `packages/contracts/src/schemas/activity.ts`) — réutilisée telle quelle
 * plutôt que recopiée (GA-26). `note` s'y ajoute : une note prise sur ce
 * compte n'est pas un échange avec quelqu'un, mais c'est un geste humain qui
 * prouve qu'on a travaillé le compte, et le brief la nomme explicitement.
 *
 * Volontairement ABSENTS : `crm_export`, `analysis`, `workflow`, `stage_change`,
 * `task`, `gate_decision`, `crm_lookup` — des gestes du PRODUIT (une analyse
 * lancée, Laura qui consulte le CRM) ou administratifs, jamais un geste humain
 * vers ce compte.
 */
export const KNOWN_ACCOUNT_ACTIVITY_KINDS = [...INTERACTION_ACTIVITY_KINDS, 'note'] as const

// Non exporté : consommé seulement dans ce fichier — `pnpm lint:exports:types`
// (knip) refuse un type exporté sans appelant hors de son propre fichier.
type AccountKnownTraces = {
  /** Missions liées au compte, TOUT statut confondu — même une seule, même
   *  terminée depuis longtemps : l'ESN a déjà travaillé ce compte. */
  missions: number
  /** Activités de {@link KNOWN_ACCOUNT_ACTIVITY_KINDS} posées sur ce compte —
   *  jamais un compte de CONTACTS, qui ne prouve qu'un import. */
  activeActivities: number
}

/**
 * #2556.1 — le prédicat, pur et testable sans base.
 *
 * Une trace PASSIVE (contacts importés, fiche créée) ne rend PAS un compte
 * « connu » : il faut une trace D'ACTIVITÉ — mission, contact réellement
 * sollicité, note écrite, échange. C'est tout l'invariant de ce fichier.
 */
export function isAccountKnownFromTraces(traces: AccountKnownTraces): boolean {
  return traces.missions > 0 || traces.activeActivities > 0
}
