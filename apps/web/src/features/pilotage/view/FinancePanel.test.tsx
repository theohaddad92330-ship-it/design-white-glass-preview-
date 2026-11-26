import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCSV } from '@/lib/export-csv'

/** L'arbre de routes que CE navigateur connaît — voir `quality/lib/destinations`. */
let routesByPath: Record<string, unknown> = { '/missions': true }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

/**
 * Le défaut que ce panneau corrige n'est pas un calcul faux : c'est un calcul
 * JUSTE que personne ne voit. Cinq endpoints financiers, testés, portant chacun
 * leur discipline d'honnêteté — et zéro appelant.
 *
 * Ces tests gardent les deux propriétés qui comptent : le panneau MONTE (une
 * garde « au moins un appelant » ne dit rien de ce qui manque), et il distingue
 * « pas le droit » de « pas de chiffre ».
 */
const revenue = vi.fn()
const forecast = vi.fn()
const capacity = vi.fn()
const margin = vi.fn()
const dso = vi.fn()
const channels = vi.fn()

/**
 * `useRevenue` et `useAggregateMargin` transmettent maintenant `month` : le
 * delta période/période (manque n°2) appelle les DEUX hooks une seconde fois,
 * avec le mois précédent. Les tests qui ne posent pas `month` continuent de
 * recevoir le même mock arg-indépendant qu'avant (`mockReturnValue`) ; ceux du
 * delta lisent l'argument via `mockImplementation`.
 */
/**
 * ⚠️ DEUX modules moqués depuis le 01/09/2026, et la coupure n'est pas
 * arbitraire : les QUATRE lectures qui savent recevoir une SOCIÉTÉ passent
 * désormais par `features/pilotage/api` (leur clé de cache doit porter la
 * société), les DEUX qui en sont aveugles — la capacité et le délai de paiement
 * — gardent leurs hooks d'origine. Moquer les six au même endroit masquerait
 * précisément cette frontière.
 */
vi.mock('@/features/missions/api', () => ({
  useCapacity: () => capacity(),
  useDso: () => dso(),
}))

vi.mock('../api', () => ({
  useDashboardRevenue: (month?: string, entity?: unknown) => revenue(month, entity),
  useDashboardForecast: (entity?: unknown) => forecast(entity),
  useDashboardMargin: (month?: string, entity?: unknown) => margin(month, entity),
  useDashboardChannels: (month?: string, entity?: unknown) => channels(month, entity),
}))

const { FinancePanel } = await import('./FinancePanel')

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false })
const denied = () => ({ data: undefined, isLoading: false, isError: true })

function wrap(month?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FinancePanel month={month} />
    </QueryClientProvider>,
  )
}

describe('FinancePanel', () => {
  it('affiche les QUATRE chiffres d’affaires sans jamais les additionner', () => {
    revenue.mockReturnValue(
      ok({
        periodMonth: '2026-07-01',
        lines: [
          { kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null },
          { kind: 'produced', amountCents: 98_000_00, withoutAmount: 2, unavailableReason: null },
          { kind: 'invoiced', amountCents: null, withoutAmount: 0, unavailableReason: 'aucune facture' },
          { kind: 'collected', amountCents: 41_000_00, withoutAmount: 0, unavailableReason: null },
        ],
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    capacity.mockReturnValue(
      ok({ periodMonth: '2026-08-01', capacityDays: null, committedDays: null, availableDays: null, unmeasured: 3 }),
    )
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 4, threshold: null, alerts: [] }))
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 3, required: 10 }, undatable: 0 }),
    )
    channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))

    wrap()
    // Les quatre lignes portent leur propre libellé : aucun total n'apparaît.
    for (const label of ['Signé', 'Produit', 'Facturé', 'Encaissé']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // #3709 — « Encaissé » nomme sa période et sa source à côté du chiffre.
    expect(screen.getByText('sur juillet 2026 · source : suivi de facturation')).toBeTruthy()
  })

  it('un chiffre absent est « non mesuré », jamais un zéro', () => {
    revenue.mockReturnValue(
      ok({
        periodMonth: '2026-07-01',
        lines: [{ kind: 'signed', amountCents: null, withoutAmount: 0, unavailableReason: null }],
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    capacity.mockReturnValue(
      ok({ periodMonth: '2026-08-01', capacityDays: null, committedDays: null, availableDays: null, unmeasured: 0 }),
    )
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, threshold: null, alerts: [] }))
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 0, required: 10 }, undatable: 0 }),
    )
    channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))

    const { container } = wrap()
    expect(container.textContent).toContain('non mesuré')
    // « 0 jour à vendre » se lirait « tout le monde est staffé ».
    expect(container.textContent).not.toContain('0 jour')
  })

  // #3483 / #3550.3 — recette 02/10 : 16 cellules « non mesuré » nues. Dans une liste, une absence sans
  // raison à dire ne fait aucune ligne (doctrine 20/09) ; la capacité absente n'écrit ni libellé ni tiret.
  it('#3483 — une ligne absente SANS raison n’écrit rien : ni « non mesuré » nu, ni libellé orphelin', () => {
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [] }))
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    capacity.mockReturnValue(
      ok({ periodMonth: '2026-08-01', capacityDays: null, committedDays: null, availableDays: null, unmeasured: 0 }),
    )
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, threshold: null, alerts: [] }))
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 0, required: 10 }, undatable: 0 }),
    )
    channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))

    wrap()
    // La capacité n'a aucune raison à dire (`note={null}`) : ses jours absents ne font pas de ligne.
    expect(screen.queryByText('Jours disponibles au total')).toBeNull()
    expect(screen.queryByText('Jours déjà engagés')).toBeNull()
  })

  it('sans finance:read, le DIT au lieu d’afficher un panneau vide', () => {
    for (const query of [revenue, forecast, capacity, margin, dso, channels]) query.mockReturnValue(denied())
    const { container } = wrap()
    expect(container.textContent).toContain('périmètre finance')
  })

  it('le prévisionnel traite l’absence comme la carte d’à côté (recette du 27/08)', () => {
    // Deux cartes du MÊME bloc disaient deux choses opposées : « Chiffre
    // d'affaires » écrivait « non mesuré · ce n'est pas « zéro euro » », et
    // « Prévisionnel » écrivait « 580 lignes sans montant — le total est un
    // plancher » à côté de **0 €**. Quand 100 % des lignes sont sans montant, il
    // n'y a aucun plancher mesuré.
    for (const query of [revenue, capacity, margin, dso, channels]) query.mockReturnValue(denied())
    forecast.mockReturnValue(
      ok({
        months: [],
        lines: [
          // Aucune ligne chiffrée : le serveur rend `null`, l'écran dit pourquoi.
          { kind: 'hoped', amountCents: null, withoutAmount: 580, count: 580 },
          // Au moins une chiffrée : le plancher reste, mot pour mot.
          { kind: 'secured', amountCents: 4_500_000, withoutAmount: 2, count: 7 },
        ],
      }),
    )
    const { container } = wrap()

    expect(container.textContent).toContain('non mesuré')
    expect(container.textContent).toContain('580 lignes existent, aucune ne porte de montant')
    // Le plancher n'est PAS annoncé sur une ligne qui n'en a pas.
    expect(container.textContent).not.toContain('580 lignes sans montant')
    // …et il l'est toujours sur celle qui en a un.
    expect(container.textContent).toContain('2 lignes sans montant — le total est un plancher')
  })

  it('le délai de paiement dit ce qu’il lui manque, plutôt que de se taire', () => {
    revenue.mockReturnValue(denied())
    forecast.mockReturnValue(denied())
    capacity.mockReturnValue(denied())
    margin.mockReturnValue(denied())
    channels.mockReturnValue(denied())
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 3, required: 10 }, undatable: 0 }),
    )
    channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))
    const { container } = wrap()
    expect(container.textContent).toContain('3 factures sur les 10')
  })

  it('chiffre le coût de l’intermédiation, ou dit qu’il lui manque un terme', () => {
    // Le chiffre qui justifie un chantier de référencement d'un an. Comparer une
    // valeur réelle à une valeur absente donnerait un écart inventé.
    for (const query of [revenue, forecast, capacity, margin, dso]) query.mockReturnValue(denied())
    channels.mockReturnValue(
      ok({
        periodMonth: '2026-07-01',
        byChannel: [
          { channel: 'direct', marginPercent: 40, missions: 3, unmeasured: 0 },
          { channel: 'partner', marginPercent: null, missions: 0, unmeasured: 2 },
          { channel: 'subcontracting', marginPercent: null, missions: 0, unmeasured: 0 },
          { channel: 'unknown', marginPercent: null, missions: 0, unmeasured: 0 },
        ],
        intermediationCost: null,
      }),
    )
    const { container } = wrap()
    expect(container.textContent).toContain('40 %')
    expect(container.textContent).toContain('il manque une des deux marges')
    // Les missions non chiffrées sont COMPTÉES, jamais absorbées.
    expect(container.textContent).toContain('2 missions non chiffrées')
  })
})

describe('FinancePanel — les deux portées (D1 · 26/08)', () => {
  const OWN = { kind: 'own' as const, outsideAnyPortfolio: 3 }

  it('DIT quand il ne montre qu’un périmètre', () => {
    // Sur un espace où rien n'est attribué, une portée restreinte rend « 0 € »,
    // et « 0 € » se lit « je n'ai rien vendu » alors que la vérité est « rien ne
    // m'est rattaché ».
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [], scope: OWN }))
    forecast.mockReturnValue(ok({ months: [], lines: [], scope: OWN }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [], scope: OWN }))
    capacity.mockReturnValue(denied())
    dso.mockReturnValue(denied())
    channels.mockReturnValue(denied())
    wrap()
    expect(screen.getByText(/Ton périmètre/)).toBeInTheDocument()
    expect(screen.getByText(/3 missions ne sont rattachées à personne/)).toBeInTheDocument()
  })

  it('dit « réservé aux responsables » et non « indisponible » sur les trois blocs d’espace', () => {
    // Un droit manquant et une panne appellent deux gestes différents.
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [], scope: OWN }))
    forecast.mockReturnValue(ok({ months: [], lines: [], scope: OWN }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [], scope: OWN }))
    capacity.mockReturnValue(denied())
    dso.mockReturnValue(denied())
    channels.mockReturnValue(denied())
    wrap()
    expect(screen.getAllByText(/Réservé aux responsables/)).toHaveLength(3)
  })

  it('ne dit RIEN de la portée à un responsable — un bandeau permanent cesse d’être lu', () => {
    const ALL = { kind: 'workspace' as const, outsideAnyPortfolio: null }
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [], scope: ALL }))
    forecast.mockReturnValue(ok({ months: [], lines: [], scope: ALL }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [], scope: ALL }))
    capacity.mockReturnValue(
      ok({ periodMonth: '2026-08-01', capacityDays: null, committedDays: null, availableDays: null, unmeasured: 0 }),
    )
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 0, required: 10 }, undatable: 0 }),
    )
    channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))
    wrap()
    expect(screen.queryByText(/Ton périmètre/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Réservé aux responsables/)).not.toBeInTheDocument()
  })

  it('ne compte RIEN quand aucune mission n’est orpheline', () => {
    revenue.mockReturnValue(
      ok({ periodMonth: '2026-07-01', lines: [], scope: { kind: 'own', outsideAnyPortfolio: 0 } }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [] }))
    capacity.mockReturnValue(denied())
    dso.mockReturnValue(denied())
    channels.mockReturnValue(denied())
    wrap()
    expect(screen.getByText(/Ton périmètre/)).toBeInTheDocument()
    expect(screen.queryByText(/rattachée à personne/)).not.toBeInTheDocument()
  })
})

/**
 * Les missions orphelines MÈNENT aux missions ; le droit manquant, à rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI PORTE CE BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * « 3 missions ne sont rattachées à personne » compte des OBJETS : ils existent,
 * ils s'ouvrent, et sans chemin vers eux la phrase est un reproche sans suite.
 *
 * « Ces chiffres relèvent du périmètre finance » ne compte rien du tout : c'est
 * un DROIT manquant. Aucun écran ne répare un droit — `/settings/team` gère les
 * MEMBRES, pas les portées — et un bouton qui mène à un écran incapable d'agir
 * est pire qu'un chiffre nu. La phrase reste donc nue, et c'est une décision.
 */
describe('FinancePanel — ce qui mène quelque part, et ce qui ne doit mener nulle part', () => {
  const OWN = { kind: 'own' as const, outsideAnyPortfolio: 3 }

  beforeEach(() => {
    routesByPath = { '/missions': true }
  })

  function withScope() {
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [], scope: OWN }))
    forecast.mockReturnValue(ok({ months: [], lines: [], scope: OWN }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [], scope: OWN }))
    capacity.mockReturnValue(denied())
    dso.mockReturnValue(denied())
    channels.mockReturnValue(denied())
  }

  it('les missions rattachées à personne ouvrent la liste des missions', () => {
    withScope()
    wrap()

    const orphans = screen.getByRole('link', { name: /3 missions ne sont rattachées à personne/ })
    expect(orphans).toHaveAttribute('href', '/missions')
    expect(orphans.getAttribute('aria-label')).toContain('ouvrir la liste')
  })

  it('ne rend AUCUN lien mort quand ce navigateur ignore `/missions`', () => {
    routesByPath = { '/accounts': true }
    withScope()
    wrap()

    // Le comptage reste, le lien disparaît.
    expect(screen.getByText(/3 missions ne sont rattachées à personne/)).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('le droit manquant reste NU — aucun écran ne répare une portée', () => {
    for (const query of [revenue, forecast, capacity, margin, dso, channels]) query.mockReturnValue(denied())
    const { container } = wrap()

    expect(container.textContent).toContain('périmètre finance')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

/**
 * LA TUILE DIT SUR QUOI ELLE PORTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le DSO écarte les factures CONTESTÉES, et c'est juste — « un litige n'est pas
 * un retard » : le temps qu'une facture contestée met à être réglée mesure la
 * durée d'une négociation, pas la ponctualité d'un client. Mais il les écartait
 * **en silence**, et une médiane muette sur ce qu'elle a sorti ment dans les
 * deux sens : la garder gonflerait le délai alors que le client n'a rien à payer
 * tant que le litige dure, et la sortir sans le dire cache de l'argent qui ne
 * rentre pas.
 *
 * Les mal datées étaient déjà comptées. Les contestées ne l'étaient pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX POPULATIONS QUI NE SE CONFONDENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « non datable » = on ne sait pas QUAND elle a été payée.
 * « contestée »   = le client conteste, et le temps ne court pas pareil.
 * Les fondre ferait disparaître la seule des deux qui coûte de l'argent.
 */
describe('FinancePanel — le délai de paiement NOMME ce qu’il a écarté', () => {
  function onlyDso(data: unknown) {
    for (const query of [revenue, forecast, capacity, margin, channels]) query.mockReturnValue(denied())
    dso.mockReturnValue(ok(data))
  }

  it('compte les factures contestées, à côté du chiffre', () => {
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 3 })
    const { container } = wrap()
    expect(container.textContent).toContain('3 factures contestées')
  })

  it('ne fond PAS les deux exclusions — elles se lisent toutes les deux', () => {
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 2, disputed: 3 })
    const { container } = wrap()
    expect(container.textContent).toContain('2 factures écartées faute de dates')
    expect(container.textContent).toContain('3 factures contestées')
  })

  it('dit ce qu’il a écarté MÊME quand le chiffre n’est pas mesurable', () => {
    // C'est le cas le plus fréquent au démarrage, et c'était le plus muet : la
    // raison du « non mesurable » chassait l'aveu de ce qui avait été sorti.
    onlyDso({ days: null, measurability: { measurable: false, observed: 3, required: 10 }, undatable: 0, disputed: 4 })
    const { container } = wrap()
    expect(container.textContent).toContain('3 factures sur les 10')
    expect(container.textContent).toContain('4 factures contestées')
  })

  it('« aucune contestée » est une MESURE, et se dit', () => {
    // Zéro facture en litige est une vraie information : elle dit que la
    // médiane porte sur TOUT le portefeuille payé. La taire laisserait croire
    // que la question n'a pas été posée.
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 0 })
    const { container } = wrap()
    expect(container.textContent).toContain('aucune facture contestée')
  })

  it('« pas su compter » ne s’affiche JAMAIS « 0 »', () => {
    // Les deux appellent des gestes opposés : l'un ne demande rien, l'autre
    // demande de réessayer. `0` sur une lecture ratée dirait « rien à
    // signaler » (GA-18/GA-19).
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: null })
    const { container } = wrap()
    expect(container.textContent).toContain('non comptées')
    expect(container.textContent).not.toContain('aucune facture contestée')
    expect(container.textContent).not.toContain('0 facture contestée')
  })

  it('la mesure SAIT bouger : le compte affiché suit la donnée, il n’est pas écrit en dur', () => {
    // Contrôle négatif — une garde qui ne peut pas faire bouger ce qu'elle
    // observe n'observe rien.
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 7 })
    const { container } = wrap()
    expect(container.textContent).toContain('7 factures contestées')
    expect(container.textContent).not.toContain('3 factures contestées')
  })

  it('une seule contestée se dit au SINGULIER', () => {
    // Une clé sans forme plurielle vient de faire afficher « 1 crédits ».
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 1 })
    const { container } = wrap()
    expect(container.textContent).toContain('1 facture contestée')
    expect(container.textContent).not.toContain('1 factures contestées')
  })

  /**
   * ⚠️ AUCUN LIEN SUR CE COMPTEUR, ET C'EST UNE DÉCISION — PAS UN OUBLI.
   *
   * La règle du dépôt est qu'un compteur qui NOMME une population l'OUVRE :
   * « 3 missions rattachées à personne » mène à `/missions`, quelques lignes
   * plus haut dans ce même fichier.
   *
   * Elle ne peut pas être tenue ici, et il vaut mieux l'écrire que la simuler.
   * Le DSO porte sur TOUT l'historique payé ; le seul écran où une facture
   * contestée se voit est `/missions/facturation`, qui appelle
   * `useInvoiceReadiness()` SANS mois et n'affiche donc qu'UN mois — celui que
   * le serveur choisit. Une facture contestée réglée il y a huit mois n'y est
   * pas. Le lien mènerait à un écran où les factures annoncées n'apparaissent
   * pas : c'est exactement le « lien mort » que `quality/lib/destinations`
   * existe pour empêcher, et le fichier le dit — « un lien mort est pire qu'une
   * absence de lien, il fait douter de tout le reste de la liste ».
   *
   * Le compte reste donc NU, comme le droit manquant plus haut, jusqu'à ce que
   * `/missions/facturation` sache s'ouvrir sur une population (un paramètre de
   * recherche, hors du périmètre de ce lot). Ce test PINGLE la décision pour
   * qu'elle se re-discute plutôt que de se perdre.
   */
  it('ne rend AUCUN lien mort : aucun écran ne liste les contestées sur tout l’historique', () => {
    onlyDso({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 3 })
    const { container } = wrap()

    // Le comptage est là…
    expect(container.textContent).toContain('3 factures contestées')
    // …et il ne promet aucune porte qui n'existe pas.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

/**
 * LES CIBLES DU PDF 5 §13.3 — ce qui transforme une mesure en décision.
 *
 * L'écran refusait toute couleur d'alerte, et il avait raison de le faire :
 * « l'orange dit "c'est mauvais". Mauvais par rapport à quoi ? Une couleur
 * d'alerte suppose un objectif, et l'objectif n'est pas tranché. » Pour ces
 * quatre lignes-là, il l'est — la source le chiffre. Ces tests gardent les trois
 * choses qui font qu'une cible aide au lieu de nuire.
 */
describe('FinancePanel — les cibles chiffrées', () => {
  function onlyMargin(data: unknown) {
    for (const query of [revenue, forecast, capacity, dso, channels]) query.mockReturnValue(denied())
    margin.mockReturnValue(ok(data))
  }

  it('le délai de paiement porte sa cible, et dit de quel côté il tombe', () => {
    for (const query of [revenue, forecast, capacity, margin, channels]) query.mockReturnValue(denied())
    dso.mockReturnValue(
      ok({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 0 }),
    )
    const { container } = wrap()
    expect(container.textContent).toContain('< 65 j')
    expect(container.textContent).toContain('dans la cible')
  })

  it('un DSO non mesurable n’est PAS « dans la cible » — le piège du lot', () => {
    // Un délai inconnu traité comme zéro passerait « < 65 j » haut la main et
    // s'afficherait vert : « on est payé le jour même », sur un espace où l'on
    // ne sait rien. C'est le mensonge le plus coûteux que cet écran puisse dire.
    for (const query of [revenue, forecast, capacity, margin, channels]) query.mockReturnValue(denied())
    dso.mockReturnValue(
      ok({ days: null, measurability: { measurable: false, observed: 3, required: 10 }, undatable: 0, disputed: 0 }),
    )
    const { container } = wrap()
    expect(container.textContent).toContain('< 65 j')
    expect(container.textContent).toContain('non comparée')
    expect(container.textContent).not.toContain('dans la cible')
  })

  it('la marge d’espace ne se compare pas quand elle repose sur trop peu de missions', () => {
    // ⚠️ Contrairement au DSO, `marginPercent` ne s'annule PAS sous le seuil :
    // « sous le seuil, le chiffre reste calculé ». Il s'AFFICHE donc, et il ne
    // se COMPARE pas — deux décisions distinctes. `measurability` voyageait
    // depuis le 26/08 sans qu'aucun écran ne la lise.
    onlyMargin({
      marginPercent: 31,
      measured: 2,
      unmeasured: 1,
      measurability: { measurable: false, observed: 2, required: 5, missing: 3 },
      threshold: null,
      alerts: [],
    })
    const { container } = wrap()
    expect(container.textContent).toContain('31 %')
    expect(container.textContent).toContain('25 – 40 %')
    expect(container.textContent).toContain('non comparée')
    expect(container.textContent).toContain('2 missions sur les 5 nécessaires')
    expect(container.textContent).not.toContain('dans la cible')
  })

  it('la part de marge NON MESURÉE devient un chiffre, avec sa cible de complétude', () => {
    // « 4 missions non chiffrées » ne dit pas si la marge au-dessus décrit
    // l'espace : sur quarante c'est du bruit, sur six c'est un chiffre qu'il ne
    // faut pas croire.
    onlyMargin({
      marginPercent: 31,
      measured: 6,
      unmeasured: 4,
      measurability: { measurable: true, observed: 6, required: 5, missing: 0 },
      threshold: null,
      alerts: [],
    })
    const { container } = wrap()
    expect(container.textContent).toContain('Marge non mesurée')
    expect(container.textContent).toContain('40 %')
    expect(container.textContent).toContain('complétude')
    // 40 % de missions non chiffrées, cible < 10 % : la marge affichée ne décrit
    // pas l'espace, et l'écran le DIT.
    expect(container.textContent).toContain('hors cible')
  })

  it('zéro mission sur zéro n’est pas « 0 % non mesuré »', () => {
    // Le zéro qui ment DU BON CÔTÉ : un espace vide afficherait la meilleure
    // complétude possible, en vert, sans avoir rien mesuré.
    onlyMargin({
      marginPercent: null,
      measured: 0,
      unmeasured: 0,
      measurability: { measurable: false, observed: 0, required: 5, missing: 5 },
      threshold: null,
      alerts: [],
    })
    const { container } = wrap()
    expect(container.textContent).toContain('aucune mission à mesurer')
    // ⚠️ `queryByText` et non une recherche de sous-chaîne : « 0 % » est un
    // fragment de « 25 – 40 % », la borne de la cible juste au-dessus. On
    // cherche un ÉLÉMENT dont tout le texte vaut « 0 % » — c'est-à-dire la
    // cellule de valeur, qui doit dire « non mesuré » à la place.
    expect(screen.queryByText('0 %')).toBeNull()
    expect(container.textContent).not.toContain('dans la cible')
  })

  it('le taux d’intercontrat se colore dans le SENS de sa cible', () => {
    // « < 5 % bien piloté ». Un taux de 17 % est hors cible — alors que 17 % de
    // CRA reçus le serait aussi, mais pour la raison opposée. Un écran qui
    // colore au hasard du signe est pire que pas de couleur.
    for (const query of [revenue, forecast, margin, dso, channels]) query.mockReturnValue(denied())
    capacity.mockReturnValue(
      ok({
        periodMonth: '2026-08-01',
        capacityDays: 120,
        committedDays: 100,
        availableDays: 20,
        unmeasured: 0,
        bench: { rate: 0.17, onBench: 1, measurability: { measurable: true, observed: 6, required: 5, missing: 0 } },
      }),
    )
    const { container } = wrap()
    expect(container.textContent).toContain('< 5 %')
    expect(container.textContent).toContain('hors cible')
  })
})

/** Un jeu de données complet sur les six lectures — pour les tests qui
 *  vérifient le CÂBLAGE (infobulles, et ce que les prochains commits de ce
 *  lot ajoutent) plutôt qu'un cas d'honnêteté déjà gardé plus haut. */
function fullData() {
  revenue.mockReturnValue(
    ok({
      periodMonth: '2026-08-01',
      lines: [
        { kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null },
        { kind: 'produced', amountCents: 98_000_00, withoutAmount: 2, unavailableReason: null },
        { kind: 'invoiced', amountCents: 80_000_00, withoutAmount: 0, unavailableReason: null },
        { kind: 'collected', amountCents: 41_000_00, withoutAmount: 0, unavailableReason: null },
      ],
    }),
  )
  forecast.mockReturnValue(
    ok({
      months: [],
      lines: [
        { kind: 'secured', amountCents: 10_000_00, withoutAmount: 0, count: 2 },
        { kind: 'likely', amountCents: 5_000_00, withoutAmount: 0, count: 1 },
        { kind: 'hoped', amountCents: 20_000_00, withoutAmount: 0, count: 3 },
      ],
    }),
  )
  capacity.mockReturnValue(
    ok({
      periodMonth: '2026-08-01',
      capacityDays: 120,
      committedDays: 100,
      availableDays: 20,
      unmeasured: 0,
      bench: { rate: 0.1, onBench: 1, measurability: { measurable: true, observed: 6, required: 5, missing: 0 } },
    }),
  )
  margin.mockReturnValue(
    ok({
      marginPercent: 31,
      measured: 6,
      unmeasured: 1,
      measurability: { measurable: true, observed: 6, required: 5, missing: 0 },
      threshold: 20,
      alerts: [],
    }),
  )
  dso.mockReturnValue(
    ok({ days: 32, measurability: { measurable: true, observed: 12, required: 10 }, undatable: 0, disputed: 0 }),
  )
  channels.mockReturnValue(
    ok({
      periodMonth: '2026-07-01',
      byChannel: [
        { channel: 'direct', marginPercent: 40, missions: 3, unmeasured: 0 },
        { channel: 'partner', marginPercent: 30, missions: 2, unmeasured: 0 },
        { channel: 'subcontracting', marginPercent: null, missions: 0, unmeasured: 1 },
        { channel: 'unknown', marginPercent: null, missions: 0, unmeasured: 0 },
      ],
      intermediationCost: 10,
    }),
  )
}

/**
 * UNE INFOBULLE PAR MÉTRIQUE — manque n°1 du lot du 30/08.
 *
 * Le CONTENU de chaque infobulle (elle NOMME ce qui est exclu, elle ne répète
 * pas le `hint` du bloc) est gardé exhaustivement par
 * `finance/finance-tooltip-i18n.test.ts`. Ici, on garde le CÂBLAGE : chaque
 * métrique affichée porte bien un déclencheur d'infobulle — ni plus, ni moins.
 */
describe('FinancePanel — une infobulle par métrique (manque n°1)', () => {
  it('porte un déclencheur d’infobulle sur CHAQUE ligne affichée, et aucun de plus', () => {
    fullData()
    const { container } = wrap()
    // 4 (CA) + 3 (prévisionnel) + 1 (marge des lignes contractualisées, 01/09)
    // + 4 (capacité) + 3 (marge) + 5 (4 canaux + l'écart) + 1 (DSO) = 21
    expect(container.querySelectorAll('[data-slot="tooltip-trigger"]')).toHaveLength(21)
  })

  it('aucun bloc réservé ou en échec ne porte d’infobulle : rien n’explique un chiffre qui n’est pas affiché', () => {
    for (const query of [revenue, forecast, capacity, margin, dso, channels]) query.mockReturnValue(denied())
    const { container } = wrap()
    expect(container.querySelectorAll('[data-slot="tooltip-trigger"]')).toHaveLength(0)
  })
})

/**
 * UN LIEN « VOIR LE DÉTAIL » PAR BLOC — manque n°3 du lot du 30/08.
 *
 * ⚠️ RÉVISÉ le 01/09/2026 (Louis) : « peu importe quel CTA, ça m'envoie
 * toujours vers missions en cours ». Quatre des cinq liens pointaient sur
 * `/missions`, qui ouvre l'onglet « Missions en cours » — donc quatre chiffres
 * qui comptent quatre populations différentes menaient au même écran, et aucun
 * ne montrait ce qu'on venait de cliquer.
 *
 * Chaque lien mène désormais à la population que SON chiffre compte, d'après
 * les tables réellement lues côté serveur :
 * · Chiffre d'affaires — `invoice_readiness` (facturé, encaissé) et les CRA
 *   (produit) → l'écran Facturation ;
 * · Prévisionnel — dominé par la ligne « espéré », qui lit `opportunities` →
 *   l'écran Projets ;
 * · Capacité — le vivier ;
 * · Marge — `missions` + `mission_commercial_terms`, et ses alertes portent des
 *   `missionId` → la liste des missions ;
 * · Marge par canal — AUCUN lien : le canal vit sur les conditions commerciales
 *   d'une mission et aucun écran ne classe par canal. Un lien vers la liste
 *   répéterait exactement le défaut qu'on corrige.
 */
describe('FinancePanel — voir le détail, par bloc (manque n°3)', () => {
  beforeEach(() => {
    routesByPath = {
      '/missions': true,
      '/missions/facturation': true,
      '/projects': true,
      '/consultants': true,
    }
  })

  it('chaque lien mène à la population que SON chiffre compte — jamais tous au même écran', () => {
    fullData()
    wrap()

    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href(/Chiffre d'affaires — voir le détail/)).toBe('/missions/facturation')
    expect(href(/Prévisionnel — voir le détail/)).toBe('/projects')
    expect(href(/Capacité — voir le détail/)).toBe('/consultants')
    expect(href(/Marge — voir le détail/)).toBe('/missions')

    // Cinq destinations distinctes pour cinq questions distinctes : aucune
    // n'est servie deux fois.
    const hrefs = screen.getAllByRole('link', { name: /voir le détail/i }).map(l => l.getAttribute('href'))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('la marge PAR CANAL n’a aucun lien — aucun écran ne classe par canal', () => {
    fullData()
    wrap()
    expect(screen.queryByRole('link', { name: /Marge par canal — voir le détail/i })).not.toBeInTheDocument()
  })

  it('le délai de paiement n’en a toujours aucun', () => {
    fullData()
    wrap()
    expect(screen.queryByRole('link', { name: /Délai de paiement — voir le détail/i })).not.toBeInTheDocument()
  })

  it('chaque lien porte le NOM du bloc qu’il ouvre — cinq liens identiques seraient inutilisables au clavier', () => {
    fullData()
    wrap()
    expect(screen.getByRole('link', { name: /Chiffre d'affaires — voir le détail/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Capacité — voir le détail/ })).toBeInTheDocument()
  })

  it('ne rend AUCUN lien mort quand ce navigateur ignore les deux destinations', () => {
    // `routesByPath` VIDE ⇒ lecture ratée ⇒ `isReachable` laisse PASSER (voir
    // `quality/lib/destinations.ts`) : simuler « aucune destination connue »
    // veut dire un arbre non-vide qui ne les contient simplement pas.
    routesByPath = { '/accounts': true }
    fullData()
    wrap()
    expect(screen.queryAllByRole('link', { name: /voir le détail/i })).toHaveLength(0)
  })

  it('un bloc réservé ou en panne ne montre pas son lien, même si la destination existe', () => {
    const OWN = { kind: 'own' as const, outsideAnyPortfolio: 0 }
    revenue.mockReturnValue(ok({ periodMonth: '2026-07-01', lines: [], scope: OWN }))
    forecast.mockReturnValue(ok({ months: [], lines: [], scope: OWN }))
    margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, alerts: [], scope: OWN }))
    // Réservés aux responsables : aucun des trois ne montre son lien.
    capacity.mockReturnValue(denied())
    dso.mockReturnValue(denied())
    channels.mockReturnValue(denied())
    wrap()

    expect(screen.getAllByRole('link', { name: /voir le détail/i })).toHaveLength(3)
    expect(screen.queryByRole('link', { name: /Capacité — voir le détail/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Marge par canal — voir le détail/ })).not.toBeInTheDocument()
  })
})

/**
 * LE DELTA PÉRIODE/PÉRIODE — manque n°2 du lot du 30/08, ET son piège central :
 * « un delta n'existe que si la période antérieure existe » — jamais 0 %,
 * jamais une flèche neutre qui se lirait « stable ».
 *
 * Le rendu lui-même (les quatre états honnêtes) est la responsabilité de
 * `TrendLine`/`lib/trend.ts`, déjà gardés ailleurs dans ce dépôt (GA-26 : une
 * dérivation vit à un seul endroit). Ici, on garde que `FinancePanel` leur
 * passe les BONNES valeurs, et seulement quand `month` est posé.
 */
describe('FinancePanel — le delta période/période (manque n°2)', () => {
  it('compare la ligne à la MÊME ligne du mois précédent', () => {
    revenue.mockImplementation((month?: string) =>
      ok({
        periodMonth: `${month}-01`,
        lines: [
          {
            kind: 'signed',
            amountCents: month === '2026-07' ? 100_000_00 : 120_000_00,
            withoutAmount: 0,
            unavailableReason: null,
          },
        ],
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    for (const query of [capacity, margin, dso, channels]) query.mockReturnValue(denied())

    const { container } = wrap('2026-08')
    // (120 000 − 100 000) / 100 000 = +20 %.
    expect(container.textContent).toContain('+20 % vs mois précédent')
  })

  it('la marge d’espace compare aussi sa valeur au mois précédent', () => {
    for (const query of [revenue, forecast, capacity, dso, channels]) query.mockReturnValue(denied())
    margin.mockImplementation((month?: string) =>
      ok({
        marginPercent: month === '2026-07' ? 20 : 30,
        measured: 6,
        unmeasured: 0,
        measurability: { measurable: true, observed: 6, required: 5, missing: 0 },
        threshold: null,
        alerts: [],
      }),
    )
    const { container } = wrap('2026-08')
    // (30 − 20) / 20 = +50 %.
    expect(container.textContent).toContain('+50 % vs mois précédent')
  })

  it('LE PIÈGE DU LOT — « pas de photo le mois dernier », JAMAIS 0 % ni une flèche neutre', () => {
    revenue.mockImplementation((month?: string) =>
      month === '2026-07'
        ? ok({
            periodMonth: '2026-07-01',
            lines: [{ kind: 'signed', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source' }],
          })
        : ok({
            periodMonth: '2026-08-01',
            lines: [{ kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null }],
          }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    for (const query of [capacity, margin, dso, channels]) query.mockReturnValue(denied())

    const { container } = wrap('2026-08')
    expect(container.textContent).toContain('pas de photo le mois dernier')
    expect(container.textContent).not.toContain('0 %')
    expect(container.textContent).not.toMatch(/[+−-]\d+ % vs mois précédent/)
  })

  it('#3483 — la même raison sur quatre lignes se dit UNE fois, avec les lignes qu’elle concerne', () => {
    revenue.mockReturnValue(
      ok({
        periodMonth: '2026-08-01',
        lines: (['signed', 'produced', 'invoiced', 'collected'] as const).map(kind => ({
          kind,
          amountCents: null,
          withoutAmount: 0,
          unavailableReason: 'no_source',
        })),
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    for (const query of [capacity, margin, dso, channels]) query.mockReturnValue(denied())

    const { container } = wrap('2026-08')
    expect(container.textContent?.match(/Aucune source pour ce chiffre/g)).toHaveLength(1)
    expect(container.textContent).toContain('Signé, Produit, Facturé, Encaissé')
  })

  it('r3a — sur l’écran finance (mois choisi), « aucune source » renvoie aux encaissements sur douze mois, même suivi', () => {
    revenue.mockReturnValue(
      ok({
        periodMonth: '2026-08-01',
        lines: (['signed', 'produced', 'invoiced', 'collected'] as const).map(kind => ({
          kind,
          amountCents: null,
          withoutAmount: 0,
          unavailableReason: 'no_source',
        })),
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    for (const query of [capacity, margin, dso, channels]) query.mockReturnValue(denied())

    const { container } = wrap('2026-08')
    expect(container.textContent).toContain('carte Encaissements')
    expect(container.textContent).toContain('douze derniers mois')
  })

  it('le cockpit — SANS `month` — ne montre AUCUN delta : comportement inchangé', () => {
    revenue.mockReturnValue(
      ok({
        periodMonth: '2026-07-01',
        lines: [{ kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null }],
      }),
    )
    forecast.mockReturnValue(ok({ months: [], lines: [] }))
    for (const query of [capacity, margin, dso, channels]) query.mockReturnValue(denied())

    const { container } = wrap()
    expect(container.textContent).not.toContain('vs mois précédent')
    expect(container.textContent).not.toContain('pas de photo le mois dernier')
  })
})

/**
 * L'EXPORT — manque n°5 du lot du 30/08. Le contenu exact du fichier (une
 * section absente par lecture en échec, la même formule que l'écran) est
 * gardé par `finance/finance-export.test.ts`. Ici, on garde que le bouton
 * n'apparaît que si quelque chose est affiché, et qu'il déclenche vraiment
 * un téléchargement avec les bonnes données.
 */
describe('FinancePanel — l’export (manque n°5)', () => {
  beforeEach(() => {
    vi.mocked(downloadCSV).mockClear()
  })

  it('n’apparaît PAS quand rien n’est affiché — un bouton qui produirait un fichier vide apprend à ne plus cliquer', () => {
    for (const query of [revenue, forecast, capacity, margin, dso, channels]) query.mockReturnValue(denied())
    wrap()
    expect(screen.queryByRole('button', { name: 'Exporter' })).not.toBeInTheDocument()
  })

  it('exporte exactement ce que l’écran a le droit de montrer, daté', () => {
    fullData()
    wrap('2026-08')

    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = vi.mocked(downloadCSV).mock.calls[0] as [string, string, unknown]
    expect(csv).toContain('Signé')
    expect(csv).toContain("Marge de l'espace")
    expect(filename).toMatch(/^finance-2026-08-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
