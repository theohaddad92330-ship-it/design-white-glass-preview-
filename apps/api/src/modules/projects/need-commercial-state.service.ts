import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  FINISHED_MISSION_STATUSES,
  needHasEngagedConsultant,
  needRequiresStaffing,
  type SubmissionStage,
  type SubmissionSubstatus,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ShortlistEntity } from '../../database/entities/shortlist.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import {
  CommercialTransitionsService,
  type CommercialTransitionEntry,
} from '../commercial-transitions/commercial-transitions.service'

/** Un statut de besoin qui referme la ligne — un besoin dans cet état n'attend
 *  plus rien. Mêmes deux valeurs que `canTransitionNeedStatus` traite en
 *  sortie (`need-status.ts`) : jamais une troisième liste qui pourrait diverger. */
const CLOSED_NEED_STATUSES: ReadonlySet<string> = new Set(['lost', 'cancelled'])

/** Combien de missions / candidats doublons au plus. Un besoin n'a jamais
 *  légitimement des dizaines de missions ou de doublons — la borne est un
 *  filet, pas un cas attendu (même patron que `TIMELINE_MAX`,
 *  `account-timeline.service.ts`). */
const NEED_COMMERCIAL_STATE_LIST_MAX = 20

export interface NeedJournalEntry extends CommercialTransitionEntry {
  /** Le sujet PORTEUR de la transition — besoin, shortlist, positionnement ou
   *  mission. Distinct de `subjectType` du contrat brut : c'est le nom que
   *  Laura peut réciter, jamais un recalcul du même fait. */
  subjectLabel: 'need' | 'shortlist' | 'submission' | 'mission'
}

export interface NeedMissionSummary {
  id: string
  label: string
  status: string
  submissionId: string | null
  crmDealId: string | null
  opportunityId: string | null
  createdAt: string
}

/**
 * #2339.1 / .2 / .5 / .6 / .11 / .13 (épopée #2795) — L'ÉTAT CANONIQUE
 * COMMERCIAL & STAFFING D'UN BESOIN, CÔTÉ LECTURE.
 *
 * `CommercialTransitionsService` enregistre déjà les QUATRE sujets de la
 * chaîne besoin → shortlist → positionnement → mission (#2320.23, puis
 * #2339.7 pour la mission et #2339.1-.13 pour le positionnement) — mais
 * aucune porte ne les relisait ENSEMBLE pour UN besoin. `needTransitionHistory`
 * (`ProjectPipelineService`) ne lit que `subjectType: 'need'`, par construction
 * (#2320.24). Ce service est le second lecteur, pas un second calcul : il
 * RÉSOUT les shortlists/positionnements/missions qui appartiennent au besoin,
 * puis rejoue EXACTEMENT `CommercialTransitionsService.history()` pour chacun.
 *
 * Fichier séparé de `ProjectPipelineService` (déjà on l'appelant unique de sept
 * specs qui le construisent positionnellement) : ajouter des dépendances à son
 * constructeur aurait cassé sept fichiers de test pour un gain nul — cette
 * classe a sa propre injection, son propre test.
 *
 * Lecture seule partout : aucune méthode ici n'écrit une ligne.
 */
@Injectable()
export class NeedCommercialStateService {
  constructor(
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ShortlistEntity) private readonly shortlists: Repository<ShortlistEntity>,
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    private readonly commercialTransitions: CommercialTransitionsService,
  ) {}

  private async findOwnedNeed(workspaceId: string, needId: string): Promise<ProjectNeedEntity | null> {
    return this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
  }

  /** #2339.3 / #2339.10 — le besoin brut, scopé à l'espace. `null` = introuvable
   *  ou d'un AUTRE espace, jamais le besoin d'un espace qu'on ne voit pas. */
  async readOne(workspaceId: string, needId: string): Promise<ProjectNeedEntity | null> {
    return this.findOwnedNeed(workspaceId, needId)
  }

  /** #2339.6 / #2339.11 / #2339.13 — les missions déjà nées de CE besoin,
   *  chronologiquement. `[]` = aucune mission encore, un état valide. */
  async missionsForNeed(workspaceId: string, needId: string): Promise<NeedMissionSummary[] | null> {
    const need = await this.findOwnedNeed(workspaceId, needId)
    if (!need) return null
    const rows = await this.missions.find({
      where: { need_id: needId, workspace_id: workspaceId },
      order: { created_at: 'ASC' },
      take: NEED_COMMERCIAL_STATE_LIST_MAX,
    })
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      status: row.status,
      submissionId: row.submission_id,
      crmDealId: row.crm_deal_id,
      opportunityId: row.opportunity_id,
      createdAt: row.created_at.toISOString(),
    }))
  }

  /**
   * #2339.1 — LE JOURNAL UNIFIÉ DES QUATRE SUJETS, dans l'ordre où ils sont
   * survenus. Chaque entrée reste celle que `CommercialTransitionsService` a
   * enregistrée — fusionnée ici, jamais recalculée (GA-26).
   */
  async journal(
    workspaceId: string,
    needId: string,
  ): Promise<{ needId: string; status: string; entries: NeedJournalEntry[] } | null> {
    const need = await this.findOwnedNeed(workspaceId, needId)
    if (!need) return null

    const [shortlists, submissions, missions] = await Promise.all([
      this.shortlists.find({ where: { need_id: needId, workspace_id: workspaceId } }),
      this.submissions.find({ where: { need_id: needId, workspace_id: workspaceId } }),
      this.missions.find({ where: { need_id: needId, workspace_id: workspaceId } }),
    ])

    const label = (subjectType: NeedJournalEntry['subjectLabel']) => subjectType

    const [needEntries, shortlistEntries, submissionEntries, missionEntries] = await Promise.all([
      this.commercialTransitions.history('need', needId, workspaceId),
      Promise.all(shortlists.map(row => this.commercialTransitions.history('shortlist', row.id, workspaceId))),
      Promise.all(submissions.map(row => this.commercialTransitions.history('submission', row.id, workspaceId))),
      Promise.all(missions.map(row => this.commercialTransitions.history('mission', row.id, workspaceId))),
    ])

    const entries: NeedJournalEntry[] = [
      ...needEntries.map(entry => ({ ...entry, subjectLabel: label('need') })),
      ...shortlistEntries.flat().map(entry => ({ ...entry, subjectLabel: label('shortlist') })),
      ...submissionEntries.flat().map(entry => ({ ...entry, subjectLabel: label('submission') })),
      ...missionEntries.flat().map(entry => ({ ...entry, subjectLabel: label('mission') })),
    ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

    return { needId, status: need.status, entries }
  }

  /**
   * #2339.2 — LE CONTRÔLE DE HANDOFF avant de lancer une conversion
   * besoin→mission : la même preuve d'engagement que la porte `won`
   * (`needHasEngagedConsultant`, déjà utilisée par `needTransitionVerdict`),
   * plus l'absence de mission déjà ouverte pour ce besoin — la reconversion
   * silencieuse qu'aucune porte ne bloquait (registre #2339.2, 23/09/2026).
   * `null` = besoin introuvable ou d'un autre espace.
   */
  async missionHandoffCheck(
    workspaceId: string,
    needId: string,
  ): Promise<{
    needId: string
    status: string
    allowed: boolean
    missing: string[]
    existingMissionId: string | null
  } | null> {
    const need = await this.findOwnedNeed(workspaceId, needId)
    if (!need) return null

    const submissionRows = await this.submissions.find({ where: { need_id: needId, workspace_id: workspaceId } })
    const forGate: { stage: SubmissionStage; substatus: SubmissionSubstatus | null }[] = submissionRows.map(row => ({
      stage: row.stage as SubmissionStage,
      substatus: row.substatus as SubmissionSubstatus | null,
    }))

    const existingMissions = await this.missions.find({ where: { need_id: needId, workspace_id: workspaceId } })
    const activeMission = existingMissions.find(
      row => !FINISHED_MISSION_STATUSES.includes(row.status as (typeof FINISHED_MISSION_STATUSES)[number]),
    )

    const missing: string[] = []
    // #4270.4 (18/10) — un forfait encadré devient une mission suivie, sans consultant à engager.
    if (needRequiresStaffing(need) && !needHasEngagedConsultant(forGate)) missing.push('consultant_engaged')
    if (activeMission) missing.push('mission_already_exists')

    return {
      needId,
      status: need.status,
      allowed: missing.length === 0,
      missing,
      existingMissionId: activeMission?.id ?? null,
    }
  }

  /**
   * #2339.5 — LES DOUBLONS PROBABLES du même besoin, dans le même compte :
   * même intitulé normalisé, ou au moins une compétence commune. `[]` = aucun
   * candidat, un état valide — on ne PROPOSE jamais un doublon inventé.
   * Doctrine (`c79_collecte_large_mais_propre` n'est pas en jeu ici, mais
   * l'article général « on propose, on ne fusionne jamais » l'est) : cette
   * méthode ne fusionne rien, elle nomme des candidats.
   */
  async duplicateCandidates(
    workspaceId: string,
    needId: string,
  ): Promise<{
    needId: string
    candidates: { needId: string; title: string; status: string; reason: 'meme_intitule' | 'competences_communes' }[]
  } | null> {
    const need = await this.findOwnedNeed(workspaceId, needId)
    if (!need) return null

    const siblings = await this.needs.find({ where: { account_id: need.account_id, workspace_id: workspaceId } })
    const normalisedTitle = need.title.trim().toLowerCase()
    const skillTerms = new Set(
      (need.skills ?? []).map(skill => (skill.term ?? '').trim().toLowerCase()).filter(Boolean),
    )

    const candidates = siblings
      .filter(row => row.id !== need.id)
      .filter(row => !CLOSED_NEED_STATUSES.has(row.status) && !row.archived_at)
      .flatMap(row => {
        const sameTitle = row.title.trim().toLowerCase() === normalisedTitle
        const sharesSkill = (row.skills ?? []).some(skill => skillTerms.has((skill.term ?? '').trim().toLowerCase()))
        if (!sameTitle && !sharesSkill) return []
        return [
          {
            needId: row.id,
            title: row.title,
            status: row.status,
            reason: (sameTitle ? 'meme_intitule' : 'competences_communes') as 'meme_intitule' | 'competences_communes',
          },
        ]
      })
      .slice(0, NEED_COMMERCIAL_STATE_LIST_MAX)

    return { needId, candidates }
  }

  /**
   * #2339.13 — L'ÉTAT NO-GO d'un besoin : mission dupliquée (plus d'une mission
   * ACTIVE liée au même besoin) ou incohérence Besoin/Mission (besoin gagné
   * sans aucune mission, ou besoin clos avec une mission active). Le NO-GO
   * "CV inventé" n'est PAS recalculé ici : la garantie vit déjà à la source
   * (`bellum_cv.py`, #2333.4 — un CV ne se fabrique jamais, par construction),
   * et la reciter ici en ferait un second calcul (GA-26).
   */
  async noGoState(
    workspaceId: string,
    needId: string,
  ): Promise<{ needId: string; status: string; noGo: boolean; reasons: string[] } | null> {
    const need = await this.findOwnedNeed(workspaceId, needId)
    if (!need) return null

    const missions = await this.missions.find({ where: { need_id: needId, workspace_id: workspaceId } })
    const activeMissions = missions.filter(
      row => !FINISHED_MISSION_STATUSES.includes(row.status as (typeof FINISHED_MISSION_STATUSES)[number]),
    )

    const reasons: string[] = []
    if (activeMissions.length > 1) reasons.push('mission_dupliquee')
    if (need.status === 'won' && activeMissions.length === 0) reasons.push('besoin_gagne_sans_mission')
    if (CLOSED_NEED_STATUSES.has(need.status) && activeMissions.length > 0) reasons.push('besoin_clos_mission_active')

    return { needId, status: need.status, noGo: reasons.length > 0, reasons }
  }
}
