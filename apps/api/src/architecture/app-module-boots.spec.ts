import { Global, Module } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { createMockRepository } from '../database/test-utils'
import { CopilotCardService } from '../modules/action-os/copilot-card.service'
import { CreditReservationService } from '../modules/action-os/credit-reservation.service'
import { WorkflowRunnerService } from '../modules/action-os/workflow-runner.service'
import { ActionRouterService } from '../modules/action-router/action-router.service'
import { EnrichmentDurationService } from '../modules/analytics/enrichment-duration.service'
import { ContactEnrichmentWorker } from '../modules/contacts/contact-enrichment.worker'
import { ContactsController } from '../modules/contacts/contacts.controller'
import { ContactsService } from '../modules/contacts/contacts.service'
import { JwtStrategy } from '../modules/auth/jwt.strategy'
import { SessionRegistryService } from '../modules/auth/session-registry.service'
import { AuthModule } from '../modules/auth/auth.module'
import { McpApiModule } from '../modules/mcp-api/mcp-api.module'
import { OAuthModule } from '../modules/oauth/oauth.module'
import { CopilotBridgeController } from '../modules/copilot-bridge/copilot-bridge.controller'
import { ChatThreadTitlesService } from '../modules/ia-proxy/chat-thread-titles.service'
import { IaProxyController } from '../modules/ia-proxy/ia-proxy.controller'
import { NeedArrivalSubscriber } from '../modules/consultants/matching/need-arrival.subscriber'

/**
 * L'APPLICATION DÉMARRE — le graphe de modules RÉEL d'`AppModule` se résout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE LES GARDES STATIQUES LAISSENT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-20 (repository déclaré), GA-42 (service injecté par un contrôleur exporté
 * par son module) et GA-247 (paramètre de constructeur qui porte un jeton)
 * lisent le SOURCE. Aucune ne monte le conteneur : un cycle d'imports de modules
 * (« the module at index [n] of the X "imports" array is undefined »), un jeton
 * fourni dans un module que l'injecteur n'atteint pas, un `useExisting` vers un
 * fournisseur absent — tout cela ne se voit qu'au démarrage, c'est-à-dire au
 * healthcheck Railway, quand les 9 000 tests sont déjà verts
 * (`module-graph-checked-only-at-boot`).
 *
 * Et il y a pire qu'un démarrage raté : un paramètre `@Optional()` que le module
 * n'atteint pas ne fait RIEN échouer — Nest injecte `undefined`, l'application
 * démarre, et la capacité est morte en silence. Le lot Action OS L1→L3 (13/09)
 * en ajoute quatre (les cartes dans la conversation, le suivi d'analyse du pont,
 * les ports du routeur, le solde de réservation du worker) : ce fichier vérifie
 * qu'ils sont REMPLIS, pas seulement que le graphe compile.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DOUBLÉ, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Seule la connexion Postgres est remplacée (`DatabaseModule` → une source de
 * données factice, le motif de `contacts.module.spec.ts`) : chaque
 * `TypeOrmModule.forFeature` reste réel et résout vers un dépôt factice. Tous
 * les autres modules sont ceux d'`AppModule`, dans son ordre. `compile()`
 * instancie chaque fournisseur SANS appeler les crochets de cycle de vie : aucun
 * cron ne s'arme, aucun worker BullMQ ne démarre, aucune requête ne part.
 */

const dataSourceStub = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getMongoRepository: jest.fn(() => createMockRepository()),
  getRepository: jest.fn(() => createMockRepository()),
  getTreeRepository: jest.fn(() => createMockRepository()),
  manager: { transaction: jest.fn(), query: jest.fn(), getRepository: jest.fn(() => createMockRepository()) },
  transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
  query: jest.fn(),
  createQueryRunner: jest.fn(),
  // #2916 / #2399.2 (c93) — une vraie source de données porte sa liste
  // d'abonnés ORM ; `NeedArrivalSubscriber` s'y inscrit à la construction.
  subscribers: [] as unknown[],
}

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class StubDatabaseModule {}

/** Les six clés que le schéma d'environnement exige — des valeurs de forme, jamais réelles. */
const REQUIRED_ENV: Record<string, string> = {
  SUPABASE_URL: 'https://boot-check.supabase.co',
  SUPABASE_ANON_KEY: 'boot-check-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'boot-check-service-role',
  SUPABASE_JWT_SECRET: 'boot-check-jwt-secret',
  ANTHROPIC_API_KEY: 'boot-check-anthropic',
  STRIPE_SECRET_KEY: 'sk_test_boot_check',
}

/** Un champ privé, lu tel que le conteneur l'a posé. */
function injected(instance: object, field: string): unknown {
  return (instance as Record<string, unknown>)[field]
}

describe('AppModule démarre — le graphe réel se résout et les @Optional du lot Action OS sont remplis', () => {
  let moduleRef: TestingModule | undefined

  beforeAll(async () => {
    for (const [key, value] of Object.entries(REQUIRED_ENV)) process.env[key] ??= value
    // Import APRÈS l'environnement : `ConfigModule.forRoot({ load })` valide
    // l'environnement dès l'évaluation d'`app.module.ts`.
    const { AppModule } = await import('../app.module')
    const { DatabaseModule } = await import('../database/database.module')
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule(StubDatabaseModule)
      .compile()
  }, 180_000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  it('LIT quelque chose — le conteneur porte le graphe ENTIER, pas un sous-ensemble', () => {
    const container = (
      moduleRef as unknown as { container: { getModules(): Map<string, { metatype: { name?: string } }> } }
    ).container
    const names = [...container.getModules().values()].map(module => module.metatype?.name)
    // 120 `*.module.ts` le 13/09/2026 ; un conteneur réduit à quelques modules
    // rendrait les assertions ci-dessous vertes sur un graphe qui n'est pas celui de prod.
    expect(names.length).toBeGreaterThan(100)
    expect(names).toEqual(
      expect.arrayContaining(['AppModule', 'IaProxyModule', 'CopilotBridgeModule', 'ActionOsModule']),
    )
  })

  it('#2916 / c93 — l’abonné « arrivée d’un besoin » est CONSTRUIT et inscrit sur la source de données', () => {
    const subscriber = moduleRef?.get(NeedArrivalSubscriber)
    expect(subscriber).toBeDefined()
    expect(dataSourceStub.subscribers).toContain(subscriber)
  })

  it('la conversation reçoit les cartes (Action OS) ET le titre des fils — les deux paramètres appendés en fin', () => {
    const controller = moduleRef?.get(IaProxyController)
    expect(controller).toBeInstanceOf(IaProxyController)
    expect(injected(controller as object, 'cards')).toBeInstanceOf(CopilotCardService)
    expect(injected(controller as object, 'threadTitles')).toBeInstanceOf(ChatThreadTitlesService)
  })

  it('le pont du copilote reçoit les cartes : une analyse lancée depuis la conversation est suivie', () => {
    const controller = moduleRef?.get(CopilotBridgeController)
    expect(injected(controller as object, 'cards')).toBeInstanceOf(CopilotCardService)
  })

  it('le routeur reçoit ses ports de carte, la carte son observateur d’analyse', () => {
    const router = moduleRef?.get(ActionRouterService) as object
    const ports = injected(router, 'ports') as Record<string, unknown> | undefined
    expect(ports).toBeDefined()
    expect(Object.keys(ports ?? {}).sort()).toEqual(
      [
        // #4186 — la porte commune remplace les portes par fournisseur et la porte nue.
        'crmWrites',
        'enrichmentJobs',
        'mailDrafts',
        'memory',
        'messageDrafts',
        'projects',
        'routines',
        'settings',
      ].sort(),
    )
    const cards = moduleRef?.get(CopilotCardService) as object
    expect(injected(cards, 'analysisLaunches')).toBeDefined()
  })

  it('le worker d’enrichissement et le runner soldent et réservent sur le MÊME registre de crédits promis', () => {
    const worker = moduleRef?.get(ContactEnrichmentWorker) as object
    const runner = moduleRef?.get(WorkflowRunnerService) as object
    const registry = moduleRef?.get(CreditReservationService)
    expect(registry).toBeInstanceOf(CreditReservationService)
    expect(injected(worker, 'settler')).toBe(registry)
    expect(injected(runner, 'reservations')).toBe(registry)
  })

  /*
   * #2120.57 — on a REPROCHÉ à cette chaîne d'être un no-op muet (« la mesure
   * n'est jamais fournie, d'où le silence »). Mesuré : c'est FAUX.
   * `AnalyticsModule` est `@Global()` et exporte `EnrichmentDurationService`,
   * donc les deux côtés le reçoivent — le silence observé en recette venait du
   * plancher de cinq mesures, pas du câblage.
   *
   * Ce qui manquait, c'est la GARANTIE : rien n'empêchait ce câblage de cesser
   * d'être vrai. Retirer cette seule entrée du tableau `exports` laisse
   * l'application DÉMARRER — 6 assertions vertes sur 7, mesuré le 20/09/2026 —
   * et ne fait rougir que celle-ci.
   */
  it('la mesure de durée d’enrichissement est FOURNIE des DEUX côtés — sinon `record()` est un no-op muet', () => {
    const duration = moduleRef?.get(EnrichmentDurationService)
    expect(duration).toBeInstanceOf(EnrichmentDurationService)
    // Le côté ÉCRITURE : `ContactsService.enrichContact` appelle
    // `this.enrichmentDuration?.record(...)`. `@Optional()` + `?.` forment un
    // couple qui avale la panne — si le jeton ne se résout pas, rien ne tombe au
    // démarrage, rien ne s'écrit à l'exécution, aucun journal.
    expect(injected(moduleRef?.get(ContactsService) as object, 'enrichmentDuration')).toBe(duration)
    // Le côté LECTURE : `GET /contacts/enrichment-duration-estimate`.
    expect(injected(moduleRef?.get(ContactsController) as object, 'enrichmentDuration')).toBe(duration)
  })

  /*
   * #2120.57 — le MÊME motif, trouvé par GA-365 et NON par un rapport : celui-ci
   * n'était pas théorique. Voir `session-registry.module.ts`.
   */
  it('les TROIS JwtStrategy voient le registre de sessions — une révocation vaut aussi pour MCP et OAuth', () => {
    // `JwtStrategy` est déclarée par trois modules, donc il en existe trois
    // INSTANCES. `select()` va chercher celle de chaque module : un `get()`
    // global rendrait la première et serait vert sur deux angles morts.
    for (const owner of [AuthModule, McpApiModule, OAuthModule]) {
      const strategy = moduleRef?.select(owner).get(JwtStrategy, { strict: true }) as object
      expect(injected(strategy, 'sessions')).toBeInstanceOf(SessionRegistryService)
    }
  })
})
