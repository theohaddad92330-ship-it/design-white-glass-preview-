/**
 * #2427.10 — LE SIGNAL « LAURA A DIT STOP », PARTAGÉ ENTRE SURFACES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS un second budget d'interruption, et ce n'est PAS une nouvelle
 * porte vers `/laura/*` : `useLaura` reste la seule (GA-39/GA-237). Ce module
 * ne calcule rien — il RELAIE un verdict déjà rendu par le serveur
 * (`isInterruptionSilenced`, `interruption-budget.ts`) et déjà lu par
 * `useLaura` à chaque réponse de `/laura/plan`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `LauraCard` est montée globalement (`routes/__root.tsx`) et demande donc son
 * plan pour CHAQUE écran, `/chat` compris — y compris quand elle n'a rien à
 * afficher. `lauraOpener` (Chat.tsx), lui, compose sa phrase localement, sans
 * jamais interroger le serveur : c'est voulu (aucun appel au modèle, aucun
 * message du plafond quotidien consommé). Mais ce choix avait un angle mort —
 * il ne savait pas non plus si l'utilisateur avait COUPÉ Laura (D49) ou si elle
 * était EN RETRAIT après plusieurs fermetures sans lecture (§5.3) : deux façons
 * de dire « arrête », que `isInterruptionSilenced` existe précisément pour
 * reconnaître sur n'importe quel canal, écran ou pas (voir #1938.13 dans
 * `interruption-budget.ts`).
 *
 * `useLaura` écrit ici ce qu'il vient d'apprendre ; `lauraOpener` le lit avant
 * de parler. Aucun nouvel appel réseau : la carte demandait déjà cette réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPLI, COMME PARTOUT DANS CE BUDGET
 * ─────────────────────────────────────────────────────────────────────────────
 * La valeur de repos est `false` (pas silencieuse). Tant qu'aucune surface n'a
 * encore reçu de plan — ou si `LauraCard` n'a pas encore répondu quand le
 * minuteur de l'amorce expire — l'amorce parle. « Le repli laisse PASSER » :
 * mieux vaut une amorce de trop qu'une assistante qui semble muette pour une
 * mauvaise raison.
 */
let silenced = false

/** Écrit par `useLaura`, à chaque réponse de `/laura/plan`. */
export function setLauraSilenced(value: boolean): void {
  silenced = value
}

/** Lu par `lauraOpener` (Chat.tsx) juste avant de parler. */
export function isLauraSilenced(): boolean {
  return silenced
}
