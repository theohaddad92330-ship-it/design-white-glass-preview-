import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { IsNull, MoreThan, Repository } from 'typeorm'
import type { AccountShareLink, AccountShareSection } from '@bellum/contracts'
import { computeUrl } from '@bellum/http'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

const SHARE_TTL_DAYS = 30
const SLUG_TITLE_MAX_LEN = 40
const SLUG_SUFFIX_BYTES = 6

/**
 * Generates a public, slug-based share URL for an account dossier and
 * resolves slugs back to the underlying account_id. The slug — not a JWT —
 * goes in the URL, so revoking access = setting `revoked_at`. Links live
 * 30 days; we persist them so a user can list / revoke past shares.
 */
@Injectable()
export class AccountShareService {
  constructor(
    @InjectRepository(AccountShareEntity)
    private readonly shares: Repository<AccountShareEntity>,
    private readonly config: ConfigService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  // Multi-user Phase 2: share links belong to the team. The write stamps
  // `workspace_id` (resolved from the JWT user, kept as created-by `user_id`) so
  // a future "list the workspace's shares" read is team-scoped. Resolution lives
  // here — not in the caller — because the caller (AccountsController) is owned
  // by another Phase-2 agent. Public resolution (`findActiveBySlug`) is by slug
  // and stays global by design (anyone with the link can read). Identical today.
  async mintShareLink(
    accountId: string,
    userId: string,
    companyName: string,
    section: AccountShareSection = 'full',
  ): Promise<AccountShareLink> {
    const slug = this.buildSlug(companyName)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const row = await this.shares.save(
      this.shares.create({
        slug,
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        section,
        expires_at: expiresAt,
        revoked_at: null,
      }),
    )

    return {
      url: this.absoluteUrl(slug),
      slug: row.slug,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      section: row.section as AccountShareSection,
    }
  }

  /**
   * Resolves a slug to the share row if it exists, is not expired, and has
   * not been revoked. Returns `null` for missing / stale / revoked slugs —
   * callers map that to 404.
   */
  async findActiveBySlug(slug: string): Promise<AccountShareEntity | null> {
    return this.shares.findOne({
      where: { slug, expires_at: MoreThan(new Date()), revoked_at: IsNull() },
    })
  }

  private absoluteUrl(slug: string): string {
    const base = this.config.get<string>('frontendUrl', 'http://localhost:5173').replace(/\/+$/, '')
    const path = computeUrl({ template: '/share/{slug}', variables: { slug } })
    return `${base}${path}`
  }

  /**
   * Slug = `{slugified-company-name}-{base64url(6 random bytes)}`.
   * The random suffix makes guessing infeasible (≈48 bits) while keeping
   * URLs short and human-readable; the prefix gives social previews
   * something readable to display.
   */
  private buildSlug(companyName: string): string {
    const titleSlug = slugify(companyName).slice(0, SLUG_TITLE_MAX_LEN).replace(/-+$/, '')
    const suffix = randomBytes(SLUG_SUFFIX_BYTES).toString('base64url')
    return titleSlug ? `${titleSlug}-${suffix}` : suffix
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
