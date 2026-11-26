import { type MarketSignalDate, decideMarketSignalDate } from '@bellum/contracts'

/**
 * #2288.2 — DES LIGNES SQL À UNE DATE PAR ENTREPRISE, SANS RIEN DÉCIDER ICI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne tranche RIEN. La règle — date exacte pour mon espace, mois pour ce qui
 * vient d'ailleurs et seulement au-dessus du seuil, aucune date en dessous —
 * vit dans `decideMarketSignalDate` (`@bellum/contracts`), et c'est le SEUL
 * endroit où elle vit (GA-26). Ce fichier fait la seule chose que la fonction
 * pure ne peut pas faire : regrouper les lignes que le SQL rend, entreprise par
 * entreprise, et n'inscrire au résultat que ce qui a une date.
 *
 * ⚠️ Il ne s'appelle pas `*.service.ts` à dessein, comme `portfolio-lookups.ts`
 * juste à côté : c'est une mise en forme pure, elle n'injecte rien et ne lit
 * rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE RÉSULTAT EST UNE TABLE CREUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une entreprise sans date n'a PAS d'entrée. Pas une entrée à `null`, pas une
 * entrée « non daté » : l'appelant lit `get(key)` et obtient `undefined`, ce
 * qui se rend « aucun signal actuel ». Une entrée vide finirait par se rendre
 * comme une date connue mais manquante — c'est le « 0 » de la doctrine, sous
 * une autre forme.
 */
export function marketSignalDatesByKey(input: {
  /** Clé d'entreprise du corpus → identifiant du compte de MON espace. */
  readonly accountByKey: ReadonlyMap<string, string>
  /**
   * Les observations datées lues à travers les espaces, rattachées au compte de
   * MON espace par le SIREN. `workspaceId` ne sert QU'À COMPTER et ne ressort
   * jamais du résultat.
   */
  readonly rows: readonly {
    readonly accountId: string
    readonly workspaceId: string
    readonly observedAt: string | null
  }[]
  readonly askingWorkspaceId: string
  /** MON espace partage-t-il ? Décoché par défaut — réciprocité. */
  readonly contributes: boolean
}): ReadonlyMap<string, MarketSignalDate> {
  const byAccount = new Map<string, { workspaceId: string; observedAt: string | null }[]>()
  for (const row of input.rows) {
    const accountId = (row?.accountId ?? '').trim()
    if (!accountId) continue
    byAccount.set(accountId, [
      ...(byAccount.get(accountId) ?? []),
      { workspaceId: row.workspaceId, observedAt: row.observedAt },
    ])
  }

  const dates = new Map<string, MarketSignalDate>()
  for (const [companyKey, accountId] of input.accountByKey) {
    const observations = byAccount.get(accountId)
    if (!observations) continue
    const decided = decideMarketSignalDate({
      observations,
      askingWorkspaceId: input.askingWorkspaceId,
      contributes: input.contributes,
    })
    if (decided) dates.set(companyKey, decided)
  }
  return dates
}
