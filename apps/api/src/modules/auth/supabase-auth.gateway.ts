import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Database } from '@bellum/contracts'
import { SupabaseClient, type User } from '@supabase/supabase-js'
import { SupabaseService } from '../../supabase/supabase.service'

/**
 * Thin adapter over Supabase GoTrue: exposes the client to the auth services
 * and owns the bits they all share — user lookups, session DTO mapping, and
 * the redirect/URL helpers.
 */
@Injectable()
export class SupabaseAuthGateway {
  private readonly supabase: SupabaseClient<Database>

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.supabase = this.supabaseService.getClient()
  }

  get client(): SupabaseClient<Database> {
    return this.supabase
  }

  // Skips the OTP gate entirely (signup auto-confirms). E2E / local dev only —
  // never set in production.
  get bypassEmailVerification(): boolean {
    return this.config.get<string>('bypassEmailVerification') === 'true'
  }

  // No admin `getUserByEmail` exists, so we scan `listUsers` (O(n)). The
  // explicit error guard is also what stops TS from collapsing the response
  // union's `users` field to `never[]`.
  async findUserByEmail(emailLower: string): Promise<User | undefined> {
    const { data, error } = await this.supabase.auth.admin.listUsers()
    if (error || !data) return undefined
    const userByEmail = data.users.find(u => u.email?.toLowerCase() === emailLower)
    return userByEmail
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId)
    if (error || !data?.user) return undefined
    return data.user
  }

  buildRedirectUrl(path: string): string {
    const base: string = this.config.get<string>('frontendUrl', '')

    const redirectUrl = `${base}${path}`
    return redirectUrl
  }

  /**
   * Adds the Supabase anon key as `?apikey=…` to a GoTrue URL — Supabase's Kong
   * gateway rejects browser navigations missing it. The anon key is public, so
   * exposing it in the redirect URL is safe.
   */
  appendAnonApiKey(rawUrl: string): string {
    const url = new URL(rawUrl)
    const anonKey = this.config.get<string>('supabaseAnonKey', '')
    if (anonKey) url.searchParams.set('apikey', anonKey)
    return url.toString()
  }
}
