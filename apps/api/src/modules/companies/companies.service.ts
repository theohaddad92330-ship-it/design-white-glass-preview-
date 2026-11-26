import { Injectable, Logger } from '@nestjs/common'
import type { CompanySearchLens, CompanySearchResponse, WorkspaceMarket } from '@bellum/contracts'
import { IaClient } from '../ia/ia.client'

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name)

  constructor(private readonly ia: IaClient) {}

  /** Hand the autocomplete query to the IA service. The IA layer absorbs
   *  Pappers errors and returns an empty list, so the UI never blocks on a
   *  flaky upstream — caller can treat the empty array as "no match yet".
   *
   *  Timeout is 12s: the IA's `httpx` client to Pappers itself runs at 10s,
   *  + network overhead between API and IA, + a small buffer. 5s was racing
   *  Pappers on warm starts and surfacing as `Request timed out after 5000ms`.
   */
  async search(
    q: string,
    limit: number,
    country?: WorkspaceMarket,
    /** `esn` ranks suggestions by ESN plausibility (onboarding). Absent keeps
     *  the registry order — what the prospect-account autocomplete needs. */
    lens?: CompanySearchLens,
  ): Promise<CompanySearchResponse> {
    try {
      // `country` (recherche multi-pays #494) — FR/absent keeps the Pappers path
      // on the IA side untouched; a non-FR market delegates to the country pack.
      const res = await this.ia.searchCompanies(q, limit, country, { timeoutMs: 12_000, maxAttempts: 1, lens })
      // ⚠️ On RECONSTRUIT l'objet, donc tout champ neuf du service IA disparaît
      // ici sans qu'aucun test ne tombe — les deux côtés restent cohérents avec
      // eux-mêmes et personne ne les compare. `broadenedFrom` (#1099) a passé
      // exactement par là : trouvé en production, la clé n'atteignait pas le
      // navigateur. Un champ ajouté au contrat doit être ajouté ICI aussi.
      return {
        suggestions: res.suggestions ?? [],
        // Recopié seulement s'il y a quelque chose à dire : le corps d'une
        // recherche nominale reste byte-identique.
        ...(res.broadenedFrom ? { broadenedFrom: res.broadenedFrom } : {}),
        ...(res.sourceUnavailable ? { sourceUnavailable: true as const } : {}),
      }
    } catch (error) {
      // Don't surface a 5xx on a typing UX — log and return empty.
      this.logger.warn('IA company search failed', { error, q, country, lens })
      // #1107/#1109 : mais une liste vide PARCE QUE l'appel a échoué n'est pas
      // « aucune entreprise trouvée ». Replier les deux sur le même corps a fait
      // écrire à l'écran l'inverse de ce qui s'était passé, et le testeur en a
      // déduit « réseau et/ou lien KO » sans que rien ne le lui dise.
      return { suggestions: [], sourceUnavailable: true }
    }
  }
}
