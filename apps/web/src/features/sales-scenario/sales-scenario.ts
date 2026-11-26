/**
 * #2731.2 — UN SCÉNARIO COMMERCIAL RÉEL, JOUÉ DANS LE PRODUIT, SUR LES DONNÉES
 * DE L'ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA VISITE GUIDÉE NE FAIT PAS, ET QUE CE SCÉNARIO FAIT
 * ─────────────────────────────────────────────────────────────────────────
 * La visite (`product-tour/`) présente les ÉCRANS, un par aire, sans jamais
 * toucher une donnée : elle ne peut naviguer que vers des routes sans
 * paramètre. Le retour bêta du 22/09/2026 demande autre chose — « des
 * scénarios commerciaux simples, joués dans l'outil, qui montrent quoi faire et
 * dans quel ordre ». Le scénario tient donc un FIL MÉTIER (du compte au premier
 * contact, puis au suivi) et chaque étape ouvre l'écran sur UN objet réel de
 * l'espace : le dernier compte analysé, son interlocuteur classé premier.
 *
 * Tranché sans toi (decisions-louis-22-09-soir.md §12), version la plus
 * conservatrice : UN scénario (« préparer un premier contact »), pas un
 * catalogue ; il MONTRE et EMMÈNE, il n'écrit rien — chaque geste qui écrit
 * (préparer, envoyer, créer l'action) reste celui du commercial sur l'écran.
 * Ce n'est pas une checklist de plus (#2077) : aucune case, aucun état
 * persisté, il se relance autant qu'on veut.
 *
 * ⚠️ On n'affiche pas ce qu'on n'a pas : sans compte analysé, le scénario
 * commence par en analyser un (la recherche) et s'ARRÊTE là — aucune étape ne
 * nomme un compte ou un contact deviné. Sans interlocuteur, les deux étapes
 * « contact » sortent de la liste plutôt que de pointer vers le vide.
 */

/** Ce que l'espace porte réellement, lu par l'appelant. */
export type SalesScenarioData = {
  account: { id: string; name: string } | null
  contact: { id: string; name: string } | null
}

type SalesScenarioStepKey = 'search' | 'account' | 'contact' | 'message' | 'actions' | 'laura'

type SalesScenarioStep = {
  key: SalesScenarioStepKey
  /** Route RÉSOLUE — les identifiants sont ceux de l'espace, jamais un exemple. */
  route: string
  /** Valeurs interpolées dans le texte i18n de l'étape. */
  values: { account?: string; contact?: string }
}

export function buildSalesScenarioSteps(data: SalesScenarioData): SalesScenarioStep[] {
  const { account, contact } = data
  if (!account) return [{ key: 'search', route: '/search', values: {} }]

  const steps: SalesScenarioStep[] = [
    { key: 'account', route: `/accounts/${account.id}`, values: { account: account.name } },
  ]
  if (contact) {
    const values = { account: account.name, contact: contact.name }
    steps.push({ key: 'contact', route: `/contacts/${contact.id}`, values })
    steps.push({ key: 'message', route: `/contacts/${contact.id}`, values })
  }
  steps.push({ key: 'actions', route: '/actions', values: { account: account.name } })
  steps.push({ key: 'laura', route: '/chat', values: { account: account.name } })
  return steps
}
