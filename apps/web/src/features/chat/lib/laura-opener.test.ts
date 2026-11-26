import { describe, expect, it } from 'vitest'
import { LAURA_OPENER_DELAY_MS, lauraOpener, lauraOpenerPersists, type LauraOpenerInput } from './laura-opener'

/**
 * #1947 / #1908 — la première prise de parole de Laura sur un fil vierge.
 *
 * Le `t` de test rend la clé ET ses paramètres : ce qui se vérifie ici est le
 * CHOIX de la phrase et ce qu'on lui passe, pas le texte des catalogues (couvert
 * par la parité i18n et par `Chat.persistence.test.tsx`, qui lit le vrai FR).
 */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}${JSON.stringify(params)}` : key) as unknown as Parameters<typeof lauraOpener>[0]

const LOADING: LauraOpenerInput = {
  firstName: 'Louis',
  isDemo: false,
  accountName: null,
  portfolioCount: null,
  hasVivier: false,
  settled: false,
}

describe('lauraOpener — la première prise de parole de Laura', () => {
  it('attend trois secondes — le délai que #1947 demande', () => {
    expect(LAURA_OPENER_DELAY_MS).toBe(3_000)
  })

  it('salue par le prénom du PROFIL', () => {
    const text = lauraOpener(t, LOADING)
    expect(text).toContain('opener.withName')
    expect(text).toContain('"firstName":"Louis"')
  })

  it('sans prénom, n’en invente aucun', () => {
    const text = lauraOpener(t, { ...LOADING, firstName: '' })
    expect(text).toContain('opener.withoutName')
    expect(text).not.toContain('firstName')
  })

  it('pendant le CHARGEMENT, ne conclut jamais « je connais peu ton activité »', () => {
    const text = lauraOpener(t, LOADING)
    expect(text).toContain('opener.neutral')
    expect(text).not.toContain('opener.newcomer')
  })

  it('un portefeuille NON lu (null) n’est pas un portefeuille vide, même signaux lus', () => {
    const text = lauraOpener(t, { ...LOADING, settled: true, portfolioCount: null })
    expect(text).not.toContain('opener.newcomer')
    expect(text).toContain('opener.neutral')
  })

  it('« peu de contexte » seulement quand TOUT est lu et vide', () => {
    const text = lauraOpener(t, { ...LOADING, settled: true, portfolioCount: 0 })
    expect(text).toContain('opener.newcomer')
  })

  it('#3773.1 — un portefeuille chargé ne se COMPTE PAS à l’accueil : « Sur quoi avance-t-on ? » suffit', () => {
    const text = lauraOpener(t, { ...LOADING, portfolioCount: 48, settled: true })
    expect(text).toContain('opener.neutral')
    expect(text).not.toContain('48')
    expect(text).not.toContain('count')
  })

  // #3772.5 — la demande visait à BORNER ce compteur à la portée choisie ;
  // #3773.1 l'a réglée autrement, en le RETIRANT. Avec un compte précis en
  // portée aussi, donc : aucun chiffre de portefeuille, quelle que soit la
  // portée — rien à border puisqu'il n'y a plus de chiffre du tout.
  it('#3772.5 — un compte précis en portée ne fait pas réapparaître le compteur de portefeuille', () => {
    const text = lauraOpener(t, { ...LOADING, portfolioCount: 48, accountName: 'SNCF', settled: true })
    expect(text).toContain('opener.account')
    expect(text).not.toContain('48')
  })

  it('#3773.1 — un vivier rempli sans portefeuille reste l’accueil court, et n’est pas « peu de contexte »', () => {
    const text = lauraOpener(t, { ...LOADING, settled: true, portfolioCount: 0, hasVivier: true })
    expect(text).toContain('opener.neutral')
    expect(text).not.toContain('opener.newcomer')
  })

  it('un fil cadré sur un compte nomme ce compte, avant tout le reste', () => {
    const text = lauraOpener(t, { ...LOADING, portfolioCount: 25, accountName: 'SNCF' })
    expect(text).toContain('opener.account')
    expect(text).toContain('\\"account\\":\\"SNCF\\"')
  })

  it('en démonstration, dit que c’est une démonstration — jamais une promesse du réel (#1942)', () => {
    const text = lauraOpener(t, { ...LOADING, isDemo: true, portfolioCount: 25, accountName: 'SNCF' })
    expect(text).toContain('opener.demo')
    expect(text).not.toContain('opener.neutral')
  })
})

/** #1936 — la 1re ouverture du jour EST le brief (décision de Louis du 12/09). */
describe('lauraOpener — cas morningBrief', () => {
  it('le brief en trois blocs REMPLACE l’amorce courte', () => {
    const text = lauraOpener(t, { ...LOADING, portfolioCount: 25, morningBrief: { briefing: null, role: null } })
    expect(text).toContain('opener.brief.changed.title')
    expect(text).toContain('opener.brief.prepared.title')
    expect(text).toContain('opener.brief.advice.title')
    expect(text).not.toContain('opener.neutral')
  })

  it('salue par le prénom du PROFIL, jamais par celui du brief', () => {
    const text = lauraOpener(t, { ...LOADING, morningBrief: { briefing: null, role: null } })
    expect(text).toContain('opener.brief.greetingWithName')
    expect(text).toContain('"firstName":"Louis"')
  })

  it('en démonstration, le brief dit AUSSI que c’est une démonstration (#1942)', () => {
    const text = lauraOpener(t, { ...LOADING, isDemo: true, morningBrief: { briefing: null, role: null } })
    expect(text).toContain('opener.brief.changed.title')
    expect(text).toContain('opener.demo')
  })

  it('sans brief (pas la première du jour), l’amorce courte du lot 1 reste', () => {
    const text = lauraOpener(t, { ...LOADING, portfolioCount: 25, morningBrief: null })
    expect(text).toContain('opener.neutral')
    expect(text).not.toContain('opener.brief')
  })
})

/** #1921.9 — « puis Laura prend la parole » après l'accueil de fin d'onboarding. */
describe('lauraOpener — cas justOnboarded', () => {
  it('prend le relais de l’accueil, avec le prénom du profil', () => {
    const text = lauraOpener(t, { ...LOADING, justOnboarded: true, settled: true, portfolioCount: 0 })
    expect(text).toContain('opener.justOnboardedWithName')
    expect(text).toContain('"firstName":"Louis"')
    expect(text).not.toContain('opener.newcomer')
  })

  it('sans prénom, n’en invente aucun', () => {
    const text = lauraOpener(t, { ...LOADING, firstName: '', justOnboarded: true })
    expect(text).toContain('opener.justOnboarded')
    expect(text).not.toContain('firstName')
  })

  it('en démonstration, la démonstration l’emporte', () => {
    const text = lauraOpener(t, { ...LOADING, isDemo: true, justOnboarded: true })
    expect(text).toContain('opener.demo')
    expect(text).not.toContain('opener.justOnboarded')
  })
})

/**
 * #3773.1 — une salutation d'interface n'est pas un message du fil : seules les
 * prises de parole qui POSENT une question rattachée à la réponse sont écrites.
 */
describe('lauraOpenerPersists — salutation d’interface ou message du fil', () => {
  it('la salutation courte, la salutation d’un compte et celle de la démonstration ne s’écrivent PAS dans le fil', () => {
    expect(lauraOpenerPersists({ ...LOADING, portfolioCount: 48, settled: true })).toBe(false)
    expect(lauraOpenerPersists({ ...LOADING, accountName: 'SNCF' })).toBe(false)
    expect(lauraOpenerPersists({ ...LOADING, isDemo: true })).toBe(false)
  })

  it('le brief du jour, le passage de main de l’onboarding et « tu veux que je choisisse ? » restent des messages', () => {
    expect(lauraOpenerPersists({ ...LOADING, morningBrief: { briefing: null, role: null } })).toBe(true)
    expect(lauraOpenerPersists({ ...LOADING, justOnboarded: true })).toBe(true)
    expect(lauraOpenerPersists({ ...LOADING, settled: true, portfolioCount: 0 })).toBe(true)
  })
})
