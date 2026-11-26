import { getLang, makeT } from '@/lib/i18n'
import { Card, CardHeader, EmptyState, KpiTile } from '@/ui'
import { fetchUnroutedIntents, type RapportNonCompris } from './unrouted-intents.client'
import {
  libelleCategorie,
  libelleSurface,
  phraseAucunePubliee,
  phraseRetenus,
  valeurTraces,
} from './unrouted-intents.logic'

export const dynamic = 'force-dynamic'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : LES DEMANDES QUE LAURA N'A PAS SU
 * ROUTER, telles que le produit a le droit de les lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne masque rien, n'agrège rien et n'applique aucun plancher : le moteur IA
 * masque le texte, l'API écrit la trace SANS identité, l'agrège et retient tout
 * groupe sous `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` occurrences distinctes
 * (GA-267). Ce que l'écran ajoute tient en une phrase : **il dit ce qui est
 * retenu, et pourquoi**, au lieu de laisser croire que rien n'a été demandé.
 *
 * ⚠️ AUCUN ESPACE, AUCUNE PERSONNE : la trace n'en porte pas la colonne. Cet
 * écran vit sous `/produit`, que `produit-ne-croise-pas-comportement-et-espace`
 * garde contre tout identifiant d'espace.
 */
export default async function LauraNonComprisPage() {
  const lang = await getLang()
  const t = makeT(lang)

  let rapport: RapportNonCompris | null = null
  let erreur: string | null = null
  try {
    rapport = await fetchUnroutedIntents()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  const retenus = rapport ? phraseRetenus(rapport.withheldGroups, rapport.minDistinctOccurrences, lang) : null

  return (
    <main className="wrap">
      <h1>{t('unroutedTitle')}</h1>
      <p className="subtitle">{t('unroutedSubtitle')}</p>
      <p className="muted">{t('unroutedPrivacy')}</p>

      {erreur ? (
        <Card>
          <EmptyState icon="!" message={`${t('unroutedError')} ${erreur}`} />
        </Card>
      ) : null}

      {rapport ? (
        <>
          <section className="kpi-grid">
            <KpiTile
              label={t('unroutedKpiRecorded')}
              value={valeurTraces(rapport.recorded)}
              period={`${rapport.windowDays} ${t('unroutedDays')}`}
            />
            <KpiTile label={t('unroutedKpiPublished')} value={rapport.groups.length} />
            <KpiTile label={t('unroutedKpiWithheld')} value={rapport.withheldGroups} />
          </section>

          <Card>
            <CardHeader title={t('unroutedTableTitle')} />
            {retenus ? <p className="muted">{retenus}</p> : null}
            {rapport.groups.length === 0 ? (
              <EmptyState message={phraseAucunePubliee(rapport.minDistinctOccurrences, lang)} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('unroutedColText')}</th>
                      <th>{t('unroutedColDistinct')}</th>
                      <th>{t('unroutedColCategory')}</th>
                      <th>{t('unroutedColSurfaces')}</th>
                      <th>{t('unroutedColLanguages')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapport.groups.map(groupe => (
                      <tr key={groupe.text}>
                        <td>{groupe.text}</td>
                        <td>{groupe.distinctOccurrences}</td>
                        <td>{groupe.categories.map(category => libelleCategorie(category, lang)).join(', ')}</td>
                        <td>{groupe.surfaces.map(surface => libelleSurface(surface, lang)).join(', ')}</td>
                        <td>{groupe.languages.length > 0 ? groupe.languages.join(', ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </main>
  )
}
