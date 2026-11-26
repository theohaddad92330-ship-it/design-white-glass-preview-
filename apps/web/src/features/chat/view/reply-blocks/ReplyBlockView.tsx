import type { ReplyBlock } from '@bellum/contracts'
import { AccountCard } from './AccountCard'
import { AccountRankingCard } from './AccountRankingCard'
import { AccountMapCard } from './AccountMapCard'
import { AccountVolumeSprintCard } from './AccountVolumeSprintCard'
import { ActionPlanCard } from './ActionPlanCard'
import { ApproachCard } from './ApproachCard'
import { ComparisonCard } from './ComparisonCard'
import { ConsultantBriefCard } from './ConsultantBriefCard'
import { ConsultantShortlistCard } from './ConsultantShortlistCard'
import { ContactListCard } from './ContactListCard'
import { CountContractCard } from './CountContractCard'
import { FileExportCard } from './FileExportCard'
import { ManagerReviewCard } from './ManagerReviewCard'
import { MeetingBriefCard } from './MeetingBriefCard'
import { MissingDataCard } from './MissingDataCard'
import { PostMeetingSummaryCard } from './PostMeetingSummaryCard'
import { TimelineCard } from './TimelineCard'
import { VerdictCard } from './VerdictCard'

/**
 * #1914 — un bloc VALIDÉ par le contrat → sa carte.
 *
 * Le `switch` est exhaustif sur l'union : un neuvième type ajouté au contrat
 * sans carte ici ne compile pas, et le test qui lit le jeu partagé tombe — le
 * défaut « une action émise dans un langage, non rendue dans l'autre » ne se
 * rejoue pas.
 */
export function ReplyBlockView({ block }: { block: ReplyBlock }) {
  switch (block.type) {
    case 'verdict':
      return <VerdictCard block={block} />
    case 'account_ranking':
      return <AccountRankingCard block={block} />
    case 'contact_list':
      return <ContactListCard block={block} />
    case 'comparison':
      return <ComparisonCard block={block} />
    case 'action_plan':
      return <ActionPlanCard block={block} />
    case 'consultant_shortlist':
      return <ConsultantShortlistCard block={block} />
    case 'meeting_brief':
      return <MeetingBriefCard block={block} />
    case 'consultant_brief':
      return <ConsultantBriefCard block={block} />
    case 'missing_data':
      return <MissingDataCard block={block} />
    case 'account_card':
      return <AccountCard block={block} />
    case 'timeline':
      return <TimelineCard block={block} />
    case 'file_export':
      return <FileExportCard block={block} />
    case 'approach':
      // #2429.13 — l'approche, en champs validés : plus un titre markdown exact.
      return <ApproachCard block={block} />
    case 'account_volume_sprint':
      // #3392 / #3428 — le sprint 10 dont 3, chacun avec pourquoi maintenant /
      // porte d'entrée / premier mouvement, forcés par le contrat.
      return <AccountVolumeSprintCard block={block} />
    case 'account_map':
      // #3758.2 / #3762 — la cartographie : groupes et couverture, et/ou la grille canonique.
      return <AccountMapCard block={block} />
    case 'count_contract':
      // #213.2 (#3228) — le contrat de comptage, copié tel quel depuis un outil.
      return <CountContractCard block={block} />
    case 'post_meeting_summary':
      // #3758 (reste du lot J14) — le compte rendu ENREGISTRÉ, jamais le texte du modèle.
      return <PostMeetingSummaryCard block={block} />
    case 'manager_review':
      // #2985 (lot E07 08/10) — la revue manager sur UN compte nommé, bâtie du résultat
      // de `get_account_manager_review`, jamais le texte du modèle.
      return <ManagerReviewCard block={block} />
  }
}
