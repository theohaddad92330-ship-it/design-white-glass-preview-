import type { OrgEntity } from '@bellum/contracts'
import { BPCE_ROWS, BPCE_SEED } from './bpce-seed'
import type { CompteCsvRow } from './compte-csv-parser'
import { writeCsvNeedAnnotations, writeCsvPartners, type CsvSqlExecutor } from './compte-csv-writes'

/**
 * Ce que le compte « Groupe BPCE » écrit AUTOUR du dossier (30/09/2026) :
 *
 * 1. le graphe du groupe — les unités des blocs `02_STRUCTURE_GROUPE` et
 *    `03_BANQUES_COOPERATIVES` (55 nœuds, chacun citant sa ligne source) ;
 * 2. les ESN présentes (`account_partners`, bloc `07_PRESTATAIRES_EN_PLACE`) ;
 * 3. les pistes « Besoin détecté » reliées à leur ligne source.
 *
 * Les écritures SQL sont les mêmes que celles de Société Générale
 * (`compte-csv-writes.ts`) — une seule copie. Elles vivent ici pour deux
 * appelants : le semis (`DemoSeedService`) et le rattrapage des salles déjà
 * semées (`apps/api/scripts/demo-bpce-complement.ts`).
 */

/** La racine du graphe (`demo-org-graphs.ts`). */
export const BPCE_ORG_GRAPH_ROOT_ID = 'e-bpce'

const BLOC02_TYPE: Record<string, OrgEntity['type']> = {
  'Domaine fonctionnel SI': 'departement',
  'Pôle fonctionnel': 'departement',
  'Capacité de service SI': 'departement',
  'Segment de reporting': 'bu',
  'Réseau coopératif': 'bu',
  Groupement: 'bu',
  Coentreprise: 'filiale',
}

function isConfirmed(row: CompteCsvRow): boolean {
  return (row.fiabilite ?? '').startsWith('Confirmé')
}

function nodeId(row: CompteCsvRow): string {
  return `e-bpce-csv-${(row.id ?? '').replace(/^BPCE-/, '').toLowerCase()}`
}

/**
 * Les nœuds du graphe du groupe : bloc 02 (pôles, domaines, segments,
 * coentreprises…) et bloc 03 (banques coopératives → `filiale`). Tous rattachés
 * à la racine : le CSV ne publie pas de lien parent entre ces lignes, et en
 * déduire un d'une mise en page serait de la donnée inventée.
 */
export function mapBpceOrgGraphEntities(rows: readonly CompteCsvRow[] = BPCE_ROWS): OrgEntity[] {
  return rows
    .filter(row => row.bloc === '02_STRUCTURE_GROUPE' || row.bloc === '03_BANQUES_COOPERATIVES')
    .flatMap((row): OrgEntity[] => {
      if (!row.objet || !row.id) return []
      const grounding = isConfirmed(row) ? 'B' : 'C'
      return [
        {
          id: nodeId(row),
          name: row.objet,
          type: row.bloc === '03_BANQUES_COOPERATIVES' ? 'filiale' : (BLOC02_TYPE[row.niveau ?? ''] ?? 'bu'),
          parentId: BPCE_ORG_GRAPH_ROOT_ID,
          status: 'operating',
          confidence: isConfirmed(row) ? 80 : 55,
          sources: [
            {
              id: `s-bpce-csv-${row.id}`,
              kind: 'workspace_import',
              ref: `Relevé du compte importé le 30/09/2026 — ligne ${row.id} (${row.niveau ?? 'niveau non précisé'}${row.fiabilite ? `, fiabilité : ${row.fiabilite}` : ''})`,
              grounding,
              date: '2026-09-30',
            },
          ],
        },
      ]
    })
}

/**
 * `account_partners` (les ESN et cabinets du bloc 07) puis `opportunities` (les
 * pistes reliées à leur ligne). Bornées au compte ET à son espace ; une
 * correction humaine gagne toujours (`writeCsvPartners`, `writeCsvNeedAnnotations`).
 * APRÈS `ProjectsService.materialize` : ce sont ses lignes que l'on complète.
 */
export async function applyBpcePartnersAndNeeds(
  exec: CsvSqlExecutor,
  workspaceId: string,
  accountId: string,
  options: { dryRun: boolean },
): Promise<{ partners: number; needs: number }> {
  return {
    partners: await writeCsvPartners(exec, workspaceId, accountId, BPCE_SEED.partners, options.dryRun),
    needs: await writeCsvNeedAnnotations(exec, workspaceId, accountId, BPCE_SEED.needAnnotations, options.dryRun),
  }
}
