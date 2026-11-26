import { getLang, makeT, type TKey } from '@/lib/i18n'
import { Card, CardHeader, EmptyState, KpiTile } from '@/ui'
import { FIRST_PROOF_VERDICTS, fetchFirstProofVerdicts, type RapportPremierePreuve } from './premiere-preuve.client'

export const dynamic = 'force-dynamic'

/**
 * issue 2076.13 — LA RECETTE PRODUIT de la « première preuve ».
 *
 * Le verdict qu'un commercial pose sur la première analyse d'un compte qu'il
 * connaît déjà (juste / partielle / fausse / incomplète) enrichit son ESPACE
 * (directives réinjectées aux runs suivants) ; cet écran en est l'autre
 * destination — l'éditeur y lit la justesse du produit, tous espaces confondus.
 *
 * Seuls les espaces qui ont OUVERT le partage sont lus, et seulement le motif
 * (GA-47) ; les verdicts privés sont un compte, jamais une ligne. Sans verdict
 * partagé, l'écran dit « non mesuré » — jamais « 0 % juste » (GA-18).
 */
export default async function PremierePreuvePage() {
  const lang = await getLang()
  const t = makeT(lang)

  let rapport: RapportPremierePreuve | null = null
  let erreur: string | null = null
  try {
    rapport = await fetchFirstProofVerdicts()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  return (
    <main className="wrap">
      <h1>{t('firstProofTitle')}</h1>
      <p className="subtitle">{t('firstProofSubtitle')}</p>
      <p className="muted">{t('firstProofPrivacy')}</p>

      {erreur ? (
        <Card>
          <EmptyState icon="!" message={`${t('firstProofError')} ${erreur}`} />
        </Card>
      ) : null}

      {rapport ? (
        <>
          <section className="kpi-grid">
            <KpiTile
              label={t('firstProofKpiShared')}
              value={rapport.shared}
              period={`${rapport.windowDays} ${t('firstProofDays')}`}
            />
            <KpiTile label={t('firstProofKpiWorkspaces')} value={rapport.distinctWorkspaces} />
            <KpiTile label={t('firstProofKpiWithheld')} value={rapport.withheldPrivate} />
          </section>

          <Card>
            <CardHeader title={t('firstProofTableTitle')} />
            {rapport.shared === 0 ? (
              <EmptyState message={t('firstProofNone')} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('firstProofColVerdict')}</th>
                      <th>{t('firstProofColCount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIRST_PROOF_VERDICTS.map(verdict => (
                      <tr key={verdict}>
                        <td>{t(`firstProofVerdict_${verdict}` as TKey)}</td>
                        <td>{rapport.verdicts[verdict]}</td>
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
