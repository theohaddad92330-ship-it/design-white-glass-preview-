import type { KnowledgeReceiptLayer } from '@bellum/contracts'
import type { ChatResponseContext } from './ContextDisclosure'
import { replyProvenance } from './reply-provenance'

/**
 * BEL-LAU-1010 (#3765) — LE FONDEMENT D'UNE RÉPONSE, en quatre natures.
 *
 * #3764 / #3861 (Louis, 11/10) — il ne dérive PAS de « complétude » : cette ligne n'est jamais affichée
 * (le fait des sources non consultées a son badge nommé et le panneau « Voir la source »).
 *
 * Le pied de réponse disait déjà le nombre de sources et la fraîcheur
 * (`reply-provenance.ts`). Il lui manquait la NATURE de ce qui fonde la réponse,
 * son périmètre et son palier de certitude. Ce module les dérive du MÊME contexte que le
 * panneau « Voir la source » — aucun second calcul des sources, rien d'inventé.
 *
 * Règles : une mesure absente est `null`/non listée, jamais « 0 » ; la certitude
 * est un palier NOMMÉ (aucune probabilité) ; aucun fournisseur n'est nommé.
 */

type ReplyFoundation = 'market_memory' | 'recent_web' | 'workspace' | 'inference'

const FOUNDATION_ORDER: ReplyFoundation[] = ['market_memory', 'recent_web', 'workspace', 'inference']

const RECEIPT_LAYER_FOUNDATION: Record<KnowledgeReceiptLayer, ReplyFoundation> = {
  workspace: 'workspace',
  crm: 'workspace',
  messaging: 'workspace',
  agenda: 'workspace',
  documents: 'workspace',
  account_dossier: 'workspace',
  dataforge: 'market_memory',
  market_memory: 'market_memory',
  current_public_sources: 'recent_web',
  bellum_method: 'inference',
  inference: 'inference',
}

const SOURCE_KIND_FOUNDATION: Record<string, ReplyFoundation> = {
  market_observation: 'market_memory',
  market_signal: 'recent_web',
  crm: 'workspace',
  account_dossier: 'workspace',
  knowledge_doc: 'workspace',
  method_rule: 'inference',
}

type Certainty = 'high' | 'medium' | 'low'
const CERTAINTY_RANK: Record<Certainty, number> = { low: 0, medium: 1, high: 2 }

export type ReplySourceBasis = {
  foundations: ReplyFoundation[]
  scope: {
    account: string | null
    portfolio: { count: number; total: number | null } | null
    scopes: string[]
  }
  /** Palier le plus BAS porté par les sources ; `null` = non porté. */
  certainty: Certainty | null
  /** Des sources existent mais aucune ne porte de date : la fraîcheur se NOMME inconnue. */
  undatedFreshness: boolean
}

export function replySourceBasis(context: ChatResponseContext | undefined): ReplySourceBasis | null {
  if (!context) return null

  const found = new Set<ReplyFoundation>()
  const receipt = context.knowledge_receipt
  if (receipt) {
    for (const [layer, foundation] of Object.entries(RECEIPT_LAYER_FOUNDATION) as [
      KnowledgeReceiptLayer,
      ReplyFoundation,
    ][]) {
      const status = receipt[layer]?.status
      if (status === 'consulted') found.add(foundation)
    }
  } else {
    for (const source of context.sources ?? []) {
      const foundation = SOURCE_KIND_FOUNDATION[source.kind]
      if (foundation) found.add(foundation)
    }
  }

  const noToolRead = context.reasoning_trace?.tools_called?.length === 0
  const scopes: string[] = []
  for (const source of context.sources ?? []) {
    const scope = source.scope?.trim()
    if (scope && !scopes.includes(scope)) scopes.push(scope)
  }

  let certainty: Certainty | null = null
  for (const source of context.sources ?? []) {
    const tier = source.confidence
    if (tier && (certainty === null || CERTAINTY_RANK[tier] < CERTAINTY_RANK[certainty])) certainty = tier
  }

  const portfolio = context.active?.portfolio
  const sources = context.sources ?? []
  const { asOf } = replyProvenance(context)

  // #3893.1 (recette prod 08/10, W 5b4b10d2f3) — le pied gardait le périmètre
  // portefeuille sur une question mono-compte (Sanofi) posée dans une
  // conversation « Tout mon espace » : `active.account.present` ne s'active
  // QUE pour une conversation scopée, jamais pour un compte simplement NOMMÉ
  // dans la question. Signal retenu : `get_account_briefing` cite une seule
  // source `account_dossier` par appel (`chat_tools.py::cited_sources`), son
  // `label` est le nom du compte — jamais un second calcul, la même donnée
  // que « Voir la source » lit déjà. `compare_accounts` en cite PLUSIEURS
  // (une par compte comparé) : la condition ne se déclenche jamais dessus.
  const dossierLabels = new Set(
    sources
      .filter(source => source.kind === 'account_dossier')
      .map(source => source.label?.trim())
      .filter((label): label is string => Boolean(label)),
  )
  const singleAccountFromSources = dossierLabels.size === 1 ? [...dossierLabels][0] : null
  const accountFromActiveScope = context.active?.account?.present ? (context.active.account.name ?? null) : null
  const account = accountFromActiveScope ?? singleAccountFromSources
  // Le périmètre portefeuille ne se perd QUE quand c'est CETTE dérivation qui
  // a posé le compte : la conversation scopée (`accountFromActiveScope`)
  // gardait déjà, elle, le droit d'afficher les deux (comportement inchangé).
  const portfolioSuppressedBySingleAccountReply = !accountFromActiveScope && singleAccountFromSources !== null

  return {
    foundations: noToolRead ? [] : FOUNDATION_ORDER.filter(f => found.has(f)),
    scope: {
      account,
      portfolio:
        !portfolioSuppressedBySingleAccountReply && portfolio?.present && portfolio.count > 0
          ? { count: portfolio.count, total: portfolio.total ?? null }
          : null,
      scopes,
    },
    certainty,
    undatedFreshness:
      !noToolRead && sources.length > 0 && asOf === null && !sources.every(s => s.kind === 'market_observation'),
  }
}
