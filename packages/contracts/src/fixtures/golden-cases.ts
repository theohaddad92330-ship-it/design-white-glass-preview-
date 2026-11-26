/**
 * Les cinq cas de référence, ANONYMISÉS — LEGACY-006.
 *
 * ## Ce qu'ils sont
 *
 * Chaque cas est une SITUATION plus une liste d'affirmations qui doivent rester
 * vraies. Ils ne portent aucune donnée client : ni nom de société réelle, ni
 * personne physique, ni chiffre repris d'un dossier. Le paquet source le pose
 * comme condition (`rawClientDataIncluded: false`), et le dépôt venait de le
 * violer dans ses propres fixtures de contrat — vingt-trois dirigeants réels y
 * étaient nommés jusqu'au 25/08/2026.
 *
 * ## Ce qu'ils NE sont pas
 *
 * Ce ne sont pas des jeux d'évaluation exécutables : aucun n'appelle un modèle,
 * aucun ne produit de score. Les transformer en évaluation demanderait un run
 * réel par cas, donc une clé de production et un coût par poussée — et une
 * évaluation qui rougit parce qu'un modèle a tourné sa phrase autrement finit
 * désactivée. C'est le même arbitrage que les vingt conversations de Laura.
 *
 * Ce qu'ils apportent est ce qui manquait : un endroit où les affirmations
 * historiques sont ÉCRITES, citables, et confrontables au code par une personne.
 * Une affirmation qu'aucun texte ne porte se perd à la première réécriture.
 *
 * ## L'affirmation qui les résume toutes
 *
 * « le titre seul ne peut pas établir une priorité » — c'est l'interdit du
 * paquet, et c'est celui qu'on vérifie en premier quand un classement surprend.
 */

/** Un cas de référence : d'où il vient, ce qu'il doit rester vrai. */
export type GoldenCase = {
  readonly id: string
  /** Le cas d'origine, en une phrase — jamais le dossier lui-même. */
  readonly derivedFrom: string
  /** Ce que le produit doit continuer de faire. Chacune est vérifiable à la main. */
  readonly assertions: readonly string[]
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    id: 'small_esn_manager_system',
    derivedFrom: 'audit d’une petite ESN, anonymisé',
    assertions: [
      'le responsable voit des interventions, pas des indicateurs décoratifs',
      'un consultant peut être un capteur de relation',
      'un rituel hebdomadaire produit des actions avec un propriétaire et une date',
    ],
  },
  {
    id: 'multi_entity_bank_account',
    derivedFrom: 'paquet historique de quatre comptes, régénéré en synthétique',
    assertions: [
      'un groupe n’est pas un périmètre',
      'trois portes d’entité peuvent s’ouvrir en parallèle',
      'le fil achats reste séparé des fils métier',
    ],
  },
  {
    id: 'consultant_to_project_reverse_motion',
    derivedFrom: 'prospection inversée et push de profil',
    assertions: [
      'le secteur de mission appartient au projet, pas au consultant',
      'le matching explique ce qui colle ET ce qui manque',
      'aucun envoi sans approbation et sans destinataire vérifié',
    ],
  },
  {
    id: 'mission_revenue_protection',
    derivedFrom: 'suivi de mission',
    assertions: [
      'une date de fin déclenche le renouvellement ou le retour d’expérience',
      'une date INCONNUE ne crée jamais de fausse alerte',
      'l’issue met à jour la mission ET la timeline du compte',
    ],
  },
  {
    id: 'domain_aware_title_routing',
    derivedFrom: 'corpus des intitulés de poste et prisme industriel',
    assertions: [
      'le chemin d’un acheteur industriel diffère de celui d’un décideur informatique',
      'RH et Achats ne sont pas un premier contact sans preuve',
      'le titre seul ne peut pas établir une priorité',
    ],
  },
]

/** Un cas par son identifiant, ou `null`. */
export function goldenCase(id: string): GoldenCase | null {
  return GOLDEN_CASES.find(entry => entry.id === id) ?? null
}
