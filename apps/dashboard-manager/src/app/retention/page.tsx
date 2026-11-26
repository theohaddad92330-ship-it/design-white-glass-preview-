import { CohortGrid } from '@/app/_components/charts'
import { dateEtHeure } from '@/lib/dates'
import { fetchCohortesDUsage, type CohortesDUsage } from '@/lib/manager-kpi'
import { fetchRetentionCohorts, type RapportRetention } from '@/lib/retention'
import { KpiTile } from '@/ui'
import { COHORT_MIN_SPACES, construireVueRetention } from './retention.logic'
import { libelleCohorteDUsage, REPERES_DUSAGE } from './usage-cohortes.logic'

export const dynamic = 'force-dynamic'

/**
 * #1658.1 — LA RÉTENTION PAR COHORTE MENSUELLE D'ESPACES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne dessine pas la grille — `CohortGrid` (#1643) le fait, et elle porte déjà
 * les trois états d'une cellule. Il ne calcule pas la rétention — l'API le fait,
 * là où l'heure de lecture est connue. Il ne redéfinit pas le seuil d'anonymat —
 * `COHORT_MIN_SPACES` vit à un seul endroit. Ce qu'il ajoute tient en une
 * phrase : **il dit ce que la grille tait.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET ILS NE DISENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Illisible** — l'API n'a pas répondu : une ERREUR. Une panne ne rend
 *    jamais une grille vide, ce serait annoncer « aucun client ».
 *  · **Aucune cohorte** — la base ne porte aucun espace non-démo. C'est un fait,
 *    et il se dit avec ses mots.
 *  · **Cohortes masquées** — elles existent, elles sont trop petites pour être
 *    montrées. La ligne est NOMMÉE avec sa raison, au lieu de disparaître : une
 *    ligne absente se lirait « personne ne s'est inscrit ce mois-là ».
 *
 * ⚠️ AUCUNE MÉTRIQUE PAR PERSONNE. L'unité d'analyse est l'ESPACE, jamais
 * quelqu'un — doctrine `c64_analytique_produit`. Aucune adresse e-mail ne
 * transite par cet écran, donc rien à masquer ; aucun espace n'est nommé non
 * plus, seulement compté.
 */
export default async function RetentionPage() {
  let rapport: RapportRetention | null = null
  let erreur: string | null = null
  try {
    rapport = await fetchRetentionCohorts()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  // #1946.14 — DEUX ROUTES, DEUX SORTS. `manager-kpis` et `retention-cohorts`
  // ne répondent pas ensemble : une panne de l'une ne doit pas emporter
  // l'autre. Le bloc d'usage affiche alors « non lu », et la grille reste. Un
  // seul `try` autour des deux aurait fait de cette page un tout-ou-rien — le
  // défaut « un repli qui teste la panne nommée fait tomber l'écran hôte ».
  let usage: CohortesDUsage | null = null
  try {
    usage = await fetchCohortesDUsage()
  } catch {
    usage = null
  }

  const vue = rapport ? construireVueRetention(rapport.cohortes) : null

  return (
    <main className="wrap">
      <h1>Rétention par cohorte</h1>
      <p className="subtitle">
        Chaque ligne est un mois d’inscription, chaque colonne un mois de vie de la cohorte. Une case dit la part
        d’espaces qui ont validé au moins une action ce mois-là — se connecter ne compte pas. L’unité est l’espace, pas
        la personne.
      </p>

      {/* #1946.14 — « Instrumenter : usage J+7 et J+30 ». Hors du `erreur ?`
          ci-dessous : ces deux repères viennent d'une AUTRE route, ils
          s'affichent même quand la grille de cohortes n'a pas pu être lue. */}
      <section style={{ margin: '20px 0' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>Usage après inscription</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
          Autre grandeur que la grille ci-dessous : ici l’unité est l’INSCRIPTION, pas l’espace, et les repères sont
          fixes (J+7, J+30) au lieu des mois de vie d’une cohorte. Les deux chiffres ne se comparent pas entre eux.
          Aucun utilisateur n’est nommé ni compté individuellement.
        </p>
        <section className="cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {REPERES_DUSAGE.map(repere => {
            const libelle = libelleCohorteDUsage(usage?.[repere.cle])
            return (
              <div key={repere.cle} title={repere.aide}>
                <KpiTile label={repere.titre} value={libelle.valeur} period={libelle.pied} />
              </div>
            )
          })}
        </section>
      </section>

      {erreur ? (
        <p style={{ color: 'var(--red)' }}>Impossible de lire la rétention : {erreur}</p>
      ) : !rapport || !vue ? null : rapport.cohortes.length === 0 ? (
        <p className="empty">
          Aucun espace client dans la base — il n’y a pas encore de cohorte à suivre. (Les espaces de démonstration sont
          exclus du calcul : leur activité est celle d’un semis, pas d’un client.)
        </p>
      ) : (
        <>
          <section className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card">
              <div className="label">Espaces suivis</div>
              <div className="value">{rapport.espaces}</div>
            </div>
            <div className="card">
              <div className="label">Cohortes</div>
              <div className="value">{rapport.cohortes.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                dont {vue.masquees} masquée{vue.masquees > 1 ? 's' : ''}
              </div>
            </div>
            <div className="card">
              <div className="label">Jamais aucune action validée</div>
              <div className="value">{rapport.espacesSansAucuneAction}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                comptés dans les dénominateurs, absents de tous les numérateurs
              </div>
            </div>
          </section>

          {vue.rows.length > 0 ? (
            <section style={{ margin: '20px 0' }}>
              <CohortGrid
                rows={vue.rows}
                monthsElapsed={row => moisEcoulesDeLaVue(vue, row.cohortLabel)}
                period={`${vue.rows.length} cohorte${vue.rows.length > 1 ? 's' : ''} · M0 → M${rapport.mois - 1}`}
                asOf={dateEtHeure(rapport.calculeA)}
              />
            </section>
          ) : (
            <p className="empty" style={{ margin: '20px 0' }}>
              Aucune cohorte n’atteint {COHORT_MIN_SPACES} espaces : rien ne peut être affiché sans désigner ses
              membres.
            </p>
          )}

          {/* LA LIGNE MASQUÉE, qui est le test de l'issue. Sans elle, un mois
              dont la cohorte est trop petite se lirait « personne ne s'est
              inscrit » — et le compte d'espaces du haut le démentirait. */}
          {vue.masquees > 0 ? (
            <section style={{ margin: '20px 0' }}>
              <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Cohortes masquées</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                Sous {COHORT_MIN_SPACES} espaces, une ligne de rétention ne dit rien de fiable et désigne ses membres :
                un taux sur deux espaces est une phrase sur deux clients, écrite en pourcentage. Elles sont nommées ici
                pour qu’on sache qu’elles existent — {vue.espacesMasques} espace
                {vue.espacesMasques > 1 ? 's' : ''} au total.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {vue.lignes
                  .filter(ligne => ligne.etat === 'masquee')
                  .map(ligne => (
                    <li key={ligne.cohorte.cohorte} style={{ marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize' }}>{ligne.libelle}</span>{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        — trop peu d’espaces ({ligne.cohorte.espaces} sur {COHORT_MIN_SPACES} requis)
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
            ⚠️ La dernière case de chaque ligne porte un mois <strong>en cours</strong> : elle ne peut que monter d’ici
            la fin du mois. Une case au-delà est vide parce que le mois n’a pas eu lieu — ce n’est pas une rétention de
            zéro.
          </p>
        </>
      )}
    </main>
  )
}

/**
 * Les mois écoulés d'une ligne, retrouvés dans la vue.
 *
 * `CohortGrid` redemande le nombre pour chaque ligne qu'elle dessine ; il vient
 * de l'API, qui seule connaît l'heure de la lecture. Une ligne introuvable rend
 * `-1` — toute la ligne passe « à venir », donc visiblement vide plutôt que
 * faussement mesurée.
 */
function moisEcoulesDeLaVue(vue: { lignes: { libelle: string; cohorte: { moisEcoules: number } }[] }, libelle: string) {
  return vue.lignes.find(ligne => ligne.libelle === libelle)?.cohorte.moisEcoules ?? -1
}
