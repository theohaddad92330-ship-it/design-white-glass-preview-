import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { FENETRES_RAILWAY, railwayConfigure } from './railway.client'
import { RailwaySupervisionService, type SupervisionRailway } from './railway.service'
import { supabaseConfigure } from './supabase-metrics.client'
import { SupabaseSupervisionService, type SupervisionSupabase } from './supabase.service'

/**
 * LECTURE DE FOND de la supervision Railway et Supabase (30/09/2026).
 *
 * POURQUOI : lire au moment de la requête échouait par intermittence (Railway
 * a des pics à 13 s) et le CPU Supabase, un taux entre DEUX lectures, restait
 * « non mesuré » — le cache de 30 s et les 2 réplicas faisaient que la lecture
 * précédente n'existait presque jamais à l'ouverture de la page.
 *
 * COMMENT : un minuteur de 60 s (première lecture au démarrage) garde en
 * mémoire la DERNIÈRE LECTURE RÉUSSIE, son horodatage et la dernière erreur.
 * Les routes servent cet état SANS appel réseau. Chaque réplica lit pour lui
 * (pas de Redis) : le delta CPU se calcule entre deux lectures du MÊME réplica.
 *
 * NO-OP STRICT : ni Railway ni Supabase configuré ⇒ le minuteur ne démarre pas.
 *
 * SANS VERROU : chaque réplica doit lire pour lui-même, puisque l'état est en mémoire du processus et que le delta CPU exige deux lectures du même réplica ; c'est une lecture seule, sans effet de bord ni écriture.
 */

const INTERVALLE_MS = 60_000
const PERIME_APRES_SEC = 300
/** Raison fixe quand la lecture lève : le message d'exception ne sort jamais. */
const RAISON_INCONNUE = 'lecture impossible'

type Fraicheur = {
  /** ms epoch de la dernière lecture réussie. */ lueA: number
  ageSec: number
  /** Vrai au-delà de 300 s sans lecture réussie. */ perime: boolean
  /** Raison fixe de la dernière tentative en échec, alors qu'une mesure est gardée. */ derniereErreur?: string
}

type Servi<T extends { etat: string }> =
  | Exclude<T, { etat: 'mesure' }>
  | { etat: 'en_attente' }
  | (Extract<T, { etat: 'mesure' }> & Fraicheur)

export type RailwayServi = Servi<SupervisionRailway>
export type SupabaseServi = Servi<SupervisionSupabase>

type Etat<T> = { mesure: T | null; lueA: number | null; erreur: string | null; tentee: boolean }
const etatVide = <T>(): Etat<T> => ({ mesure: null, lueA: null, erreur: null, tentee: false })

function servir<T extends { etat: string }>(etat: Etat<T>): Servi<T> {
  if (etat.mesure && etat.lueA !== null) {
    const ageSec = Math.max(0, Math.round((Date.now() - etat.lueA) / 1000))
    return {
      ...(etat.mesure as Extract<T, { etat: 'mesure' }>),
      lueA: etat.lueA,
      ageSec,
      perime: ageSec > PERIME_APRES_SEC,
      ...(etat.erreur ? { derniereErreur: etat.erreur } : {}),
    }
  }
  if (etat.tentee && etat.erreur) return { etat: 'injoignable', raison: etat.erreur } as Servi<T>
  return { etat: 'en_attente' }
}

@Injectable()
export class LectureDeFondService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LectureDeFondService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private enCours = false
  private readonly etatRailway = etatVide<SupervisionRailway>()
  private readonly etatSupabase = etatVide<SupervisionSupabase>()
  private maxConnections: number | null = null

  constructor(
    private readonly railwaySvc: RailwaySupervisionService,
    private readonly supabaseSvc: SupabaseSupervisionService,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  onModuleInit(): void {
    if (!railwayConfigure() && !supabaseConfigure()) return
    void this.cycle()
    this.timer = setInterval(() => void this.cycle(), INTERVALLE_MS)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** `?fenetre=` : 24 h (défaut) sert l'état de fond ; 1h / 7j restent à la demande. */
  async railway(fenetre?: string): Promise<RailwayServi> {
    if (!railwayConfigure()) return { etat: 'non_configure' }
    const demandee = FENETRES_RAILWAY.find(f => f === fenetre) ?? '24h'
    if (demandee !== '24h') return (await this.railwaySvc.railway(demandee)) as RailwayServi
    return servir(this.etatRailway)
  }

  async supabase(): Promise<SupabaseServi> {
    if (!supabaseConfigure()) return { etat: 'non_configure' }
    return servir(this.etatSupabase)
  }

  private async cycle(): Promise<void> {
    if (this.enCours) return
    this.enCours = true
    try {
      await Promise.all([
        railwayConfigure() ? this.lire(this.etatRailway, () => this.railwaySvc.railway('24h')) : undefined,
        supabaseConfigure() ? this.lire(this.etatSupabase, () => this.lireSupabase()) : undefined,
      ])
    } finally {
      this.enCours = false
    }
  }

  private async lire<T extends { etat: string }>(etat: Etat<T>, lecture: () => Promise<T>): Promise<void> {
    try {
      const r = await lecture()
      etat.tentee = true
      if (r.etat === 'mesure') {
        etat.mesure = r
        etat.lueA = Date.now()
        etat.erreur = null
      } else if (r.etat === 'injoignable') {
        etat.erreur = (r as { raison?: string }).raison ?? RAISON_INCONNUE
      }
    } catch {
      // ⚠️ Jamais le message d'exception : il peut porter l'URL ou un secret.
      etat.tentee = true
      etat.erreur = RAISON_INCONNUE
      this.logger.warn('supervision : lecture de fond en échec')
    }
  }

  /** Lecture Supabase ; `max_connections` absent de l'endpoint ⇒ `SHOW max_connections` (une fois, mémorisé). */
  private async lireSupabase(): Promise<SupervisionSupabase> {
    const r = await this.supabaseSvc.supabase()
    if (r.etat !== 'mesure' || r.connexions.maxConnections !== null) return r
    const repli = await this.lireMaxConnections()
    if (repli === null) return r
    // Mesurée par le repli : elle n'est plus « absente » (sinon bandeau « mesure partielle » à tort).
    return {
      ...r,
      connexions: { ...r.connexions, maxConnections: repli },
      absentes: r.absentes.filter(n => n !== 'pg_settings_max_connections'),
    }
  }

  private async lireMaxConnections(): Promise<number | null> {
    if (this.maxConnections !== null) return this.maxConnections
    if (!this.dataSource) return null
    try {
      const lignes = (await this.dataSource.query('SHOW max_connections')) as Array<Record<string, unknown>>
      const n = Number(Object.values(lignes[0] ?? {})[0])
      if (!Number.isFinite(n) || n <= 0) return null
      this.maxConnections = n
      return n
    } catch {
      // ⚠️ Message non journalisé : nommé, jamais propagé.
      this.logger.warn('supervision supabase : SHOW max_connections impossible')
      return null
    }
  }
}
