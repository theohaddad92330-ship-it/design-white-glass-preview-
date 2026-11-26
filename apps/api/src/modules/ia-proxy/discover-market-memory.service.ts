import { Injectable, Logger, Optional } from '@nestjs/common'
import {
  candidateProvenBySkill,
  candidateWidenedBySkill,
  DISCOVER_NEED_RECENT_MONTHS,
  type DiscoverCandidate,
  type DiscoverDegradedSource,
} from '@bellum/contracts'
import { MarketMemoryService, type MarketCompanyLookup } from '../market-memory/market-memory.service'

interface DiscoverMarketMemoryFilters {
  readonly technologiesObserved?: readonly string[]
  readonly externalRecourseObserved?: boolean
  /** #4632.2 — famille de rôles observée : CLASSE la liste (jamais d'exclusion). */
  readonly roleFamilyObserved?: string
  /** #4632.2 — écosystème lié à (ESN observée) : CLASSE la liste. */
  readonly ecosystemObserved?: string
}

/**
 * #2165.28 / #2165.30 — LES DEUX FILTRES SERVEUR DE LA MÉMOIRE MARCHÉ, en UN
 * aller-retour PAR PAGE de résultats, jamais un par ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SERVICE À PART, PAS UNE MÉTHODE DE PLUS SUR `IaProxyController`
 * ─────────────────────────────────────────────────────────────────────────
 * `ia-proxy.controller.ts` est un gros fichier, et `discover/registry` /
 * `discover/signals` sont des routes VIVANTES, limitées en débit
 * (`DISCOVER_RATE_LIMIT`). Un service injectable neuf, appelé par une seule
 * ligne du contrôleur, se teste isolément sans reconstruire tout le
 * contrôleur — le patron que `DiscoverPortfolioService` tient déjà pour
 * `withPortfolioState`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE QUI BORNE CE SERVICE (c65, GA-259)
 * ─────────────────────────────────────────────────────────────────────────
 * Un compte dont la mémoire marché n'a PAS de donnée n'est jamais compté
 * comme « ne correspond pas » — il est simplement écarté de CETTE vue
 * filtrée (on ne peut pas confirmer qu'il correspond), et son NOMBRE remonte
 * dans `degraded[].kind === 'unmeasured'` : le compte n'est pas exclu EN
 * SILENCE. `externalRecourseObserved` ne filtre que sur `true` — `false`
 * n'affirme jamais « ce compte n'externalise pas ».
 *
 * Et une PANNE (service absent, ou lecture en erreur) laisse les résultats
 * INTACTS : aucun candidat retiré, tous comptés `unmeasured`. Un filtre qu'on
 * ne peut pas vérifier ne doit jamais se comporter comme un filtre qui exclut
 * tout — ce serait pire que de ne pas filtrer du tout.
 */
@Injectable()
export class DiscoverMarketMemoryService {
  private readonly logger = new Logger(DiscoverMarketMemoryService.name)

  constructor(@Optional() private readonly marketMemory?: MarketMemoryService) {}

  /**
   * #4791.2 (Louis 31/10) — Market Memory comme SOURCE : les entreprises dont la pile observée recoupe la
   * compétence cherchée, en NOMS (la mémoire marché ne porte aucun SIREN, par doctrine). L'IA les apparie au
   * registre ou les écarte. Date = le MOIS PARTAGÉ seulement : la date « propre à l'espace » ne sort pas.
   * Sans compétence : rien n'est lu. Best-effort : une panne rend [].
   */
  async namesFor(
    filters: {
      technologiesObserved?: readonly string[]
      keywords?: readonly string[]
      needsPeriod?: 'all' | 'recent' | 'old'
      needsNature?: readonly string[]
    },
    cap: number,
    now: Date = new Date(),
  ): Promise<Array<{ name: string; label: string; date?: string; nature?: 'mission' }>> {
    // #5203 — TOUTES les compétences de la recherche (plafonnées à trois lectures), plus seulement la première.
    const technologies = [
      ...new Set(
        [...(filters.technologiesObserved ?? []), ...(filters.keywords ?? [])].map(t => t.trim()).filter(Boolean),
      ),
    ].slice(0, 3)
    if (technologies.length === 0 || !this.marketMemory || cap <= 0) return []
    // Un parcours observé est une MISSION : un filtre de nature qui ne la retient pas n'en laisse aucune.
    if ((filters.needsNature?.length ?? 0) > 0 && !filters.needsNature!.includes('mission')) return []
    const period = filters.needsPeriod ?? 'all'
    const recentSince = new Date(now)
    recentSince.setUTCMonth(recentSince.getUTCMonth() - DISCOVER_NEED_RECENT_MONTHS)
    const since = recentSince.toISOString().slice(0, 7)
    try {
      const out: Array<{ name: string; label: string; date?: string; nature?: 'mission' }> = []
      const seen = new Set<string>()
      for (const technology of technologies) {
        const read = await this.marketMemory.searchByFilters({ technology })
        if (read.status !== 'ok') continue
        for (const match of read.matches) {
          const date = match.currentSignal?.nature === 'shared' ? match.currentSignal.observedMonth : undefined
          // Un filtre de période RETIRE : sans date, impossible de dire « récent » ou « ancien » — le nom ne passe pas.
          if (period !== 'all' && (!date || (period === 'recent' ? date < since : date >= since))) continue
          if (seen.has(match.companyName)) continue
          seen.add(match.companyName)
          out.push({
            name: match.companyName,
            label: technology,
            ...(date ? { date, nature: 'mission' as const } : {}),
          })
        }
      }
      return out.slice(0, cap)
    } catch (error) {
      this.logger.warn('lecture mémoire marché (source de candidats) impossible', { error })
      return []
    }
  }

  /**
   * #4632.2 — « Famille de rôles observée » / « Écosystèmes liés à » CLASSENT la liste : les comptes que la mémoire
   * marché a observés avec cette famille / cet écosystème d'abord, les autres derrière dans leur ordre. Aucun compte
   * n'est écarté : le corpus ne prouve pas une absence (GA-259) et la lecture plafonne ; une panne laisse la liste
   * intacte et se DIT (`unmeasured`).
   */
  private async rankByObserved(
    candidates: DiscoverCandidate[],
    filters: DiscoverMarketMemoryFilters,
    degraded: DiscoverDegradedSource[],
  ): Promise<DiscoverCandidate[]> {
    const asks: Array<{
      field: 'roleFamilyObserved' | 'ecosystemObserved'
      query: { roleFamily: string } | { esn: string }
    }> = []
    const roleFamily = filters.roleFamilyObserved?.trim()
    const ecosystem = filters.ecosystemObserved?.trim()
    if (roleFamily) asks.push({ field: 'roleFamilyObserved', query: { roleFamily } })
    if (ecosystem) asks.push({ field: 'ecosystemObserved', query: { esn: ecosystem } })
    if (asks.length === 0) return candidates
    const observed = new Set<string>()
    for (const ask of asks) {
      try {
        const read = this.marketMemory ? await this.marketMemory.searchByFilters(ask.query) : null
        if (!read || read.status !== 'ok') {
          degraded.push(unmeasuredEntry(candidates.length, [ask.field]))
          continue
        }
        for (const match of read.matches) observed.add(foldCompanyName(match.companyName))
      } catch (error) {
        this.logger.warn('lecture mémoire marché (classement du rail) impossible', { error })
        degraded.push(unmeasuredEntry(candidates.length, [ask.field]))
      }
    }
    const isObserved = (candidate: DiscoverCandidate) => observed.has(foldCompanyName(candidate.name))
    return [...candidates.filter(isObserved), ...candidates.filter(candidate => !isObserved(candidate))]
  }

  async applyFilters(
    candidates: readonly DiscoverCandidate[],
    filters: DiscoverMarketMemoryFilters,
  ): Promise<{ candidates: DiscoverCandidate[]; degraded: DiscoverDegradedSource[] }> {
    const techList = (filters.technologiesObserved ?? []).map(t => t.trim().toLowerCase()).filter(Boolean)
    const wantsTech = techList.length > 0
    // ⚠️ Seul `true` filtre — voir le docblock de tête.
    const wantsEsn = filters.externalRecourseObserved === true

    const wantsRank = Boolean(filters.roleFamilyObserved?.trim() || filters.ecosystemObserved?.trim())
    if (!wantsTech && !wantsEsn && !wantsRank) return { candidates: [...candidates], degraded: [] }

    const lookups: MarketCompanyLookup[] = candidates.map(c => ({ ref: c.siren, name: c.name, country: 'FR' }))

    const [stacksResult, esnResult] = await Promise.all([
      wantsTech && this.marketMemory ? this.marketMemory.observedStacksFor(lookups) : null,
      wantsEsn && this.marketMemory ? this.marketMemory.esnObservedManyFor(lookups) : null,
    ]).catch(error => {
      this.logger.error('lecture mémoire marché du filtre Découvrir impossible', { error })
      return [null, null] as const
    })

    const techPanne =
      wantsTech && (!this.marketMemory || stacksResult === null || stacksResult.status === 'unavailable')
    const esnPanne = wantsEsn && (!this.marketMemory || esnResult === null || esnResult.status === 'unavailable')

    const degraded: DiscoverDegradedSource[] = []
    if (techPanne) degraded.push(unmeasuredEntry(candidates.length, ['technologiesObserved']))
    if (esnPanne) degraded.push(unmeasuredEntry(candidates.length, ['externalRecourseObserved']))

    let unmeasuredTech = 0
    let unmeasuredEsn = 0

    const kept = candidates.filter(candidate => {
      // COMPETENCE-TROUVE (20/10) — un compte trouvé par ses OFFRES sur la techno demandée est prouvé :
      // l'offre EST l'observation de la pile, il n'a pas besoin d'une ligne en mémoire marché.
      // #4434 — un compte remonté par ÉLARGISSEMENT de compétence (« proche : JavaScript ») est prouvé par
      // l'offre de son voisin : il n'a pas à citer la techno exacte.
      const provenByOffer =
        wantsTech && (candidateProvenBySkill(candidate, techList) || candidateWidenedBySkill(candidate))
      if (wantsTech && !techPanne && !provenByOffer) {
        const rows = stacksResult && stacksResult.status === 'ok' ? stacksResult.stacks.get(candidate.siren) : undefined
        if (rows === undefined || rows === null) {
          unmeasuredTech += 1
          return false
        }
        const observed = rows.map(r => r.toLowerCase())
        if (!techList.some(wanted => observed.some(o => o.includes(wanted)))) return false
      }
      if (wantsEsn && !esnPanne) {
        const value = esnResult && esnResult.status === 'ok' ? esnResult.observed.get(candidate.siren) : undefined
        if (value === undefined || value === null) {
          unmeasuredEsn += 1
          return false
        }
        if (value !== true) return false
      }
      return true
    })

    if (unmeasuredTech > 0) degraded.push(unmeasuredEntry(unmeasuredTech, ['technologiesObserved']))
    if (unmeasuredEsn > 0) degraded.push(unmeasuredEntry(unmeasuredEsn, ['externalRecourseObserved']))

    const ranked = await this.rankByObserved(kept, filters, degraded)
    return { candidates: ranked, degraded }
  }

  /**
   * #3408 — NOMMER la pile observée de chaque candidat (le « Périmètre
   * conseillé » de la carte), en UN aller-retour groupé comme `applyFilters`.
   *
   * Sans service monté, en panne ou sans pile pour le compte : le candidat sort
   * INTACT — aucune clé, donc aucune ligne ; jamais une pile devinée. Trois
   * technologies au plus par compte (la carte n'en affiche pas davantage).
   */
  async annotateObservedStacks(candidates: readonly DiscoverCandidate[]): Promise<DiscoverCandidate[]> {
    if (!this.marketMemory || candidates.length === 0) return [...candidates]
    try {
      const lookups: MarketCompanyLookup[] = candidates.map(c => ({ ref: c.siren, name: c.name, country: 'FR' }))
      const result = await this.marketMemory.observedStacksFor(lookups)
      if (result.status !== 'ok') return [...candidates]
      return candidates.map(candidate => {
        const stack = result.stacks.get(candidate.siren)
        return stack && stack.length > 0 ? { ...candidate, technologiesObserved: stack.slice(0, 3) } : candidate
      })
    } catch (error) {
      this.logger.error('lecture mémoire marché de la pile Découvrir impossible', { error })
      return [...candidates]
    }
  }

  /**
   * #4067.3 — la mémoire marché passe de l'étiquette / du filtre au FACTEUR
   * du score : le recours externe OBSERVÉ et la pile COMMUNE avec l'offre de
   * l'ESN (`profileTerms` : offres, portefeuille, rôles placés du profil).
   *
   * Par SIREN : `externalRecourse` `null` = non observé (jamais « n'externalise
   * pas », c65) ; `stackOverlap` `null` = pile non couverte. Sans service, ou
   * si les DEUX lectures sont en panne : `null` — la source entière est non
   * mesurée, jamais un zéro.
   */
  async sourceFactsFor(
    candidates: readonly DiscoverCandidate[],
    profileTerms: readonly string[],
  ): Promise<Map<string, { externalRecourse: boolean | null; stackOverlap: string[] | null }> | null> {
    if (!this.marketMemory || candidates.length === 0) return null
    try {
      const lookups: MarketCompanyLookup[] = candidates.map(c => ({ ref: c.siren, name: c.name, country: 'FR' }))
      const [stacks, esn] = await Promise.all([
        this.marketMemory.observedStacksFor(lookups),
        this.marketMemory.esnObservedManyFor(lookups),
      ])
      if (stacks.status !== 'ok' && esn.status !== 'ok') return null
      const terms = profileTerms.map(term => term.toLowerCase())
      const facts = new Map<string, { externalRecourse: boolean | null; stackOverlap: string[] | null }>()
      for (const candidate of candidates) {
        const stack = stacks.status === 'ok' ? (stacks.stacks.get(candidate.siren) ?? null) : null
        facts.set(candidate.siren, {
          externalRecourse: esn.status === 'ok' ? (esn.observed.get(candidate.siren) ?? null) : null,
          stackOverlap: stack === null ? null : stack.filter(techno => namesTechno(terms, techno)),
        })
      }
      return facts
    } catch (error) {
      this.logger.error('lecture mémoire marché des axes Découvrir impossible', { error })
      return null
    }
  }
}

/** Un terme du profil NOMME-t-il cette techno ? En mot entier : « java » ne
 *  s'allume pas sur « javascript », « c » jamais sur « conseil ». */
function namesTechno(terms: readonly string[], techno: string): boolean {
  const needle = techno.trim().toLowerCase()
  if (needle.length < 2) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u')
  return terms.some(term => pattern.test(term))
}

/** Un nom d'entreprise sans casse, accents, ponctuation ni forme juridique courante (SAS, SA…). */
function foldCompanyName(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sas|sasu|sa|sarl|eurl|sca|snc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unmeasuredEntry(count: number, fields: string[]): DiscoverDegradedSource {
  return {
    source: 'market-memory',
    reason: 'market_memory_unmeasured',
    count,
    kind: 'unmeasured',
    fields,
  }
}
