import { describe, expect, it } from 'vitest'
import { ctaFor, type CtaLinks } from './cta'
import { containsInternalEmail } from './guardrails'
import { buildPrefill } from './prefill'
import type { Route } from './routing'

const LINKS: CtaLinks = {
  demoUrl: 'https://app.bellum-ai.com/demo',
  bookingUrl: null,
  appUrl: 'https://app.bellum-ai.com',
  siteUrl: 'https://bellum-ai.com',
}

const ROUTES: readonly Route[] = ['calendly', 'demo', 'signup', 'support', 'human', 'resource']

describe('le bouton proposé au visiteur', () => {
  it('mène toujours quelque part — un bouton sans destination est un bouton mort', () => {
    for (const route of ROUTES) expect(ctaFor(route, LINKS).url).toBeTruthy()
  })

  // La moitié invisible du bug de production du §2 : le message d'échec passait
  // par le modèle et par le filtre de sortie, le `mailto:` du bouton ne passait
  // par ni l'un ni l'autre.
  it.each(ROUTES)('%s ne porte JAMAIS d’adresse e-mail', route => {
    const url = ctaFor(route, LINKS).url ?? ''
    expect(url.startsWith('mailto:')).toBe(false)
    expect(containsInternalEmail(url)).toBe(false)
  })

  it('mène « écrire à l’équipe » vers le formulaire, pas vers une boîte', () => {
    expect(ctaFor('human', LINKS).url).toBe('https://bellum-ai.com/beta')
    expect(ctaFor('support', LINKS).url).toBe('https://bellum-ai.com/beta')
  })

  it('préfère le lien de réservation quand l’opérateur l’a posé', () => {
    const links = { ...LINKS, bookingUrl: 'https://cal.example/theo' }
    expect(ctaFor('calendly', links).url).toBe('https://cal.example/theo')
    expect(ctaFor('human', links).url).toBe('https://cal.example/theo')
  })
})

describe('le prefill (chantier n°5) ne se pose que sur le lien de compte', () => {
  const prefill = buildPrefill({ companyType: 'esn', pain: 'texte libre' })

  it('accroche le contexte au lien de création de compte', () => {
    expect(ctaFor('signup', LINKS, prefill).url).toBe(`https://app.bellum-ai.com/signup?${prefill.query}`)
  })

  it('ne touche à aucun autre bouton — rien ne se crée sans le geste précis', () => {
    for (const route of ROUTES) {
      if (route === 'signup') continue
      expect(ctaFor(route, LINKS, prefill).url).toBe(ctaFor(route, LINKS).url)
    }
  })

  it('rend le lien nu sans prefill fourni — comportement inchangé', () => {
    expect(ctaFor('signup', LINKS).url).toBe('https://app.bellum-ai.com/signup')
  })
})
