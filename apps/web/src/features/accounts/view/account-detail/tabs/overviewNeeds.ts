import type { Account, AccountAnalysis, ItChallenge, RecentSignal } from '@bellum/contracts'
import { dropInternshipRows, parseAccountAnalysis } from '@bellum/contracts'

/**
 * #3673 (réfuté en prod le 07/10 : sur Société Générale, « Enjeux à adresser » et
 * « Expertises concernées » absents) — LES ENJEUX ET LES EXPERTISES, LUS LÀ OÙ ILS VIVENT.
 *
 * L'écran ne lisait qu'UNE place : `raw_analysis.it_challenges` et
 * `raw_analysis.it_implications_for_esn`. Or un dossier peut porter la même matière
 * ailleurs, et « une carte absente » dit alors faussement « rien à dire » :
 *
 *  1. la colonne `accounts.it_challenges` (écrite par `applyResearch`, lue par la page
 *     Besoins) — un dossier dont le blob ne la porte pas la porte pourtant ;
 *  2. les DOMAINES D'OPPORTUNITÉ déjà stockés (`raw_analysis.opportunity_domains`, dossier
 *     importé) : un libellé et son constat — ce sont des expertises concernées et des enjeux
 *     nommés par la source elle-même.
 *
 * Rien n'est inventé : on RELIT ce qui est stocké, avec la forme d'écran. Ni l'une ni
 * l'autre ⇒ la même absence qu'avant (la carte se tait, doctrine « on n'affiche pas ce
 * qu'on n'a pas »). Une analyse qui porte déjà ses enjeux / son implication ne change pas
 * d'un octet : la dérivation ne passe qu'en repli. Les comptes déjà analysés en profitent
 * sans rejeu — c'est le rattrapage de l'existant (doctrine du 18/09).
 */
export function readOverviewNeeds(
  account: Pick<Account, 'it_challenges'>,
  analysis: Pick<AccountAnalysis, 'it_challenges' | 'it_implications_for_esn' | 'opportunity_domains'>,
): { challenges: ItChallenge[]; implications: string | null } {
  const domains = (analysis.opportunity_domains ?? []).filter(domain => text(domain.label) !== null)
  const domainChallenges = domains.map(domain => ({
    title: text(domain.label),
    description: text(domain.constat) ?? text(domain.implication),
  }))

  const stored = analysis.it_challenges ?? []
  const fromColumn = parseAccountAnalysis({ it_challenges: account.it_challenges }).it_challenges ?? []
  const challenges = firstWithTitle(stored, fromColumn, domainChallenges)
  // #3676 (réfuté en recette 07/10 : « feuille de route 2026-2029 » affiché 2 fois sur
  // l'overview) — quand les domaines d'opportunité sont la SEULE source, ils nomment déjà
  // chaque enjeu dans `challenges` ci-dessus : les reprendre aussi dans `implications`
  // répéterait le même fait sous un second titre (GA-26, « un même fait ne s'affiche
  // qu'une fois par écran »). Les domaines n'alimentent donc `implications` QUE si
  // `challenges` vient d'une AUTRE source (sinon rien de nouveau à y dire).
  const challengesComeFromDomains = challenges === domainChallenges && hasTitle(domainChallenges)

  const implications =
    text(analysis.it_implications_for_esn) ??
    (!challengesComeFromDomains && domains.length > 0 ? domains.map(domain => text(domain.label)).join(' · ') : null)

  return { challenges, implications }
}

/**
 * #3928.1 (recette R7a, prod 429335a9c8, SNCF RESEAU) — « Pourquoi maintenant » disait
 * « Aucun signal récent » alors que l'onglet Opportunités comptait 7 signaux et les
 * listait. Cette section ne lisait que `raw_analysis.recent_signals` (le blob) ; SNCF
 * portait les siens sur la COLONNE `accounts.recent_signals` — la même que le lecteur
 * unique `buildAccountWatchData` fusionne déjà (#3928.a) pour l'onglet Opportunités et
 * « Ce que BellumAI ajoute à ce que tu sais ». On ne peut pas réutiliser ce lecteur ici
 * tel quel : il normalise le signal et PERD `selection_role`/`selection_reason`, dont
 * `BuyingSignals` a besoin pour distinguer piste et contexte (#3668.7). On fusionne donc
 * les deux sources BRUTES, avec la même clé de déduplication (libellé + source) et le
 * même rejet des offres de stage (#4044) que le lecteur unique.
 */
export function readOverviewSignals(
  account: Pick<Account, 'recent_signals'>,
  analysis: Pick<AccountAnalysis, 'recent_signals'>,
): RecentSignal[] {
  const merged = dropInternshipRows([...(analysis.recent_signals ?? []), ...(account.recent_signals ?? [])], {
    jobsOnly: true,
  }) as Record<string, unknown>[]
  const seen = new Set<string>()
  return merged.filter(entry => {
    const label = text(typeof entry?.signal === 'string' ? entry.signal : null)
    if (!label) return false
    const key = `${label}|${text(typeof entry?.source === 'string' ? entry.source : null) ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }) as unknown as RecentSignal[]
}

function hasTitle(list: ItChallenge[]): boolean {
  return list.some(item => text(item.title) !== null)
}

function firstWithTitle(...candidates: ItChallenge[][]): ItChallenge[] {
  return candidates.find(list => list.some(item => text(item.title) !== null)) ?? []
}

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}
