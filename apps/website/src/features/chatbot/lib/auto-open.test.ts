import { describe, expect, it } from 'vitest'
import {
  behaviourFor,
  canFireNow,
  MOBILE_MIN_PRESENCE_MS,
  shouldAutoOpen,
  type AutoOpenInput,
  type VisitState,
} from './auto-open'

const FRESH: VisitState = { autoOpened: false, dismissed: false, visitCount: 1 }

function plan(pathname: string, overrides: Partial<AutoOpenInput> = {}) {
  return shouldAutoOpen({ pathname, visit: FRESH, viewport: 'desktop', ...overrides })
}

/** Les six tests obligatoires du ticket BEL-LAU-901, plus le tableau du §4.4. */
describe('le tableau des délais du §4.4', () => {
  it.each([
    ['/', 4_000],
    ['/pricing', 2_000],
    ['/fr/pricing', 2_000],
    ['/en/product', 8_000],
    ['/use-cases', 8_000],
    ['/demo', 3_000],
    ['/beta', 3_000],
  ])('ouvre en grand sur %s après %i ms', (pathname, delayMs) => {
    expect(plan(pathname)).toEqual({ open: true, delayMs, message: 'first' })
  })

  it.each(['/about', '/nl/webinar'])('ne montre que la bulle sur %s', pathname => {
    const result = plan(pathname)
    expect(result?.open).toBe(false)
    expect(result?.delayMs).toBe(12_000)
  })

  // T1 du ticket.
  it.each(['/legal', '/privacy', '/fr/cgv', '/cookies', '/dpa', '/status'])(
    'se tait TOTALEMENT sur %s — aucune ouverture, aucune bulle',
    pathname => {
      expect(plan(pathname)).toBeNull()
      expect(behaviourFor(pathname)).toBe('silent')
    },
  )

  it('se tait sur un chemin que le site ne sert PAS, même s’il ressemble à une page connue', () => {
    // Trouvé en recette live : `/tarifs` est un 404 — le site rend le français
    // à la racine sans traduire ses chemins — et Laura s'y ouvrait EN GRAND.
    // Un alias mort ne coûte rien tant qu'il ne déclenche rien.
    for (const dead of ['/tarifs', '/produit', '/cas-usage', '/fr/tarifs']) {
      expect(plan(dead), dead).toBeNull()
      expect(behaviourFor(dead)).toBe('silent')
    }
  })

  it('se tait sur une page qu’on n’a pas prévue plutôt que d’improviser', () => {
    // Le §4.4 mentionne un « Blog / ressources » que le site n'a pas. Le jour
    // où il existera, il sera silencieux jusqu'à ce qu'on l'inscrive — c'est le
    // bon sens de l'erreur.
    expect(plan('/blog')).toBeNull()
    expect(plan('/fr/ressources')).toBeNull()
  })
})

describe('les sept règles qui empêchent que ce soit agaçant', () => {
  // T2 du ticket : une seule ouverture par session.
  it('n’ouvre qu’une fois par session', () => {
    expect(plan('/pricing', { visit: { ...FRESH, autoOpened: true } })).toBeNull()
  })

  it('n’insiste JAMAIS après une fermeture — fermée = fermée', () => {
    expect(plan('/pricing', { visit: { ...FRESH, dismissed: true } })).toBeNull()
    // Même sur une sortie d'intention, même au retour de visite.
    expect(plan('/pricing', { visit: { ...FRESH, dismissed: true, visitCount: 4 }, exitIntent: true })).toBeNull()
  })

  // T3 : le report tient à l'immobilité, pas au chemin.
  it('reporte pendant qu’on défile ou qu’on saisit, sans annuler', () => {
    expect(canFireNow({ scrolling: false, typing: false })).toBe(true)
    expect(canFireNow({ scrolling: true, typing: false })).toBe(false)
    expect(canFireNow({ scrolling: false, typing: true })).toBe(false)
    // Le plan reste le même : ce qui est reporté n'est pas refusé.
    expect(plan('/pricing')).not.toBeNull()
  })

  // T4 : mobile, 2 s de présence → pas d'ouverture.
  it('attend au moins trois secondes sur mobile', () => {
    expect(plan('/pricing', { viewport: 'mobile' })?.delayMs).toBe(MOBILE_MIN_PRESENCE_MS)
    // Un délai déjà plus long n'est pas raccourci.
    expect(plan('/product', { viewport: 'mobile' })?.delayMs).toBe(8_000)
  })

  it('ne détecte pas de sortie d’intention au doigt', () => {
    // Sur mobile, un curseur qui « part vers le haut » ne veut rien dire.
    expect(plan('/pricing', { viewport: 'mobile', exitIntent: true })?.message).toBe('first')
    expect(plan('/pricing', { exitIntent: true })).toEqual({ open: true, delayMs: 0, message: 'exit' })
  })

  // T5 : deuxième visite → message de retour, pas le message d'accueil.
  it('accueille un visiteur qui revient autrement, et sans le faire attendre', () => {
    expect(plan('/pricing', { visit: { ...FRESH, visitCount: 2 } })).toEqual({
      open: true,
      delayMs: 0,
      message: 'return',
    })
  })

  it('garde la bulle en bulle même au retour de visite', () => {
    // « À propos » reste de la curiosité, qu'on y vienne pour la première ou la
    // troisième fois.
    expect(plan('/about', { visit: { ...FRESH, visitCount: 3 } })?.open).toBe(false)
  })

  it('donne toujours la priorité au silence d’une page légale', () => {
    expect(plan('/privacy', { exitIntent: true })).toBeNull()
    expect(plan('/cgv', { visit: { ...FRESH, visitCount: 5 } })).toBeNull()
  })
})
