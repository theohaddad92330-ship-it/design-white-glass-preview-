import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  CLOSED_SUBMISSION_STAGES,
  type RecordHistoryEntry,
  type RecordLink,
  type RecordLinkGroup,
  type RecordLinkKind,
  type RecordLinksResponse,
  type RecordPanelKind,
  type RecordProperty,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { CommercialTransitionEntity } from '../../database/entities/commercial-transition.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'

/** Les types dont le journal `commercial_transitions` porte l'historique. */
const HISTORY_SUBJECT: Partial<Record<RecordPanelKind, 'opportunity' | 'need' | 'submission' | 'mission'>> = {
  opportunity: 'opportunity',
  need: 'need',
  submission: 'submission',
  mission: 'mission',
}

const HISTORY_LIMIT = 50

interface Header {
  label: string
  status: string | null
  properties: RecordProperty[]
}

function prop(key: string, value: string | number | null | undefined): RecordProperty {
  return { key, value: value === null || value === undefined || value === '' ? null : String(value) }
}

/**
 * #4194 (épopée #4191, lot L3) — les trois zones du panneau latéral unique :
 * propriétés, historique, objets liés. LECTURE SEULE, toujours scopée à
 * l'espace : un identifiant d'un autre espace est introuvable, et un voisin
 * d'un autre espace n'apparaît jamais dans les liens.
 *
 * Ce service lit les entités du dépôt, jamais le service d'un autre module
 * (GA-07). Une relation absente ne fait aucun groupe : on n'affiche pas ce
 * qu'on n'a pas.
 */
@Injectable()
export class RecordLinksService {
  constructor(
    @InjectRepository(ProjectEntity) private readonly opportunities: Repository<ProjectEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(MissionAssignmentEntity) private readonly assignments: Repository<MissionAssignmentEntity>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(CommercialTransitionEntity) private readonly transitions: Repository<CommercialTransitionEntity>,
  ) {}

  async read(workspaceId: string, kind: RecordPanelKind, id: string): Promise<RecordLinksResponse> {
    const loaded = await this.load(workspaceId, kind, id)
    const history = await this.history(workspaceId, kind, id)
    return {
      kind,
      id,
      label: loaded.header.label,
      status: loaded.header.status,
      properties: loaded.header.properties,
      history,
      links: loaded.groups.filter(g => g.items.length > 0),
    }
  }

  private async load(
    ws: string,
    kind: RecordPanelKind,
    id: string,
  ): Promise<{ header: Header; groups: RecordLinkGroup[] }> {
    switch (kind) {
      case 'opportunity':
        return this.loadOpportunity(ws, id)
      case 'need':
        return this.loadNeed(ws, id)
      case 'submission':
        return this.loadSubmission(ws, id)
      case 'mission':
        return this.loadMission(ws, id)
      case 'consultant':
        return this.loadConsultant(ws, id)
    }
  }

  private async loadOpportunity(ws: string, id: string) {
    const opp = await this.opportunities.findOne({ where: { id, workspace_id: ws } })
    if (!opp) throw new NotFoundException()
    const [account, needs, subs, born, renewed] = await Promise.all([
      this.accountLinks(ws, [opp.account_id]),
      this.needs.find({ where: { project_id: id, workspace_id: ws } }),
      this.submissions.find({ where: { project_id: id, workspace_id: ws } }),
      this.missions.find({ where: { opportunity_id: id, workspace_id: ws } }),
      // #4191 (recette 2, E4) — la mission que CETTE affaire cherche à prolonger
      // (`missions.renewal_opportunity_id`) : sans elle, la carte « Renouvellement »
      // ne montrait que le compte.
      this.missions.find({ where: { renewal_opportunity_id: id, workspace_id: ws } }),
    ])
    const missions = [...new Map([...born, ...renewed].map(m => [m.id, m])).values()]
    return {
      header: {
        label: opp.label,
        status: opp.stage ?? null,
        properties: [
          prop('stage', opp.stage),
          prop('objective', opp.objective),
          prop('expectedCloseOn', opp.expected_close_on),
          prop('urgency', opp.urgency),
        ],
      },
      groups: [
        { kind: 'account' as const, items: account },
        { kind: 'need' as const, items: needs.map(n => this.needLink(n)) },
        { kind: 'submission' as const, items: await this.submissionLinks(ws, subs) },
        { kind: 'mission' as const, items: missions.map(m => this.missionLink(m)) },
      ],
    }
  }

  private async loadNeed(ws: string, id: string) {
    const need = await this.needs.findOne({ where: { id, workspace_id: ws } })
    if (!need) throw new NotFoundException()
    const [opp, subs, missions] = await Promise.all([
      need.project_id ? this.opportunities.findOne({ where: { id: need.project_id, workspace_id: ws } }) : null,
      this.submissions.find({ where: { need_id: id, workspace_id: ws } }),
      this.missions.find({ where: { need_id: id, workspace_id: ws } }),
    ])
    return {
      header: {
        label: need.title,
        status: need.status ?? null,
        properties: [prop('status', need.status), prop('seniority', need.seniority)],
      },
      groups: [
        { kind: 'opportunity' as const, items: opp ? [this.opportunityLink(opp)] : [] },
        { kind: 'submission' as const, items: await this.submissionLinks(ws, subs) },
        { kind: 'mission' as const, items: missions.map(m => this.missionLink(m)) },
      ],
    }
  }

  private async loadSubmission(ws: string, id: string) {
    const sub = await this.submissions.findOne({ where: { id, workspace_id: ws } })
    if (!sub) throw new NotFoundException()
    const [need, opp, consultant, missions] = await Promise.all([
      sub.need_id ? this.needs.findOne({ where: { id: sub.need_id, workspace_id: ws } }) : null,
      this.opportunities.findOne({ where: { id: sub.project_id, workspace_id: ws } }),
      this.consultants.findOne({ where: { id: sub.consultant_id, workspace_id: ws } }),
      this.missions.find({ where: { submission_id: id, workspace_id: ws } }),
    ])
    return {
      header: {
        label: consultant?.full_name ?? '',
        status: sub.stage ?? null,
        properties: [prop('stage', sub.stage)],
      },
      groups: [
        { kind: 'need' as const, items: need ? [this.needLink(need)] : [] },
        { kind: 'opportunity' as const, items: opp ? [this.opportunityLink(opp)] : [] },
        { kind: 'consultant' as const, items: consultant ? [this.consultantLink(consultant)] : [] },
        { kind: 'mission' as const, items: missions.map(m => this.missionLink(m)) },
      ],
    }
  }

  private async loadMission(ws: string, id: string) {
    const mission = await this.missions.findOne({ where: { id, workspace_id: ws } })
    if (!mission) throw new NotFoundException()
    const assignments = await this.assignments.find({ where: { mission_id: id, workspace_id: ws } })
    const consultantIds = [...new Set(assignments.map(a => a.consultant_id))]
    // L'affaire d'ORIGINE puis, si elle existe et diffère, l'affaire de RENOUVELLEMENT.
    const opportunityIds = [mission.opportunity_id, mission.renewal_opportunity_id].filter(
      (v, i, all): v is string => Boolean(v) && all.indexOf(v) === i,
    )
    const [account, opps, need, sub, consultants] = await Promise.all([
      this.accountLinks(ws, [mission.account_id]),
      Promise.all(opportunityIds.map(oid => this.opportunities.findOne({ where: { id: oid, workspace_id: ws } }))),
      mission.need_id ? this.needs.findOne({ where: { id: mission.need_id, workspace_id: ws } }) : null,
      mission.submission_id
        ? this.submissions.findOne({ where: { id: mission.submission_id, workspace_id: ws } })
        : null,
      consultantIds.length > 0 ? this.consultants.find({ where: { id: In(consultantIds), workspace_id: ws } }) : [],
    ])
    return {
      header: {
        label: mission.label,
        status: mission.status ?? null,
        properties: [
          prop('status', mission.status),
          prop('roleTitle', mission.role_title),
          prop('startedOn', mission.started_on),
          prop('endsOn', mission.ends_on),
        ],
      },
      groups: [
        { kind: 'account' as const, items: account },
        { kind: 'opportunity' as const, items: opps.flatMap(o => (o ? [this.opportunityLink(o)] : [])) },
        { kind: 'need' as const, items: need ? [this.needLink(need)] : [] },
        { kind: 'submission' as const, items: sub ? await this.submissionLinks(ws, [sub]) : [] },
        { kind: 'consultant' as const, items: consultants.map(c => this.consultantLink(c)) },
      ],
    }
  }

  private async loadConsultant(ws: string, id: string) {
    const consultant = await this.consultants.findOne({ where: { id, workspace_id: ws } })
    if (!consultant) throw new NotFoundException()
    const [subs, assignments] = await Promise.all([
      this.submissions.find({ where: { consultant_id: id, workspace_id: ws } }),
      this.assignments.find({ where: { consultant_id: id, workspace_id: ws } }),
    ])
    const missionIds = [...new Set(assignments.map(a => a.mission_id))]
    const missions =
      missionIds.length > 0 ? await this.missions.find({ where: { id: In(missionIds), workspace_id: ws } }) : []
    const open = subs.filter(s => !(CLOSED_SUBMISSION_STAGES as readonly string[]).includes(s.stage))
    return {
      header: {
        label: consultant.full_name ?? '',
        status: consultant.availability ?? null,
        properties: [prop('title', consultant.title), prop('availability', consultant.availability)],
      },
      groups: [
        { kind: 'submission' as const, items: await this.submissionLinks(ws, open) },
        { kind: 'mission' as const, items: missions.map(m => this.missionLink(m)) },
      ],
    }
  }

  private async history(ws: string, kind: RecordPanelKind, id: string): Promise<RecordHistoryEntry[]> {
    const subject = HISTORY_SUBJECT[kind]
    if (!subject) return []
    const rows = await this.transitions.find({
      where: { subject_type: subject, subject_id: id, workspace_id: ws },
      order: { occurred_at: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return rows.map(r => ({
      id: r.id,
      fromState: r.from_state,
      toState: r.to_state,
      proof: r.proof,
      occurredAt: r.occurred_at.toISOString(),
    }))
  }

  private async accountLinks(ws: string, ids: string[]): Promise<RecordLink[]> {
    const rows = await this.accounts.find({ where: { id: In(ids), workspace_id: ws } })
    return rows.map(a => ({
      kind: 'account' as RecordLinkKind,
      id: a.id,
      label: a.trade_name || a.company_name,
      status: null,
    }))
  }

  private opportunityLink(o: ProjectEntity): RecordLink {
    return { kind: 'opportunity', id: o.id, label: o.label, status: o.stage ?? null }
  }

  private needLink(n: ProjectNeedEntity): RecordLink {
    return { kind: 'need', id: n.id, label: n.title, status: n.status ?? null }
  }

  private missionLink(m: MissionEntity): RecordLink {
    return { kind: 'mission', id: m.id, label: m.label, status: m.status ?? null }
  }

  private consultantLink(c: ConsultantEntity): RecordLink {
    return { kind: 'consultant', id: c.id, label: c.full_name ?? '', status: c.availability ?? null }
  }

  /** Un positionnement se nomme par son consultant : lu en un seul lot. */
  private async submissionLinks(ws: string, subs: SubmissionEntity[]): Promise<RecordLink[]> {
    if (subs.length === 0) return []
    const ids = [...new Set(subs.map(s => s.consultant_id))]
    const people = await this.consultants.find({ where: { id: In(ids), workspace_id: ws } })
    const names = new Map(people.map(c => [c.id, c.full_name ?? '']))
    return subs.map(s => ({
      kind: 'submission' as const,
      id: s.id,
      label: names.get(s.consultant_id) ?? '',
      status: s.stage ?? null,
    }))
  }
}
