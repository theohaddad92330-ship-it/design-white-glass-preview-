// Client de l'endpoint de supervision de l'API
// (GET /internal/admin/supervision/runners, gardé par InternalSecretGuard).
// Appelé côté serveur seulement — le secret interne ne doit jamais atteindre le
// navigateur, et le jeton Grafana ne quitte jamais l'API. Même forme que
// src/lib/queues.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// ── Types (miroir de apps/api supervision.service.ts) ────────────────────────
// Chaque valeur absente est `null` — « non mesuré », jamais 0.

type PointMesure = { t: number; v: number | null }

type ConteneurRunner = {
  host: string
  name: string
  cpuCoeurs: number | null
  cpuLimiteCoeurs: number | null
  memOctets: number | null
  memLimiteOctets: number | null
  disqueOctets: number | null
  oom24h: number | null
}

type HoteRunner = {
  host: string
  fraicheurSec: number | null
  perime: boolean
  coeurs: number | null
  cpuPct: number | null
  load1: number | null
  memPct: number | null
  disquePct: number | null
  disqueLibreOctets: number | null
  conteneurs: ConteneurRunner[]
}

export type SerieHote = { host: string; points: PointMesure[] }

export type SupervisionRunners =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      hotes: HoteRunner[]
      flotte: { runnersVus: number | null; coeurs: number | null }
      series: { cpuPct: SerieHote[]; memPct: SerieHote[] }
      requetesEnEchec: string[]
    }

export async function fetchSupervisionRunners(): Promise<SupervisionRunners> {
  const res = await fetch(`${REAL_BASE}/internal/admin/supervision/runners`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supervision endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SupervisionRunners
}

// ── Onglet « Base Supabase » (GET /internal/admin/supervision/supabase) ───────
// Miroir de apps/api supabase.service.ts. Valeurs instantanées, aucun stockage.

type DisqueSupabase = {
  mountpoint: string
  tailleOctets: number | null
  libreOctets: number | null
  usagePct: number | null
}

type PoolPgbouncer = {
  base: string
  utilisateur: string | null
  clientsActifs: number | null
  clientsEnAttente: number | null
  serveursActifs: number | null
  taillePool: number | null
}

// Lecture de fond (30/09) : l'API sert la dernière lecture réussie, jamais un appel réseau à la requête.
type FraicheurFond = {
  /** ms epoch de la dernière lecture réussie. */
  lueA: number
  ageSec: number
  /** Vrai au-delà de 300 s sans lecture réussie. */
  perime: boolean
  /** Raison fixe de la dernière tentative en échec, alors qu'une mesure est gardée. */
  derniereErreur?: string
}

export type SupervisionSupabase =
  | { etat: 'non_configure' }
  | { etat: 'en_attente' }
  | { etat: 'injoignable'; raison: string }
  | ({
      etat: 'mesure'
      mesureA: string
      instance: {
        coeurs: number | null
        cpuPct: number | null
        cpuPremiereLecture: boolean
        load1: number | null
        memPct: number | null
        memTotalOctets: number | null
        disques: DisqueSupabase[]
      }
      connexions: {
        backendsTotal: number | null
        backendsParBase: { base: string; backends: number | null }[]
        maxConnections: number | null
        pgbouncer: PoolPgbouncer[]
      }
      volumes: { base: string; octets: number | null }[]
      absentes: string[]
    } & FraicheurFond)

export async function fetchSupervisionSupabase(): Promise<SupervisionSupabase> {
  const res = await fetch(`${REAL_BASE}/internal/admin/supervision/supabase`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supervision endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SupervisionSupabase
}

// ── Onglet « Disponibilité » (GET /internal/admin/supervision/disponibilite) ──
// Miroir de apps/api disponibilite.service.ts. Sondes blackbox des runners CI ;
// `sondesDeployees: false` = aucune série probe_* encore poussée (tout est null).

type CibleDisponibilite = {
  cible: string
  hotesOk: number | null
  hotesTotal: number | null
  dispo24hPct: number | null
  latenceP50Ms: number | null
  latenceMaxMs: number | null
  tlsJours: number | null
  serie: PointMesure[]
}

export type SupervisionDisponibilite =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      sondesDeployees: boolean
      cibles: CibleDisponibilite[]
      commits: { api: string | null; ia: string | null; main: null }
      requetesEnEchec: string[]
    }

export async function fetchSupervisionDisponibilite(): Promise<SupervisionDisponibilite> {
  const res = await fetch(`${REAL_BASE}/internal/admin/supervision/disponibilite`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supervision endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SupervisionDisponibilite
}

// ── Onglet « Railway » (GET /internal/admin/supervision/railway?fenetre=…) ────
// Miroir de apps/api railway.service.ts. Coût = ESTIMATION, jamais la facture.

type PointRailway = { t: number; v: number | null }

type ServiceRailway = {
  id: string
  nom: string
  cpuMoyen: number | null
  cpuMax: number | null
  memMoyenneGo: number | null
  memMaxGo: number | null
  limiteCpu: number | null
  limiteMemGo: number | null
  coutMensuelEstimeUsd: number | null
  points: { cpu: PointRailway[]; mem: PointRailway[] }
}

export type SupervisionRailway =
  | { etat: 'non_configure' }
  | { etat: 'en_attente' }
  | { etat: 'injoignable'; raison: string }
  | ({
      etat: 'mesure'
      mesureA: string
      fenetre: '1h' | '24h' | '7j'
      services: ServiceRailway[]
      totalEstimeUsd: number | null
      totalPartiel: boolean
      tarifs: { vcpuParMois: number; goMemParMois: number; source: string }
      nonEvalue: string[]
    } & FraicheurFond)

export async function fetchSupervisionRailway(): Promise<SupervisionRailway> {
  const res = await fetch(`${REAL_BASE}/internal/admin/supervision/railway?fenetre=24h`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supervision endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SupervisionRailway
}

// ── Incidents infra ouverts (GET /internal/admin/supervision/incidents) ──────
// Miroir de apps/api alertes-infra.service.ts. `illisible` = Redis injoignable :
// ce n'est JAMAIS « aucun incident ».

type IncidentInfra = {
  regle: string
  sujet: string
  message: string
  valeur: number
  seuil: number
  unite: string
  depuis: string
  onglet: string
}

export type SupervisionIncidents = { etat: 'mesure'; incidents: IncidentInfra[] } | { etat: 'illisible' }

export async function fetchSupervisionIncidents(): Promise<SupervisionIncidents> {
  const res = await fetch(`${REAL_BASE}/internal/admin/supervision/incidents`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Supervision endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SupervisionIncidents
}
