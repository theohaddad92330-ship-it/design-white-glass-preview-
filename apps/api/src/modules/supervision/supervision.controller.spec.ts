import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AlertesInfraService as AlertesInfraServiceClass } from './alertes-infra.service'
import { DisponibiliteService as DisponibiliteServiceClass } from './disponibilite.service'
import { LectureDeFondService as LectureDeFondServiceClass } from './lecture-de-fond.service'
import { PostgresActiviteService as PostgresActiviteServiceClass } from './postgres-activite.service'
import { SupervisionService as SupervisionServiceClass } from './supervision.service'
import { SupervisionController } from './supervision.controller'
import type { AlertesInfraService } from './alertes-infra.service'
import type { DisponibiliteService } from './disponibilite.service'
import type { LectureDeFondService } from './lecture-de-fond.service'
import type { PostgresActiviteService } from './postgres-activite.service'
import type { SupervisionService } from './supervision.service'

describe('SupervisionController', () => {
  it('est gardé par InternalSecretGuard au niveau de la classe', () => {
    // Sans la garde, la charge de la flotte CI serait lisible par n'importe qui.
    const guards = Reflect.getMetadata('__guards__', SupervisionController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('sert internal/admin/supervision', () => {
    expect(Reflect.getMetadata('path', SupervisionController)).toBe('internal/admin/supervision')
  })

  it('délègue GET runners au service', async () => {
    const runners = jest.fn().mockResolvedValue({ etat: 'non_configure' })
    const ctrl = new SupervisionController(
      { runners } as unknown as SupervisionService,
      {} as LectureDeFondService,
      {} as DisponibiliteService,
      {} as AlertesInfraService,
      {} as PostgresActiviteService,
    )
    await expect(ctrl.runners()).resolves.toEqual({ etat: 'non_configure' })
    expect(runners).toHaveBeenCalledTimes(1)
  })

  it('délègue GET supabase au service Supabase', async () => {
    const supabase = jest.fn().mockResolvedValue({ etat: 'non_configure' })
    const ctrl = new SupervisionController(
      {} as SupervisionService,
      { supabase } as unknown as LectureDeFondService,
      {} as DisponibiliteService,
      {} as AlertesInfraService,
      {} as PostgresActiviteService,
    )
    await expect(ctrl.supabase()).resolves.toEqual({ etat: 'non_configure' })
    expect(Reflect.getMetadata('path', SupervisionController.prototype.supabase)).toBe('supabase')
    expect(supabase).toHaveBeenCalledTimes(1)
  })

  it('délègue GET disponibilite au service Disponibilité', async () => {
    const disponibilite = jest.fn().mockResolvedValue({ etat: 'non_configure' })
    const ctrl = new SupervisionController(
      {} as SupervisionService,
      {} as LectureDeFondService,
      { disponibilite } as unknown as DisponibiliteService,
      {} as AlertesInfraService,
      {} as PostgresActiviteService,
    )
    await expect(ctrl.disponibilite()).resolves.toEqual({ etat: 'non_configure' })
    expect(Reflect.getMetadata('path', SupervisionController.prototype.disponibilite)).toBe('disponibilite')
    expect(disponibilite).toHaveBeenCalledTimes(1)
  })

  it('délègue GET railway au service Railway avec la fenêtre demandée', async () => {
    const railway = jest.fn().mockResolvedValue({ etat: 'non_configure' })
    const ctrl = new SupervisionController(
      {} as SupervisionService,
      { railway } as unknown as LectureDeFondService,
      {} as DisponibiliteService,
      {} as AlertesInfraService,
      {} as PostgresActiviteService,
    )
    await expect(ctrl.railway('7j')).resolves.toEqual({ etat: 'non_configure' })
    expect(Reflect.getMetadata('path', SupervisionController.prototype.railway)).toBe('railway')
    expect(railway).toHaveBeenCalledWith('7j')
  })

  it('délègue GET incidents au service d’alertes', async () => {
    const incidents = jest.fn().mockResolvedValue({ etat: 'illisible' })
    const ctrl = new SupervisionController(
      {} as SupervisionService,
      {} as LectureDeFondService,
      {} as DisponibiliteService,
      { incidents } as unknown as AlertesInfraService,
      {} as PostgresActiviteService,
    )
    await expect(ctrl.incidents()).resolves.toEqual({ etat: 'illisible' })
    expect(Reflect.getMetadata('path', SupervisionController.prototype.incidents)).toBe('incidents')
  })
  it('incident pool 04/10 — délègue GET postgres-activite au relevé agrégé de pg_stat_activity', async () => {
    const releve = jest.fn().mockResolvedValue({ etat: 'illisible', raison: 'timeout' })
    const ctrl = new SupervisionController(
      {} as SupervisionService,
      {} as LectureDeFondService,
      {} as DisponibiliteService,
      {} as AlertesInfraService,
      { releve } as unknown as PostgresActiviteService,
    )
    await expect(ctrl.postgresActivite()).resolves.toEqual({ etat: 'illisible', raison: 'timeout' })
    expect(Reflect.getMetadata('path', SupervisionController.prototype.postgresActivite)).toBe('postgres-activite')
  })
})

/**
 * #4480 (brief « Droits ») — la supervision est une SURFACE D'ACCÈS réservée au back-office. Prouvé par le
 * REFUS, sur le fil HTTP : un membre simple (un jeton d'utilisateur, aucun secret interne) reçoit un refus,
 * jamais une page vide — et aucun service n'est appelé, donc aucun amont sondé pour lui.
 */
describe('SupervisionController — un membre simple est REFUSÉ', () => {
  const SECRET_DE_TEST = 'secret-interne-de-test-seulement'
  const ROUTES = ['disponibilite', 'runners', 'supabase', 'railway', 'incidents', 'postgres-activite'] as const
  let app: INestApplication
  const appele = jest.fn()

  beforeAll(async () => {
    const repond = (...noms: string[]) =>
      Object.fromEntries(noms.map(n => [n, () => (appele(), Promise.resolve({ etat: 'non_configure' }))]))
    const moduleRef = await Test.createTestingModule({
      controllers: [SupervisionController],
      providers: [
        InternalSecretGuard,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'internalApiSecret' ? SECRET_DE_TEST : undefined) },
        },
        { provide: SupervisionServiceClass, useValue: repond('runners') },
        { provide: LectureDeFondServiceClass, useValue: repond('supabase', 'railway') },
        { provide: DisponibiliteServiceClass, useValue: repond('disponibilite') },
        { provide: AlertesInfraServiceClass, useValue: repond('incidents') },
        { provide: PostgresActiviteServiceClass, useValue: repond('releve') },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => appele.mockClear())

  it.each(ROUTES)('GET %s avec un jeton de membre et sans secret interne : 403, aucun service appelé', async route => {
    await request(app.getHttpServer())
      .get(`/internal/admin/supervision/${route}`)
      .set('Authorization', 'Bearer jeton-de-membre-simple')
      .expect(403)
    expect(appele).not.toHaveBeenCalled()
  })

  it('un secret interne FAUX est refusé aussi', async () => {
    await request(app.getHttpServer())
      .get('/internal/admin/supervision/railway')
      .set('x-internal-secret', 'pas-le-bon-secret-de-test')
      .expect(403)
    expect(appele).not.toHaveBeenCalled()
  })

  it('le back-office (secret interne exact) est servi — la garde sait aussi dire OUI', async () => {
    await request(app.getHttpServer())
      .get('/internal/admin/supervision/railway')
      .set('x-internal-secret', SECRET_DE_TEST)
      .expect(200)
    expect(appele).toHaveBeenCalledTimes(1)
  })
})
