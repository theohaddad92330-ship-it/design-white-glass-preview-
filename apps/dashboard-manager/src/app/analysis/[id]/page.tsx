import { AnalysisCompany } from './_components/AnalysisCompany'
import { AnalysisContract } from './_components/AnalysisContract'
import { AnalysisCost } from './_components/AnalysisCost'
import { AnalysisProviderMetrics } from './_components/AnalysisProviderMetrics'
import { AnalysisOrgAndContacts, AnalysisPeopleMentioned } from './_components/AnalysisContacts'
import { AnalysisEntities } from './_components/AnalysisEntities'
import { AnalysisGrounding, AnalysisHeader, AnalysisStatusBadges } from './_components/AnalysisHeader'
import { AnalysisPhases } from './_components/AnalysisPhases'
import { AnalysisDecisionGraph, AnalysisPlan, AnalysisSalesEnablement } from './_components/AnalysisPlan'
import { AnalysisRawJson } from './_components/AnalysisRawJson'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'
import { AnalysisSignals } from './_components/AnalysisSignals'
import {
  AnalysisEvidence,
  AnalysisFreshness,
  AnalysisRawSources,
  AnalysisRegistry,
} from './_components/AnalysisSources'
import { type Dict, pick, str } from './_components/analysis-shared'
import { fetchTelemetryDetail } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

/**
 * Le détail d'une analyse — l'écran le plus dense du back-office.
 *
 * ⚠️ CE FICHIER N'ORCHESTRE QUE L'ORDRE. Chaque section vit dans
 * `_components/`, lit `raw_analysis` elle-même et rend `null` quand elle n'a
 * rien à dire. L'ORDRE CI-DESSOUS EST LE RENDU : les sections sont entrelacées
 * par thème (l'audit d'exécution s'intercale entre le vocabulaire du groupe et
 * l'organigramme, le grounding entre la concurrence et les entités) parce que
 * c'est l'ordre de LECTURE d'un opérateur, pas l'ordre de rangement du code.
 * Le réordonner change l'écran — `page.test.tsx` le refuse.
 */
export default async function AnalysisDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  let detail
  try {
    detail = await fetchTelemetryDetail(params.id)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/">
          ← retour
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          Détail indisponible. {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  const raw = (detail.rawAnalysis ?? {}) as Dict
  const companyLogoUrl = str(pick(raw, 'companyLogoUrl', 'company_logo_url'))

  // #2905 (#2442.19) — L'ACCÈS AUX DONNÉES BRUTES D'UN CLIENT EST TRACÉ.
  // Cet écran rend `raw_analysis` cross-tenant, en entier, sans le moindre
  // filtre — et jusqu'ici sans laisser aucune trace de qui l'a ouvert, quand,
  // ou pourquoi. `void` : au mieux, jamais bloquante (même doctrine que
  // `journaliserAudit`) — une lecture déjà servie ne doit pas devenir une
  // erreur d'écran parce que le journal est injoignable.
  void journaliserAccesDepuisComposant({
    operation: 'analyses.raw_data_read',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'account',
    subjectId: params.id,
    subjectLabel: detail.companyName || null,
  })

  return (
    <main className="wrap">
      <a className="link" href="/">
        ← retour
      </a>
      <h1 style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        {companyLogoUrl ? (
          <img
            src={companyLogoUrl}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: 6, objectFit: 'contain' }}
            referrerPolicy="no-referrer"
          />
        ) : null}
        {detail.companyName || detail.accountId}
      </h1>
      <p className="subtitle">
        <AnalysisStatusBadges detail={detail} />
      </p>

      <AnalysisHeader detail={detail} />
      <AnalysisContract raw={raw} />
      <AnalysisPhases detail={detail} />
      <AnalysisOrgAndContacts detail={detail} />
      <AnalysisCompany raw={raw} />
      <AnalysisGrounding detail={detail} />
      <AnalysisEntities raw={raw} />
      <AnalysisRawSources raw={raw} />
      <AnalysisSignals raw={raw} />
      <AnalysisEvidence raw={raw} />
      <AnalysisPlan raw={raw} />
      <AnalysisRegistry raw={raw} />
      <AnalysisDecisionGraph raw={raw} />
      <AnalysisSalesEnablement raw={raw} />
      <AnalysisFreshness raw={raw} />
      <AnalysisCost raw={raw} />
      <AnalysisProviderMetrics raw={raw} />
      <AnalysisPeopleMentioned raw={raw} />
      <AnalysisRawJson raw={raw} />
    </main>
  )
}
