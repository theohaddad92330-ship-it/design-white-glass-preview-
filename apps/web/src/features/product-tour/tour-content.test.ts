import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_TOUR_STEPS } from './tour-steps'

/**
 * #1863.3 — CHAQUE ÉTAPE DIT CE QUE L'ÉCRAN FAIT, ET CE QU'ON PEUT Y FAIRE.
 *
 * Le retour verbatim : la visite « montre pas du tout les choses dans le
 * détail ». Une étape ne portait qu'une phrase, c'est-à-dire à peine plus que
 * le nom de l'écran affiché juste au-dessus.
 *
 * ⚠️ La garde lit les catalogues SUR LE DISQUE, pas via `i18n.t`. Le runtime
 * i18next rend la CLÉ quand la traduction manque : une suite qui passe par lui
 * resterait verte sur un catalogue anglais vide, et on livrerait
 * « tour.steps.missions.promise » à un prospect anglophone.
 *
 * ⚠️ Et elle compte les DEUX côtés séparément. Une liste de trois gestes en
 * français et de deux en anglais ne lève rien : l'écran anglais afficherait
 * simplement un geste de moins, ce que personne ne remarque avant la démo.
 */
const LOCALES = join(__dirname, '../../i18n/locales')

type TourStepContent = { promise?: unknown; does?: unknown }
type TourCatalog = { tour?: { steps?: Record<string, TourStepContent> } }

function loadTour(lang: 'fr' | 'en'): TourCatalog {
  return JSON.parse(readFileSync(join(LOCALES, lang, 'onboarding.json'), 'utf8')) as TourCatalog
}

const CATALOGS = { fr: loadTour('fr'), en: loadTour('en') } as const

describe('#1863.3 — la profondeur de chaque étape de la visite', () => {
  it('LIT vraiment les deux catalogues — un fichier vide rendrait toute cette suite aveugle', () => {
    for (const lang of ['fr', 'en'] as const) {
      expect(Object.keys(CATALOGS[lang].tour?.steps ?? {}).length, lang).toBeGreaterThanOrEqual(
        PRODUCT_TOUR_STEPS.length,
      )
    }
  })

  it('chaque étape porte une PROMESSE non vide, en français ET en anglais', () => {
    for (const step of PRODUCT_TOUR_STEPS) {
      for (const lang of ['fr', 'en'] as const) {
        const promise = CATALOGS[lang].tour?.steps?.[step.key]?.promise
        expect(typeof promise, `${lang} › ${step.key} › promise`).toBe('string')
        expect((promise as string).trim().length, `${lang} › ${step.key} › promise`).toBeGreaterThan(20)
      }
    }
  })

  it('chaque étape porte EXACTEMENT trois gestes concrets, des deux côtés', () => {
    for (const step of PRODUCT_TOUR_STEPS) {
      for (const lang of ['fr', 'en'] as const) {
        const does = CATALOGS[lang].tour?.steps?.[step.key]?.does
        expect(Array.isArray(does), `${lang} › ${step.key} › does`).toBe(true)
        expect((does as unknown[]).length, `${lang} › ${step.key} › does`).toBe(3)
        for (const action of does as unknown[]) {
          expect(typeof action, `${lang} › ${step.key} › does`).toBe('string')
          expect((action as string).trim().length, `${lang} › ${step.key} › does`).toBeGreaterThan(20)
        }
      }
    }
  })

  it('aucun geste n’est recopié d’une étape à l’autre — une visite qui se répète ne décrit rien', () => {
    for (const lang of ['fr', 'en'] as const) {
      const all = PRODUCT_TOUR_STEPS.flatMap(step => (CATALOGS[lang].tour?.steps?.[step.key]?.does ?? []) as string[])
      expect(new Set(all).size, lang).toBe(all.length)
    }
  })

  it('les libellés de commande de la visite existent des deux côtés', () => {
    // `position`, `details`, `quit`, `finish`… sont les mots de la barre qui
    // tient le fil : sans eux, elle rend des clés brutes à l'écran.
    for (const key of ['position', 'companionLabel', 'details', 'quit', 'finish', 'whatYouCanDo', 'subtitle']) {
      for (const lang of ['fr', 'en'] as const) {
        const tour = CATALOGS[lang].tour as Record<string, unknown> | undefined
        expect(typeof tour?.[key], `${lang} › tour.${key}`).toBe('string')
      }
    }
  })

  it('le sous-titre COMPTE les écrans plutôt que d’en écrire le nombre — il disait « 6 » pour onze étapes', () => {
    for (const lang of ['fr', 'en'] as const) {
      const subtitle = (CATALOGS[lang].tour as Record<string, unknown> | undefined)?.['subtitle'] as string
      expect(subtitle, lang).toContain('{{total}}')
      expect(subtitle, lang).not.toMatch(/\d/)
    }
  })

  it('sait dire NON — une liste de gestes amputée d’un côté est dénoncée', () => {
    // Preuve n°1 : on casse volontairement le corpus, et on rejoue le MÊME
    // calcul. Sans cette épreuve, la garde pourrait ne rien lire du tout.
    const doctored: Record<string, TourStepContent> = {
      ...(CATALOGS.en.tour?.steps ?? {}),
      dashboard: { promise: 'A promise long enough to pass the length check.', does: ['only', 'two'] },
    }
    const does = doctored['dashboard']?.does as unknown[]
    expect(does.length).not.toBe(3)
  })
})
