/**
 * Les stades qui veulent dire « montré à un client » (BEL-SC-239, historique de
 * présentation). `shortlisted` en sort : c'est un choix interne, personne à
 * l'extérieur ne l'a vu. `withdrawn` aussi : un profil retiré avant présentation
 * n'a rien montré.
 *
 * Fichier à part (GA-26, un réglage vit à un seul endroit ; GA-07, un service
 * n'importe pas un autre service) : `ProposalsService` et `DeliveryService`
 * (#2414.48, épopée #2986) lisent la MÊME définition de « présenté ».
 */
export const PRESENTED_SUBMISSION_STAGES = ['submitted', 'interview', 'accepted', 'rejected']
