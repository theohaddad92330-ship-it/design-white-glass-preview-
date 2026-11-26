import { z } from 'zod'

/**
 * Ce que Bellum a contribué (tome 1 §12).
 *
 * Le signal de churn le plus explicite du call est une phrase du bêta testeur :
 * « je vais essayer d'en enchaîner d'autres, comme ça après je pourrai garder
 * l'abonnement plus longtemps. » Un abonnement conditionné à une signature.
 *
 * LA RÈGLE, et elle porte tout le bloc : on n'écrit JAMAIS « Bellum vous a fait
 * gagner 42 000 € ». On écrit « 3 missions signées sur des comptes ouverts via
 * Découvrir ». La causalité appartient au commercial, pas à l'outil — et c'est
 * exactement ce qui distingue une attribution vérifiable d'une promesse
 * marketing que le premier client sérieux démontera.
 */
export const contributionLineSchema = z.object({
  key: z.enum(['accounts_opened', 'needs_from_signal', 'submissions_from_matching', 'missions_signed']),
  /**
   * Le comptage. Jamais un montant : voir la règle ci-dessus.
   *
   * ⚠️ `null` — et non `0` — quand la lecture n'a pas abouti. Le service rendait
   * `0` sur exception jusqu'au 29/08/2026, sur l'écran de pilotage même : « zéro
   * compte ouvert grâce à Découvrir » et « je n'ai pas pu compter » s'y
   * affichaient à l'identique. La question du dépôt, posée à chaque valeur
   * absente : *si elle manque, « 0 » est-il VRAI ?* Ici non — et un espace neuf
   * a, lui, un VRAI zéro qui mérite d'être lu. Les deux réponses existent, elles
   * ne peuvent pas partager le même chiffre.
   */
  count: z.number().int().nonnegative().nullable(),
  /**
   * Ce que ce chiffre affirme, et jusqu'où.
   *
   * `direct` — l'objet porte lui-même sa provenance (un compte marqué
   * `origin = discover`). `partial` — le lien est réel mais l'issue ne lui est
   * pas imputable : une mission signée sur un compte ouvert via Découvrir a été
   * gagnée par un commercial, pas par un outil. Les confondre transformerait un
   * fait en publicité.
   */
  attribution: z.enum(['direct', 'partial']),
})
export type ContributionLine = z.infer<typeof contributionLineSchema>

export const contributionSchema = z.object({
  lines: z.array(contributionLineSchema),
  /** Depuis quand on compte. */
  since: z.string(),
  /**
   * Les comptes dont l'origine est INCONNUE — antérieurs au marquage.
   *
   * Annoncé, jamais absorbé : un total qui les compterait comme « pas venus de
   * Découvrir » sous-estimerait la contribution, et les compter dedans
   * l'inventerait. Les dire à part est la seule lecture vraie, et c'est la même
   * discipline que les lignes non tarifées du registre de coûts.
   *
   * `null` quand la lecture échoue, pour la raison de `count` ci-dessus : les
   * afficher à `0` absorberait dans le silence ce que ce champ existe justement
   * pour ne pas absorber.
   */
  unattributedAccounts: z.number().int().nonnegative().nullable(),
})
export type Contribution = z.infer<typeof contributionSchema>
