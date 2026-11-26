import { dateEtHeure } from '@/lib/dates'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'
import { Card, CardHeader, EmptyState } from '@/ui'
import { fetchDriveInterne, type VueDriveInterne } from './drive-interne.client'
import styles from './drive-interne.module.css'
import { compter, trierFichiers, type StatutFichier } from './drive-interne.logic'

export const dynamic = 'force-dynamic'

const STATUTS: ReadonlyArray<{ id: StatutFichier; label: string }> = [
  { id: 'error', label: 'En erreur' },
  { id: 'ignored', label: 'Ignorés' },
  { id: 'indexed', label: 'Indexés' },
  { id: 'archived', label: 'Archivés' },
]
// #3586 — sous le nom : le dossier parent, deux derniers segments (la fin du
// chemin est la partie utile) ; le chemin complet reste au survol.
function dossierParent(chemin: string): string {
  const segments = chemin.split('/').filter(Boolean)
  const dossiers = segments.slice(0, -1)
  if (dossiers.length === 0) return chemin
  return (dossiers.length > 2 ? '…/' : '') + dossiers.slice(-2).join('/')
}

const LABEL: Record<StatutFichier, string> = {
  error: 'En erreur',
  ignored: 'Ignoré',
  indexed: 'Indexé',
  archived: 'Archivé',
}

/**
 * #3586 — LE DRIVE INTERNE : dernière synchro, compteurs par statut, fichiers
 * (erreurs en tête), digest repliable. Outil interne, déplacé du web (/bak) vers
 * le DM le 05/10/2026. Lecture seule et journalisée. Une valeur absente ne
 * s'affiche jamais « 0 » : « — » / « Jamais ».
 */
export default async function DriveInternePage() {
  let vue: VueDriveInterne | null = null
  let erreur: string | null = null
  try {
    vue = await fetchDriveInterne()
    void journaliserAccesDepuisComposant({
      operation: 'internal_knowledge.drive_read',
      category: 'ordinaire',
      outcome: 'succes',
      subjectType: 'internal_knowledge_files',
      subjectId: 'tous',
    })
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  return (
    <main className="wrap">
      <h1>Drive interne</h1>
      <p className="subtitle">
        La synchro du Drive interne Bellum vers le corpus de Laura : dernière passe, fichiers indexés, ignorés, en
        erreur ou archivés, et le digest courant.
      </p>

      {erreur || !vue ? (
        <Card>
          <EmptyState icon="!" message={`Drive interne indisponible. ${erreur ?? ''}`} />
        </Card>
      ) : (
        <Contenu vue={vue} />
      )}
    </main>
  )
}

function Contenu({ vue }: { vue: VueDriveInterne }) {
  const fichiers = trierFichiers(vue.files ?? [])
  const counts = vue.counts
  return (
    <>
      {!vue.configured ? <p className="muted">Synchro non configurée sur cet environnement.</p> : null}

      <Card>
        <CardHeader title="Dernière synchro" />
        <p data-testid="drive-interne-last-run">
          Dernière passe : {dateEtHeure(vue.lastRunAt, 'Jamais')}
          {vue.lastStatus ? ` · ${vue.lastStatus === 'ok' ? 'réussie' : 'en erreur'}` : ''}
        </p>
        {vue.lastStatus === 'error' && vue.lastError ? <p className="muted">{vue.lastError}</p> : null}
        <p className="muted">Dernière réconciliation : {dateEtHeure(vue.lastReconciledAt, 'Jamais')}</p>
      </Card>

      {counts ? (
        <Card>
          <CardHeader title="Fichiers par statut" />
          <dl style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {STATUTS.map(s => (
              <div key={s.id}>
                <dt className="muted">{s.label}</dt>
                <dd style={{ fontSize: 22, margin: 0 }}>{compter(counts[s.id])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {vue.digest ? (
        <Card>
          <details>
            <summary>Digest courant</summary>
            <p>Généré le : {dateEtHeure(vue.digest.generatedAt)}</p>
            <p>
              Taille : {compter(vue.digest.sizeChars)} caractères (≈ {compter(vue.digest.approxTokens)} jetons)
            </p>
            <p className="muted">Surcoût d’entrée estimé par appel commercial (≈ 4 caractères par jeton).</p>
          </details>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Fichiers" />
        {fichiers.length === 0 ? (
          <EmptyState message="Aucun fichier synchronisé." />
        ) : (
          <div className={styles.defilement}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colFichier} />
                <col className={styles.colStatut} />
                <col className={styles.colFragments} />
                <col className={styles.colDate} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th>Statut</th>
                  <th>Fragments</th>
                  <th>Synchronisé le</th>
                  <th>Erreur / raison</th>
                </tr>
              </thead>
              <tbody>
                {fichiers.map(f => (
                  <tr key={f.path}>
                    <td>
                      <span className={styles.fichier} title={f.name}>
                        {f.name}
                      </span>
                      <span className={`${styles.chemin} muted`} title={f.path}>
                        {dossierParent(f.path)}
                      </span>
                    </td>
                    <td className={styles.compact}>{LABEL[f.status]}</td>
                    <td className={styles.compact}>{compter(f.chunkCount)}</td>
                    <td className={styles.compact}>{dateEtHeure(f.syncedAt)}</td>
                    <td className="muted">
                      {f.errorMessage ? (
                        <span className={styles.raison} title={f.errorMessage}>
                          {f.errorMessage}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
