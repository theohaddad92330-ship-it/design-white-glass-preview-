/**
 * Garde de DIMENSIONNEMENT du pool Postgres de l'API, au démarrage.
 *
 * Incident pool du 04/10/2026 (soir) : `DB_POOL_MAX` passé de 5 à 15 à 15:23Z,
 * sur DEUX réplicas (`apps/api/railway.json`) = 30 clients sur le pooler
 * Supavisor en mode transaction, dont le `pool_size` (plafond côté Supabase)
 * est plus petit. File, puis refus (« authentication did not complete within
 * 15000ms », ECHECKOUTTIMEOUT) : toute l'API en 500, et les migrations des
 * déploiements en échec — on ne pouvait même plus déployer le correctif.
 *
 * La règle : `DB_POOL_MAX × réplicas ≤ 70 % du pool_size Supavisor` — les 30 %
 * restants pour le client de migration, l'IA, le chevauchement de déploiement
 * (un réplica neuf démarre avant que l'ancien ne draine) et l'éditeur SQL.
 *
 * Au-delà, on CLAMPE et on le crie (ERREUR) ; on ne refuse JAMAIS de démarrer :
 * la prod doit vivre, un pool trop petit ralentit, un pool trop grand tombe.
 *
 * Fonction PURE : la décision se teste sans Nest ni base.
 */

export const POOLER_SHARE = 0.7

interface PoolMaxDecision {
  max: number
  /** `ok` = dans le budget ; `clamped` = réduit ; `unguarded` = la garde ne peut pas trancher complètement. */
  level: 'ok' | 'clamped' | 'unguarded'
  message: string | null
}

type Env = Record<string, string | undefined>

function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function decidePoolMax(requested: number, env: Env = process.env): PoolMaxDecision {
  const poolerSize = positiveInt(env['DB_POOLER_POOL_SIZE'])
  if (poolerSize === null) {
    return {
      max: requested,
      level: 'unguarded',
      message:
        'DB_POOLER_POOL_SIZE absent : le pool Postgres (DB_POOL_MAX=' +
        String(requested) +
        ") n'est pas comparé au pool_size Supavisor. Règle : DB_POOL_MAX × réplicas ≤ 70 % du pool_size " +
        '(incident du 04/10/2026). Poser DB_POOLER_POOL_SIZE (dashboard Supabase › Database › Connection pooling) et DB_REPLICAS.',
    }
  }

  // Railway n'expose PAS le nombre de réplicas à l'exécution (seulement l'id de
  // CELUI-CI) : sans `DB_REPLICAS`, on compte au moins 1 — une borne basse,
  // jamais un chiffre deviné plus haut.
  const declaredReplicas = positiveInt(env['DB_REPLICAS'])
  const replicas = declaredReplicas ?? 1
  const budget = Math.floor(POOLER_SHARE * poolerSize)
  const recommended = Math.max(1, Math.floor((POOLER_SHARE * poolerSize) / replicas))
  const replicasLabel =
    declaredReplicas === null ? 'DB_REPLICAS absent (compté 1, borne basse)' : `DB_REPLICAS=${replicas}`

  if (requested * replicas > budget) {
    return {
      max: recommended,
      level: 'clamped',
      message:
        `Pool Postgres SURDIMENSIONNÉ : DB_POOL_MAX=${requested} × ${replicasLabel} = ${requested * replicas} ` +
        `> 70 % de DB_POOLER_POOL_SIZE=${poolerSize} (${budget}). Pool ramené à ${recommended} ` +
        `(maximum recommandé ${recommended} = floor(0,7 × ${poolerSize} / ${replicas})). ` +
        'Au-delà, Supavisor fait la queue puis refuse : toute l’API en 500 et les migrations bloquées (incident du 04/10/2026).',
    }
  }
  if (declaredReplicas === null) {
    return {
      max: requested,
      level: 'unguarded',
      message:
        `DB_REPLICAS absent : la garde du pool compte 1 réplica (DB_POOL_MAX=${requested}, DB_POOLER_POOL_SIZE=${poolerSize}). ` +
        `Avec plusieurs réplicas, le total peut dépasser 70 % — poser DB_REPLICAS (numReplicas de railway.json).`,
    }
  }
  return { max: requested, level: 'ok', message: null }
}
