import { Controller, Get, Optional, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Response } from 'express'
import { ReadinessService, type ReadinessReport } from './readiness.service'
import { IaClient } from '../ia/ia.client'
import { readBuiltAt } from './build-time'

/** Deployed build identity (Théo P0 « parité release » : prouver que le code
 *  inspecté == le produit testé). Non secret : uniquement le commit/env/date de
 *  build, ce que Railway/Sentry connaissent déjà. */
type VersionInfo = {
  /** Git commit SHA du déploiement (SENTRY_RELEASE = $RAILWAY_GIT_COMMIT_SHA). */
  commit: string
  /** dev / preview / prod (SENTRY_ENVIRONMENT). */
  environment: string
  /** Horodatage de la réponse (proxy de « service en vie sur cette build »). */
  timestamp: string
  /** #4711.1 — QUAND la build a été construite (posé au build, #4711.2). `null` = inconnu, jamais deviné. */
  built_at: string | null
  /** Révision du service IA (déploiement Railway distinct). `null` quand il ne
   *  répond pas — on ne prétend jamais savoir ce qui y tourne. */
  ia: { commit: string; environment: string } | null
}

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly readiness: ReadinessService,
    // `@Optional()` : les specs à constructeur nu restent valides, et un
    // déploiement sans client IA rend simplement `ia: null`.
    @Optional() private readonly ia?: IaClient,
  ) {}

  /** Liveness (load-balancer / Railway "is the process up" probe). Always 200 if
   *  the process can answer — it says nothing about whether the worker can run
   *  jobs. Deploy promotion is gated on `/health/ready` (below), not this. */
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  /**
   * Deploy READINESS gate — Railway `healthcheckPath`.
   *
   * 200 ONLY when the process booted AND its Redis/BullMQ connection answers AND
   * the in-process analysis worker is running; 503 otherwise. A build that can't
   * do all three never turns green, so Railway keeps the previous healthy deploy
   * instead of promoting a worker that can't process jobs — "a broken worker
   * never reaches prod".
   *
   * Uses `@Res({ passthrough: true })` + a manual status (not a thrown 503) so a
   * legitimately-not-ready poll during boot does NOT flow through the exception
   * filter and spam Sentry with 5xx.
   */
  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport & { status: string }> {
    const report = await this.readiness.check()
    res.status(report.ready ? 200 : 503)
    return { status: report.ready ? 'ready' : 'not_ready', ...report }
  }

  /**
   * Identité de la build déployée. Sert à la parité release : l'écran admin
   * l'affiche à côté du build web pour confirmer que les deux services tournent
   * le commit attendu. `unknown` si l'env n'est pas renseigné (dev local).
   */
  @Get('version')
  async version(): Promise<VersionInfo> {
    // Le service IA est un déploiement Railway DISTINCT : sans sa révision ici,
    // un correctif IA mergé et un bug qui persiste sont indiscernables d'un
    // simple retard de déploiement, sauf à ouvrir Railway. `null` quand l'IA ne
    // répond pas — un écran d'état ne tombe pas parce que ce qu'il observe est
    // en panne.
    const ia = this.ia ? await this.ia.version() : null
    return {
      ...(ia ? { ia } : { ia: null }),
      commit:
        process.env['SENTRY_RELEASE'] ??
        process.env['RAILWAY_GIT_COMMIT_SHA'] ??
        process.env['GIT_COMMIT'] ??
        'unknown',
      environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'unknown',
      timestamp: new Date().toISOString(),
      built_at: readBuiltAt(),
    }
  }
}
