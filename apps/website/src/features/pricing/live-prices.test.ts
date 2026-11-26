import { describe, expect, it } from 'vitest'
import { fillLiveTokens, livePlan, PLAN_ORDER, type LiveCatalogCopy } from './live-prices'
import { CREDIT_WEIGHTS } from '@bellum/contracts'

/**
 * Le défaut que ces tests verrouillent a été vu EN PRODUCTION, sur la page
 * d'accueil : quatre cartes (Free, Starter, Growth, Team / Enterprise) jointes
 * par position à deux prix live (starter, growth). Tout était décalé d'un cran
 * — « Free » annonçait 119 €, « Starter » 249 € — et la carte Growth, ne
 * trouvant plus rien, imprimait `{seatPrice}` tel quel.
 *
 * Depuis la grille du 27/08, le déséquilibre est PIRE : trois cartes (Free,
 * Growth, Entreprise) pour UN seul palier achetable. Une jointure par position
 * poserait le prix de Growth sur la carte Free — c'est-à-dire annoncerait la
 * démonstration à 199 €.
 *
 * Un prix faux sur une page de tarifs n'est pas un défaut d'affichage : c'est
 * une promesse commerciale que Stripe ne tiendra pas.
 */

/** Le catalogue tel que l'API le rend : les paliers ACHETABLES uniquement. */
const LIVE: LiveCatalogCopy = {
  prices: [{ monthly: '199 €', annual: '159 €' }],
  seats: ['—'],
  seatLabel: '—',
  seatUniform: true,
  entryPriceDigits: '199',
}

describe('livePlan', () => {
  it('rend au palier SON prix, quel que soit son rang à l’écran', () => {
    // Growth est la carte du MILIEU, et le seul prix du catalogue est en
    // première position. Par rang, la carte Free l'aurait pris.
    expect(livePlan(LIVE, 'growth').price?.monthly).toBe('199 €')
    expect(livePlan(LIVE, 'growth').price?.annual).toBe('159 €')
  })

  it('ne donne aucun prix à une carte qui n’est pas un palier', () => {
    // C'est LE test du défaut : la carte Free est en première position, et la
    // première position du catalogue live est le seul palier vendu.
    expect(livePlan(LIVE, null).price).toBeUndefined()
    expect(livePlan(LIVE, null).seat).toBeUndefined()
  })

  it('rend un vrai libellé de siège même quand le catalogue est vide', () => {
    // API injoignable : les prix retombent sur le catalogue de messages. Le
    // repli doit rester un texte lisible — jamais un jeton `{seatPrice}`, jamais
    // du vide.
    const empty: LiveCatalogCopy = {
      prices: [],
      seats: [],
      seatLabel: '—',
      seatUniform: true,
      entryPriceDigits: null,
    }
    expect(livePlan(empty, 'growth').seat).toBe('—')
    expect(livePlan(empty, 'growth').price).toBeUndefined()
  })
})

describe('la carte telle qu’elle se compose', () => {
  /** Les trois cartes de la page d'accueil, dans leur ordre d'affichage. */
  const HOME_KEYS = [null, 'growth', null] as const
  const CATALOG = [
    { name: 'Free', price: '0 €', seatBullet: 'Aucun siège payant' },
    { name: 'Growth', price: '199 €', seatBullet: '1 utilisateur — au-delà, offre Entreprise' },
    { name: 'Entreprise', price: 'Sur devis', seatBullet: 'Crédits mutualisés' },
  ]

  it('laisse « Free » à 0 € et « Sur devis » sans montant', () => {
    const rendered = CATALOG.map((card, index) => {
      const { price } = livePlan(LIVE, HOME_KEYS[index] ?? null)
      return price?.monthly ?? card.price
    })
    expect(rendered).toEqual(['0 €', '199 €', 'Sur devis'])
  })

  it('ne laisse aucun jeton non résolu atteindre la page', () => {
    // Plus aucune carte ne porte `{seatPrice}` depuis que Growth est
    // mono-utilisateur. La garde reste : un jeton réintroduit par un éditeur de
    // contenu doit se résoudre, pas s'imprimer.
    const bullets = CATALOG.map((card, index) => {
      const { seat } = livePlan(LIVE, HOME_KEYS[index] ?? null)
      return fillLiveTokens(card.seatBullet, { seatPrice: seat })
    })
    expect(bullets.some(bullet => bullet.includes('{'))).toBe(false)
  })

  it('garde l’ordre du catalogue live aligné sur les paliers achetables', () => {
    // Si quelqu'un remet un palier en self-service sans toucher aux cartes,
    // c'est ici que ça se voit — pas sur la page en production.
    expect(PLAN_ORDER).toEqual(['growth'])
  })
})

describe('les catalogues de messages, dans les quatre langues', () => {
  const LOCALES = ['fr', 'en', 'de', 'nl'] as const

  /**
   * Les cartes de la page d'accueil, dans l'ordre où elles s'affichent.
   *
   * Le nom du palier sur devis est TRADUIT (« Entreprise » en français,
   * « Enterprise » ailleurs) — c'est un nom commercial, pas un code. Les deux
   * autres ne le sont pas.
   */
  const homeCards = (locale: string) => ['Free', 'Growth', locale === 'fr' ? 'Entreprise' : 'Enterprise']

  it.each(LOCALES)('%s : la page d’accueil garde ses trois cartes dans l’ordre', async locale => {
    // C'est la garde qui manquait. `PLAN_KEYS` désigne les paliers PAR RANG
    // dans ce tableau : une carte ajoutée, retirée ou déplacée par un éditeur
    // de contenu décale à nouveau les prix d'un cran, en silence, dans une
    // seule langue — le genre de défaut qu'on découvre en réunion.
    const home = (await import(`../../../messages/${locale}/home.json`)) as {
      default: { pricing: { plans: { name: string }[] } }
    }
    expect(home.default.pricing.plans.map(plan => plan.name)).toEqual(homeCards(locale))
  })

  it.each(LOCALES)('%s : la page tarifs ne liste que les paliers achetables', async locale => {
    const pricing = (await import(`../../../messages/${locale}/pricing.json`)) as {
      default: { plans: { items: { name: string }[] } }
    }
    // `plans.items` est joint à `PLAN_ORDER` rang par rang : il doit contenir
    // exactement les paliers achetables, et rien d'autre. Free et Entreprise
    // vivent à part (`plans.free`, `plans.enterprise`) précisément pour ne
    // jamais entrer dans cette jointure.
    expect(pricing.default.plans.items).toHaveLength(PLAN_ORDER.length)
    expect(pricing.default.plans.items.map(item => item.name)).toEqual(['Growth'])
  })
})

describe('la FAQ ne contredit pas les cartes qu’elle accompagne', () => {
  const LOCALES = ['fr', 'en', 'de', 'nl'] as const

  /**
   * Défaut vu en production le 18/08 : les cartes annonçaient « Starter 119 € ·
   * 80 crédits » et « Growth 249 € · 250 crédits », pendant que la FAQ de la
   * MÊME page décrivait « Starter-Solo : 35 crédits, Team : 150, Growth : 420 »
   * — la grille d'avant le 16/08, avec ses paquets de sièges 1/3/8 abandonnés.
   *
   * Deux chiffres contradictoires sur un même écran ne sont pas une coquille :
   * le lecteur choisit celui qui l'arrange, et c'est l'autre qui sera facturé.
   */
  it.each(LOCALES)('%s : la FAQ ne cite aucun volume de crédits inconnu des cartes', async locale => {
    const pricing = (await import(`../../../messages/${locale}/pricing.json`)) as {
      default: { plans: { items: { features: string[] }[] }; faq: { items: { a: string }[] } }
    }
    const catalog = pricing.default
    const known = new Set(
      catalog.plans.items.flatMap(item =>
        item.features.flatMap(feature =>
          [...feature.matchAll(/(\d+)\s*(?:crédits|credits|Guthaben)/gi)].map(m => m[1]!),
        ),
      ),
    )
    expect(known.size).toBeGreaterThan(0)

    const quoted = catalog.faq.items.flatMap(item =>
      [...item.a.matchAll(/(\d+)\s*(?:crédits|credits|Guthaben)/gi)].map(m => m[1]!),
    )
    // Un PRIX D'ACTION est légitime partout ; ce sont les VOLUMES mensuels qui
    // doivent correspondre aux cartes.
    //
    // ⚠️ La première version discriminait par « > 1 », et ce raccourci n'était
    // vrai que tant que TOUTE action coûtait un crédit. Depuis la pondération,
    // une analyse en coûte huit — la FAQ qui l'écrit disait donc la vérité, et
    // la garde la refusait. On lit maintenant la grille des poids plutôt que
    // de deviner : un nombre qui EST un poids d'action est un prix, les autres
    // sont des volumes.
    const actionPrices = new Set(Object.values(CREDIT_WEIGHTS).map(String))
    const volumes = quoted.filter(value => !actionPrices.has(value))
    expect(volumes.filter(value => !known.has(value))).toEqual([])
  })

  it.each(LOCALES)('%s : la FAQ ne nomme plus une offre qui n’existe pas', async locale => {
    const pricing = (await import(`../../../messages/${locale}/pricing.json`)) as {
      default: { faq: { items: { a: string }[] } }
    }
    const answers = pricing.default.faq.items.map(item => item.a).join(' ')
    // « Starter-Solo » puis « Starter » : deux noms de paliers retirés de la
    // grille, le 16/08 puis le 27/08. Une FAQ qui les cite encore propose au
    // visiteur une offre qu'aucun bouton ne peut acheter.
    expect(answers).not.toContain('Starter-Solo')
    expect(answers).not.toContain('Starter')
  })
})
