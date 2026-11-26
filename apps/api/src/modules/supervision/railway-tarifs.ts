/**
 * TARIFS RAILWAY — UN seul endroit (un réglage vit à un seul endroit, GA-26).
 * Sert au coût mensuel ESTIMÉ par service de l'onglet « Railway » de la
 * supervision : moyenne de la fenêtre × tarif public. Ce n'est PAS la facture.
 * Réseau et disque ne sont pas évalués. Mettre à jour la `source` en changeant
 * un tarif.
 */
export const TARIFS_RAILWAY = {
  /** USD par vCPU et par mois. */
  vcpuParMois: 20,
  /** USD par Go de mémoire et par mois. */
  goMemParMois: 10,
  source: 'railway.com/pricing (Pro), relevé 30/09/2026',
} as const
