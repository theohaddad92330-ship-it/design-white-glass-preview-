import { fetchAdminOverview, fetchAdminPlans, type AdminPlan } from '@/lib/admin'
import { fetchFeatureAdoptionUsage } from '@/lib/feature-adoption-usage'
import { Card, CardHeader, KpiTile, SegmentBar } from '@/ui'
import { AdoptionTable } from './_components/adoption-table'
import {
  RAISON_USAGE_INDISPONIBLE,
  TOUS_LES_SEAUX,
  compterSeaux,
  construireRapportAdoption,
  resumerMesureUsage,
  usageParFonctionDepuisSignaux,
  type LigneAdoption,
} from './feature-adoption.logic'

export const dynamic = 'force-dynamic'

/**
 * issue 1657.2 / issue 1685 — L'ADOPTION DES FONCTIONS DU PALIER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION QUE CET ÉCRAN FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux issues, un seul sujet, et une question COMMERCIALE derrière : paie-t-on
 * une fonction dont on ne se sert pas ? Le cadrage tranché par Louis — une
 * « fonction » est une fonction GATÉE PAR L'OFFRE, celles qui distinguent
 * Growth d'Entreprise (`@bellum/contracts`, `PLAN_FEATURE_KEYS`) — écarte les
 * deux autres lectures possibles : « les actions d'un écran » (catalogue à
 * construire) et « les 85 écrans du produit » (le catalogue existe déjà,
 * mais répond à QUEL ÉCRAN, jamais à QUELLE FONCTION DU PALIER).
 *
 * Voir le docblock de tête de `feature-adoption.logic.ts` pour : le détail du
 * dénominateur (nommé, jamais « tous les espaces »), la route #1685 qui
 * agrège désormais l'usage réel de 12 des 14 fonctions par espace, et ce qui
 * sépare « morte » d'« ignorée ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE PAGE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne lit AUCUN identifiant d'espace, AUCUN nom de client : le
 * dénominateur est un COMPTE d'abonnements (`AdminOverview.plans`, déjà
 * exposé), jamais une liste. Voir
 * `src/architecture/adoption-ne-nomme-jamais-un-espace.test.ts` (règle 5 de
 * `c64_analytique_produit` : rien de comportemental par espace client NOMMÉ).
 * Elle ne recalcule rien : `feature-adoption.logic.ts` porte toute la
 * dérivation, testée en isolation (TDD).
 */

/** Le libellé FR d'un seau, pour la barre segmentée — jamais un `kind` brut à
 *  l'écran. Le résidu (« sans espace éligible », « pas encore mesurable »)
 *  est rendu EN DERNIER par `TOUS_LES_SEAUX` (voir son docblock) : un
 *  fourre-tout en tête d'une barre triée par volume mange la ligne. */
// ⚠️ Jamais de `<`/`>` littéral dans ces libellés : React échappe le texte en
// `&lt;`/`&gt;` à l'affichage, et un test qui cherche le caractère brut ne le
// trouverait jamais — d'où « moins de »/« sous » en toutes lettres.
const LIBELLE_SEAU: Record<LigneAdoption['etat']['kind'], string> = {
  adoptee: 'Adoptée (≥ 60 %)',
  confidentielle: 'Confidentielle (10 à 60 %)',
  ignoree: 'Ignorée (moins de 10 %, ≥ 60 j)',
  morte: 'Morte (0 usage, ≥ 60 j)',
  observation_insuffisante: 'Observation insuffisante (moins de 60 j)',
  sans_titulaire: 'Aucun espace éligible',
  non_mesurable: 'Pas encore mesurable',
}

export default async function AdoptionPage() {
  // #1685 — la mesure d'usage est en Promise.allSettled avec les deux autres,
  // mais son échec ne casse JAMAIS la page : `plans`/`overview` restent le
  // catalogue et le dénominateur, réels et disponibles, quoi qu'il arrive à la
  // route d'usage. Une panne de mesure d'usage dégrade l'écran vers son état
  // d'AVANT ce lot (tout `non_mesurable`), jamais vers une page cassée.
  const [plansResult, overviewResult, usageResult] = await Promise.allSettled([
    fetchAdminPlans(),
    fetchAdminOverview(),
    fetchFeatureAdoptionUsage(),
  ])
  const plans: AdminPlan[] | null = plansResult.status === 'fulfilled' ? plansResult.value : null
  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null

  if (!plans || !overview) {
    return (
      <main className="wrap">
        <h1>Adoption — les fonctions du palier</h1>
        <p className="error">
          Impossible de lire le catalogue des paliers ou la distribution des abonnements :{' '}
          {plansResult.status === 'rejected'
            ? plansResult.reason instanceof Error
              ? plansResult.reason.message
              : 'catalogue indisponible'
            : null}
          {overviewResult.status === 'rejected'
            ? overviewResult.reason instanceof Error
              ? overviewResult.reason.message
              : 'distribution indisponible'
            : null}
        </p>
      </main>
    )
  }

  // ⚠️ `overview.plans` est un compte RÉEL par abonnement — un total à 0 sur un
  // palier sans abonné aujourd'hui est un ZÉRO VRAI, jamais une absence de
  // mesure (à la différence de l'état d'adoption des fonctions ci-dessous).
  const totalAbonnements = Object.values(overview.plans).reduce((a: number, b: number) => a + b, 0)
  const usageParFonction =
    usageResult.status === 'fulfilled' ? usageParFonctionDepuisSignaux(usageResult.value.signals) : undefined
  const resumeUsage = usageResult.status === 'fulfilled' ? resumerMesureUsage(usageResult.value.signals) : null
  const lignes = construireRapportAdoption(plans, overview.plans, usageParFonction)
  const compte = compterSeaux(lignes)
  const segments = TOUS_LES_SEAUX.map(kind => ({ label: LIBELLE_SEAU[kind], value: compte[kind] }))

  return (
    <main className="wrap">
      <h1>Adoption — les fonctions du palier</h1>
      <p className="subtitle">
        La question commerciale derrière ce dossier : paie-t-on une fonction dont on ne se sert pas ? Les{' '}
        {lignes.length} fonctions ci-dessous sont celles GATÉES PAR L’OFFRE — celles qui distinguent Growth d’Entreprise
        — jamais les actions d’un écran, jamais les écrans eux-mêmes. Chaque pourcentage porte son dénominateur : les
        espaces qui ont le DROIT à la fonction, jamais tous les espaces.
      </p>

      {/* ─────────────────────────────────────────────────────────────────
          1. L'ÉTAT DE LA MESURE D'USAGE (#1685) — combien de fonctions sont
             mesurées aujourd'hui, et pourquoi les autres ne le sont pas encore
         ───────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Card>
          {resumeUsage ? (
            <>
              <CardHeader
                title={`Mesure d’usage : disponible pour ${resumeUsage.fonctionsMesurees} sur ${resumeUsage.totalFonctions} fonctions${resumeUsage.windowDays !== null ? ` (fenêtre de ${resumeUsage.windowDays} jours)` : ''}`}
              />
              {resumeUsage.fonctionsSansSignal.length > 0 ? (
                <ul style={{ fontSize: 12, color: 'var(--amber)', margin: 0, paddingLeft: 18 }}>
                  {resumeUsage.fonctionsSansSignal.map(f => (
                    <li key={f.feature}>
                      <strong>{f.labelFr}</strong> — pas encore mesurable : {f.raison}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <CardHeader title="Mesure d’usage : indisponible pour le moment" />
              <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>{RAISON_USAGE_INDISPONIBLE}</p>
            </>
          )}
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          2. LE CATALOGUE ET SON DÉNOMINATEUR — RÉEL, DISPONIBLE MAINTENANT
         ───────────────────────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
        <KpiTile label="Fonctions gatées par l’offre" value={lignes.length} />
        <KpiTile label="Abonnements, tous paliers confondus" value={totalAbonnements} />
        <KpiTile label="Fonctions sans espace éligible aujourd’hui" value={compte.sans_titulaire} />
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          3. LA RÉPARTITION DES QUATRE SEAUX DE L'ISSUE + LE RÉSIDU HONNÊTE,
             EN DERNIER (règle du dépôt : jamais le fourre-tout en tête).
         ───────────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>
          Répartition des {lignes.length} fonctions — les quatre seaux de l’issue, et pourquoi le reste ne l’est pas
          encore
        </h2>
        <SegmentBar segments={segments} format={v => `${v} fonction${v > 1 ? 's' : ''}`} />
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          4. LE DÉTAIL, FONCTION PAR FONCTION
         ───────────────────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Le détail, fonction par fonction</h2>
        <AdoptionTable lignes={lignes} />
      </section>
    </main>
  )
}
