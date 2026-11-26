import { z } from 'zod'

/**
 * LE COMPTEUR DE PROACTIVITÉ — ce qui protège l'utilisateur du produit
 * (PDF 6 §7, ticket BEL-AUT-503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le document le dit en une phrase : « le risque n°1 d'un produit agentique est
 * d'agacer ; sans plafond, l'utilisateur coupe tout ». Vingt-six routines
 * postent aujourd'hui des notifications, chacune raisonnable prise seule, et
 * personne ne compte le total. Le jour où elles ont toutes quelque chose à
 * dire, l'utilisateur reçoit vingt-six messages — puis il les désactive toutes,
 * y compris celles qui lui auraient fait gagner une affaire.
 *
 * Quatre décisions portent le fichier, et chacune se paie si on la prend à
 * l'envers :
 *
 * 1. **SUPPRIMER, pas mettre en file.** Une file reporte le bruit au lendemain
 *    et produit un rattrapage massif — c'est-à-dire le même problème, décalé et
 *    aggravé. Un message proactif qui n'était pas assez important aujourd'hui
 *    ne le devient pas en vieillissant.
 * 2. **Le message supprimé reste VISIBLE**, sans notification. Il n'est pas
 *    perdu : il est dans le centre d'actions, pour qui va le chercher. Ce qui
 *    est supprimé, c'est l'interruption, pas l'information.
 * 3. **Rien à dire ⇒ rien envoyé.** Jamais de « rien à signaler aujourd'hui » :
 *    un message qui ne dit rien consomme la même attention qu'un message utile,
 *    et il apprend à ne plus regarder.
 * 4. **Les échecs et les gestes de l'utilisateur ne comptent pas.** Un échec
 *    doit se voir — l'utilisateur a le droit de savoir qu'une action a raté. Et
 *    ce qu'il a lui-même déclenché répond à un geste : ça ne l'interrompt pas,
 *    ça lui répond.
 */

/** Le plafond par défaut. Le PDF dit « 2 à 3 » ; on prend 3. */
export const PROACTIVITY_DEFAULT_CAP = 3
/** Les bornes du réglage (décision D40) : en dessous de 1, le produit se tait
 *  complètement ; au-delà de 5, le plafond ne protège plus de rien.
 *
 *  ⚠️ Le tome 6 §13.2 écrit « l'utilisateur peut régler manuellement de 0 à 5 ».
 *  Le ZÉRO existe et il est tenu — mais par `laura_enabled` (D49), l'interrupteur
 *  que `canInterrupt` évalue en PREMIER, et non par une seconde valeur de ce
 *  réglage-ci. Deux façons de dire « tais-toi » se contrediraient le jour où
 *  quelqu'un règle le plafond à 0 sans couper Laura. */
export const PROACTIVITY_MIN_CAP = 1
export const PROACTIVITY_MAX_CAP = 5

/**
 * Le réglage de la personne, ramené dans ses bornes.
 *
 * Il vit ICI et nulle part ailleurs (GA-26) : `decideProactivity` bornait à
 * `[1, 5]` pendant que `canInterrupt` bornait à `[1, ∞[`, si bien qu'un
 * `proactivity_cap` de 12 écrit en base — une migration, un import, un test —
 * n'était plafonné que d'un côté. Une valeur illisible retombe sur le défaut,
 * jamais sur zéro : « je n'ai pas su lire ton réglage » n'est pas « tais-toi ».
 */
export function clampProactivityCap(cap: number): number {
  if (!Number.isFinite(cap)) return PROACTIVITY_DEFAULT_CAP
  return Math.max(PROACTIVITY_MIN_CAP, Math.min(PROACTIVITY_MAX_CAP, Math.trunc(cap)))
}

/**
 * D'où vient un message — et c'est ce qui décide s'il compte dans le plafond.
 *
 * `proactive` est le seul qui interrompt sans avoir été demandé. Les deux
 * autres sont exemptés, pour deux raisons différentes qu'il ne faut pas
 * confondre : un échec est une information que l'utilisateur a le DROIT
 * d'avoir, une réponse à son geste n'est pas une interruption.
 */
export const MESSAGE_ORIGINS = ['proactive', 'failure', 'user_triggered'] as const
export const messageOriginSchema = z.enum(MESSAGE_ORIGINS)
export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number]

/**
 * Les trois facteurs de la priorité (§7).
 *
 * Chacun sur 0-10, et leur PRODUIT donne 0-100 après normalisation. Le produit
 * et non la somme : un message sans impact business ne remonte pas parce qu'il
 * est urgent, et un message sur lequel l'utilisateur ne peut rien faire ne
 * remonte pas parce qu'il est important. Une somme laisserait passer les deux.
 */
export type PriorityFactors = {
  /** Ce que ça change pour l'affaire. 0 = rien. */
  businessImpact: number
  /** Ce que ça coûte d'attendre. 0 = rien ne presse. */
  urgency: number
  /** L'utilisateur peut-il agir MAINTENANT ? 0 = il ne peut rien faire. */
  actionability: number
}

/**
 * La priorité d'un message proactif, sur 0-100.
 *
 * Un facteur à zéro met la priorité à zéro, et c'est voulu : « rien à en
 * faire » est une raison suffisante de ne pas déranger, même si le sujet est
 * grave et pressant. C'est la différence entre informer et interrompre.
 */
export function messagePriority(factors: PriorityFactors): number {
  const clamp = (value: number): number => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(10, value))
  }
  const product = clamp(factors.businessImpact) * clamp(factors.urgency) * clamp(factors.actionability)
  // 10 × 10 × 10 = 1000 ramené à 100.
  return Math.round(product / 10)
}

/**
 * #2403.24 — PRÉFÉRENCE : réduit le CLASSEMENT d'une intervention que
 * l'utilisateur a RÉELLEMENT refusée plusieurs fois, sans jamais la SILENCER
 * ni changer la formule de {@link messagePriority} elle-même.
 *
 * Distincte des deux mécanismes qui bloquent déjà un retour : le cooldown par
 * clé (#2403.37, vingt-quatre heures) et le refus explicite (§5.7, trente
 * jours sauf aggravation matérielle de la priorité). Ces deux-là EMPÊCHENT le
 * retour. PRÉFÉRENCE agit seulement APRÈS qu'une intervention a déjà repassé
 * ces deux portes — elle la fait alors concourir à armes inégales avec ce que
 * l'utilisateur n'a jamais refusé, plutôt que de la traiter à égalité comme
 * si son historique n'existait pas.
 *
 * `refusalCount` = 0 (l'immense majorité des clés, jour 1) ⇒ multiplicateur
 * 1, comportement STRICTEMENT inchangé. C'est ce qui évite le risque nommé
 * à plusieurs reprises par les tours précédents sur ce même fichier :
 * recalculer le classement de TOUT le catalogue (~30 interventions) au
 * moment où une seule clé apprend un premier refus. Ici, seule la clé
 * effectivement refusée voit sa priorité bouger — jamais ses voisines.
 *
 * Les deux constantes sont un choix d'ALGORITHME (une pente et un plancher de
 * classement), documenté ici, tranché sans Louis (#2995) — pas une donnée
 * produit inventée : aucune valeur de catalogue n'est authored, tout part
 * d'un COMPTE RÉEL de réactions `refused` déjà enregistrées.
 */
export const PREFERENCE_DISCOUNT_PER_REFUSAL = 0.15
export const PREFERENCE_MIN_MULTIPLIER = 0.25

export function applyPreferenceDiscount(priority: number, refusalCount: number): number {
  if (!Number.isFinite(refusalCount) || refusalCount <= 0) return priority
  const multiplier = Math.max(PREFERENCE_MIN_MULTIPLIER, 1 - refusalCount * PREFERENCE_DISCOUNT_PER_REFUSAL)
  return Math.round(priority * multiplier)
}

/**
 * #2403.22 (épopée #2995) — FRÉQUENCE : réduit le CLASSEMENT d'une
 * intervention déjà OFFERTE plusieurs fois récemment, sans jamais toucher
 * {@link messagePriority} elle-même.
 *
 * Distincte de {@link applyPreferenceDiscount} (PRÉFÉRENCE, #2403.24), qui
 * compte les REFUS réels : FRÉQUENCE compte les OFFRES, refusées ou non — une
 * clé qu'on n'a fait que revoir souvent, sans jamais l'avoir refusée, use
 * quand même un peu d'attention à chaque réapparition. Trois passages
 * précédents sur ce même fichier ont écarté un 4ᵉ FACTEUR de
 * {@link messagePriority} pour cette même raison : le produit est PARTAGÉ par
 * les ~30 interventions du catalogue, et l'étendre aurait recalculé le
 * classement de TOUT le catalogue au moment où une seule clé apprend sa
 * première offre. Le précédent posé par PRÉFÉRENCE — un post-traitement
 * APRÈS le produit, jamais dedans — s'applique à l'identique ici.
 *
 * `offeredCount` = 0 (l'immense majorité des clés, ou toute clé dans sa
 * fenêtre de lecture) ⇒ multiplicateur 1, comportement STRICTEMENT inchangé.
 *
 * Les deux constantes sont un choix d'ALGORITHME (une pente plus douce que
 * PRÉFÉRENCE — être vu souvent est un signal plus faible qu'être refusé — et
 * un plancher plus haut), tranché sans Louis (#2995) : aucune valeur de
 * catalogue n'est authored, tout part d'un COMPTE RÉEL d'offres déjà
 * enregistrées.
 */
export const FREQUENCY_DISCOUNT_PER_OFFER = 0.05
export const FREQUENCY_MIN_MULTIPLIER = 0.5

export function applyFrequencyDiscount(priority: number, offeredCount: number): number {
  if (!Number.isFinite(offeredCount) || offeredCount <= 0) return priority
  const multiplier = Math.max(FREQUENCY_MIN_MULTIPLIER, 1 - offeredCount * FREQUENCY_DISCOUNT_PER_OFFER)
  return Math.round(priority * multiplier)
}

/**
 * #2319.118 (épopée #2985, 28/09/2026, décision Louis `SOURCES-28-09.md` : un
 * point classé A — donnée absente — n'est plus un reste, on ajoute la
 * source) — la PONDÉRATION À PORTÉE ESPACE, distincte de
 * {@link applyPreferenceDiscount} (PRÉFÉRENCE, une seule personne).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE SIX TOURS CONSÉCUTIFS (25→28/09) ONT VÉRIFIÉ AVANT CETTE FONCTION
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun mécanisme de pondération à portée `workspace` n'existait nulle part
 * dans ce dépôt (`git grep` répété, cinq fois, sur `apps/api`/`apps/ia`/
 * `packages/contracts`), et le candidat le plus proche
 * (`MessageStyleService`) s'est révélé un détournement catégoriel — il
 * analyse des MESSAGES envoyés, pas des retours accepté/refusé. Ce que ce
 * lot construit est donc une INFRA neuve, pas un réglage manquant sur un
 * mécanisme existant : le SEUL retour accepté/refusé RÉELLEMENT déjà
 * journalisé, à portée `workspace`, est `laura_interventions.reaction` — le
 * même journal que {@link applyPreferenceDiscount} lit déjà, PERSONNE PAR
 * PERSONNE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PENTE PLUS DOUCE, ET UN PLANCHER PLUS HAUT
 * ─────────────────────────────────────────────────────────────────────────
 * Même raisonnement que FRÉQUENCE face à PRÉFÉRENCE (voir sa doc juste
 * au-dessus) : le refus d'UNE personne dit quelque chose de FORT sur son
 * propre jugement ; le refus agrégé de PLUSIEURS personnes d'un même espace
 * dit quelque chose de plus faible sur chacune d'elles prise seule — deux
 * commerciaux ne travaillent pas le même portefeuille, et l'un peut refuser
 * une clé qui reste pertinente pour l'autre. La pondération espace ne doit
 * donc jamais aller AUSSI loin qu'un refus personnel répété.
 *
 * `refusalCount` = 0 (comportement STRICTEMENT inchangé, la majorité des
 * clés) ⇒ multiplicateur 1. GA-43 tient l'isolation : `refusalCount` doit
 * TOUJOURS venir d'un COMPTE borné à UN SEUL `workspace_id`, jamais agrégé
 * entre espaces (deux ESN sont des concurrents) — c'est à l'appelant de le
 * garantir en base (`WHERE workspace_id = $1`), cette fonction ne fait que le
 * calcul pur sur le compte qu'on lui donne.
 */
export const WORKSPACE_PREFERENCE_DISCOUNT_PER_REFUSAL = 0.05
export const WORKSPACE_PREFERENCE_MIN_MULTIPLIER = 0.6

export function applyWorkspacePreferenceDiscount(priority: number, refusalCount: number): number {
  if (!Number.isFinite(refusalCount) || refusalCount <= 0) return priority
  const multiplier = Math.max(
    WORKSPACE_PREFERENCE_MIN_MULTIPLIER,
    1 - refusalCount * WORKSPACE_PREFERENCE_DISCOUNT_PER_REFUSAL,
  )
  return Math.round(priority * multiplier)
}

export const proactiveCandidateSchema = z.object({
  /** Ce qui identifie le message — la routine, la règle, l'objet. */
  key: z.string().min(1),
  origin: messageOriginSchema,
  priority: z.number().int().min(0).max(100),
})
export type ProactiveCandidate = z.infer<typeof proactiveCandidateSchema>

export type ProactivityVerdict = {
  /** Ce qui part en notification, du plus prioritaire au moins. */
  notify: ProactiveCandidate[]
  /**
   * Ce qui est SUPPRIMÉ — visible dans le centre d'actions, sans notification.
   * Jamais mis en file : demain a ses propres messages.
   */
  suppressed: ProactiveCandidate[]
  /** Combien de places restaient au moment du calcul. */
  remaining: number
}

/**
 * Décide ce qui interrompt et ce qui se tait.
 *
 * L'ordre des règles est l'ordre de l'honnêteté :
 *
 *  - les **exemptés** passent toujours et ne consomment aucune place. Les faire
 *    entrer dans le plafond ferait taire un échec parce que trois conseils sont
 *    passés avant lui ;
 *  - une priorité **nulle** ne notifie jamais, même s'il reste de la place :
 *    le plafond est un maximum, pas un quota à remplir ;
 *  - le reste passe par priorité décroissante, jusqu'au plafond, et **ce qui
 *    dépasse est supprimé**.
 *
 * `alreadySentToday` porte ce qui a déjà interrompu l'utilisateur aujourd'hui :
 * le plafond est journalier, pas par appel.
 */
export function decideProactivity(
  candidates: readonly ProactiveCandidate[],
  options: { cap: number; alreadySentToday: number },
): ProactivityVerdict {
  const cap = clampProactivityCap(options.cap)
  const exempt = candidates.filter(candidate => candidate.origin !== 'proactive')
  const proactive = candidates
    .filter(candidate => candidate.origin === 'proactive')
    // Une priorité nulle ne dérange personne : « rien à en faire » suffit à se
    // taire, quelle que soit la place restante.
    .filter(candidate => candidate.priority > 0)
    .slice()
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))

  const remaining = Math.max(0, cap - Math.max(0, options.alreadySentToday))
  return {
    notify: [...exempt, ...proactive.slice(0, remaining)],
    suppressed: [
      ...proactive.slice(remaining),
      // Une priorité nulle est supprimée elle aussi : visible, jamais notifiée.
      ...candidates.filter(candidate => candidate.origin === 'proactive' && candidate.priority === 0),
    ],
    remaining,
  }
}
