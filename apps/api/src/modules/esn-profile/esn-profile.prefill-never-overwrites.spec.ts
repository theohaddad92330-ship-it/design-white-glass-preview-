import { Logger } from '@nestjs/common'
import type { EsnAnswers, PrefilledField } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import type { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'
import { EsnProfileController } from './esn-profile.controller'
import type { EsnProfileService } from './esn-profile.service'
import type { OfferPortfolioService } from './offer-portfolio.service'

/**
 * #2028.6 / #2028.7 — UNE CORRECTION HUMAINE GAGNE, Y COMPRIS CONTRE UNE
 * DONNÉE PUBLIQUE QUI A CHANGÉ.
 *
 * Ce qui existait avant ce test : `applyPrefill` (`onboardingStore.ts`)
 * protégeait les réponses déjà remplies EN SESSION, et rien côté serveur. La
 * conséquence se voit sur le chemin de RECONFIGURATION, qui est exactement
 * celui de #2022 : la session est neuve, le profil est déjà rempli, le registre
 * a changé — et la proposition revenait par-dessus la correction, avec son
 * badge « d'après le registre », comme si l'utilisateur n'avait jamais rien
 * corrigé.
 *
 * Le prefill n'écrit toujours RIEN (c'est le front qui écrit par
 * `PUT /esn-profile`) : ce qui change est qu'il ne PROPOSE plus d'écraser. Le
 * refus passe par `decideFieldWrite` (`applyFieldUpdates`, contrats) comme
 * toute écriture de champ du dépôt — pas par une comparaison réécrite ici.
 */

const user = { userId: 'u-1', email: 'commercial@kicklox.test' } as CurrentUserPayload

function field(value: string | string[]): PrefilledField {
  return { value, confidence: 'high', source: 'registry', as_of: null }
}

const company = {
  name: 'KICKLOX',
  legal_name: null,
  commercial_name: null,
  siren: '811234567',
  city: 'Paris',
  country: null,
  naf_code: '6202A',
  naf_label: 'Conseil en systèmes et logiciels informatiques',
  is_esn_naf: true,
  is_active: null,
  website: 'https://kicklox.com',
  headcount_label: '20 à 49 salariés',
  group: null,
}

function build(currentAnswers: Partial<EsnAnswers> | Error | undefined) {
  const esnProfile = {
    getAnswers: jest.fn(async () => {
      if (currentAnswers instanceof Error) throw currentAnswers
      return currentAnswers as EsnAnswers
    }),
    getWorkspaceMeta: jest.fn(),
    upsertAnswers: jest.fn(),
    regenerateProfileContext: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<EsnProfileService, 'getAnswers' | 'getWorkspaceMeta' | 'upsertAnswers' | 'regenerateProfileContext'>
  >
  const profileContext = { triggerGeneration: jest.fn() } as unknown as jest.Mocked<
    Pick<ProfileContextService, 'triggerGeneration'>
  >
  const ia = {
    prefillEsnProfile: jest.fn(async () => ({
      matched: true,
      company,
      fields: {
        // La valeur PUBLIQUE a changé depuis la dernière fois.
        esn_name: field('KICKLOX SAS'),
        positioning: field('Généraliste - large spectre selon les besoins client'),
        // Celle-ci n'a jamais été répondue : rien à protéger.
        offer_domain: field('esn_it'),
      },
    })),
  } as unknown as jest.Mocked<Pick<IaClient, 'prefillEsnProfile'>>

  return {
    esnProfile,
    profileContext,
    ia,
    controller: new EsnProfileController(
      esnProfile as unknown as EsnProfileService,
      {} as unknown as OfferPortfolioService,
      profileContext as unknown as ProfileContextService,
      ia as unknown as IaClient,
      {} as unknown as MarketMemoryService,
      // #2018.7 — 6e paramètre, en dernier ; aucun cas de ce fichier ne l'appelle.
      {} as unknown as EsnProfileCorrectionRequestService,
    ),
  }
}

describe('#2028.6 / #2028.7 — un second prefill ne propose jamais d’écraser une réponse', () => {
  let errorLog: jest.SpyInstance
  let infoLog: jest.SpyInstance

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    infoLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    errorLog.mockRestore()
    infoLog.mockRestore()
  })

  it('SAIT DIRE NON — la valeur corrigée tient, le registre ne la repropose pas', async () => {
    // L'utilisateur a corrigé « KICKLOX SAS » en « Kicklox » et vidé le site.
    const built = build({ esn_name: 'Kicklox' } as Partial<EsnAnswers>)

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.esn_name).toBeUndefined()
    // …et rien n'a été écrit, comme avant : le prefill reste sans effet de bord.
    expect(built.esnProfile.upsertAnswers).not.toHaveBeenCalled()
    expect(built.profileContext.triggerGeneration).not.toHaveBeenCalled()
  })

  it('SAIT DIRE OUI — un champ jamais répondu reste proposé, avec sa provenance', async () => {
    const built = build({ esn_name: 'Kicklox' } as Partial<EsnAnswers>)

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.offer_domain).toEqual(field('esn_it'))
    expect(result.fields.positioning).toEqual(field('Généraliste - large spectre selon les besoins client'))
  })

  it('LE TÉMOIN — un profil ENTIÈREMENT vierge reçoit la proposition complète', async () => {
    const built = build({} as Partial<EsnAnswers>)

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(Object.keys(result.fields).sort()).toEqual(['esn_name', 'offer_domain', 'positioning'])
  })

  it('une réponse vide ne protège RIEN : un blanc n’est pas une correction', async () => {
    const built = build({ esn_name: '   ', positioning: '' } as Partial<EsnAnswers>)

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(result.fields.esn_name).toEqual(field('KICKLOX SAS'))
    expect(result.fields.positioning).toEqual(field('Généraliste - large spectre selon les besoins client'))
  })

  it('une lecture de profil IMPOSSIBLE ne se lit pas « profil vide » — elle est journalisée', async () => {
    const built = build(new Error('ECONNRESET esn_profiles'))

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    // On ne sait pas ce que la personne a déjà répondu : on n'invente pas un
    // profil vierge, mais on ne prive pas non plus un vrai nouveau venu de son
    // préremplissage — le prefill n'écrit rien, c'est le badge et son geste de
    // confirmation qui décident. Le trou est DIT dans le journal, pas tu.
    expect(Object.keys(result.fields).sort()).toEqual(['esn_name', 'offer_domain', 'positioning'])
    expect(errorLog).toHaveBeenCalled()
  })
})

/**
 * #2028.7 — « …ET PAS EN SILENCE ». Le point demande DEUX choses, et la
 * seconde manquait : ne pas écraser, et que le refus laisse une trace.
 *
 * Sans elle, un champ protégé et un champ que le registre n'a jamais su
 * remplir se ressemblent exactement — côté serveur, les deux sont une clé
 * absente de la réponse. L'opérateur à qui on demande « pourquoi le SIREN
 * public ne remonte pas ? » n'a rien à lire.
 *
 * ⚠️ Ce qui est tracé est la CLÉ, jamais la valeur : la trace dit qu'une
 * correction a tenu, elle ne recopie pas ce que la personne a écrit.
 *
 * ⚠️ Et seuls les refus qui PROTÈGENT QUELQUE CHOSE sont tracés
 * (`lower_authority`). Une valeur publique identique à la réponse déjà donnée
 * est refusée elle aussi (`unchanged`), mais elle n'a rien protégé : la tracer
 * noierait le signal sous le bruit du cas le plus fréquent.
 */
describe('#2028.7 — le refus ne se fait pas en silence', () => {
  let errorLog: jest.SpyInstance
  let infoLog: jest.SpyInstance

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    infoLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    errorLog.mockRestore()
    infoLog.mockRestore()
  })

  it('SAIT DIRE NON — la trace NOMME le champ protégé, et ne recopie pas sa valeur', async () => {
    const built = build({ esn_name: 'Kicklox' } as Partial<EsnAnswers>)

    await built.controller.prefill(user, { name: 'Kicklox' })

    expect(infoLog).toHaveBeenCalledTimes(1)
    const [message, meta] = infoLog.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain('correction')
    expect(meta).toMatchObject({
      tags: { 'prefill.protected_fields': 'esn_name', 'prefill.protected_count': 1 },
      user: { id: 'u-1' },
    })
    // La valeur corrigée ne voyage PAS dans le journal.
    expect(JSON.stringify(infoLog.mock.calls)).not.toContain('Kicklox')
  })

  it('LE TÉMOIN — un profil vierge ne protège rien, donc ne trace rien', async () => {
    const built = build({} as Partial<EsnAnswers>)

    await built.controller.prefill(user, { name: 'Kicklox' })

    expect(infoLog).not.toHaveBeenCalled()
  })

  it('un refus qui ne protège RIEN ne se trace pas : la valeur publique est déjà la réponse', async () => {
    // Le registre repropose mot pour mot ce qui est déjà en base : refusé
    // (`unchanged`), mais aucune correction n'a été défendue.
    const built = build({ esn_name: 'KICKLOX SAS' } as Partial<EsnAnswers>)

    await built.controller.prefill(user, { name: 'Kicklox' })

    expect(built.controller).toBeDefined()
    expect(infoLog).not.toHaveBeenCalled()
  })

  it('LIT un corpus non vide — trois champs sont soumis à l’arbitre à chaque prefill', async () => {
    const built = build({} as Partial<EsnAnswers>)

    const result = await built.controller.prefill(user, { name: 'Kicklox' })

    expect(Object.keys(result.fields)).toHaveLength(3)
  })
})
