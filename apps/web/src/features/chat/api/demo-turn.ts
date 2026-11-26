import type { TFunction } from 'i18next'
import type { ReplyTransformRequest } from '@bellum/contracts'
import { localReplyTransform } from '@/features/chat/lib/reply-transform-local'
import {
  ACCOUNT_HREF_TOKEN_PREFIX,
  ACCOUNT_HREF_TOKEN_SUFFIX,
  CONTACT_HREF_TOKEN_PREFIX,
  CONTACT_HREF_TOKEN_SUFFIX,
  DEMO_CHAT_PROMPTS,
  DEMO_DATED_FACTS_BY_ACCOUNT,
  DEMO_DATED_FACTS_QUESTIONS,
  type DemoChart,
} from '@/features/demo/demo-chat-script'
import type { ChatResponseContext } from '@/features/chat/view/ContextDisclosure'
import type { CopilotCardWire } from './copilotCardsApi'

/**
 * LE MOTEUR DU COPILOTE EN ESPACE DE DÉMONSTRATION — #1320.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LAURA EST SCRIPTÉE ICI — décision Louis 12/10 (lot DEMO-PRODUIT)
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 12/10 : Laura reste scriptée en démo — zéro coût IA par visite et démo stable en réunion ; le cas hors script ne fabrique rien.
 * Même raison pour les suggestions (`DemoSuggestionRow`) et le briefing, la veille
 * et l'onboarding démo côté API. Classée dans `demo-coverage.ts`
 * (`DEMO_LAURA_SCRIPTED_COVERAGE`), prouvée par `demo-laura-scripted-coverage.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LOUIS A TRANCHÉ LE 03/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * « Coque RÉELLE, conversation VIDE. **`isDemo` doit choisir le MOTEUR, plus
 * l'écran.** »
 *
 * Avant : la route faisait `isDemo ? <DemoChat /> : <Chat />` — deux cent six
 * lignes de coque parallèle. Un prospect voyait donc une bulle, une liste de
 * questions et une saisie grisée, là où le produit a une colonne de
 * conversations, une portée affichée, une mémoire, des réponses structurées, de
 * la transparence et des actions. Le grief de l'issue est exactement celui-là :
 * *« la page donne une image beaucoup trop pauvre de Laura et ne représente pas
 * l'expérience réelle du produit »*.
 *
 * Depuis, `/chat` rend `<Chat />` pour tout le monde. Seule la fonction qui
 * produit la réponse change — et c'est ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SCRIPTÉ, ET POURQUOI ZÉRO RÉSEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lien de démonstration part à des inconnus. Chaque message libre serait un
 * appel Claude facturé sur un espace que personne ne surveille. Ce moteur ne
 * fait **aucun appel** : les réponses sont écrites d'avance
 * (`demo-chat-script.ts`) et parlent des dossiers réellement seedés, donc ce
 * qu'on lit correspond à ce qu'on peut ouvrir dans l'app.
 *
 * ⚠️ Il ne touche PAS à `askLaura`, qui reste la seule porte vers
 * `POST /ia/chat` (GA-237). Ce n'est pas une seconde implémentation de la
 * conversation : c'est l'absence d'appel, avec la même forme de réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE QUESTION HORS SCRIPT NE FABRIQUE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * La saisie n'est plus grisée — la coque est celle du produit. Une question
 * qu'aucune amorce ne couvre reçoit donc une réponse qui **dit ce qui se
 * passe** : les réponses sont préparées, voici celles qui existent. Inventer un
 * paragraphe plausible serait de la donnée fictive présentée à un prospect —
 * exactement ce que la doctrine du dépôt refuse, et le plus mauvais endroit
 * possible pour le faire.
 */

/** Ce qu'un tour rend — la MÊME forme que `askLaura`, plus le graphe éventuel. */
type DemoTurn = {
  reply: string
  context?: ChatResponseContext
  /** Le petit graphe en barres de certaines réponses. `DemoBarChart` le rend. */
  chart?: DemoChart
  /**
   * #1950 — les cartes du tour, dans la forme exacte que le serveur sert
   * (`CopilotCardWire`) : `Chat.tsx` les pose sur `message.cards`, et c'est le
   * VRAI `CopilotCards` qui les rend — barre « Plan de Laura » comprise.
   */
  cards?: CopilotCardWire[]
  /**
   * #2433.12 (lot P02 09/10) — la capture semée que la QUESTION porte en pièce
   * jointe : `Chat.tsx` la pose sur la bulle de la question, et c'est le VRAI
   * `AttachmentPreviewDialog` qui en rend le recadrage proposé et le tableau.
   */
  imageCapture?: (typeof DEMO_CHAT_PROMPTS)[number]['imageCapture']
}

/**
 * Le tour scripté.
 *
 * La correspondance se fait sur le TEXTE de la question, parce que c'est lui qui
 * voyage : le composeur envoie une chaîne, pas un identifiant d'amorce. Cliquer
 * une amorce revient donc à taper sa question mot pour mot, ce qui est aussi ce
 * qui rend le script atteignable au clavier.
 *
 * ⚠️ La comparaison est normalisée (casse, espaces, ponctuation finale) mais
 * jamais approximative : une question « proche » ne déclenche pas la réponse
 * d'une autre. Une réponse servie à côté de sa question est pire qu'une absence
 * de réponse — c'est une affirmation fausse sur une société réelle.
 */
export function demoTurn(
  message: string,
  fallback: string,
  accountIdByName?: ReadonlyMap<string, string>,
  // #4069.4 (recette R6 14/10) — le compte ouvert à l'écran, déjà résolu côté appelant
  // (`selectedAccountName`, aucun appel réseau neuf). Nécessaire pour qu'une question
  // GÉNÉRIQUE (« ce compte », jamais un nom) sache lequel des comptes analysés documenter.
  activeAccountName?: string | null,
  // #4610.5 — les contacts chargés par l'écran (nom → id), pour que les noms de la carte Contacts mènent à leur fiche.
  contactIdByName?: ReadonlyMap<string, string>,
): DemoTurn {
  const asked = normalize(message)
  if (activeAccountName && DATED_FACTS_QUESTIONS_NORMALIZED.has(asked)) {
    const reply = DEMO_DATED_FACTS_BY_ACCOUNT[activeAccountName]
    if (reply) return withDatedSources({ reply, context: withoutReplyOptions(datedFactsContext(activeAccountName)) })
  }
  const prompt = DEMO_CHAT_PROMPTS.find(entry => normalize(entry.question) === asked)
  if (!prompt) {
    // #4069.4 (démo 14/10) — une question LIBRE qui nomme UN compte analysé sert la réponse datée de ce compte.
    const named = namedDatedAccount(asked)
    return named
      ? withDatedSources({ reply: named.reply, context: withoutReplyOptions(datedFactsContext(named.name)) })
      : { reply: fallback }
  }
  const rawTurn = scriptedTurn(prompt)
  const scripted = {
    ...rawTurn,
    reply: resolveContactCardLinks(resolveAccountHrefs(rawTurn.reply, accountIdByName), contactIdByName),
  }
  // BEL-LAU-1010 (#3765) — parité démo : tout tour scripté porte le contexte vrai de la salle (le
  // portefeuille des comptes + l'inférence), pour que le pied de réponse dise son fondement.
  const baseTurn = scripted.context ? scripted : { ...scripted, context: withoutReplyOptions(demoContext([])) }
  // #4069.4 — le badge de preuve suit les faits datés que CETTE réponse cite (voir `datedSourcesOf`) :
  // seulement l'amorce des signaux datés — les autres amorces gardent leur fondement (portefeuille, inférence).
  const turn = prompt.id === DATED_SIGNALS_PROMPT_ID && !prompt.sources?.length ? withDatedSources(baseTurn) : baseTurn
  // #3285 — la source du tour, dans la forme EXACTE que le serveur sert (`context.sources`, `kind`
  // `method_rule`) : le vrai `ContextDisclosure` la liste. Clé omise sans source — jamais une liste vide posée.
  // #5086 — les notes de la réponse, dans le champ structuré que le serveur sert (`context.reply_notes`).
  const withNotes = prompt.replyNotes?.length
    ? { ...turn, context: { ...(turn.context ?? demoContext([])), reply_notes: [...prompt.replyNotes] } }
    : turn
  if (!prompt.sources?.length) return withNotes
  return {
    ...withNotes,
    context: { ...(withNotes.context ?? demoContext([])), sources: prompt.sources.map(source => ({ ...source })) },
  }
}

/** Clé `reply_options` omise quand il n'y a aucune précision : une liste vide se lirait « le serveur n'en propose aucune ». */
function withoutReplyOptions(context: NonNullable<DemoTurn['context']>): NonNullable<DemoTurn['context']> {
  const copy = { ...context }
  delete copy.reply_options
  return copy
}

function scriptedTurn(prompt: (typeof DEMO_CHAT_PROMPTS)[number]): DemoTurn {
  // Clé OMISE sans cartes : un tableau vide se lirait « le serveur a dit : aucune carte ».
  return {
    reply: prompt.answer,
    chart: prompt.chart,
    ...(prompt.cards?.length ? { cards: [...prompt.cards] } : {}),
    ...(prompt.imageCapture ? { imageCapture: prompt.imageCapture } : {}),
    // #2679 — les réponses possibles d'une précision posée en texte, dans la
    // forme EXACTE que le serveur sert (`context.reply_options`) : c'est le vrai
    // composant de la conversation qui les rend, pas un rendu de démonstration.
    // Clé omise quand l'amorce n'en porte pas — aucun bouton mort.
    ...(prompt.replyOptions?.length ? { context: demoContext(prompt.replyOptions) } : {}),
    // #1950.4 / .7 / .12 / .13 — le résumé du plan, dans la forme EXACTE que le
    // serveur sert (`context.plan_brief`).
    ...(prompt.planBrief
      ? { context: { ...demoContext(prompt.replyOptions ?? []), plan_brief: prompt.planBrief } }
      : {}),
    // #2392 — les propositions du tour, dans la forme EXACTE que le serveur
    // sert (`context.pending_actions`) : c'est le vrai `PendingActions` qui les rend.
    ...(prompt.pendingActions
      ? {
          context: {
            ...demoContext(prompt.replyOptions ?? []),
            pending_actions: [...prompt.pendingActions()],
          },
        }
      : {}),
    // #2276 — le job composite, dans la forme EXACTE que le serveur sert
    // (`context.laura_job`) : c'est la vraie `LauraJobCard` qui le rend.
    ...(prompt.lauraJob ? { context: { ...demoContext(prompt.replyOptions ?? []), laura_job: prompt.lauraJob } } : {}),
  }
}

/**
 * #2679 — le contexte d'un tour SCRIPTÉ, réduit à ce qui est VRAI en salle.
 *
 * Le panneau de transparence dit ce que Laura avait sous les yeux. Ici aucun
 * modèle n'est appelé : la seule chose vraie est que la réponse est écrite à
 * partir des SIX comptes de la salle (`DEMO_PORTFOLIO_NAMES`), nommés dans le
 * texte. Donc le
 * portefeuille, et rien d'autre — aucun document lu (la liste reste vide, elle
 * ne prétend pas le contraire), aucun profil, aucun compte actif, aucun plan,
 * aucune mémoire. Un `0` ne s'affiche jamais : `ContextDisclosure` ne pose une
 * puce que sur ce qui est présent.
 */
function demoContext(
  replyOptions: readonly { question: string; options: readonly string[] }[],
): NonNullable<DemoTurn['context']> {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: true, count: DEMO_PORTFOLIO_NAMES.length, names: [...DEMO_PORTFOLIO_NAMES] },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [],
    not_consulted: [],
    // #3764 — recette prod 08/10 (U 22edd95fe1) : sans ceci, `reply-badges.ts`
    // lisait `reasoning_trace` absent → `toolsRead: null` → AUCUN badge, sur
    // tout tour scripté (« Où en est mon portefeuille ? » compris). La
    // convention déjà tranchée pour `knowledge_receipt.workspace` ci-dessous
    // (« consulted » veut dire « fondé sur la salle », jamais « un appel a eu
    // lieu ») s'étend ici : le portefeuille de la salle EST la lecture
    // réelle de ce tour, donc `tools_called` la nomme — jamais le nom d'un
    // outil externe qui n'a pas tourné. Avec `sources: []` ci-dessus, le
    // badge qui en sort est honnête : « Aucune preuve actuelle » (aucune
    // source fraîche citée), jamais « Signal actuel vérifié ».
    reasoning_trace: { tools_called: ['demo_portfolio'] },
    // #3193.2/.3/.4 (épopée #3217) — parité démo (craft rule n°9) : la SEULE
    // couche réelle en salle est le portefeuille des SIX comptes (`workspace`
    // ci-dessous) — aucun appel réseau n'a lieu, donc les dix autres couches
    // restent honnêtement `not_requested`, jamais devinées à `consulted`.
    knowledge_receipt: {
      workspace: { status: 'consulted', result_count: DEMO_PORTFOLIO_NAMES.length },
      crm: { status: 'not_requested' },
      messaging: { status: 'not_requested' },
      agenda: { status: 'not_requested' },
      documents: { status: 'not_requested' },
      account_dossier: { status: 'not_requested' },
      dataforge: { status: 'not_requested' },
      market_memory: { status: 'not_requested' },
      current_public_sources: { status: 'not_requested' },
      bellum_method: { status: 'not_requested' },
      inference: { status: 'consulted', caveat: 'réponse combinée par raisonnement' },
    },
    reply_options: replyOptions.map(precision => ({
      question: precision.question,
      options: [...precision.options],
    })),
  }
}

/**
 * #4069.4 (recette R6 14/10) — même contexte que `demoContext`, mais pour UN compte nommé (les
 * faits datés ci-dessus) plutôt que le portefeuille : `active.account` dit honnêtement de quel
 * dossier la réponse parle, au lieu du générique `present: false` des tours de portefeuille.
 *
 * #4069.4 (14/10, démo) — et ses `sources` sont les faits datés que la réponse CITE : le pied de
 * réponse dérive son badge de preuve de ce que le texte affirme, jamais « Aucune preuve actuelle »
 * sous des faits datés.
 */
function datedFactsContext(accountName: string): NonNullable<DemoTurn['context']> {
  const base = demoContext([])
  return { ...base, active: { ...base.active, account: { present: true, name: accountName } } }
}

const FRENCH_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const
const DATED_FACT = new RegExp(`(?:(\\d{1,2})(?:er)?\\s+)?(${FRENCH_MONTHS.join('|')})\\s+(20\\d{2})`, 'i')

/**
 * Les faits DATÉS d'une réponse : une source par puce qui porte un mois et une année (jour facultatif,
 * « le 8 octobre 2026 », « en mars 2026 »). Une puce sans date n'est pas une source — rien n'est deviné.
 */
function datedSourcesOf(reply: string): NonNullable<DemoTurn['context']>['sources'] {
  const sources: NonNullable<DemoTurn['context']>['sources'] = []
  for (const line of reply.split('\n')) {
    const bullet = /^\s*[•*-]\s+(.*)$/.exec(line)
    const match = bullet ? DATED_FACT.exec(bullet[1]) : null
    if (!bullet || !match) continue
    const month = FRENCH_MONTHS.indexOf(match[2].toLowerCase() as (typeof FRENCH_MONTHS)[number]) + 1
    const day = match[1] ? Number(match[1]) : 1
    const asOf = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const label = bullet[1].replace(/[\s;.]+$/u, '')
    sources.push({
      kind: 'account_dossier',
      label: label.length > 140 ? `${label.slice(0, 139)}…` : label,
      as_of: asOf,
    })
  }
  return sources
}

function withDatedSources(turn: DemoTurn): DemoTurn {
  const sources = datedSourcesOf(turn.reply)
  if (sources.length === 0 || !turn.context) return turn
  return { ...turn, context: { ...turn.context, sources } }
}

const DATED_SIGNALS_PROMPT_ID = 'p-signals'

/** Questions générales sur un compte (texte déjà normalisé : minuscules, sans accents). */
const GENERAL_ACCOUNT_QUESTION =
  /(que sais|qu'?est[- ]ce que tu sais|ou en est|ou en sont|quoi de neuf|parle[- ]moi|fais[- ]moi un point|point sur|resume|dis[- ]moi tout|infos? sur|nouvelles? de)/

/** Les comptes qui ont une réponse DATÉE écrite : les quatre analysés + SNCF (l'amorce « signaux »). */
const DATED_ANSWER_BY_ACCOUNT: Readonly<Record<string, string | undefined>> = {
  ...DEMO_DATED_FACTS_BY_ACCOUNT,
  SNCF: DEMO_CHAT_PROMPTS.find(entry => entry.id === DATED_SIGNALS_PROMPT_ID)?.answer,
}

/**
 * #4069.4 — UN compte analysé nommé dans la question (mot entier, sans casse ni accents) ⇒ sa réponse
 * datée. Deux comptes nommés, ou aucun : `null` — on ne devine pas lequel documenter. Un compte sans
 * réponse datée écrite (Groupe BPCE…) n'est pas dans la table : rien n'est fabriqué.
 */
function namedDatedAccount(askedNormalized: string): { name: string; reply: string } | null {
  // Une question PRÉCISE (« le chiffre d'affaires de SNCF ») n'est pas « que sais-tu de SNCF » : servir
  // les faits datés y répondrait à côté. Seules les questions générales sur le compte sont servies.
  if (!GENERAL_ACCOUNT_QUESTION.test(askedNormalized)) return null
  const hits = Object.entries(DATED_ANSWER_BY_ACCOUNT).filter(([name, reply]) => {
    if (!reply) return false
    const needle = normalize(name)
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`).test(askedNormalized)
  })
  const only = hits.length === 1 ? hits[0] : null
  return only && only[1] ? { name: only[0], reply: only[1] } : null
}

// Normalisées UNE fois (même fonction que les amorces de `DEMO_CHAT_PROMPTS`).
const DATED_FACTS_QUESTIONS_NORMALIZED = new Set(DEMO_DATED_FACTS_QUESTIONS.map(normalize))

/** Les six comptes cibles de la salle (01/10/2026), ceux que les réponses scriptées classent. */
const DEMO_PORTFOLIO_NAMES = ['SNCF', 'Société Générale', 'Groupe BPCE', 'Alstom', 'ENGIE', 'TotalEnergies'] as const

/** Échappe les caractères spéciaux d'une regex — ici, les accolades du jeton. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ACCOUNT_HREF_TOKEN = new RegExp(
  `${escapeRegExp(ACCOUNT_HREF_TOKEN_PREFIX)}([^}]+)${escapeRegExp(ACCOUNT_HREF_TOKEN_SUFFIX)}`,
  'g',
)

/**
 * #3766 Reste (lot K06 07/10) — résout `accountHref('SNCF')` (`demo-chat-script.ts`)
 * contre l'UUID RÉELLEMENT assigné par le semis dans cette salle précise. Sans
 * `accountIdByName` (hors écran réel : tests, démonstration hors script), le
 * jeton reste tel quel — aucune carte scriptée ne le laisse fuiter : la réponse
 * garde son texte EXACT (`demo-turn.test.ts`), et le seul appelant réel
 * (`Chat.tsx`) fournit toujours la table tirée de `useAccounts`.
 */
function resolveAccountHrefs(text: string, accountIdByName: ReadonlyMap<string, string> | undefined): string {
  if (!accountIdByName) return text
  return text.replace(ACCOUNT_HREF_TOKEN, (token, slug: string) => {
    // `accountHref()` remplace l'espace par `_` (`appPath` refuse l'espace) — on inverse ici.
    const id = accountIdByName.get(slug.replace(/_/g, ' '))
    return id ?? token
  })
}

const CONTACT_HREF_PROPERTY = new RegExp(
  `,"href":"/contacts/${escapeRegExp(CONTACT_HREF_TOKEN_PREFIX)}([^}]+)${escapeRegExp(CONTACT_HREF_TOKEN_SUFFIX)}"`,
  'g',
)
const UNRESOLVED_COMPANY_HREF = new RegExp(
  `,"company_href":"/accounts/${escapeRegExp(ACCOUNT_HREF_TOKEN_PREFIX)}[^}]+${escapeRegExp(ACCOUNT_HREF_TOKEN_SUFFIX)}"`,
  'g',
)

/**
 * #4610.5 — résout le lien de FICHE d'un contact cité dans la carte `contact_list` d'une réponse scriptée, contre
 * les contacts RÉELLEMENT chargés. Un contact introuvable (ou aucune table) ne laisse JAMAIS de jeton ni de lien
 * mort : la propriété est retirée, le nom reste du texte. Même règle pour le `company_href` que
 * `resolveAccountHrefs` n'a pas pu résoudre.
 */
function resolveContactCardLinks(text: string, contactIdByName: ReadonlyMap<string, string> | undefined): string {
  return text
    .replace(CONTACT_HREF_PROPERTY, (_property, slug: string) => {
      const id = contactIdByName?.get(slug.replace(/_/g, ' '))
      return id ? `,"href":"/contacts/${id}"` : ''
    })
    .replace(UNRESOLVED_COMPANY_HREF, '')
}

/** #4610.5 — la réponse scriptée à CETTE question cite-t-elle des contacts à lier ? (évite de lire les contacts à chaque message) */
export function demoTurnLinksContacts(message: string): boolean {
  const asked = normalize(message)
  const prompt = DEMO_CHAT_PROMPTS.find(entry => normalize(entry.question) === asked)
  return Boolean(prompt?.answer.includes(CONTACT_HREF_TOKEN_PREFIX))
}

/** Les amorces de la démonstration, dans la forme que le composeur attend. */
export function demoSuggestions(): { label: string; prompt: string }[] {
  return DEMO_CHAT_PROMPTS.map(entry => ({ label: entry.question, prompt: entry.question }))
}

/** Casse, espaces multiples et ponctuation finale ne changent pas la question. */
function normalize(value: string): string {
  // #3398.4b — accents et apostrophes (’ ʼ ` ´ ′ → ') ne changent pas la question :
  // la même phrase tapée au clavier ou collée portait une apostrophe droite et
  // ne retrouvait pas son amorce. Normalisation, jamais approximation.
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’‘ʼ`´′]/gu, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.\s]+$/u, '')
}

/**
 * #3768 (BEL-LAU-1014) — LE GESTE « RETRAVAILLER CETTE RÉPONSE » EN DÉMONSTRATION.
 *
 * Même règle que le reste de ce moteur : zéro réseau, rien d'inventé. Les gestes
 * qui se déduisent du texte de la réponse (synthétiser, moins de détails,
 * priorités, plan d'action, liste exportable) sont rendus par
 * `localReplyTransform` à partir de ses seules lignes — les réserves comprises.
 * Ceux qui demandent de NOUVELLES données (approfondir, plus de comptes, mieux
 * justifier) le DISENT, au lieu de fabriquer une suite plausible.
 */
export function demoReplyTransformTurn(request: ReplyTransformRequest, t: TFunction): DemoTurn {
  const action = t(`replyTransform.ids.${request.id}`)
  const reply = localReplyTransform(request, {
    setAside: count => t('replyTransform.demo.setAside', { count }),
    planTitle: t('replyTransform.demo.planTitle'),
    tableHead: [
      t('replyTransform.demo.tableHead.rank'),
      t('replyTransform.demo.tableHead.item'),
      t('replyTransform.demo.tableHead.detail'),
    ],
  })
  if (reply !== null) return { reply }
  const needsNewData = request.id === 'deepen' || request.id === 'more_accounts' || request.id === 'justify'
  return { reply: t(needsNewData ? 'replyTransform.demo.unavailable' : 'replyTransform.demo.nothing', { action }) }
}
