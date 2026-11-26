import type { AccountListQuery } from '@bellum/contracts'

export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    list: (userId: string | undefined, filters: AccountListQuery) => ['accounts', 'list', userId, filters] as const,
    // #2128.34-43 — les lectures du dossier que la recherche transversale
    // réutilise. Mêmes valeurs qu'avant (écrites en dur dans chaque onglet) :
    // la recherche lit le MÊME cache, donc aucun appel de plus quand la section
    // a déjà été ouverte.
    projects: (accountId: string) => ['projects', 'by-account', accountId] as const,
    missions: (accountId: string) => ['account-missions', accountId] as const,
    capitalisation: (accountId: string) => ['capitalisation', accountId] as const,
    // #2422.4 (épopée #2869) — les contrats juridiques d'un compte.
    contracts: (accountId: string) => ['legal-contracts', accountId] as const,
    // #2422.6 (épopée #2869, lot R24 07/10/2026) — les liens de dépôt d'un contrat.
    contractUploadLinks: (accountId: string, contractId: string) =>
      ['legal-contract-upload-links', accountId, contractId] as const,
  },
  drafts: {
    byId: (key: string) => ['drafts', key] as const,
  },
} as const
