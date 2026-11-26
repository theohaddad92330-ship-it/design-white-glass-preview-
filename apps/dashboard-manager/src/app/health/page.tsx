import {
  fetchAdminHealth,
  fetchAdminMigrations,
  fetchAdminModelRouting,
  fetchAdminPromptRegistry,
  fetchAdminPromptRegistryDiff,
  fetchAdminRightsMatrix,
  fetchAdminRouteMigration,
  type AdminMigrationsReport,
  type AdminModelRoutingReport,
  type AdminPromptRegistryDiffReport,
  type AdminPromptRegistryReport,
  type AdminRightsMatrixReport,
  type AdminRouteMigrationReport,
  type AdminSystemHealth,
} from '@/lib/admin'
import { fetchOperatorHealth, type OperatorHealthReport } from '@/lib/operator-health'
import {
  fetchCostMetrics,
  fetchKillSwitches,
  fetchSourceHealth,
  type CostMetricsReport,
  type KillSwitchReport,
  type SourceHealthReport,
} from '@/lib/telemetry'
import { countOrUnmeasured, pctOrUnmeasured } from '@/lib/mesure'
import { ClientFacingErrorsPanel } from './_components/client-facing-errors'
import { IncidentTimelinePanel } from './_components/incident-timeline-panel'
import { CostMetricsPanel } from './_components/cost-metrics-panel'
import { DependencyGrid } from './_components/dependency-grid'
import { compterParEtat, construireGrille, verdictSante } from './_components/dependency-grid.logic'
import { KillSwitchPanel } from './_components/kill-switch-panel'
import { MigrationsPanel } from './_components/migrations-panel'
import { ModelRoutingPanel } from './_components/model-routing-panel'
import { PromptRegistryPanel } from './_components/prompt-registry-panel'
import { RightsMatrixPanel } from './_components/rights-matrix-panel'
import { RouteMigrationPanel } from './_components/route-migration-panel'
import { SourceHealthPanel } from './_components/source-health-panel'
import { dateEtHeure } from '@/lib/dates'

// Backoffice — la santé du système au-delà de la vivacité : la grille des onze
// dépendances (#1660), ce qui casse vu du client, les files BullMQ, le taux
// d'échec des analyses sur 24 h et l'identité de la build. Vue opérateur
// inter-espaces, derrière InternalSecretGuard. Toujours fraîche.
export const dynamic = 'force-dynamic'

/**
 * #1660 — « garder la logique, refaire l'affichage ».
 *
 * Ce qui change : la grille de tuiles arrive EN TÊTE, parce que c'est la
 * question qu'on se pose en ouvrant cet écran — « qu'est-ce qui est cassé ? ».
 * Les files, le taux d'échec et la build restent, en dessous, comme le détail
 * qu'ils sont.
 *
 * Ce qui NE change pas : chaque bloc se charge à part, et une panne de l'un ne
 * masque jamais l'autre. Un bloc en échec rend « inconnu », jamais un tableau
 * vide qui se lirait « tout va bien » — c'est déjà la règle des deux panneaux
 * du bas, elle vaut pour les deux nouveaux.
 */

// `.badge.completed` est vert, `.badge.error` rouge (globals.css). Réutilisés
// tels quels, aucun CSS nouveau — et le badge porte un MOT, jamais une couleur
// seule.
function statusPill(ok: boolean, label: string) {
  return <span className={`badge ${ok ? 'completed' : 'error'}`}>{label}</span>
}

// Supervision 30/09 : un taux absent (aucun run sur 24 h) est « non mesuré »,
// jamais « 0,0 % » (GA-18 / GA-19).
const pct = pctOrUnmeasured

function uptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}j ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default async function HealthPage(props: {
  searchParams?: Promise<{ diffPrompt?: string; diffRefA?: string; diffRefB?: string }>
}) {
  const searchParams = await props.searchParams
  const now = Date.now()

  let health: AdminSystemHealth | null = null
  try {
    health = await fetchAdminHealth()
  } catch (err) {
    return (
      <main className="wrap">
        <h1>Santé système</h1>
        <p className="subtitle">
          Backoffice — les dépendances du produit, ce qui casse vu du client, les files d&apos;attente et la version
          déployée.
        </p>
        <div className="error">
          Impossible de joindre l&apos;endpoint admin de l&apos;API.
          <br />
          {err instanceof Error ? err.message : String(err)}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code>, que l&apos;API tourne et que Redis est
          joignable.
        </div>
      </main>
    )
  }

  // Les onze dépendances (#1660). Chargée à part : une panne de cette route ne
  // doit pas emporter le reste de l'écran, et son échec rend « inconnu ».
  let operator: OperatorHealthReport | null = null
  let operatorError: string | null = null
  try {
    operator = await fetchOperatorHealth()
  } catch (err) {
    operatorError = err instanceof Error ? err.message : String(err)
  }

  // Chargé à part : l'état des sources et la santé système sont deux questions
  // distinctes, et une panne de l'une ne doit pas masquer l'autre. Une erreur ici
  // rend « inconnu », jamais un tableau vide qui se lirait comme « tout va bien ».
  let sourceHealth: SourceHealthReport | null = null
  let sourceHealthError: string | null = null
  try {
    sourceHealth = await fetchSourceHealth()
  } catch (err) {
    sourceHealthError = err instanceof Error ? err.message : String(err)
  }

  // Les interrupteurs d'arrêt (D169), chargés à part pour la même raison : une
  // panne de l'un ne doit pas masquer l'autre. Un échec ici rend « inconnu »,
  // jamais un tableau vide qui se lirait « rien n'est coupé ».
  let killSwitches: KillSwitchReport | null = null
  let killSwitchError: string | null = null
  try {
    killSwitches = await fetchKillSwitches()
  } catch (err) {
    killSwitchError = err instanceof Error ? err.message : String(err)
  }

  // LOT 10 — le coût par prompt (hors analyse), chargé à part pour la même
  // raison : une panne de cette route ne doit jamais masquer le reste de
  // l'écran. Un échec ICI (l'endpoint API ne répond pas) rend « indisponible » ;
  // une réponse qui dit elle-même `reachable: false` (le moteur IA ne répond
  // pas) est un cas DIFFÉRENT que `CostMetricsPanel` distingue en interne — les
  // deux se lisent « on ne sait pas », jamais « ça n'a rien coûté ».
  let costMetrics: CostMetricsReport | null = null
  let costMetricsError: string | null = null
  try {
    costMetrics = await fetchCostMetrics()
  } catch (err) {
    costMetricsError = err instanceof Error ? err.message : String(err)
  }

  // #2445.11 — statut des migrations, chargé à part pour la même raison que
  // les trois blocs ci-dessus : une panne de cette route ne doit jamais
  // masquer le reste de l'écran. Un échec ici rend « inconnu », jamais une
  // absence de migration en attente.
  let migrations: AdminMigrationsReport | null = null
  let migrationsError: string | null = null
  try {
    migrations = await fetchAdminMigrations()
  } catch (err) {
    migrationsError = err instanceof Error ? err.message : String(err)
  }

  // #2445.2 (épopée #2766) — politique de routage modèle, chargée à part pour
  // la même raison que les blocs ci-dessus : une panne de cette route ne doit
  // jamais masquer le reste de l'écran. `available: false` (l'IA n'a pas
  // répondu, cf. `AdminOpsService.getModelRouting`) est traité comme un échec
  // ici aussi : on ne SAIT pas la politique effective.
  let modelRouting: AdminModelRoutingReport | null = null
  let modelRoutingError: string | null = null
  try {
    const report = await fetchAdminModelRouting()
    if (report.available) modelRouting = report
    else modelRoutingError = "l'IA n'a pas répondu"
  } catch (err) {
    modelRoutingError = err instanceof Error ? err.message : String(err)
  }

  // #2445.1 (épopée #2766) — registre de prompts, chargé à part pour la même
  // raison que les blocs ci-dessus : une panne de cette route ne doit jamais
  // masquer le reste de l'écran. `available: false` est traité comme un échec
  // ici aussi : on ne SAIT pas la liste effective des prompts.
  let promptRegistry: AdminPromptRegistryReport | null = null
  let promptRegistryError: string | null = null
  try {
    const report = await fetchAdminPromptRegistry()
    if (report.available) promptRegistry = report
    else promptRegistryError = "l'IA n'a pas répondu"
  } catch (err) {
    promptRegistryError = err instanceof Error ? err.message : String(err)
  }

  // #2445.1 (épopée #2766) — diff d'un prompt entre deux refs git, demandé
  // via le formulaire GET du panneau ci-dessus (le choix des refs vit dans
  // l'URL, jamais dans un état client). Rien n'est calculé tant qu'aucun
  // prompt n'est choisi — pas de diff par défaut, coûteux et sans valeur
  // avant qu'on sache CE qu'on veut comparer.
  const diffPromptName = (searchParams?.diffPrompt ?? '').trim()
  const diffRefA = (searchParams?.diffRefA ?? '').trim()
  const diffRefB = (searchParams?.diffRefB ?? 'HEAD').trim() || 'HEAD'
  let promptRegistryDiff: (AdminPromptRegistryDiffReport & { name: string }) | null = null
  if (diffPromptName && diffRefA) {
    try {
      const report = await fetchAdminPromptRegistryDiff(diffPromptName, diffRefA, diffRefB)
      promptRegistryDiff = { ...report, name: diffPromptName }
    } catch {
      promptRegistryDiff = { available: false, diff: '', rollbackCommand: [], name: diffPromptName }
    }
  }

  // #2445.4 (épopée #2766) — matrice des droits par outil, chargée à part pour
  // la même raison que les blocs ci-dessus : une panne de cette route ne doit
  // jamais masquer le reste de l'écran. `available: false` est traité comme un
  // échec ici aussi : on ne SAIT pas le classement effectif.
  let rightsMatrix: AdminRightsMatrixReport | null = null
  let rightsMatrixError: string | null = null
  try {
    const report = await fetchAdminRightsMatrix()
    if (report.available) rightsMatrix = report
    else rightsMatrixError = "l'IA n'a pas répondu"
  } catch (err) {
    rightsMatrixError = err instanceof Error ? err.message : String(err)
  }

  // #2958 — registre de migration de routes (#2154.3) + NO-GO/GO (#2154.31/.32),
  // chargé à part pour la même raison que les blocs ci-dessus : une panne de
  // cette route ne doit jamais masquer le reste de l'écran. Un échec ici rend
  // « inconnu », jamais « aucune route ne bloque ».
  let routeMigration: AdminRouteMigrationReport | null = null
  let routeMigrationError: string | null = null
  try {
    routeMigration = await fetchAdminRouteMigration()
  } catch (err) {
    routeMigrationError = err instanceof Error ? err.message : String(err)
  }

  // ⚠️⚠️ TROUVÉ EN RECETTE LE 09/09/2026, PENDANT UN INCIDENT RÉEL.
  //
  // La pastille disait « healthy » pendant que la grille juste en dessous
  // affichait « 1 en panne · SUPABASE (AUTHENTIFICATION) · incident en cours
  // depuis 09:05 » — et un client a signalé « 0 résultats » à 09:06:57, la
  // minute suivante.
  //
  // La cause : `health.status` décrit l'API ELLE-MÊME (son process, sa base,
  // sa file), jamais les dépendances SONDÉES du produit. Deux questions
  // différentes, une seule pastille, en tête d'une page intitulée « Santé
  // système » — c'est-à-dire à l'endroit exact où un opérateur vient
  // demander « est-ce que quelque chose est cassé ? ».
  //
  // Un agrégat qui ignore une panne ne se contente pas d'être incomplet : il
  // fait manquer l'incident. La pastille répond donc désormais à la question
  // qu'on lui pose, en réutilisant la dérivation qui existe déjà (jamais une
  // seconde règle, qui divergerait).
  //
  // ⚠️ `operator` à `null` = l'endpoint n'a pas répondu, donc on ne SAIT PAS
  // l'état des dépendances. « Non mesuré » n'est pas « tout va bien » : la
  // pastille ne peut pas affirmer `healthy` sur une mesure qu'on n'a pas.
  const compteDependances = operator ? compterParEtat(construireGrille(operator.dependencies, sourceHealth, now)) : null
  const verdict = verdictSante(health.status === 'healthy', compteDependances)
  const healthy = verdict.sain
  const libellePastille = verdict.libelle
  const { failures, version } = health

  return (
    <main className="wrap">
      <h1>
        Santé système {'  '}
        {statusPill(healthy, libellePastille)}
      </h1>
      <p className="subtitle">
        Les onze dépendances du produit et ce qui casse vu du client, puis les files BullMQ, le taux d&apos;échec des
        analyses sur 24 h et l&apos;identité de la build. Rafraîchi à chaque chargement.
      </p>

      {operator ? (
        <>
          <DependencyGrid dependencies={operator.dependencies} sourceHealth={sourceHealth} now={now} />
          <ClientFacingErrorsPanel report={operator.clientFacingErrors} />
          <IncidentTimelinePanel report={operator.incidentTimeline} />
        </>
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Dépendances</h2>
          <div className="error">
            État des dépendances <strong>inconnu</strong> — la route n&apos;a pas répondu. Ce n&apos;est pas « tout va
            bien » : c&apos;est « on ne sait pas ce qui va ».
            <br />
            {operatorError}
          </div>
        </section>
      )}

      <h2 style={{ fontSize: 16, margin: '28px 0 12px' }}>Analyses et build</h2>
      <section className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card">
          <div className="label">Taux d&apos;échec (24 h)</div>
          {/* Red only when it actually trips the degraded rule (≥20% AND ≥5 runs)
              — a 100% rate over 1 run is not statistically meaningful and must
              not scream red next to a `healthy` verdict. */}
          <div
            className="value"
            style={{
              color:
                failures.failureRate !== null && failures.failureRate >= 0.2 && failures.total >= 5
                  ? 'var(--red)'
                  : undefined,
            }}
          >
            {pct(failures.failureRate)}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            {failures.total === 0 ? 'aucun run sur 24 h' : `${failures.failed} / ${failures.total} runs`}
          </div>
        </div>
        <div className="card">
          <div className="label">Uptime API</div>
          <div className="value">{uptime(health.uptimeSeconds)}</div>
        </div>
        <div className="card">
          <div className="label">Build</div>
          <div className="value" style={{ fontSize: 16 }}>
            <span className="mono">{version.commit.slice(0, 10)}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{version.environment}</div>
        </div>
      </section>

      <h2 style={{ fontSize: 16, margin: '28px 0 12px' }}>Files d&apos;attente (BullMQ)</h2>
      <table>
        <thead>
          <tr>
            <th>Queue</th>
            <th className="num">En attente</th>
            <th className="num">Actifs</th>
            <th className="num">Terminés</th>
            <th className="num">Échoués</th>
            <th className="num">Différés</th>
            <th className="num">En pause</th>
          </tr>
        </thead>
        <tbody>
          {health.queues.map(q => (
            <tr key={q.name}>
              <td className="mono">{q.name}</td>
              <td className="num">{countOrUnmeasured(q.waiting)}</td>
              <td className="num">{countOrUnmeasured(q.active)}</td>
              <td className="num" style={{ color: 'var(--muted)' }}>
                {countOrUnmeasured(q.completed)}
              </td>
              <td className="num" style={{ color: (q.failed ?? 0) > 0 ? 'var(--red)' : undefined }}>
                {countOrUnmeasured(q.failed)}
              </td>
              <td className="num">{countOrUnmeasured(q.delayed)}</td>
              <td className="num">{countOrUnmeasured(q.paused)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Snapshot à {dateEtHeure(health.timestamp)}. « Dégradé » = taux d&apos;échec ≥ 20 % (sur ≥ 5 runs) ou backlog
        analysis (en attente + actifs) ≥ 100.
      </p>

      {killSwitches ? (
        <KillSwitchPanel report={killSwitches} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Capacités coupées</h2>
          <div className="error">
            État des interrupteurs <strong>inconnu</strong> — l&apos;endpoint n&apos;a pas répondu. Ce n&apos;est pas «
            rien n&apos;est coupé » : c&apos;est « on ne sait pas ce qui l&apos;est ».
            <br />
            {killSwitchError}
          </div>
        </section>
      )}

      {costMetrics ? (
        <CostMetricsPanel report={costMetrics} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Coût par prompt (hors analyse)</h2>
          <div className="error">
            Coût par prompt <strong>indisponible</strong> — l&apos;endpoint n&apos;a pas répondu. Ce n&apos;est pas «
            aucun coût » : c&apos;est « on ne sait pas ce que ça a coûté ».
            <br />
            {costMetricsError}
          </div>
        </section>
      )}

      {sourceHealth ? (
        <SourceHealthPanel report={sourceHealth} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>État des sources externes</h2>
          <div className="error">
            État des sources <strong>indisponible</strong> — l&apos;endpoint n&apos;a pas répondu.
            <br />
            {sourceHealthError}
          </div>
        </section>
      )}

      {migrations ? (
        <MigrationsPanel report={migrations} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Migrations</h2>
          <div className="error">
            Statut des migrations <strong>inconnu</strong> — l&apos;endpoint n&apos;a pas répondu. Ce n&apos;est pas «
            aucune en attente » : c&apos;est « on ne sait pas ce qui a tourné ».
            <br />
            {migrationsError}
          </div>
        </section>
      )}

      {modelRouting ? (
        <ModelRoutingPanel report={modelRouting} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Politique de routage modèle</h2>
          <div className="error">
            Politique de routage <strong>inconnue</strong> — l&apos;IA n&apos;a pas répondu. Ce n&apos;est pas « tout au
            défaut » : c&apos;est « on ne sait pas ce qui est réglé ».
            <br />
            {modelRoutingError}
          </div>
        </section>
      )}

      {promptRegistry ? (
        <PromptRegistryPanel report={promptRegistry} diff={promptRegistryDiff} refA={diffRefA} refB={diffRefB} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Registre de prompts</h2>
          <div className="error">
            Registre de prompts <strong>inconnu</strong> — l&apos;IA n&apos;a pas répondu.
            <br />
            {promptRegistryError}
          </div>
        </section>
      )}

      {rightsMatrix ? (
        <RightsMatrixPanel report={rightsMatrix} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Matrice des droits</h2>
          <div className="error">
            Matrice des droits <strong>inconnue</strong> — l&apos;IA n&apos;a pas répondu.
            <br />
            {rightsMatrixError}
          </div>
        </section>
      )}

      {routeMigration ? (
        <RouteMigrationPanel report={routeMigration} />
      ) : (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Migration de routes (n° 2154)</h2>
          <div className="error">
            Statut <strong>inconnu</strong> — l&apos;endpoint n&apos;a pas répondu. Ce n&apos;est pas « rien ne bloque »
            : c&apos;est « on ne sait pas ce qui bloque ».
            <br />
            {routeMigrationError}
          </div>
        </section>
      )}
    </main>
  )
}
