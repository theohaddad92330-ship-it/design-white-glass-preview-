import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@bellum/contracts'

/** Un stockage de session qui ne retient RIEN : le client service-role est
 *  partagé entre tous les utilisateurs, il ne doit porter la session d'aucun. */
const NO_SESSION_STORAGE = {
  getItem: (): string | null => null,
  setItem: (): void => undefined,
  removeItem: (): void => undefined,
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name)
  private readonly client: SupabaseClient<Database>

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('supabaseUrl', '')
    const key = this.config.get<string>('supabaseServiceRoleKey', '')
    // Finding pentest : ne JAMAIS journaliser un fragment de la clé
    // service-role (elle bypasse la RLS) — présence + longueur seulement.
    const keyStatus = key ? `present, len=${key.length}` : 'MISSING'
    this.logger.log(`Supabase client → ${url} (service-role key: ${keyStatus})`)
    // Session tenue 24 h (15/09/2026) : ce client est PARTAGÉ par toute l'API.
    // Sans ces options, il rangeait en mémoire la session du dernier utilisateur
    // authentifié (login, OTP, refresh) et son ticker la renouvelait avant
    // expiration — le refresh token tournait côté serveur, celui du cookie
    // devenait « Already Used » et le navigateur était déconnecté au réveil.
    // Voir `supabase.service.spec.ts`.
    // ⚠️ `persistSession: false` NE SUFFIT PAS : auth-js garde alors la session
    // dans un stockage mémoire propre à l'instance (et PostgREST la lit avant la
    // clé). Seul un stockage qui n'écrit rien garantit qu'aucune session n'y reste.
    this.client = createClient<Database>(url, key, {
      auth: { storage: NO_SESSION_STORAGE, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }

  getClient(): SupabaseClient<Database> {
    return this.client
  }
}
