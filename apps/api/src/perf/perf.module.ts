import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EventLoopLagMonitor } from './event-loop-lag'
import { instrumentPool } from './pool-instrumentation'

/** 6543 = pooler Supabase (transaction pooling) ; tout autre port = connexion directe. */
export function describePoolMode(port: number | undefined): 'pooler' | 'direct' {
  return port === 6543 ? 'pooler' : 'direct'
}

/**
 * Perf P1 — au démarrage : enveloppe le pool `pg` de TypeORM pour la mesure
 * par requête, et journalise la donnée qui manquait à l'audit : le `max` du pool
 * et son mode (pooler/direct). Ni hôte, ni identifiant, ni mot de passe.
 */
@Injectable()
export class PerfInstrumentationService implements OnApplicationBootstrap {
  private readonly logger = new Logger('DbPool')

  constructor(private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    const driver = this.dataSource.driver as unknown as { master?: object }
    if (driver?.master) instrumentPool(driver.master)

    const options = this.dataSource.options as { port?: number; extra?: { max?: number } }
    this.logger.log(`pool max=${options.extra?.max ?? 'default(10)'} mode=${describePoolMode(options.port)}`)
  }
}

// Incident boucle API (05/10/2026) — le retard de la boucle, mesuré en continu.
@Module({ providers: [PerfInstrumentationService, EventLoopLagMonitor] })
export class PerfModule {}
