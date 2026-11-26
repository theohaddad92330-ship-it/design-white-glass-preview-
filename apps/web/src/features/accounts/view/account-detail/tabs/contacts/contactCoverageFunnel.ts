import { deriveOrgCoverage, type OrgCoverageHeader, type OrgGraph } from '@bellum/contracts'

/**
 * #2552.1 — le funnel « détectés → vérifiés → pertinents → enrichis » demandé
 * par François (call bêta 17/09, #2552) : il compare BellumAI à ses propres
 * recherches et ne sait pas SI des personnes manquent parce qu'on ne les a pas
 * trouvées, parce qu'on les a écartées, ou parce qu'on n'a pas su les enrichir.
 *
 * ⚠️ CE FICHIER NE CALCULE RIEN. `deriveOrgCoverage` (packages/contracts) est
 * la SEULE dérivation de la couverture d'un compte (GA-114/GA-115) : elle lit
 * `_assemble_coverage` (moteur, `org_graph_assembler.py:505-559`) via le
 * graphe d'organigramme stocké. Recalculer ces quatre nombres ici recréerait
 * exactement le défaut que GA-114 a supprimé le 30/08 (un compteur qui plafonne
 * silencieusement à la taille d'une vague d'enrichissement). Ce module se
 * contente de choisir QUELS champs de {@link OrgCoverageHeader} forment CE
 * funnel-ci, et dans quel ORDRE.
 *
 * Mapping (le vocabulaire du client, la donnée du contrat) :
 *  · détectés  = `discovered`               — le corpus, tous états confondus ;
 *  · vérifiés  = `deterministicClassified`  — situés dans la hiérarchie par un
 *                classement déterministe, 0 crédit ;
 *  · pertinents = `attachedToEntity`        — rattachés à une entité retenue du
 *                compte. TROU NOMMÉ aujourd'hui (le rattachement déterministe ne
 *                couvre pas encore le corpus) : `null` répond directement à la
 *                question de François pour ce seau-là — « écarté ou pas mesuré
 *                ? » devient « pas mesuré, et voici pourquoi » ;
 *  · enrichis  = `llmEnriched`              — approfondis par une vague LLM.
 *
 * La somme s'EXPLIQUE parce qu'aucun seau ne remplace une absence par un zéro :
 * un stage à `null` reste `null` ici, jusqu'à l'écran qui le nomme
 * explicitement plutôt que de le compter comme « zéro pertinent ».
 */
type ContactCoverageFunnelStageKey = 'discovered' | 'verified' | 'relevant' | 'enriched'

type ContactCoverageFunnelStage = {
  key: ContactCoverageFunnelStageKey
  /** `null` = non mesuré. JAMAIS coercé à 0 : voir le mapping ci-dessus. */
  value: number | null
}

export function buildContactCoverageFunnel(
  orgGraph: OrgGraph,
  liveDiscovered: number,
): ContactCoverageFunnelStage[] | null {
  const coverage: OrgCoverageHeader = deriveOrgCoverage(orgGraph, { discovered: liveDiscovered })
  // Rien à montrer : ce dossier n'a jamais mesuré son corpus (graphe antérieur
  // au chantier de couverture, ou jamais assemblé). Un funnel de zéros
  // n'apprend rien — même règle que `ContactsFunnelBand`.
  //
  // ⚠️ On teste `deterministicClassified`, jamais `discovered` : `live.discovered`
  // REMPLACE le compteur mesuré par la liste de contacts EN DIRECT (le dossier
  // la connaît toujours), donc `coverage.discovered` n'est jamais `null` dès
  // qu'on passe un `liveDiscovered`. `deterministicClassified`, lui, vient
  // UNIQUEMENT du run mesuré — c'est le signal fiable de « rien à montrer ».
  if (coverage.deterministicClassified === null) return null

  return [
    { key: 'discovered', value: coverage.discovered },
    { key: 'verified', value: coverage.deterministicClassified },
    { key: 'relevant', value: coverage.attachedToEntity },
    { key: 'enriched', value: coverage.llmEnriched },
  ]
}
