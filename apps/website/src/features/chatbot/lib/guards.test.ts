import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { behaviourFor, shouldAutoOpen } from './auto-open'
import { ctaFor } from './cta'
import { containsInternalEmail, redactOutput } from './guardrails'
import { asksAboutPricing } from './public-pricing'
import { promptState, scoreLead, type LeadState, type Route } from './routing'
import { buildLauraSystemPrompt } from './system-prompt'
import { parseUpdateLead } from './tools'
import frChatbot from '../../../../messages/fr/chatbot.json'

/**
 * LES HUIT GARDES DU §7.2 DU PDF 10.
 *
 * Elles portent sur le CODE et non sur le modèle. Un test qui interrogerait
 * Claude mesurerait sa bonne volonté du jour ; celles-ci mesurent une propriété
 * du produit, et elles restent vraies quand le modèle est convaincu du
 * contraire.
 *
 * ⚠️ Les vingt conversations de référence du §7.1 vivent dans
 * `golden-conversations.test.ts`. Le document demande de les « rejouer en CI » ;
 * ce qui est rejoué en CI est leur part DÉTERMINISTE — prompt construit, score,
 * route, garde-fous, CTA — parce qu'une CI qui appelle un modèle rougit le jour
 * où le modèle change d'avis, et qu'une garde qu'on désactive ne garde rien.
 */

const LINKS = {
  demoUrl: 'https://app.bellum-ai.com/demo',
  bookingUrl: null,
  appUrl: 'https://app.bellum-ai.com',
  siteUrl: 'https://bellum-ai.com',
}

const PROMPT_CONTEXT = {
  demoUrl: LINKS.demoUrl,
  calendlyUrl: 'https://bellum-ai.com/beta',
  appUrl: LINKS.appUrl,
  privacyUrl: 'https://bellum-ai.com/privacy',
}

const ALL_ROUTES: readonly Route[] = ['calendly', 'demo', 'signup', 'support', 'human', 'resource']

describe('GL-01 — aucune adresse interne ne sort, texte ET bouton', () => {
  it('retire l’adresse du texte final', () => {
    expect(redactOutput('Écris à theo@bellum-it.com')).not.toContain('bellum-it.com')
    expect(redactOutput('contact@bellum-ai.com te répondra')).not.toContain('bellum-ai.com')
  })

  it('n’en met aucune dans le bouton — le champ structuré ne passe par aucun filtre', () => {
    for (const route of ALL_ROUTES) expect(containsInternalEmail(ctaFor(route, LINKS).url ?? '')).toBe(false)
  })

  it('n’en met aucune dans le prompt système', () => {
    expect(containsInternalEmail(buildLauraSystemPrompt(PROMPT_CONTEXT))).toBe(false)
  })

  it('n’en met aucune dans les libellés de l’interface', () => {
    expect(containsInternalEmail(JSON.stringify(frChatbot))).toBe(false)
  })
})

describe('GL-02 — les tics de langage du transcript sont interdits', () => {
  const prompt = buildLauraSystemPrompt(PROMPT_CONTEXT)

  it.each(['je note', 'petite correction', 'Tu ne te corriges pas dans le même message'])(
    'le prompt nomme explicitement « %s »',
    fragment => {
      expect(prompt.toLowerCase()).toContain(fragment.toLowerCase())
    },
  )

  it('n’annonce un échec de transmission qu’UNE fois par session', () => {
    // Le code, pas le prompt : le tour suivant reçoit « déjà signalé », donc il
    // n'y a plus rien à re-verbaliser.
    const source = readRouteSource()
    expect(source).toContain('failedHandoff')
    expect(source).toContain('déjà signalé')
    expect(source).not.toContain('salesRecipient()}`')
  })
})

describe('GL-03 — la grille tarifaire n’apparaît que si on l’a demandée', () => {
  it('ne se déclenche PAS sur une objection', () => {
    // Le défaut n°6 : « t'es trop cher » n'est pas une question de prix.
    expect(asksAboutPricing(["t'es trop cher"])).toBe(false)
    expect(asksAboutPricing(['ça me paraît cher pour ce que c’est'])).toBe(false)
  })

  it.each([
    'combien ça coûte ?',
    'vos tarifs ?',
    'quel est le prix ?',
    'how much does it cost?',
    'was kostet das?',
    'wat zijn de prijzen?',
    'vous avez un budget minimum ?',
    "c'est payant ?",
  ])('se déclenche sur %j', message => {
    expect(asksAboutPricing([message])).toBe(true)
  })

  it('regarde tout le fil, pas seulement le dernier message', () => {
    expect(asksAboutPricing(['bonjour', 'vos tarifs ?', 'ok'])).toBe(true)
  })

  it('le prompt sans bloc TARIFS ne contient aucun montant', () => {
    expect(buildLauraSystemPrompt(PROMPT_CONTEXT)).not.toMatch(/\d+\s?€/)
  })
})

describe('GL-04 — le score n’apparaît jamais', () => {
  const state: LeadState = { companyType: 'esn', teamSize: '16-150', persona: 'founder', painFit: 'covered' }

  it('n’est ni dans l’état envoyé au modèle, ni dans le prompt', () => {
    const conversation = promptState({ state, booking: false, exchanges: 2 })
    const prompt = buildLauraSystemPrompt({ ...PROMPT_CONTEXT, conversation })
    expect(JSON.stringify(conversation)).not.toMatch(/score/i)
    expect(prompt).not.toContain(String(scoreLead(state)))
    expect(prompt).not.toMatch(/\b(score|points?|palier|chaud|ti[èe]de|froid)\b/i)
  })

  it('ne voyage pas non plus dans la réponse — le contrat n’a pas de champ pour ça', () => {
    const contract = readSource('src/features/chatbot/lib/contract.ts')
    expect(contract).not.toMatch(/score\s*[?:]/)
  })
})

describe('GL-05 — aucun secret dans le prompt système', () => {
  const prompt = buildLauraSystemPrompt({
    ...PROMPT_CONTEXT,
    currentPage: 'pricing',
    pricing: 'Starter 119 € · Growth 249 €',
    featureStatus: 'CRM : disponible',
    conversation: promptState({ state: { companyType: 'esn' }, booking: false, exchanges: 1 }),
  })

  it.each([
    [/sk-ant-/i, 'clé Anthropic'],
    [/service[_-]?role/i, 'clé service-role'],
    [/supabase\.co|up\.railway\.app|vercel\.app/i, 'hôte interne'],
    [/SUPABASE_|ANTHROPIC_|STRIPE_|RESEND_|INTERNAL_API_SECRET/i, 'variable d’environnement'],
    [/\bpostgres(ql)?:\/\//i, 'chaîne de connexion'],
  ])('ne contient pas %s (%s)', pattern => {
    expect(prompt).not.toMatch(pattern)
  })

  it('ne nomme aucun fournisseur technique', () => {
    for (const vendor of ['Anthropic', 'Claude', 'OpenAI', 'Supabase', 'Railway', 'Apollo', 'Firecrawl']) {
      expect(prompt).not.toContain(vendor)
    }
  })
})

describe('GL-06 — aucune ouverture automatique sur une page légale', () => {
  it.each(['/legal', '/privacy', '/cookies', '/cgu', '/cgv', '/dpa', '/status'])('%s reste silencieuse', pathname => {
    for (const locale of ['', '/fr', '/en', '/de', '/nl']) {
      const full = `${locale}${pathname}`
      expect(behaviourFor(full)).toBe('silent')
      expect(
        shouldAutoOpen({
          pathname: full,
          visit: { autoOpened: false, dismissed: false, visitCount: 3 },
          viewport: 'desktop',
          exitIntent: true,
        }),
      ).toBeNull()
    }
  })
})

describe('GL-07 — la mention « assistante IA » est toujours là', () => {
  it('vit dans l’en-tête du widget, dans les quatre langues', () => {
    // Elle est rendue à côté du nom, jamais dans l'avatar : un avatar la ferait
    // disparaître partout où il est petit.
    const widget = readSource('src/features/chatbot/ChatWidget.tsx')
    expect(widget).toContain("t('header.role')")
    // ⚠️ Lit le composant PARTAGÉ (01/09/2026). `LauraAvatar` était un
    // enrobage qui posait la palette du site sur un dessin monochrome ; depuis
    // que le visuel est une image opaque, il ne réglait plus rien — un
    // enrobage qui ne règle rien est un doublon, il a été retiré.
    expect(readSource('../../packages/ui/src/assets/laura-face.tsx')).not.toContain('header.role')
  })

  it.each(['fr', 'en', 'de', 'nl'])('%s nomme l’IA dans header.role et dans la mention légale', locale => {
    const catalog = readJson(`messages/${locale}/chatbot.json`) as {
      header: { role: string }
      disclosure: string
    }
    expect(catalog.header.role.toLowerCase()).toMatch(/ia|ai|ki/)
    expect(catalog.disclosure.toLowerCase()).toMatch(/ia|ai|ki/)
  })
})

describe('GL-08 — une adresse n’est retenue que si le visiteur l’a écrite', () => {
  it('accepte ce qui a été écrit et refuse le reste', () => {
    const said = ['mon mail : Paul@Acme-it.fr']
    expect(parseUpdateLead({ email: 'paul@acme-it.fr' }, said).email).toBe('paul@acme-it.fr')
    expect(parseUpdateLead({ email: 'contact@acme-it.fr' }, said).email).toBeNull()
  })

  it('ne se laisse pas convaincre par ce que Laura a elle-même écrit', () => {
    expect(parseUpdateLead({ email: 'paul@acme-it.fr' }, []).email).toBeNull()
  })
})

/* ------------------------------------------------------------------ */

function readSource(relative: string): string {
  // Lecture de source assumée : trois de ces gardes portent sur des propriétés
  // qu'aucun appel de fonction ne peut exposer — l'absence d'un champ dans un
  // contrat, la présence d'une mention dans un composant que la configuration
  // de test du site ne sait pas monter, l'absence d'une interpolation dans une
  // route. C'est la même leçon que la garde du bandeau de transparence du
  // PDF 9 : chercher un NOM ne prouve rien, il faut lire ce qui est écrit.
  return readFileSync(join(process.cwd(), relative), 'utf8')
}

function readRouteSource(): string {
  return readSource('src/app/api/chat/route.ts')
}

function readJson(relative: string): unknown {
  return JSON.parse(readSource(relative))
}
