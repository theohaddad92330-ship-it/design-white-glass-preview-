import type { AccountFacts, MarketMemoryRead } from '@bellum/contracts'

/**
 * #4069.1 — ce que le lecteur des faits reçoit de la mémoire marché, sous
 * forme de JETON (GA-07 au plafond : « aucun module n'importe le SERVICE d'un
 * autre module »). Même discipline que `account-intelligence/module-tokens.ts` ;
 * la composition qui importe `MarketMemoryService` vit dans
 * `account-facts.module.ts`.
 */
export const ACCOUNT_FACTS_MARKET_READER = 'ACCOUNT_FACTS_MARKET_READER'

export type AccountFactsMarketReader = (lookup: {
  readonly ref: string
  readonly name: string
  readonly website?: string | null
  readonly country?: string | null
}) => Promise<MarketMemoryRead>

/** #4072.5 — la même lecture, GROUPÉE : une lecture par table pour tous les comptes (clé `ref`). */
export const ACCOUNT_FACTS_MARKET_MANY_READER = 'ACCOUNT_FACTS_MARKET_MANY_READER'

export type AccountFactsMarketManyReader = (
  lookups: readonly Parameters<AccountFactsMarketReader>[0][],
) => Promise<Map<string, MarketMemoryRead>>

/**
 * #4072 — la porte par laquelle les écrans d'action lisent LES faits du compte
 * (lecteur unique, #4069.1) sans importer le SERVICE d'un autre module (GA-07).
 * Fournie par `AccountFactsModule` ; les consommateurs l'injectent `@Optional()`.
 */
export const ACCOUNT_FACTS_READER = 'ACCOUNT_FACTS_READER'

export type AccountFactsReader = {
  forAccount(args: {
    workspaceId: string
    userId: string
    accountId: string
    asOf?: Date
  }): Promise<AccountFacts | null>
  /** #4072.5 — les faits de PLUSIEURS comptes, mémoire marché lue en groupe. Absent ⇒ appeler `forAccount` par compte. */
  forAccounts?(args: {
    workspaceId: string
    userId: string
    accountIds: readonly string[]
  }): Promise<Map<string, AccountFacts>>
}
