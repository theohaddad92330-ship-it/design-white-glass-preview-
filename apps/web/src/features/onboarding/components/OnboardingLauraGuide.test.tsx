import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_COPILOT_NAME } from '@bellum/contracts'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { OnboardingLauraGuide, parseOnboardingSubStep, RESUME_FLAG_KEY } from './OnboardingLauraGuide'

const state = { answers: {} as Record<string, string | string[]> }

vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (selector: (s: { answers: Record<string, unknown> }) => unknown) => selector(state),
}))

/**
 * La DERNIÈRE sous-étape d'une étape, DÉRIVÉE du parcours (GA-26) : les lots
 * en ajoutent régulièrement EN FIN d'étape, et un slug recopié ici désigne la
 * veille un écran de résumé, le lendemain un écran du milieu — le test devient
 * alors vert ou rouge pour une raison qui n'a rien à voir avec ce qu'il garde.
 *
 * Né de la fusion (#2626.1) : dérivée de `TEMPS1_SUBSTEPS` (ce que le Temps 1
 * pose ENCORE), pas de `TEMPS1_STAGES` (le catalogue brut) — `findSubStep`,
 * que le composant appelle réellement, ne lit que `TEMPS1_SUBSTEPS` ; une
 * sous-étape entièrement reportée au Temps 2 en est absente, et un slug tiré
 * du catalogue brut pointerait vers un écran que le composant traite comme
 * hors du parcours.
 */
function derniereSousEtape(stageCode: string): string {
  const steps = TEMPS1_SUBSTEPS.filter(step => step.stageCode === stageCode)
  const derniere = steps.at(-1)
  if (!derniere) throw new Error(`étape inconnue : ${stageCode}`)
  return derniere.slug
}

function setPath(pathname: string): void {
  window.history.pushState({}, '', pathname)
}

/** i18next résout `{{copilot}}` via `defaultVariables` (repli = Laura) sans
 *  `BrandProvider` monté (voir `i18n/index.ts`) — les tests attendent le texte
 *  déjà interpolé, jamais le gabarit brut. */
function withCopilot(template: string): string {
  return template.replaceAll('{{copilot}}', DEFAULT_COPILOT_NAME)
}

describe('parseOnboardingSubStep', () => {
  it('résout la sous-étape depuis une URL réelle du questionnaire', () => {
    const sub = parseOnboardingSubStep('/onboarding/acme-labs/company_info/equipe-commerciale')
    expect(sub?.stageCode).toBe('company_info')
    expect(sub?.slug).toBe('equipe-commerciale')
  })

  it('rend `undefined` hors du questionnaire, jamais un contexte inventé', () => {
    expect(parseOnboardingSubStep('/dashboard')).toBeUndefined()
    expect(parseOnboardingSubStep('/onboarding/acme/company_info/pas-une-sous-etape')).toBeUndefined()
  })
})

describe('OnboardingLauraGuide', () => {
  beforeEach(() => {
    sessionStorage.clear()
    state.answers = {}
    setPath('/')
  })

  it('#2020 — ne rend rien hors du parcours de questions', () => {
    setPath('/dashboard')
    const { container } = render(<OnboardingLauraGuide />)
    expect(container.textContent).toBe('')
  })

  it('#2020.7 — première question du parcours : pas de message de reprise', () => {
    setPath('/onboarding/acme/company_info/entreprise')
    const { container } = render(<OnboardingLauraGuide />)
    expect(container.textContent).toBe('')
  })

  it('#2020.7 — atterrir en cours de parcours affiche le message de reprise', () => {
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    render(<OnboardingLauraGuide />)
    expect(screen.getByText(withCopilot(fr.guide.resume.message))).toBeInTheDocument()
  })

  it('#2020.7/.13 — ne se réaffiche pas à un second montage dans le même onglet', () => {
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    render(<OnboardingLauraGuide />)
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    const { container } = render(<OnboardingLauraGuide />)
    expect(container.textContent).toBe('')
  })

  it('#2020.10/.11 — « Compris » referme le message SANS jamais ouvrir de dialogue', async () => {
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    render(<OnboardingLauraGuide />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: fr.guide.resume.dismiss }))

    expect(screen.queryByText(withCopilot(fr.guide.resume.message))).toBeNull()
  })

  it("#2020.6 — dernière sous-étape d'une étape à plusieurs sous-étapes : résume ce qui est déjà répondu", () => {
    // Message de reprise déjà consommé cet onglet — ce test isole le résumé.
    sessionStorage.setItem(RESUME_FLAG_KEY, '1')
    // #2626.1 revient sur le choix de l'étape `offer_expertise`, délibérément :
    // `offer_domains` (et tout ce qui suivait `positionnement` dans cette
    // étape) a rejoint les questions reportées au Temps 2 — `TEMPS1_SUBSTEPS`
    // ne les porte plus, elles ne peuvent plus apparaître dans un résumé
    // Temps 1. `target_market` retient encore trois sous-étapes (secteurs,
    // cibles, frein) sur deux clés requises réparties sur deux sous-étapes
    // différentes, assez pour garder le témoin « répondu / pas répondu ».
    state.answers = {
      target_sectors: ['Fintech'],
      target_company_types: ['ETI'],
      geo_zones: [],
    }
    setPath(`/onboarding/acme/target_market/${derniereSousEtape('target_market')}`)
    render(<OnboardingLauraGuide />)

    expect(screen.getByText(fr.questions.targetSectors.label)).toBeInTheDocument()
    expect(screen.getByText(fr.questions.targetCompanyTypes.label)).toBeInTheDocument()
    // #2020.6 — jamais un « répondu » fictif : une question non remplie
    // n'entre pas dans le résumé, même si elle appartient à une sous-étape
    // déjà passée.
    expect(screen.queryByText(fr.questions.geoZones.label)).toBeNull()
  })

  it("#2020.6 — pas la dernière sous-étape de l'étape : aucun résumé", () => {
    sessionStorage.setItem(RESUME_FLAG_KEY, '1')
    state.answers = { offer_domains: ['Cloud'] }
    setPath('/onboarding/acme/offer_expertise/domaines')
    const { container } = render(<OnboardingLauraGuide />)
    expect(container.textContent).toBe('')
  })

  it('#2020.13 — une seule intervention par écran : la reprise passe avant le résumé', () => {
    state.answers = { esn_name: 'Acme Consulting' }
    // `equipe-commerciale` est À LA FOIS la 2e sous-étape du parcours global
    // (reprise éligible) ET la dernière de l'étape `company_info` (résumé
    // éligible) : les deux conditions se présentent sur le MÊME écran.
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    render(<OnboardingLauraGuide />)

    expect(screen.getByText(withCopilot(fr.guide.resume.message))).toBeInTheDocument()
    expect(screen.queryByText(fr.questions.esnName.label)).toBeNull()
  })

  it('#2020.8 — aucun chemin d’écriture : interagir avec le guide ne modifie jamais les réponses', async () => {
    // Le mock `useOnboardingStore` ci-dessus n'expose NI `.getState()` NI
    // `setAnswer` : un appel à l'un ou l'autre ferait planter ce test avant
    // même l'assertion — la preuve que le composant ne les référence pas.
    state.answers = { esn_name: 'Acme Consulting' }
    setPath('/onboarding/acme/company_info/equipe-commerciale')
    render(<OnboardingLauraGuide />)
    const before = { ...state.answers }

    await userEvent.click(screen.getByRole('button', { name: fr.guide.resume.dismiss }))

    expect(state.answers).toEqual(before)
  })
})

describe('guide — libellés FR + EN (#2020)', () => {
  it('les quatre clés existent et sont non vides dans les deux langues', () => {
    const leaves = [fr.guide.title, fr.guide.resume.message, fr.guide.resume.dismiss, fr.guide.stageSummary.title]
    const enLeaves = [en.guide.title, en.guide.resume.message, en.guide.resume.dismiss, en.guide.stageSummary.title]
    for (const value of [...leaves, ...enLeaves]) {
      expect(typeof value).toBe('string')
      expect((value as string).trim().length).toBeGreaterThan(0)
    }
  })

  it("le copilote s'injecte par {{copilot}}, jamais écrit en dur (doctrine white-label)", () => {
    expect(fr.guide.title).toMatch(/\{\{copilot\}\}/)
    expect(fr.guide.resume.message).toMatch(/\{\{copilot\}\}/)
    expect(fr.guide.title).not.toMatch(/Laura/)
    expect(fr.guide.resume.message).not.toMatch(/Laura/)
  })

  it('ne promet ni score ni probabilité (doctrine c26_probabilite)', () => {
    const forbidden = /%|probabilit|chance de|score de/i
    for (const value of [fr.guide.title, fr.guide.resume.message, fr.guide.stageSummary.title]) {
      expect(value).not.toMatch(forbidden)
    }
  })
})
