import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { OnboardingPlanPage } from './OnboardingPlanPage'

const { apiFetchMock, checkoutMock, mockUsePlans, mockUseCredits, navigateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  checkoutMock: vi.fn(),
  mockUsePlans: vi.fn(),
  mockUseCredits: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => mockUseCredits() }))

vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

vi.mock('@/features/credits/api', () => ({
  creditsApi: { checkout: (...args: unknown[]) => checkoutMock(...args) },
}))

vi.mock('@/features/credits/hooks/usePlans', () => ({ usePlans: () => mockUsePlans() }))

beforeEach(() => {
  apiFetchMock.mockReset()
  checkoutMock.mockReset()
  mockUsePlans.mockReset()
  mockUsePlans.mockReturnValue({ data: undefined })
  mockUseCredits.mockReset()
  mockUseCredits.mockReturnValue({ data: undefined })
  navigateMock.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } })
})

/**
 * La grille du 27/08 (Louis, #1152) : UN SEUL palier achetable — Growth 199 €,
 * 250 crédits, un utilisateur, toutes les fonctions ouvertes. Starter (119 €)
 * est sorti de la VENTE comme Team / Enterprise l'avait été le 16/08 ; l'un et
 * l'autre restent lisibles pour les espaces qui les portent, aucun des deux ne
 * s'achète plus ici.
 *
 * Ce que ce fichier garde n'a pas changé : rien de gratuit à côté du payant,
 * aucun palier non vendable sur l'écran, et le palier ENVOYÉ à Stripe est celui
 * qu'on a montré.
 */
describe('OnboardingPlanPage — pay or ask for a demo, no free window on offer', () => {
  it('offers no trial and no free tier anywhere on the screen', async () => {
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    // The 7-day trial was removed from the display (product call 24/07): a free
    // window shown next to a paid plan sent everyone to the free window.
    expect(screen.queryByText(/essai/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/découverte/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/gratuit/i)).not.toBeInTheDocument()
  })

  it('leads with what the plan lets a rep open — dossiers per month, never a credit count (#4466)', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    expect(await screen.findByText('25 dossiers par mois')).toBeInTheDocument()
    expect(screen.getByText('199 € /mois')).toBeInTheDocument()
  })

  it('lists what each plan actually does, not just its quota', async () => {
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    // Features come from the shared billing catalogue, so the onboarding screen
    // and the billing screen can never describe the same plan differently.
    expect(screen.getByText(/espace partagé/i)).toBeInTheDocument()
    // Un seul utilisateur inclus, et AUCUN siège en plus à vendre : la deuxième
    // personne passe par Entreprise, donc par un devis.
    expect(screen.getByText(/Support prioritaire · 1 utilisateur$/)).toBeInTheDocument()
    expect(screen.queryByText(/siège/i)).not.toBeInTheDocument()
  })

  it("n'annonce aucune marche au-dessus d'un palier que l'écran ne montre pas", async () => {
    // Défaut trouvé en corrigeant #1152 : Growth héritait sa marche de `team`
    // dans `getPlans()`, et `getPublicPlans()` ne la recalculait que pour les
    // cartes d'index ≥ 1. Seul palier public ⇒ index 0 ⇒ la carte annonçait
    // « Tout Team / Enterprise, plus : » en désignant une offre absente de
    // l'écran. Une marche ne se cite que vers une carte visible.
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    expect(screen.queryByText(/Tout .*, plus :/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Team \/ Enterprise/i)).not.toBeInTheDocument()
  })

  it("n'imprime aucune clé de traduction brute dans ses puces", async () => {
    // `crm_native` et `ats_native` étaient entrés dans PLAN_FEATURE_KEYS sans
    // entrer dans les catalogues i18n : la carte affichait
    // « planFeatures.short.crm_native » tel quel. i18next rend la clé quand elle
    // manque, donc rien ne cassait. Garde de fond : plan-feature-labels.test.ts.
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    expect(screen.queryByText(/planFeatures\./)).not.toBeInTheDocument()
    expect(screen.getByText('CRM Bellum')).toBeInTheDocument()
    expect(screen.getByText('ATS Bellum')).toBeInTheDocument()
  })

  it('sends the SELECTED plan to Stripe checkout', async () => {
    checkoutMock.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    renderWithRouter(<OnboardingPlanPage />)

    fireEvent.click(await screen.findByText('Growth'))
    fireEvent.click(screen.getByRole('button', { name: /paiement/i }))

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('growth'))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.test/x'))
  })

  it('ne propose QUE des paliers achetables — Starter et Entreprise sont hors vente', async () => {
    // Il restait affiché ET sélectionné par défaut après le passage sur devis :
    // presser le bouton sans rien choisir envoyait payer 259 € un palier qui
    // n'est plus au catalogue public. Starter tombe sous la même règle le 27/08.
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    expect(screen.queryByText('Starter')).not.toBeInTheDocument()
    expect(screen.queryByText(/Team \/ Enterprise/i)).not.toBeInTheDocument()
    expect(screen.queryByText('259 € /mois')).not.toBeInTheDocument()
    expect(screen.queryByText('119 € /mois')).not.toBeInTheDocument()
  })

  it('sans choix explicite, part sur le seul palier public — jamais sur un palier retiré', async () => {
    checkoutMock.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    renderWithRouter(<OnboardingPlanPage />)

    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }))

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('growth'))
    expect(checkoutMock).not.toHaveBeenCalledWith('starter')
  })

  it('says so when checkout cannot start, instead of a dead button', async () => {
    checkoutMock.mockRejectedValue(new Error('stripe down'))
    renderWithRouter(<OnboardingPlanPage />)

    fireEvent.click(await screen.findByRole('button', { name: /paiement/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/n'a pas pu démarrer/i)
  })

  it('offers the demo as the other path, and never calls the API for it', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    const demo = await screen.findByRole('link', { name: /démo/i })
    expect(demo).toHaveAttribute('href', expect.stringContaining('/demo'))
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it("quitte l'écran dès qu'une offre est accordée pendant qu'il est ouvert", async () => {
    // Cas réel : l'onglet du prospect reste sur les tarifs, l'opérateur lui pose
    // un palier en backoffice. Le garde de route ne rejoue qu'à l'entrée — sans
    // ça, on continue de lui demander de choisir une offre qu'il a déjà.
    mockUseCredits.mockReturnValue({ data: { plan: 'growth', accounts_used: 0 } })
    renderWithRouter(<OnboardingPlanPage />)

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding/company', replace: true }))
  })

  it('reste affiché pour un compte réellement neuf', async () => {
    mockUseCredits.mockReturnValue({ data: { plan: 'decouverte', accounts_used: 0 } })
    renderWithRouter(<OnboardingPlanPage />)

    await screen.findByText('Growth')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('quotes the LIVE catalog, not the shipped baseline', async () => {
    // An operator repricing Growth in the backoffice must reach this screen —
    // otherwise it announces one amount and Stripe charges another.
    mockUsePlans.mockReturnValue({
      data: {
        growth: {
          label: 'Croissance',
          price: 29900,
          accounts_limit: 60,
          enrichment_credits: 0,
          seats: 1,
          extra_seat_price: 0,
        },
      },
    })
    renderWithRouter(<OnboardingPlanPage />)

    expect(await screen.findByText('Croissance')).toBeInTheDocument()
    expect(screen.getByText('299 € /mois')).toBeInTheDocument()
    expect(screen.getByText('6 dossiers par mois')).toBeInTheDocument()
    expect(screen.queryByText('199 € /mois')).not.toBeInTheDocument()
  })
  /**
   * #2002 — « le bouton "demander une démo" [...] de toute façon il est trop petit ».
   *
   * Le plancher tactile de 44 px (GA-30) vit DANS `Button` : les quatre tailles
   * à texte portent `pointer-coarse:min-h-11` depuis la passe des 616 boutons
   * mesurés sous 44 px. Il n'atteint donc que ce qui PASSE par `Button` — et ce
   * geste-ci était une `<a>` stylée à la main (`px-3 py-2 text-sm`, 34 px au
   * doigt). La règle était gardée, l'appelant ne passait pas par la garde :
   * le défaut n°1 du dépôt lu à l'envers.
   *
   * ⚠️ jsdom ne met RIEN en page : ce test LIT des classes, il ne mesure pas.
   * Il en lit donc deux, et la seconde seule serait inerte — `min-height` ne
   * s'applique pas à une boîte inline, or une `<a>` est inline par défaut.
   * Un `pointer-coarse:min-h-11` posé seul sur un lien ne grandit rien.
   */
  it('#2002 — le geste « démo » porte le plancher tactile, sur une boîte qui sait grandir', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    const demo = await screen.findByRole('link', { name: /démo/i })
    expect(demo.className).toContain('pointer-coarse:min-h-11')
    expect(demo.className).toMatch(/\binline-flex\b/)
  })

  /**
   * #2002.1 — « il n'y a qu'un seul forfait possible alors que je devrais
   * pouvoir accéder à la démo, ou payer 199 euros ou alors avoir sur devis le
   * prix entreprise workspace ».
   *
   * La grille du 27/08 l'avait déjà tranché — TROIS cartes, dont un seul palier
   * achetable — et le site les montre toutes les trois depuis ce jour-là. Cet
   * écran lisait `PUBLIC_PLAN_ORDER`, qui liste ce qui se VEND : une liste
   * juste pour une autre question.
   */
  it('#2002.1 — montre les trois entrées : la démonstration, l’offre, le devis', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    expect(await screen.findByText('Démonstration')).toBeInTheDocument()
    expect(screen.getByText('Growth')).toBeInTheDocument()
    expect(screen.getByText('Entreprise')).toBeInTheDocument()
    expect(screen.getByText('Sur devis')).toBeInTheDocument()
  })

  it('#2002.1 — n’écrit ni « 0 € » ni « 0 crédit » sur ce qui ne se vend pas', async () => {
    // « Si cette valeur est absente, 0 est-il VRAI ? » Non : Entreprise se
    // négocie et la démonstration n'est pas un palier. Et un « 0 € » sur la
    // démonstration rouvrirait la fenêtre gratuite fermée le 24/07.
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Démonstration')

    expect(screen.queryByText('0 € /mois')).not.toBeInTheDocument()
    expect(screen.queryByText('0 dossiers par mois')).not.toBeInTheDocument()
    expect(screen.queryByText('259 € /mois')).not.toBeInTheDocument()
  })

  it('#2002.1 — cliquer la démonstration n’envoie JAMAIS son identifiant à la caisse', async () => {
    // Le défaut déjà payé deux fois ici : une carte affichée devient une carte
    // sélectionnée, puis un identifiant envoyé à la caisse (Team le 16/08,
    // Starter le 27/08). Deux des trois entrées n'ont rien à vendre — elles ne
    // doivent donc rien pouvoir sélectionner.
    checkoutMock.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    renderWithRouter(<OnboardingPlanPage />)

    fireEvent.click(await screen.findByText('Démonstration'))
    fireEvent.click(screen.getByText('Entreprise'))
    fireEvent.click(screen.getByRole('button', { name: /paiement/i }))

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith('growth'))
    expect(checkoutMock).not.toHaveBeenCalledWith('demonstration')
    expect(checkoutMock).not.toHaveBeenCalledWith('enterprise')
  })

  it('#2002.1 — nomme Laura dans la grille tarifaire, et aucun prestataire de paiement', async () => {
    // D82 : « le copilote s'appelle Laura, partout — y compris dans la grille
    // tarifaire ». Et NOS fournisseurs ne se nomment jamais à l'écran : le nom
    // du prestataire de paiement n'a rien à faire sur une grille de prix.
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Démonstration')

    expect(screen.getAllByText(/Laura/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Stripe/i)).not.toBeInTheDocument()
  })

  /**
   * #2003.2 — « un utilisateur bêta, invité ou déjà provisionné ne voit jamais
   * une sélection d'abonnement inutile ».
   *
   * La redirection existait déjà, mais elle part APRÈS le rendu : le temps d'un
   * aller-retour de routeur, un partenaire bêta lisait « Choisis ton offre » et
   * trois cartes de prix. Le droit d'accès commercial est désormais NOMMÉ
   * (`deriveCommercialEntitlement`), et c'est lui qui décide de peindre — ou non
   * — une sélection d'abonnement.
   */
  it('#2003.2 — un compte bêta ne voit aucune sélection d’abonnement, même une fraction de seconde', async () => {
    mockUseCredits.mockReturnValue({ data: { plan: 'beta', accounts_used: 0 } })
    renderWithRouter(<OnboardingPlanPage />)

    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(screen.queryByText('Choisis ton offre')).not.toBeInTheDocument()
    expect(screen.queryByText('Growth')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /paiement/i })).not.toBeInTheDocument()
  })

  it('#2003.2 — un invité ne se voit pas proposer l’offre que son espace paie déjà', async () => {
    // L'API résout la facturation sur le PROPRIÉTAIRE de l'espace : un invité
    // lit le palier de quelqu'un d'autre. Lui montrer la caisse lui ferait
    // payer une deuxième fois la même chose.
    mockUseCredits.mockReturnValue({ data: { plan: 'growth', accounts_used: 0, is_billing_owner: false } })
    renderWithRouter(<OnboardingPlanPage />)

    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /paiement/i })).not.toBeInTheDocument()
  })

  /**
   * #2002.4 — « en bas le bouton "demander une démo" ramène vers le site ».
   *
   * Le grief n'est pas la taille (c'est #2002.3), c'est la DESTINATION : on
   * sort de l'app par un aller simple, en pleine inscription, vers une page
   * marketing qui ne montre pas le produit. Or la démonstration DU PRODUIT vit
   * ici, à `/demo` — un espace semé, sans compte à créer.
   *
   * Nouvel onglet, et c'est le mécanisme qui l'exige, pas le confort : les
   * cookies de session sont nommés par utilisateur et chaque onglet porte
   * l'identité sous laquelle il travaille (`features/auth/tab-identity.ts`,
   * DEMO-01). Un onglet neuf prend l'identité de la démonstration et laisse
   * l'inscription intacte derrière ; la même page dans CET onglet-ci la
   * remplacerait.
   */
  it('#2002.4 — le geste « démonstration » ouvre la démonstration du produit, jamais le site', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    const demo = await screen.findByRole('link', { name: /démonstration/i })
    expect(demo).toHaveAttribute('href', '/demo')
    // Une URL absolue ici, c'est le site : la destination d'avant.
    expect(demo.getAttribute('href')).not.toMatch(/^https?:/i)
    expect(screen.queryByText(/bellum-ai\.com/)).not.toBeInTheDocument()
    expect(demo).toHaveAttribute('target', '_blank')
    expect(demo.getAttribute('rel')).toContain('noopener')
  })

  /**
   * #2003.17 — « self-service : l'écran explique d'abord ce qu'il achète ».
   *
   * Trois listes de puces ne disent pas ce qu'on ACHÈTE : elles disent ce qui
   * est inclus. Ce qu'un commercial manipule, ce ne sont pas des crédits, c'est
   * un nombre de dossiers qu'il peut ouvrir — et cette traduction existe déjà,
   * calculée et testée, appelée par aucun écran : `analysesAffordable`
   * (`packages/contracts/src/billing/credit-weights.ts`). Le barème aussi
   * (`CREDIT_WEIGHTS`), pendant que le sous-titre le recopiait à la main.
   */
  it('#2003.17 — traduit le forfait en dossiers complets, depuis le barème partagé', async () => {
    renderWithRouter(<OnboardingPlanPage />)

    // RAB2 (Louis 10/10 soir) : 250 crédits ÷ 10 crédits (analyse par défaut,
    // Approfondie) = 25 dossiers — plus le poids plein 8 (31, sur-annoncé).
    // Aucun de ces trois nombres n'est écrit dans l'écran.
    expect(await screen.findByText(/25 dossiers complets/)).toBeInTheDocument()
    expect(screen.queryByText(/31 dossiers complets/)).not.toBeInTheDocument()
    // #4466 — les offres se décrivent en usage, jamais en nombre de crédits.
    expect(document.body.textContent ?? '').not.toMatch(/crédit/i)
  })

  it('#2003.17 — ce que le forfait ouvre suit le catalogue live, pas la grille embarquée', async () => {
    mockUsePlans.mockReturnValue({
      data: {
        growth: {
          label: 'Croissance',
          price: 29900,
          accounts_limit: 60,
          enrichment_credits: 0,
          seats: 1,
          extra_seat_price: 0,
        },
      },
    })
    renderWithRouter(<OnboardingPlanPage />)

    // 60 ÷ 10 = 6 (RAB2 : prix de l'analyse par défaut ; arrondi vers le bas).
    expect(await screen.findByText(/6 dossiers complets/)).toBeInTheDocument()
    expect(screen.queryByText(/25 dossiers complets/)).not.toBeInTheDocument()
  })

  it('#2003.17 — un volume de crédits illisible se DIT, il ne s’écrit pas « 0 »', async () => {
    // Une ligne de catalogue incomplète, ou une API antérieure au champ :
    // `accounts_limit` ne répond pas. « Si la valeur est absente, 0 est-il
    // VRAI ? » Non — et « 0 dossier complet » sur la carte qu'on VEND serait la
    // pire des réponses, juste devant « undefined crédits par mois ».
    mockUsePlans.mockReturnValue({
      data: { growth: { label: 'Growth', price: 19900, enrichment_credits: 0, seats: 1, extra_seat_price: 0 } },
    })
    renderWithRouter(<OnboardingPlanPage />)

    expect(await screen.findByText(/pas lisible/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 dossier/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 dossiers par mois/)).not.toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it("#2003.17 — dit aussi ce que l'offre N'ouvre PAS : la deuxième personne est un devis", async () => {
    renderWithRouter(<OnboardingPlanPage />)
    await screen.findByText('Growth')

    // `extraSeatPriceCents: 0` ne veut pas dire « siège gratuit » : ce palier
    // n'en vend aucun. L'écran doit le DIRE, pas afficher « +0 €/siège ».
    expect(screen.getByText(/Entreprise, sur devis/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument()
  })

  /**
   * #2003.20 — la recette des quatre comptes : bêta, payé, invité, démonstration.
   *
   * Les quatre sont SERVIS, pour quatre raisons différentes, et aucun des
   * quatre n'a quoi que ce soit à acheter ici. Deux d'entre eux étaient gardés
   * un par un ; les quatre le sont maintenant ensemble, parce que c'est la
   * LISTE qui est la règle — un cinquième cas servi ajouté demain doit venir
   * s'y ranger, et se faire attraper s'il montre la grille.
   */
  it.each([
    ['bêta', { plan: 'beta', accounts_used: 0 }],
    ['payé', { plan: 'growth', accounts_used: 0, is_billing_owner: true }],
    ['invité', { plan: 'growth', accounts_used: 0, is_billing_owner: false }],
    ['démonstration', { plan: 'growth', accounts_used: 0, is_demo: true }],
  ])('#2003.20 — un compte %s ne voit aucune grille tarifaire', async (_label, credits) => {
    mockUseCredits.mockReturnValue({ data: credits })
    renderWithRouter(<OnboardingPlanPage />)

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/onboarding/company', replace: true }))
    expect(screen.queryByText('Choisis ton offre')).not.toBeInTheDocument()
    expect(screen.queryByText('Growth')).not.toBeInTheDocument()
    expect(screen.queryByText('Démonstration')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /paiement/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /démonstration/i })).not.toBeInTheDocument()
  })
})
