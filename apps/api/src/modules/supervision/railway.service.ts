import { Injectable } from '@nestjs/common'
import { FENETRES_RAILWAY, RailwayClient, type FenetreRailway } from './railway.client'
import { TARIFS_RAILWAY } from './railway-tarifs'

/**
 * L'ONGLET « RAILWAY » DE LA SUPERVISION — une ligne par service de production.
 *
 * Doctrine « non mesuré n'est jamais 0 » : toute valeur absente est `null` ; un
 * vrai 0 mesuré reste 0. Le coût est une ESTIMATION (moyenne de la fenêtre ×
 * tarif public), `null` dès qu'une entrée manque — jamais la facture.
 *
 * ⚠️ `limiteCpu` / `limiteMemGo` sont le PLAFOND DU PLAN Railway, pas une
 * réservation : aucun « % de la limite » n'en est tiré.
 */

type PointMesure = { t: number; v: number | null }

type ServiceRailway = {
  id: string
  /** Nom Railway, ou l'id COURT (8 premiers caractères) quand il est inconnu. */
  nom: string
  cpuMoyen: number | null
  cpuMax: number | null
  memMoyenneGo: number | null
  memMaxGo: number | null
  limiteCpu: number | null
  limiteMemGo: number | null
  /** USD/mois, estimé ; `null` si CPU ou mémoire moyenne manque. */
  coutMensuelEstimeUsd: number | null
  points: { cpu: PointMesure[]; mem: PointMesure[] }
}

export type SupervisionRailway =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      fenetre: FenetreRailway
      services: ServiceRailway[]
      /** Somme des coûts CONNUS ; `null` si aucun n'est connu. */
      totalEstimeUsd: number | null
      /** Vrai si au moins un service n'a pas de coût (le total est alors un minimum). */
      totalPartiel: boolean
      tarifs: typeof TARIFS_RAILWAY
      /** Périmètres non évalués : nommés, jamais montrés comme 0. */
      nonEvalue: string[]
    }

const valeurs = (points: PointMesure[]): number[] => points.flatMap(p => (p.v === null ? [] : [p.v]))

function moyenne(points: PointMesure[]): number | null {
  const v = valeurs(points)
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length
}

function maximum(points: PointMesure[]): number | null {
  const v = valeurs(points)
  return v.length === 0 ? null : Math.max(...v)
}

/** Dernière valeur mesurée (une limite ne varie pas : la plus récente fait foi). */
function derniere(points: PointMesure[]): number | null {
  const v = valeurs(points)
  return v.length === 0 ? null : v[v.length - 1]!
}

const arrondi = (n: number): number => Math.round(n * 100) / 100

@Injectable()
export class RailwaySupervisionService {
  constructor(private readonly client: RailwayClient) {}

  async railway(fenetreDemandee?: string): Promise<SupervisionRailway> {
    // Liste blanche : toute autre valeur retombe sur 24 h.
    const fenetre: FenetreRailway = FENETRES_RAILWAY.find(f => f === fenetreDemandee) ?? '24h'
    const r = await this.client.lire(fenetre)
    if (r.etat !== 'mesure') return r

    const ids = [...new Set(r.series.map(s => s.serviceId))]
    const pointsDe = (id: string, mesure: string): PointMesure[] =>
      r.series.filter(s => s.serviceId === id && s.mesure === mesure).flatMap(s => s.points)

    const services: ServiceRailway[] = ids.map(id => {
      const cpu = pointsDe(id, 'CPU_USAGE')
      const mem = pointsDe(id, 'MEMORY_USAGE_GB')
      const cpuMoyen = moyenne(cpu)
      const memMoyenneGo = moyenne(mem)
      return {
        id,
        nom: r.noms[id] ?? id.slice(0, 8),
        cpuMoyen,
        cpuMax: maximum(cpu),
        memMoyenneGo,
        memMaxGo: maximum(mem),
        limiteCpu: derniere(pointsDe(id, 'CPU_LIMIT')),
        limiteMemGo: derniere(pointsDe(id, 'MEMORY_LIMIT_GB')),
        coutMensuelEstimeUsd:
          cpuMoyen === null || memMoyenneGo === null
            ? null
            : arrondi(cpuMoyen * TARIFS_RAILWAY.vcpuParMois + memMoyenneGo * TARIFS_RAILWAY.goMemParMois),
        points: { cpu, mem },
      }
    })

    const couts = services.flatMap(s => (s.coutMensuelEstimeUsd === null ? [] : [s.coutMensuelEstimeUsd]))
    return {
      etat: 'mesure',
      mesureA: new Date(r.lueA).toISOString(),
      fenetre,
      services,
      totalEstimeUsd: couts.length === 0 ? null : arrondi(couts.reduce((a, b) => a + b, 0)),
      totalPartiel: couts.length < services.length,
      tarifs: TARIFS_RAILWAY,
      nonEvalue: ['réseau', 'disque éphémère'],
    }
  }
}
