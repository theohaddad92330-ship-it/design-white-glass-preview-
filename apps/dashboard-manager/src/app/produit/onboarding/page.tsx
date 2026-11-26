import { dateEtHeure } from '@/lib/dates'
import { Card, CardHeader, EmptyState, KpiTile } from '@/ui'
import { fetchOnboardingFunnel, type RapportEntonnoir } from './onboarding-funnel.client'
import { COHORT_MIN_SPACES, construireVueEntonnoir } from './onboarding-funnel.logic'
import { CohortesTable } from './_components/cohorts-table'

export const dynamic = 'force-dynamic'

/**
 * #1686 — L'ENTONNOIR D'ONBOARDING PAR COHORTE MENSUELLE D'ESPACES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne calcule pas l'entonnoir — l'API le fait, là où l'heure de lecture est
 * connue (`apps/api/src/modules/analytics/onboarding-funnel.ts`). Il ne
 * redéfinit pas le seuil d'anonymat — `COHORT_MIN_SPACES` (#1643) vit à un
 * seul endroit. Ce qu'il ajoute tient en une phrase, comme la rétention
 * (#1658.1) dont il reprend le patron : **il masque les petites cohortes ET
 * dit pourquoi.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX MOTS QUI NE DISENT PAS LA MÊME CHOSE DANS UNE CELLULE (1686.2)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Un pourcentage, zéro compris** — l'étape a eu le temps d'être jugée : la
 *    cohorte a franchi cette part, PAS DAVANTAGE. C'est une mesure, même à 0 %.
 *  · **« Trop tôt »** — personne n'a encore franchi l'étape, ET la cohorte n'a
 *    pas eu le temps matériel d'y arriver (délai de grâce compté depuis la fin
 *    de son mois d'inscription). Ce n'est pas 0 %, question de la doctrine :
 *    *si cette valeur est absente, « 0 » est-il VRAI ?* — non, pas encore.
 *
 * ⚠️ AUCUNE MÉTRIQUE PAR PERSONNE. L'unité d'analyse est l'ESPACE, jamais
 * quelqu'un — doctrine `c64_analytique_produit`. Aucun identifiant
 * d'utilisateur ne transite par cet écran ni par les données qu'il lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1642.2 — CE QUI CHANGE DE CONTENANT, PAS DE CONTENU
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux cartes de tête et le tableau de cohortes étaient en HTML brut : ils
 * passent à `Card`/`CardHeader`/`KpiTile`/`DataTable`. Aucune colonne, aucune
 * phrase n'a disparu — voir `_components/cohorts-table.tsx` pour le tableau,
 * qui est la seule partie qui doit vivre dans un Client Component (`DataTable`
 * porte des fonctions dans ses colonnes, qui ne traversent pas la frontière
 * RSC serveur → client).
 */
export default async function OnboardingFunnelPage() {
  let rapport: RapportEntonnoir | null = null
  let erreur: string | null = null
  try {
    rapport = await fetchOnboardingFunnel()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  const vue = rapport ? construireVueEntonnoir(rapport.cohortes) : null

  return (
    <main className="wrap">
      <h1>Entonnoir d’onboarding</h1>
      <p className="subtitle">
        Pour chaque cohorte mensuelle d’espaces (le mois où l’espace s’est inscrit), la part qui a franchi chaque étape
        du parcours et le délai jusqu’à la première valeur — jamais une métrique par personne.
      </p>

      {erreur ? (
        <p style={{ color: 'var(--red)' }}>Impossible de lire l’entonnoir : {erreur}</p>
      ) : !rapport || !vue ? null : rapport.cohortes.length === 0 ? (
        <EmptyState
          icon="◇"
          message="Aucun espace client dans la base — il n’y a pas encore de cohorte à suivre. (Les espaces de démonstration sont exclus du calcul : leur activité est celle d’un semis, pas d’un client.)"
        />
      ) : (
        <>
          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}
          >
            <KpiTile label="Espaces suivis" value={rapport.espaces} />
            <KpiTile
              label="Cohortes"
              value={rapport.cohortes.length}
              period={`dont ${vue.masquees} masquée${vue.masquees > 1 ? 's' : ''}`}
            />
          </section>

          {vue.affichees > 0 ? (
            <Card>
              <CardHeader title="Cohortes" />
              <CohortesTable
                lignes={vue.lignes.filter(
                  (ligne): ligne is typeof ligne & { etat: 'affichee' } => ligne.etat === 'affichee',
                )}
                etapes={rapport.etapes}
              />
            </Card>
          ) : (
            <EmptyState
              icon="◇"
              message={`Aucune cohorte n’atteint ${COHORT_MIN_SPACES} espaces : rien ne peut être affiché sans désigner ses membres.`}
            />
          )}

          {/* LA LIGNE MASQUÉE, qui est le test de l'issue (1686.1). Sans elle,
              un mois dont la cohorte est trop petite se lirait « personne ne
              s'est inscrit » — et le compte d'espaces du haut le démentirait. */}
          {vue.masquees > 0 ? (
            <section style={{ margin: '20px 0' }}>
              <Card>
                <CardHeader title="Cohortes masquées" />
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                  Sous {COHORT_MIN_SPACES} espaces, une part sur deux ou trois espaces désigne ses membres : elle n’est
                  pas affichée. Elles sont nommées ici pour qu’on sache qu’elles existent — {vue.espacesMasques} espace
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
              </Card>
            </section>
          ) : null}

          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
            ⚠️ « Trop tôt » n’est pas 0 % : la cohorte n’a pas encore eu le temps matériel d’atteindre cette étape. «
            Non instrumentée » n’est pas 0 % non plus, et c’est un cas différent : aucun espace n’a jamais franchi cette
            étape sur AUCUNE cohorte — rien ne l’écrit, donc attendre ne rendra jamais ce zéro vrai. Un « — » sur le
            délai de première valeur veut dire qu’aucun espace de la cohorte n’a encore atteint sa première valeur,
            jamais un délai nul. Calculé à {dateEtHeure(rapport.calculeA)}.
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            ⚠️ Ni ordonné ni cumulatif : chaque colonne mesure une part indépendante de la cohorte, jamais « une part de
            ceux qui ont franchi la colonne précédente ». Un espace peut apparaître dans « Deuxième session » sans
            apparaître dans « Première action validée », et réciproquement.
          </p>
        </>
      )}
    </main>
  )
}
