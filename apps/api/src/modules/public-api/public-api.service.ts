import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { PaginatedResult, PaginationMeta } from '@bellum/contracts'
import { isSuccess, success, type Result } from '@bellum/utils'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountsService, type AccountFailure } from '../accounts/accounts.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { PublicAccountDetail, PublicContact, PublicRun, V1ListQuery } from './public-api.schemas'

function paginationMeta(total: number, limit: number, offset: number): PaginationMeta {
  const current = Math.floor(offset / limit) + 1
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
  return {
    currentPage: current,
    size: limit,
    totalItems: total,
    totalPages,
    hasNext: current < totalPages,
    hasPrev: current > 1,
  }
}

/** Explicit allowlist — the ONLY path from `accounts.*` to the public wire.
 *  `raw_analysis`, `api_cost_euros`, `user_context`, `error_message` and the
 *  ownership columns never appear here, so they can never leak. */
function toPublicAccount(row: AccountEntity): PublicAccountDetail {
  return {
    id: row.id,
    company_name: row.company_name,
    sector: row.sector,
    employees: row.employees,
    revenue: row.revenue,
    headquarters: row.headquarters,
    website: row.website,
    siren: row.siren,
    registry_id: row.registry_id,
    registry_country: row.registry_country,
    naf_code: row.naf_code,
    status: row.status,
    commercial_status: row.commercial_status ?? 'inbox',
    priority_score: row.priority_score,
    priority_justification: row.priority_justification,
    subsidiaries: Array.isArray(row.subsidiaries) ? row.subsidiaries : [],
    it_challenges: Array.isArray(row.it_challenges) ? row.it_challenges : [],
    recent_signals: Array.isArray(row.recent_signals) ? row.recent_signals : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Explicit allowlist for contacts — no `raw_data`, drafts or psychology. */
function toPublicContact(row: ContactEntity): PublicContact {
  return {
    id: row.id,
    account_id: row.account_id,
    full_name: row.full_name,
    title: row.title,
    entity: row.entity,
    family: row.family,
    decision_role: row.decision_role,
    priority: row.priority,
    email: row.email,
    email_verified: row.email_verified,
    phone: row.phone,
    linkedin_url: row.linkedin_url,
    profile_summary: row.profile_summary,
    why_contact: row.why_contact,
    lifecycle_state: row.lifecycle_state,
    contact_score: row.contact_score,
    seniority: row.seniority,
    location: row.location,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Explicit allowlist for runs — no `cost_eur`, no `prompt_versions`. */
function toPublicRun(row: AnalysisRunEntity): PublicRun {
  return {
    id: row.id,
    account_id: row.account_id,
    status: row.status,
    scope_mode: row.scope_mode,
    siren: row.siren,
    created_at: row.created_at,
    completed_at: row.completed_at,
  }
}

/**
 * Read-only data access for the public `/v1` surface. EVERY read is scoped by
 * the API key's `workspace_id` — never by anything the caller supplies — so a
 * key can only ever see its own workspace's rows. Output goes through the
 * explicit `toPublic*` allowlists above (clean DTOs, no internal columns).
 */
@Injectable()
export class PublicApiService {
  constructor(
    private readonly accounts: AccountsService,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
  ) {}

  /** One dossier, mapped through the account allowlist. */
  async getAccount(workspaceId: string, id: string): Promise<Result<PublicAccountDetail, AccountFailure>> {
    const found = await this.accounts.findOneForWorkspace(id, workspaceId)
    if (!isSuccess(found)) return found
    return success(toPublicAccount(found.output))
  }

  /**
   * Workspace contacts, newest-priority first. `account_id` narrows to one
   * dossier; the workspace predicate stays on regardless, so an id from
   * another workspace just yields an empty page. Hidden contacts are excluded
   * (same default as the app's own lists).
   */
  async listContacts(workspaceId: string, query: V1ListQuery): Promise<PaginatedResult<PublicContact>> {
    const where = {
      workspace_id: workspaceId,
      hidden: false,
      ...(query.account_id ? { account_id: query.account_id } : {}),
    }
    const [rows, total] = await this.contacts.findAndCount({
      where,
      order: { priority: 'ASC', created_at: 'DESC' },
      take: query.limit,
      skip: query.offset,
    })
    return { data: rows.map(toPublicContact), pagination: paginationMeta(total, query.limit, query.offset) }
  }

  /** Workspace analysis-run history, newest first. Same scoping rules. */
  async listRuns(workspaceId: string, query: V1ListQuery): Promise<PaginatedResult<PublicRun>> {
    const where = {
      workspace_id: workspaceId,
      ...(query.account_id ? { account_id: query.account_id } : {}),
    }
    const [rows, total] = await this.runs.findAndCount({
      where,
      order: { created_at: 'DESC' },
      take: query.limit,
      skip: query.offset,
    })
    return { data: rows.map(toPublicRun), pagination: paginationMeta(total, query.limit, query.offset) }
  }
}
