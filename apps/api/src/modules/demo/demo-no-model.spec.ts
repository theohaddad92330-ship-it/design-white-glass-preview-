import { HttpException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CreditsService } from '../credits/credits.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountsController } from '../accounts/accounts.controller'
import { ConsultantsController } from '../consultants/consultants.controller'
import { IaProxyController } from '../ia-proxy/ia-proxy.controller'
import type { ChatContextService } from '../ia-proxy/chat-context.service'
import type { ChatMessagesService } from '../ia-proxy/chat-messages.service'
import type { ChatThreadDocumentsService } from '../ia-proxy/chat-thread-documents.service'
import type { DiscoverPortfolioService } from '../ia-proxy/discover-portfolio.service'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { DEMO_REAL_DISCOVER_COMPANIES } from './demo-discover-real-companies'
import { DEMO_DISCOVER_OWNED_CANDIDATE_NAMES } from './demo-scripts'

/**
 * Ce que fait la salle de démonstration quand on lui demande du travail réel.
 *
 * Le bandeau promet « données fictives, aucun crédit consommé, les analyses
 * réelles sont désactivées ». Vérifié dans le navigateur le 03/08, trois écrans
 * le démentaient. Ces tests fixent la règle sur les gestes concernés :
 *
 * - **Découvrir** : liste scriptée, aucun registre interrogé ;
 * - **préparation d'un besoin** et **réécriture de CV** : REFUS explicite —
 *   les deux débitent un crédit et appellent un modèle, et leur livrable est
 *   un document nominatif qu'on ne veut pas écrire d'avance.
 *
 * (L'analyse d'appel d'offres, elle, est scriptée : voir `rfp.service.spec.ts`.)
 */

const USER = { userId: 'user-1' } as CurrentUserPayload

// #3819.1 — les candidats « déjà suivis » de la salle (SNCF) viennent de la source unique
// `DEMO_DISCOVER_OWNED_CANDIDATE_NAMES` (GA-26), jamais d'une liste recopiée ici.
const SEEDED_BRIEF_ACCOUNTS: readonly string[] = [
  'Naval Group',
  ...DEMO_DISCOVER_OWNED_CANDIDATE_NAMES,
  // R24-FIX-B — décision Louis 04/10 : de vraies entreprises (SIREN, lui, reste fictif, contrôlé ci-dessus).
  ...DEMO_REAL_DISCOVER_COMPANIES.map(c => c.name),
]

describe('Découvrir en démonstration', () => {
  function build() {
    const ia = {
      discoverRegistry: jest.fn(),
      discoverSignals: jest.fn(),
    } as unknown as IaClient
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-demo' }),
    } as unknown as WorkspaceContextService
    const esnProfile = { resolveProfileData: jest.fn() } as unknown as EsnProfileReader
    // #3819.1 — la démo croise ses candidats « déjà suivis » avec le portefeuille : un
    // portefeuille vide ne rapproche rien et ne compte aucun besoin (jamais un nombre inventé).
    const portfolio = {
      stamp: jest.fn(),
      resolve: jest.fn(async (_userId: string, owned: readonly unknown[]) => owned.map(() => ({}))),
      resolveKnownNeeds: jest.fn(async (owned: readonly unknown[]) => owned.map(() => undefined)),
      resolveKnownNeedFacts: jest.fn(async (owned: readonly unknown[]) => owned.map(() => undefined)),
    } as unknown as DiscoverPortfolioService

    const controller = new IaProxyController(
      ia,
      {} as ChatMessagesService,
      workspaceContext,
      esnProfile,
      {} as ChatContextService,
      portfolio,
      { get: jest.fn() } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      {} as ChatThreadDocumentsService,
    )
    return { controller, ia, esnProfile }
  }

  it('n’interroge AUCUN registre — la liste est scriptée', async () => {
    // Vu en production : l'écran rendait de vraies entreprises avec leur SIREN
    // (une caisse d'épargne, deux sociétés de conseil) dans un espace qui
    // annonce des données fictives.
    const { controller, ia, esnProfile } = build()

    const response = await controller.discoverRegistry(USER, { filters: { sector: 'Informatique' } })

    expect(ia.discoverRegistry).not.toHaveBeenCalled()
    // Le profil ESN n'est même pas résolu : rien ne part, pas même une lecture.
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(response.candidates.length).toBeGreaterThan(0)
  })

  it('aucun candidat ne porte un identifiant qu’on pourrait croire vrai', async () => {
    // C'est le champ qu'un prospect recopie. Il doit faire neuf chiffres —
    // l'écran rejette tout le reste — mais commencer par huit zéros, ce
    // qu'aucun SIREN réel ne fait. Le format exact est vérifié dans
    // `demo-scripts.spec.ts`, y compris sa clé de Luhn fausse.
    const { controller } = build()

    for (const candidate of (await controller.discoverRegistry(USER, {})).candidates) {
      expect(candidate.siren).toMatch(/^0{7}\d{2}$/) // #3238 : dix candidats, donc sept zéros de tête au moins
      // Seule exception NOMMÉE : un compte RÉEL des briefs de la salle (décision Louis 04/10 « plus
      // aucun compte fictif », #3819 : la liste d'appels rapproche le candidat du compte semé par
      // son NOM). Son SIREN reste lui fictif (contrôlé ci-dessus) : c'est lui qu'on recopie.
      if (!SEEDED_BRIEF_ACCOUNTS.includes(candidate.name)) expect(candidate.name).toContain('démo')
    }
  })

  it('le score reste la somme de ses facteurs, comme sur le vrai écran', async () => {
    // L'invariant que l'écran affiche. Un score rond sans facteur montrerait le
    // contraire de ce que le produit garantit.
    const { controller } = build()

    for (const candidate of (await controller.discoverRegistry(USER, {})).candidates) {
      const sum = candidate.scoreFactors.reduce((total, factor) => total + factor.points, 0)
      expect(candidate.score).toBe(sum)
    }
  })

  it('un candidat sans matière n’obtient pas d’angle inventé', async () => {
    const { controller } = build()
    const candidates = (await controller.discoverRegistry(USER, {})).candidates
    expect(candidates.some(candidate => candidate.angle === null)).toBe(true)
  })

  it('la porte d’entrée par les signaux suit la même règle', async () => {
    const { controller, ia } = build()
    await controller.discoverSignals(USER, {})
    expect(ia.discoverSignals).not.toHaveBeenCalled()
  })
})

describe('les gestes payants en démonstration', () => {
  it('la préparation d’un besoin est REFUSÉE, avant tout appel', async () => {
    const needPlay = { generate: jest.fn() }
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
      resolveActiveWorkspace: jest.fn(),
    } as unknown as WorkspaceContextService

    const controller = Object.create(AccountsController.prototype) as AccountsController
    Object.assign(controller, { needPlay, workspaceContext })

    await expect(
      controller.createNeedPlay({ account_id: 'a-1', kind: 'need', label: 'Besoin' } as never, USER),
    ).rejects.toBeInstanceOf(HttpException)
    expect(needPlay.generate).not.toHaveBeenCalled()
    // Aucun workspace résolu : le refus tombe avant tout travail.
    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
  })

  it('la réécriture de CV est REFUSÉE, et ne consulte même pas le solde', async () => {
    const credits = { hasEnrichmentCredit: jest.fn(), consumeEnrichmentCredit: jest.fn() }
    const consultants = { rewriteCv: jest.fn() }
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
      resolveActiveWorkspace: jest.fn(),
    } as unknown as WorkspaceContextService

    const controller = Object.create(ConsultantsController.prototype) as ConsultantsController
    Object.assign(controller, {
      consultants,
      credits: credits as unknown as CreditsService,
      workspaceContext,
    })

    await expect(controller.rewriteCv('c-1', { opportunity_id: 'o-1' } as never, USER)).rejects.toBeInstanceOf(
      HttpException,
    )
    expect(consultants.rewriteCv).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    expect(credits.hasEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('le refus DIT ce qui reste ouvert — un « non » sans issue fait quitter l’écran', async () => {
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
      resolveActiveWorkspace: jest.fn(),
    } as unknown as WorkspaceContextService
    const controller = Object.create(AccountsController.prototype) as AccountsController
    Object.assign(controller, { needPlay: { generate: jest.fn() }, workspaceContext })

    await expect(
      controller.createNeedPlay({ account_id: 'a-1', kind: 'need', label: 'Besoin' } as never, USER),
    ).rejects.toThrow(/restent ouverts/)
  })
})
