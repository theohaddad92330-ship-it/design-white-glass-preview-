import { describe, expect, it } from 'vitest'
import { getOnboardingPricingEntries, type PlanCatalog } from '@/lib/plans'

/**
 * #2002.1 — « il n'y a qu'un seul forfait possible alors que je devrais pouvoir
 * accéder à la démo, ou payer 199 euros ou alors avoir sur devis le prix
 * entreprise workspace ».
 *
 * La grille du 27/08 dit DÉJÀ trois cartes dont un seul palier achetable
 * (`SHIPPED_PLAN_GRID`, en tête du fichier) : la démonstration, Growth, et
 * Entreprise sur devis. Le site les montre toutes les trois ; l'écran
 * d'onboarding n'en montrait qu'une, parce qu'il lisait `PUBLIC_PLAN_ORDER` —
 * qui liste les paliers ACHETABLES, pas les entrées de la grille.
 *
 * ⚠️ Le piège de ce lot est l'argent : les montants arrivent en CENTIMES
 * (convention du catalogue et de la grille embarquée). Les cas ci-dessous
 * passent donc la forme RÉELLE — `price: 19900` — jamais des euros, une forme
 * que ce code ne reçoit jamais.
 */
const catalog = (over: Partial<PlanCatalog> = {}): PlanCatalog => ({
  growth: {
    label: 'Growth',
    price: 19900,
    accounts_limit: 250,
    enrichment_credits: 0,
    seats: 1,
    extra_seat_price: 0,
  },
  ...over,
})

describe('getOnboardingPricingEntries — les trois entrées de la grille (#2002.1)', () => {
  it('rend TROIS entrées : la démonstration, le palier achetable, le devis', () => {
    const entries = getOnboardingPricingEntries(catalog())

    expect(entries.map(entry => entry.id)).toEqual(['demonstration', 'growth', 'enterprise'])
  })

  it('une SEULE entrée est achetable — les deux autres ne partent jamais au paiement', () => {
    // Le défaut déjà payé deux fois sur cet écran (16/08 Team, 27/08 Starter) :
    // une carte affichée devient une carte sélectionnée, puis un identifiant
    // envoyé à la caisse. Ici deux des trois entrées n'ont RIEN à vendre.
    const entries = getOnboardingPricingEntries(catalog())

    expect(entries.filter(entry => entry.purchasable).map(entry => entry.id)).toEqual(['growth'])
  })

  it('lit le prix en CENTIMES et n’en refait pas la conversion', () => {
    // 19 900 centimes = 199 €. Une seconde division (ou multiplication) donnerait
    // 1,99 € ou 1 990 000 € — l'accident mesuré 20 minutes après un déploiement.
    const growth = getOnboardingPricingEntries(catalog()).find(entry => entry.id === 'growth')

    expect(growth?.priceCents).toBe(19900)
    expect(growth?.priceEuros).toBe(199)
  })

  it('suit le catalogue LIVE, jamais la grille embarquée, sur le seul palier vendu', () => {
    // Un repricing en backoffice doit atteindre cet écran : sinon la carte
    // annonce un montant pendant que la caisse en prélève un autre.
    const entries = getOnboardingPricingEntries(catalog({ growth: { ...catalog().growth!, price: 29900 } }))
    const growth = entries.find(entry => entry.id === 'growth')

    expect(growth?.priceEuros).toBe(299)
    expect(growth?.priceCents).toBe(29900)
  })

  it('n’AFFICHE aucun prix là où il n’y en a pas — ni « 0 € », ni un montant deviné', () => {
    // « Si cette valeur est absente, 0 est-il VRAI ? » Non : Entreprise se
    // négocie, et la démonstration n'est pas un palier. Publier le prix de
    // `team` (25 900 c) reviendrait à publier une enveloppe négociable, et
    // publier « 0 € » sur la démonstration rouvrirait la fenêtre gratuite que la
    // décision du 24/07 a fermée.
    const entries = getOnboardingPricingEntries(catalog())
    const quiet = entries.filter(entry => entry.id !== 'growth')

    expect(quiet).toHaveLength(2)
    for (const entry of quiet) {
      expect(entry.priceCents).toBeNull()
      expect(entry.priceEuros).toBeNull()
      expect(entry.priceLabel.length).toBeGreaterThan(0)
    }
  })

  it('ne publie AUCUN volume de crédits sur ce qui ne se vend pas', () => {
    // Même raison : 600 crédits est l'enveloppe par défaut de `team`, pas une
    // promesse faite à un prospect qui négociera la sienne. `null` = non
    // applicable, et l'écran ne peut donc pas écrire « 0 crédit ».
    const entries = getOnboardingPricingEntries(catalog())

    expect(entries.find(entry => entry.id === 'demonstration')?.credits).toBeNull()
    expect(entries.find(entry => entry.id === 'enterprise')?.credits).toBeNull()
    expect(entries.find(entry => entry.id === 'growth')?.credits).toBe(250)
  })

  it('ne nomme jamais le palier serveur « Team / Enterprise » au prospect', () => {
    // Le code de palier reste `team` côté serveur ; ce que lit un prospect est
    // « Entreprise ». Deux vocabulaires, et c'est le nôtre qui reste au chaud.
    const entries = getOnboardingPricingEntries(catalog())

    expect(entries.map(entry => entry.name).join(' | ')).not.toMatch(/Team \/ Enterprise/i)
  })

  it('nomme Laura dans la grille tarifaire (D82)', () => {
    // « Le copilote s'appelle Laura, partout — y compris dans la grille
    // tarifaire. »
    const entries = getOnboardingPricingEntries(catalog())
    const everything = entries.flatMap(entry => entry.features).join(' | ')

    expect(everything).toContain('Laura')
  })

  it('n’imprime aucune clé de traduction brute', () => {
    const entries = getOnboardingPricingEntries(catalog())
    const everything = entries.flatMap(entry => [entry.name, entry.priceLabel, ...entry.features]).join(' | ')

    expect(everything).not.toMatch(/pricingEntries\.|planFeatures\./)
  })

  it('tient debout sans catalogue — la grille embarquée, jamais une carte vide', () => {
    // La requête catalogue est publique et peut échouer : l'écran doit rester
    // lisible, avec les chiffres que le code EMBARQUE (199 €, 250 crédits).
    const entries = getOnboardingPricingEntries(undefined)

    expect(entries).toHaveLength(3)
    const growth = entries.find(entry => entry.id === 'growth')
    expect(growth?.priceEuros).toBe(199)
    expect(growth?.credits).toBe(250)
  })
})
