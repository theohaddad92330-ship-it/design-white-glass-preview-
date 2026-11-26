import { KpiTile, Sparkline } from '@/ui'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'
import {
  fetchSupervisionDisponibilite,
  fetchSupervisionIncidents,
  fetchSupervisionRailway,
  fetchSupervisionRunners,
  fetchSupervisionSupabase,
  type SerieHote,
  type SupervisionDisponibilite,
  type SupervisionIncidents,
  type SupervisionRailway,
  type SupervisionRunners,
  type SupervisionSupabase,
} from '@/lib/supervision'
import {
  bandeauDisponibilite,
  bandeauFond,
  bandeauRailway,
  luIlYA,
  bandeauSupabase,
  bandeauSupervision,
  etatCible,
  formatCharge,
  formatCoeurs,
  formatCommit,
  formatCpuSupabase,
  formatFraicheur,
  formatMs,
  formatTls,
  niveauTls,
  formatGo,
  formatGoDirect,
  formatNombre,
  formatPct,
  formatUsdMois,
  formatUtilisation,
  NON_MESURE,
  pointsSparkline,
  resumeIncidents,
} from './supervision.logic'
import styles from './supervision.module.css'

/**
 * SUPERVISION — onglet « Runners CI » (chantier supervision du 30/09/2026).
 *
 * Les 4 VPS Hetzner des runners CI, lus dans Grafana Cloud Prometheus par
 * l'API (le jeton ne descend jamais ici). Chaque bloc porte son PÉRIMÈTRE en
 * titre — Flotte, Hôte, Conteneur — parce qu'une charge de 60 % ne dit rien
 * tant qu'on ne sait pas si c'est celle d'une machine ou d'un conteneur.
 *
 * Onglet « Base Supabase » (`?onglet=supabase`) : métriques instantanées de
 * l'instance Postgres, sans aucun stockage.
 *
 * Onglet « Railway » (`?onglet=railway`) : CPU et mémoire par service de
 * production, coût mensuel ESTIMÉ (usage moyen × tarif public, pas la facture).
 *
 * Onglet « Disponibilité » (`?onglet=disponibilite`) : ce que les runners CI
 * voient de l'extérieur (sondes blackbox) et le commit servi.
 *
 * « non mesuré » n'est jamais « 0 ».
 */

type Onglet = 'runners' | 'supabase' | 'railway' | 'disponibilite'

function Valeur({ texte }: { texte: string }) {
  return texte === NON_MESURE ? <span className={styles['nonMesure']}>{texte}</span> : <>{texte}</>
}

function Graphe({ titre, series }: { titre: string; series: SerieHote[] }) {
  return (
    <div className={styles['graphe']}>
      <h3>{titre}</h3>
      {series.length === 0 ? (
        <p className={styles['nonMesure']}>{NON_MESURE}</p>
      ) : (
        series.map(s => (
          <div key={s.host}>
            <p className={styles['grapheHote']}>{s.host}</p>
            <Sparkline points={pointsSparkline(s.points)} label={`${titre} — ${s.host}`} />
          </div>
        ))
      )}
    </div>
  )
}

function Contenu({ r }: { r: Extract<SupervisionRunners, { etat: 'mesure' }> }) {
  const conteneurs = r.hotes.flatMap(h => h.conteneurs)
  return (
    <>
      <section className={styles['bloc']} aria-labelledby="bloc-flotte">
        <h2 id="bloc-flotte">Flotte</h2>
        <div className="kpi-grid">
          <KpiTile label="Runners vus" value={formatNombre(r.flotte.runnersVus)} period="conteneurs runner" />
          <KpiTile label="Cœurs" value={formatNombre(r.flotte.coeurs)} period="total des hôtes" />
          <KpiTile label="Hôtes" value={r.hotes.length} period="ayant rendu une série" />
        </div>
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-hote">
        <h2 id="bloc-hote">Hôte</h2>
        {r.hotes.length === 0 ? (
          <p className={styles['nonMesure']}>Aucun hôte n&apos;a rendu de série.</p>
        ) : (
          <div className={styles['hotes']}>
            {r.hotes.map(h => (
              <article key={h.host} className={`${styles['hote']} ${h.perime ? styles['hotePerime'] : ''}`}>
                <div className={styles['hoteTete']}>
                  <span className={`${styles['hoteNom']} mono`}>{h.host}</span>
                  {h.perime ? <span className={styles['perime']}>périmé</span> : null}
                </div>
                <dl className={styles['mesures']}>
                  <dt>Cœurs</dt>
                  <dd>
                    <Valeur texte={formatNombre(h.coeurs)} />
                  </dd>
                  <dt>CPU (5 min)</dt>
                  <dd>
                    <Valeur texte={formatPct(h.cpuPct)} />
                  </dd>
                  <dt>Load 1 min</dt>
                  <dd>
                    <Valeur texte={formatCharge(h.load1)} />
                  </dd>
                  <dt>Mémoire</dt>
                  <dd>
                    <Valeur texte={formatPct(h.memPct)} />
                  </dd>
                  <dt>Disque /</dt>
                  <dd>
                    <Valeur texte={formatPct(h.disquePct)} />
                  </dd>
                  <dt>Libre</dt>
                  <dd>
                    <Valeur texte={formatGo(h.disqueLibreOctets)} />
                  </dd>
                </dl>
                <p className={styles['fraicheur']}>Donnée {formatFraicheur(h.fraicheurSec)}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-conteneur">
        <h2 id="bloc-conteneur">Conteneur</h2>
        {conteneurs.length === 0 ? (
          <p className={styles['nonMesure']}>Aucun conteneur runner n&apos;a rendu de série.</p>
        ) : (
          <div className={styles['tableau']}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Hôte</th>
                  <th scope="col">Runner</th>
                  <th scope="col">CPU (cœurs / limite)</th>
                  <th scope="col">Mémoire / limite</th>
                  <th scope="col">Couche disque</th>
                  <th scope="col">OOM 24 h</th>
                </tr>
              </thead>
              <tbody>
                {conteneurs.map(c => (
                  <tr key={`${c.host}/${c.name}`}>
                    <td className="mono">{c.host}</td>
                    <td className="mono">{c.name}</td>
                    <td>
                      <Valeur texte={formatCoeurs(c.cpuCoeurs)} /> / <Valeur texte={formatCoeurs(c.cpuLimiteCoeurs)} />
                    </td>
                    <td>
                      <Valeur texte={formatGo(c.memOctets)} /> / <Valeur texte={formatGo(c.memLimiteOctets)} />
                    </td>
                    <td>
                      <Valeur texte={formatGo(c.disqueOctets)} />
                    </td>
                    <td className={c.oom24h !== null && c.oom24h > 0 ? styles['oom'] : undefined}>
                      <Valeur texte={formatNombre(c.oom24h)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-series">
        <h2 id="bloc-series">Hôte — 24 h</h2>
        <div className={styles['graphes']}>
          <Graphe titre="CPU hôte %" series={r.series.cpuPct} />
          <Graphe titre="Mémoire hôte %" series={r.series.memPct} />
        </div>
      </section>
    </>
  )
}

function Onglets({ actif }: { actif: Onglet }) {
  return (
    <nav className={styles['onglets']} aria-label="Onglets de supervision">
      <a
        className={actif === 'runners' ? styles['onglet'] : styles['ongletLien']}
        href="/supervision"
        aria-current={actif === 'runners' ? 'page' : undefined}
      >
        Runners CI
      </a>
      <a
        className={actif === 'supabase' ? styles['onglet'] : styles['ongletLien']}
        href="/supervision?onglet=supabase"
        aria-current={actif === 'supabase' ? 'page' : undefined}
      >
        Base Supabase
      </a>
      <a
        className={actif === 'railway' ? styles['onglet'] : styles['ongletLien']}
        href="/supervision?onglet=railway"
        aria-current={actif === 'railway' ? 'page' : undefined}
      >
        Railway
      </a>
      <a
        className={actif === 'disponibilite' ? styles['onglet'] : styles['ongletLien']}
        href="/supervision?onglet=disponibilite"
        aria-current={actif === 'disponibilite' ? 'page' : undefined}
      >
        Disponibilité
      </a>
    </nav>
  )
}

async function BlocIncidents() {
  let r: SupervisionIncidents | null
  try {
    r = await fetchSupervisionIncidents()
  } catch {
    r = null
  }
  const resume = resumeIncidents(r)
  return (
    <section className={styles['bloc']} aria-labelledby="bloc-incidents">
      <h2 id="bloc-incidents">Incidents infra ouverts</h2>
      {resume.etat === 'ouverts' ? (
        <ul>
          {resume.lignes.map(l => (
            <li key={l.cle}>
              <a href={l.lien} className="mono">
                {l.titre}
              </a>{' '}
              <span>{l.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles['nonMesure']}>{resume.texte}</p>
      )}
    </section>
  )
}

function Bandeau({ texte, erreurApi }: { texte: string | null; erreurApi: string | null }) {
  if (!texte) return null
  return (
    <div className={styles['bandeau']} role="status">
      {texte}
      {erreurApi ? (
        <>
          <br />
          <span className="mono">{erreurApi}</span>
        </>
      ) : null}
    </div>
  )
}

/** « lu il y a N s » sous le titre d'onglet + bandeau de la lecture de fond (discret ou orange si périmé). */
function Fraicheur({ r }: { r: SupervisionRailway | SupervisionSupabase }) {
  const lu = luIlYA(r)
  const fond = bandeauFond(r)
  return (
    <>
      {lu ? <p className={styles['note']}>{lu}</p> : null}
      {fond ? (
        <div className={fond.niveau === 'orange' ? styles['bandeau'] : styles['bandeauDiscret']} role="status">
          {fond.texte}
        </div>
      ) : null}
    </>
  )
}

function TableauBase({ colonnes, children }: { colonnes: string[]; children: React.ReactNode }) {
  return (
    <div className={styles['tableau']}>
      <table>
        <thead>
          <tr>
            {colonnes.map(c => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function ContenuSupabase({ r }: { r: Extract<SupervisionSupabase, { etat: 'mesure' }> }) {
  const { instance: i, connexions: c } = r
  return (
    <>
      <section className={styles['bloc']} aria-labelledby="bloc-instance">
        <h2 id="bloc-instance">Instance Postgres (Supabase, 2 vCPU mesurés le 30/09)</h2>
        <p className={styles['note']}>Valeurs instantanées — historique non mesuré (aucun stockage).</p>
        <div className="kpi-grid">
          <KpiTile label="CPU" value={formatCpuSupabase(i.cpuPct, i.cpuPremiereLecture)} period="entre deux lectures" />
          <KpiTile label="Cœurs" value={formatNombre(i.coeurs)} period="cpu distincts exposés" />
          <KpiTile label="Load 1 min" value={formatCharge(i.load1)} period="instantané" />
          <KpiTile label="Mémoire" value={formatPct(i.memPct)} period="1 − disponible / total" />
        </div>
        <h3>Disques (un par point de montage exposé)</h3>
        {i.disques.length === 0 ? (
          <p className={styles['nonMesure']}>{NON_MESURE}</p>
        ) : (
          <TableauBase colonnes={['Point de montage', 'Utilisation', 'Libre', 'Taille']}>
            {i.disques.map(d => (
              <tr key={d.mountpoint}>
                <td className="mono">{d.mountpoint}</td>
                <td>
                  <Valeur texte={formatPct(d.usagePct)} />
                </td>
                <td>
                  <Valeur texte={formatGo(d.libreOctets)} />
                </td>
                <td>
                  <Valeur texte={formatGo(d.tailleOctets)} />
                </td>
              </tr>
            ))}
          </TableauBase>
        )}
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-connexions">
        <h2 id="bloc-connexions">Connexions</h2>
        <p className={styles['note']}>Valeurs instantanées — historique non mesuré (aucun stockage).</p>
        <div className="kpi-grid">
          <KpiTile
            label="Backends / max_connections"
            value={formatUtilisation(c.backendsTotal, c.maxConnections)}
            period="toutes bases"
          />
        </div>
        <h3>Backends par base</h3>
        {c.backendsParBase.length === 0 ? (
          <p className={styles['nonMesure']}>{NON_MESURE}</p>
        ) : (
          <TableauBase colonnes={['Base', 'Backends / max']}>
            {c.backendsParBase.map(b => (
              <tr key={b.base}>
                <td className="mono">{b.base}</td>
                <td>
                  <Valeur texte={formatUtilisation(b.backends, c.maxConnections)} />
                </td>
              </tr>
            ))}
          </TableauBase>
        )}
        <h3>pgbouncer</h3>
        {c.pgbouncer.length === 0 ? (
          <p className={styles['nonMesure']}>{NON_MESURE}</p>
        ) : (
          <TableauBase
            colonnes={[
              'Base',
              'Utilisateur',
              'Clients actifs',
              'Clients en attente',
              'Serveurs actifs',
              'Taille du pool',
            ]}
          >
            {c.pgbouncer.map(p => (
              <tr key={`${p.base}/${p.utilisateur ?? ''}`}>
                <td className="mono">{p.base}</td>
                <td className="mono">{p.utilisateur ?? NON_MESURE}</td>
                <td>
                  <Valeur texte={formatNombre(p.clientsActifs)} />
                </td>
                <td className={p.clientsEnAttente !== null && p.clientsEnAttente > 0 ? styles['oom'] : undefined}>
                  <Valeur texte={formatNombre(p.clientsEnAttente)} />
                </td>
                <td>
                  <Valeur texte={formatNombre(p.serveursActifs)} />
                </td>
                <td>
                  <Valeur texte={formatNombre(p.taillePool)} />
                </td>
              </tr>
            ))}
          </TableauBase>
        )}
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-volumes">
        <h2 id="bloc-volumes">Volumes</h2>
        <p className={styles['note']}>Valeurs instantanées — historique non mesuré (aucun stockage).</p>
        {r.volumes.length === 0 ? (
          <p className={styles['nonMesure']}>{NON_MESURE}</p>
        ) : (
          <TableauBase colonnes={['Base', 'Taille']}>
            {r.volumes.map(v => (
              <tr key={v.base}>
                <td className="mono">{v.base}</td>
                <td>
                  <Valeur texte={formatGo(v.octets)} />
                </td>
              </tr>
            ))}
          </TableauBase>
        )}
      </section>
    </>
  )
}

function ContenuRailway({ r }: { r: Extract<SupervisionRailway, { etat: 'mesure' }> }) {
  return (
    <>
      <section className={styles['bloc']} aria-labelledby="bloc-railway">
        <h2 id="bloc-railway">Services Railway (production)</h2>
        <p className={styles['note']}>
          Fenêtre {r.fenetre}. Limite = plafond du plan Railway (pas une réservation) : aucun pourcentage de saturation
          n’en est tiré. Coût estimé, d’après l’usage moyen de la fenêtre × tarif public — pas la facture (
          {r.tarifs.source}). Non évalué : {r.nonEvalue.join(', ')}.
        </p>
        {r.services.length === 0 ? (
          <p className={styles['nonMesure']}>{NON_MESURE}</p>
        ) : (
          <TableauBase
            colonnes={[
              'Service',
              'CPU moyen (vCPU)',
              'CPU max (vCPU)',
              'Mémoire moyenne (Go)',
              'Mémoire max (Go)',
              'Coût estimé',
            ]}
          >
            {r.services.map(s => (
              <tr key={s.id}>
                <td className="mono">{s.nom}</td>
                <td>
                  <Valeur texte={formatCoeurs(s.cpuMoyen)} />
                </td>
                <td>
                  <Valeur texte={formatCoeurs(s.cpuMax)} />
                </td>
                <td>
                  <Valeur texte={formatGoDirect(s.memMoyenneGo)} />
                </td>
                <td>
                  <Valeur texte={formatGoDirect(s.memMaxGo)} />
                </td>
                <td>
                  <Valeur texte={formatUsdMois(s.coutMensuelEstimeUsd)} />
                </td>
              </tr>
            ))}
          </TableauBase>
        )}
        <div className="kpi-grid">
          <KpiTile
            label="Total estimé"
            value={formatUsdMois(r.totalEstimeUsd)}
            period={r.totalPartiel ? 'partiel — estimé, pas la facture' : 'estimé, pas la facture'}
          />
        </div>
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-railway-series">
        <h2 id="bloc-railway-series">Historique par service ({r.fenetre})</h2>
        <div className={styles['hotes']}>
          {r.services.map(s => (
            <div key={s.id} className={styles['graphe']}>
              <h3>{s.nom}</h3>
              <p className={styles['grapheHote']}>CPU (vCPU)</p>
              <Sparkline points={pointsSparkline(s.points.cpu)} label={`CPU — ${s.nom}`} />
              <p className={styles['grapheHote']}>Mémoire (Go)</p>
              <Sparkline points={pointsSparkline(s.points.mem)} label={`Mémoire — ${s.nom}`} />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function ContenuDisponibilite({ r }: { r: Extract<SupervisionDisponibilite, { etat: 'mesure' }> }) {
  return (
    <>
      <section className={styles['bloc']} aria-labelledby="bloc-vu-exterieur">
        <h2 id="bloc-vu-exterieur">Vu depuis l’extérieur (4 runners : Helsinki, Nuremberg ×2, Falkenstein)</h2>
        <p className={styles['note']}>
          Une sonde HTTP par minute depuis chaque runner CI, hors de la production. Latences sur 1 h (p50 = la plus
          lente des médianes par runner).
        </p>
        {r.sondesDeployees ? (
          <TableauBase colonnes={['Cible', 'État', 'Dispo 24 h', 'Latence p50 / max', 'Certificat TLS', 'Succès 24 h']}>
            {r.cibles.map(c => {
              const etat = etatCible(c.hotesOk, c.hotesTotal)
              const tls = niveauTls(c.tlsJours)
              return (
                <tr key={c.cible}>
                  <td className="mono">{c.cible}</td>
                  <td className={etat.niveau === 'degrade' ? styles['oom'] : undefined}>
                    <Valeur texte={etat.texte} />
                  </td>
                  <td>
                    <Valeur texte={formatPct(c.dispo24hPct)} />
                  </td>
                  <td>
                    <Valeur texte={formatMs(c.latenceP50Ms)} /> / <Valeur texte={formatMs(c.latenceMaxMs)} />
                  </td>
                  <td className={tls === 'rouge' ? styles['oom'] : tls === 'orange' ? styles['tlsOrange'] : undefined}>
                    <Valeur texte={formatTls(c.tlsJours)} />
                  </td>
                  <td>
                    <Sparkline points={pointsSparkline(c.serie)} label={`Succès 24 h — ${c.cible}`} />
                  </td>
                </tr>
              )
            })}
          </TableauBase>
        ) : (
          <p className={styles['nonMesure']}>Sondes pas encore déployées (aucune série probe_*).</p>
        )}
      </section>

      <section className={styles['bloc']} aria-labelledby="bloc-commit">
        <h2 id="bloc-commit">Commit servi</h2>
        <TableauBase colonnes={['Service', 'Commit']}>
          <tr>
            <td className="mono">api</td>
            <td className="mono">
              <Valeur texte={formatCommit(r.commits.api)} />
            </td>
          </tr>
          <tr>
            <td className="mono">ia</td>
            <td className="mono">
              <Valeur texte={formatCommit(r.commits.ia)} />
            </td>
          </tr>
          <tr>
            <td className="mono">main</td>
            <td>
              <Valeur texte={formatCommit(r.commits.main)} />
            </td>
          </tr>
        </TableauBase>
      </section>
    </>
  )
}

async function OngletDisponibilite() {
  let r: SupervisionDisponibilite
  let erreurApi: string | null = null
  try {
    r = await fetchSupervisionDisponibilite()
  } catch (err) {
    erreurApi = err instanceof Error ? err.message : String(err)
    r = { etat: 'injoignable', raison: 'API admin injoignable' }
  }

  // Consultation tracée comme les autres onglets, jamais bloquante.
  void journaliserAccesDepuisComposant({
    operation: 'supervision.consultation',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'infra',
    subjectId: 'disponibilite',
    subjectLabel: 'Disponibilité',
  })

  return (
    <>
      <Bandeau texte={bandeauDisponibilite(r)} erreurApi={erreurApi} />
      {r.etat === 'mesure' ? <ContenuDisponibilite r={r} /> : null}
    </>
  )
}

async function OngletRailway() {
  let r: SupervisionRailway
  let erreurApi: string | null = null
  try {
    r = await fetchSupervisionRailway()
  } catch (err) {
    erreurApi = err instanceof Error ? err.message : String(err)
    r = { etat: 'injoignable', raison: 'API admin injoignable' }
  }

  // Consultation tracée comme les autres onglets, jamais bloquante.
  void journaliserAccesDepuisComposant({
    operation: 'supervision.consultation',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'infra',
    subjectId: 'railway',
    subjectLabel: 'Railway',
  })

  return (
    <>
      <Fraicheur r={r} />
      <Bandeau texte={bandeauRailway(r)} erreurApi={erreurApi} />
      {r.etat === 'mesure' ? <ContenuRailway r={r} /> : null}
    </>
  )
}

async function OngletSupabase() {
  let r: SupervisionSupabase
  let erreurApi: string | null = null
  try {
    r = await fetchSupervisionSupabase()
  } catch (err) {
    erreurApi = err instanceof Error ? err.message : String(err)
    r = { etat: 'injoignable', raison: 'API admin injoignable' }
  }

  // Consultation tracée comme l'onglet Runners, jamais bloquante.
  void journaliserAccesDepuisComposant({
    operation: 'supervision.consultation',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'infra',
    subjectId: 'supabase',
    subjectLabel: 'Base Supabase',
  })

  return (
    <>
      <Fraicheur r={r} />
      <Bandeau texte={bandeauSupabase(r)} erreurApi={erreurApi} />
      {r.etat === 'mesure' ? <ContenuSupabase r={r} /> : null}
    </>
  )
}

async function OngletRunners() {
  let r: SupervisionRunners
  let erreurApi: string | null = null
  try {
    r = await fetchSupervisionRunners()
  } catch (err) {
    erreurApi = err instanceof Error ? err.message : String(err)
    r = { etat: 'injoignable', raison: 'API admin injoignable' }
  }

  // La consultation de la supervision est tracée, comme les autres lectures du
  // back-office. `void` : jamais bloquante — un journal injoignable ne doit pas
  // devenir une erreur d'écran.
  void journaliserAccesDepuisComposant({
    operation: 'supervision.consultation',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'infra',
    subjectId: 'runners',
    subjectLabel: 'Runners CI',
  })

  const bandeau = bandeauSupervision(r)

  return (
    <>
      <Bandeau texte={bandeau} erreurApi={erreurApi} />
      {r.etat === 'mesure' ? <Contenu r={r} /> : null}
    </>
  )
}

export default async function SupervisionPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const demande = searchParams?.['onglet']
  const actif: Onglet =
    demande === 'supabase'
      ? 'supabase'
      : demande === 'railway'
        ? 'railway'
        : demande === 'disponibilite'
          ? 'disponibilite'
          : 'runners'
  return (
    <main className="wrap">
      <h1>Supervision</h1>
      <p className="subtitle">
        {actif === 'supabase'
          ? 'L’instance Postgres Supabase, lue en direct.'
          : actif === 'railway'
            ? 'Les services Railway de production : CPU, mémoire et coût estimé.'
            : actif === 'disponibilite'
              ? 'La disponibilité du produit vue depuis l’extérieur, et le commit servi.'
              : 'La flotte des runners CI, lue dans Grafana Cloud.'}
      </p>
      <BlocIncidents />
      <Onglets actif={actif} />
      {actif === 'supabase' ? (
        <OngletSupabase />
      ) : actif === 'railway' ? (
        <OngletRailway />
      ) : actif === 'disponibilite' ? (
        <OngletDisponibilite />
      ) : (
        <OngletRunners />
      )}
    </main>
  )
}
