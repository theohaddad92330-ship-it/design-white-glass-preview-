import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ReflagClient } from '@reflag/node-sdk'

/**
 * Who a flag is being evaluated for. `companyId` is the WORKSPACE id — the
 * tenant that owns the plan and the seats — so a flag can be rolled out to a
 * whole ESN at once rather than user by user.
 */
type FlagContext = {
  userId?: string | null
  companyId?: string | null
}

/** One flag as the operator backoffice lists it. */
export type FlagState = {
  key: string
  enabled: boolean
}

/**
 * Singleton wrapper around the Reflag Node SDK. Initialised once at boot; every
 * consumer pulls it via DI and calls `isEnabled(flag, context)`.
 *
 * FAIL OPEN by design: without `REFLAG_SECRET_KEY` (the normal local-dev case)
 * a single warning is logged and every flag resolves to `false`. Product code
 * therefore never branches on "is Reflag configured?" — it calls `isEnabled` and
 * gets a safe default. Same contract if the SDK fails to start.
 */
/**
 * Clé de flag telle que le SDK la type : une union générée à partir des flags
 * déclarés. Les flags de Bellum, eux, se créent dans le dashboard Reflag et
 * arrivent ici en `string`. On nomme donc le type attendu plutôt que d'écraser
 * la vérification avec un cast opaque — si le SDK change la forme de sa clé,
 * c'est ce type qui casse, à un seul endroit.
 */
type ReflagFlagKey = Parameters<ReturnType<ReflagClient['bindClient']>['getFlag']>[0]

@Injectable()
export class ReflagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReflagService.name)
  private client: ReflagClient | null = null

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const secretKey = this.config.get<string>('reflagSecretKey', '')
    if (!secretKey) {
      this.logger.warn('REFLAG_SECRET_KEY missing — feature flags will all evaluate to disabled.')
      return
    }
    // The SDK also reads REFLAG_SECRET_KEY from process.env; passing it
    // explicitly keeps behaviour identical however the env was loaded
    // (dotenv, Railway, Docker secrets…).
    this.client = new ReflagClient({ secretKey })
    try {
      // Caches the flag definitions — `getFlag`/`getFlags` return nothing
      // until this resolves.
      await this.client.initialize()
      this.logger.log('Reflag SDK initialised')
    } catch (error) {
      this.logger.error('Reflag SDK failed to initialise — flags will fail open', { error })
      this.client = null
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.flush?.()
  }

  /** Whether the SDK is configured and running — surfaced by the backoffice so
   *  an operator can tell "no flags" from "not connected". */
  isConfigured(): boolean {
    return this.client !== null
  }

  /**
   * Evaluate one flag for the given context. Returns `false` when the SDK is
   * not configured or the flag is unknown — callers never handle "Reflag down"
   * as a separate state.
   */
  isEnabled(flag: string, ctx: FlagContext = {}): boolean {
    const bound = this.bind(ctx)
    if (!bound) return false
    return bound.getFlag(flag as ReflagFlagKey).isEnabled
  }

  /**
   * Every flag Reflag knows about, with its value for this context. Powers the
   * operator backoffice ("is feature X on for this customer?"), which is why it
   * takes a context rather than returning definitions: a flag's value is only
   * meaningful for someone.
   *
   * Empty list when the SDK isn't configured — never a throw.
   */
  listFlags(ctx: FlagContext = {}): FlagState[] {
    const bound = this.bind(ctx)
    if (!bound) return []
    return Object.entries(bound.getFlags()).map(([key, flag]) => ({
      key,
      enabled: Boolean((flag as { isEnabled?: boolean } | undefined)?.isEnabled),
    }))
  }

  /** Bind the client to a user/company, or `null` when unconfigured. */
  private bind(ctx: FlagContext) {
    if (!this.client) return null
    return this.client.bindClient({
      user: ctx.userId ? { id: ctx.userId } : undefined,
      company: ctx.companyId ? { id: ctx.companyId } : undefined,
    })
  }
}
