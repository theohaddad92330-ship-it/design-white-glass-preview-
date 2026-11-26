import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { declaredAvailability, handoffPromiseInstruction, humanReplyPromise } from '@/features/chatbot/lib/availability'
import { renderPublicFeatureStatus } from '@/features/chatbot/lib/feature-status'
import {
  containsSensitiveDisclosure,
  inspectInput,
  isAbuseRefusal,
  MAX_MESSAGE_CHARS,
  redactOutput,
} from '@/features/chatbot/lib/guardrails'
import { ctaFor } from '@/features/chatbot/lib/cta'
import { handoffFailureAlreadyTold } from '@/features/chatbot/lib/handoff-memory'
import { splitMessages } from '@/features/chatbot/lib/multi-message'
import { coveredObjectionThemes } from '@/features/chatbot/lib/objection-library'
import { uncoveredObjectionTheme } from '@/features/chatbot/lib/objection-coverage'
import { buildPrefill } from '@/features/chatbot/lib/prefill'
import { quickRepliesFor } from '@/features/chatbot/lib/quick-replies'
import { isPainCovered } from '@/features/chatbot/lib/public-kb'
import { asksAboutPricing, renderPublicPricing } from '@/features/chatbot/lib/public-pricing'
import { sendTeamEmail } from '@/features/chatbot/lib/notify'
import { SlidingWindowCounter } from '@/features/chatbot/lib/rate-limit'
import {
  answeredAxes,
  bookingVerdict,
  nextQuestion,
  promptState,
  resolveRoute,
  type LeadState,
} from '@/features/chatbot/lib/routing'
import { buildLauraSystemPrompt } from '@/features/chatbot/lib/system-prompt'
import { parseHumanContact, parseUpdateLead, TOOL_DEFINITIONS } from '@/features/chatbot/lib/tools'
import {
  MAX_TURNS_SENT,
  type ChatAnalyticsEvent,
  type ChatErrorBody,
  type ChatRequestBody,
  type ChatResponseBody,
} from '@/features/chatbot/lib/contract'
import { APP_URL, demoUrl, SITE_URL, talkToTeamUrl } from '@/lib/app-url'
import { routing, type Locale } from '@/i18n/routing'

/**
 * Le seul endroit du produit qui parle au modèle au nom de Laura.
 *
 * Trois choix d'architecture, chacun pour une raison qui se voit en production :
 *
 * 1. **Pas de streaming.** Un widget qui écrit mot à mot est plus agréable — et
 *    un jeton envoyé ne se rattrape pas. Le filtre de sortie (`redactOutput`)
 *    est la garantie qui reste vraie quand tout le reste a échoué ; il exige de
 *    voir la réponse ENTIÈRE avant de la laisser partir. On échange une
 *    animation contre une garantie.
 *
 * 2. **Pas d'état serveur de conversation.** Le navigateur renvoie le fil ; le
 *    serveur ne stocke rien. Il n'y a donc aucune conversation de visiteur à
 *    conserver, à purger, ou à fuiter. L'état de qualification qui revient du
 *    client est re-validé (`parseUpdateLead`) et ne pilote qu'une suggestion de
 *    bouton — le mentir ne donne accès à rien.
 *
 * 3. **Sans clé, no-op strict.** Pas de clé API = 503 explicite et widget
 *    masqué. Jamais un chatbot qui répond « une erreur est survenue » à chaque
 *    message sur la page d'accueil.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Le modèle est surchargeable sans redéploiement — même discipline que
 *  `MODEL_<PROMPT_NAME>` côté service IA. */
const MODEL = process.env.CHATBOT_MODEL?.trim() || 'claude-opus-5'
/**
 * 1400 et non 1024 : le modèle conversationnel en cinq temps produit des
 * réponses plus riches (une réaction, une réponse, une question), et une
 * réponse coupée au milieu d'une phrase est pire qu'une réponse longue. La
 * brièveté reste imposée par le PROMPT, pas par la troncature.
 */
const MAX_OUTPUT_TOKENS = 1400
/** Une réponse commerciale de quatre lignes n'a pas besoin de délibérer. */
const EFFORT = 'low' as const
/** Bornes du va-et-vient d'outils. Deux suffisent : qualifier, puis répondre. */
const MAX_TOOL_ROUNDS = 3

const WINDOW_MS = 10 * 60 * 1000
const perSession = new SlidingWindowCounter({ windowMs: WINDOW_MS, max: 30 })
/** L'IP est la borne qui tient quand un script fabrique une session par
 *  message. Plus large que la session : plusieurs personnes partagent une
 *  sortie d'entreprise, et bloquer une ESN entière serait le comble. */
const perAddress = new SlidingWindowCounter({ windowMs: WINDOW_MS, max: 150, maxKeys: 20000 })

/** Sessions ayant déjà produit une notification. En mémoire du process, et
 *  assumé : le pire cas est un e-mail en double pour l'équipe, jamais un lead
 *  perdu. Une base pour ça coûterait plus cher que le problème. */
const notifiedLeads = new Set<string>()
const handedOff = new Set<string>()
/** Sessions où une transmission a déjà échoué ET été annoncée. Une fois suffit :
 *  répéter « je n'ai pas pu transmettre » n'apprend rien et occupe la place
 *  d'une vraie réponse. */
const failedHandoff = new Set<string>()

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function fail(error: ChatErrorBody['error'], status: number, events?: ChatAnalyticsEvent[]) {
  return NextResponse.json<ChatErrorBody>(events?.length ? { error, events } : { error }, { status })
}

function localeOf(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale
}

/** Le catalogue tarifaire de la langue du visiteur — celui de la page qu'il a
 *  sous les yeux. Un échec de lecture retire le bloc TARIFS, il n'invente pas. */
async function loadPricing(locale: Locale): Promise<string | null> {
  try {
    const catalog = (await import(`../../../../messages/${locale}/pricing.json`)) as { default: unknown }
    return renderPublicPricing(catalog.default)
  } catch {
    return null
  }
}

/** Les destinations, résolues une fois — le calcul lui-même est pur et vit
 *  dans `lib/cta.ts`, où il est testable et où la garde GL-01 peut le lire. */
function ctaLinks() {
  return { demoUrl: demoUrl(), bookingUrl: talkToTeamUrl(), appUrl: APP_URL, siteUrl: SITE_URL }
}

/** Les sujets que le §9 demande de compter, repérés sur ce que le VISITEUR
 *  écrit — le seul signal honnête : ce que Laura répond n'est pas la question. */
function topicEvents(message: string): ChatAnalyticsEvent[] {
  const events: ChatAnalyticsEvent[] = []
  const normalized = message.toLowerCase()
  if (/\b(prix|tarif|co[ûu]te?|combien|pricing|cost|budget)\b/.test(normalized)) events.push('pricing_answered')
  if (/\b(int[ée]gration|integrat|connect|crm|ats|erp|api)\b/.test(normalized)) events.push('integration_answered')
  return events
}

/**
 * Le visiteur demande-t-il à parler à quelqu'un ?
 *
 * Repéré sur ce qu'il ÉCRIT et non sur ce que le modèle en conclut : « demandé
 * deux fois » est le fait qui fait tomber le lien sans condition (§4.9), et le
 * faire dépendre d'une déclaration du modèle reviendrait à lui laisser décider
 * de la règle censée l'encadrer.
 */
function asksForBooking(message: string): boolean {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /\b(rendez[ -]?vous|rdv|creneau|un appel|te parler|vous parler|parler a quelqu|demo live|book a call|meeting|call)\b/.test(
    normalized,
  )
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return fail('not_configured', 503)

  const body = (await request.json().catch(() => null)) as ChatRequestBody | null
  const turns = Array.isArray(body?.messages) ? body!.messages : []
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 64) : ''
  if (!sessionId || !turns.length) return fail('empty', 400)

  const now = Date.now()
  const address = clientAddress(request)
  const sessionHits = perSession.hit(`s:${sessionId}`, now)
  const addressHits = perAddress.hit(`a:${address}`, now)
  if (sessionHits.limited || addressHits.limited) return fail('rate_limited', 429, ['chat_refusal'])

  const last = turns.at(-1)
  if (!last || last.role !== 'user') return fail('empty', 400)

  const verdict = inspectInput(last.content, sessionHits.count - 1)
  if (!verdict.ok) {
    // Une injection repérée ne coûte AUCUN appel modèle : elle est refusée ici.
    // Le refus voyage avec son événement — c'est le navigateur qui mesure, et
    // sans lui la seule statistique de sécurité du §9 resterait vide.
    const status = verdict.reason === 'rate_limited' ? 429 : 400
    return fail(verdict.reason, status, isAbuseRefusal(verdict.reason) ? ['chat_refusal'] : undefined)
  }

  const locale = localeOf(body?.locale)
  const featureStatus = renderPublicFeatureStatus()

  // Le visiteur vient peut-être de coller quelque chose qu'il ne devrait pas.
  // On ne le stocke pas, on ne le renvoie pas au modèle en clair, et on le lui
  // dit — dans cet ordre, parce que c'est celui qui limite les dégâts.
  const leaked = containsSensitiveDisclosure(verdict.message)

  const history = turns.slice(-MAX_TURNS_SENT).map(turn => ({
    role: turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: redactOutput(String(turn.content ?? '').slice(0, MAX_MESSAGE_CHARS)),
  }))

  const visitorMessages = history.filter(turn => turn.role === 'user').map(turn => turn.content)

  const client = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = history.map(turn => ({ role: turn.role, content: turn.content }))

  const lead: LeadState = { ...(body?.lead ?? {}) }
  const events: ChatAnalyticsEvent[] = [...topicEvents(verdict.message)]
  const eventProps: Partial<Record<ChatAnalyticsEvent, Record<string, string>>> = {}
  let explicitIntent: Parameters<typeof resolveRoute>[1] = null
  let capturedEmail: string | null = null
  let reply = ''

  // Chantier n°3 (§11, P1) : la bibliothèque d'objections est vivante, mais
  // rien ici ne l'écrit — elle se PROPOSE à un humain qui l'accepte, jamais
  // toute seule. Ce qui traverse la frontière navigateur n'est ni la phrase du
  // visiteur ni son thème présumé exact : c'est un THÈME du vocabulaire fermé,
  // qui ne désigne personne, et seulement quand la bibliothèque ne le traite
  // pas déjà. C'est le tableau de bord (§9, « top 20 non couvertes ») qui
  // agrège ces événements pour transformer un angle mort répété en entrée à
  // écrire à la main.
  const objectionTheme = uncoveredObjectionTheme(verdict.message, coveredObjectionThemes())
  if (objectionTheme) {
    events.push('objection_uncovered')
    eventProps.objection_uncovered = { theme: objectionTheme }
  }

  // Le nombre d'échanges est un FAIT de conversation, compté ici et jamais
  // demandé au modèle : la 3ᵉ condition du §4.6 (« la conversation a duré au
  // moins trois échanges ») ne peut pas dépendre de ce qu'il croit se rappeler.
  const exchanges = visitorMessages.length
  // Le visiteur redemande-t-il un rendez-vous ? On le sait AVANT d'appeler le
  // modèle, parce que l'insistance est ce qui débloque le lien sans condition.
  const booked = asksForBooking(verdict.message)
  if (booked) lead.bookRequests = (lead.bookRequests ?? 0) + 1

  // GL-03 : la grille n'entre dans le contexte que si quelqu'un a posé une
  // question de prix. Le §4.10 l'interdit sur une OBJECTION, et un bloc qu'on
  // n'injecte pas est un bloc qu'aucun modèle ne peut réciter.
  const pricing = asksAboutPricing(visitorMessages) ? await loadPricing(locale) : null

  const system = buildLauraSystemPrompt({
    locale,
    currentPage: typeof body?.page === 'string' ? body.page.slice(0, 120) : undefined,
    pricing: pricing ?? undefined,
    featureStatus: featureStatus ?? undefined,
    demoUrl: demoUrl(),
    calendlyUrl: talkToTeamUrl() ?? `${SITE_URL}/beta`,
    appUrl: APP_URL,
    privacyUrl: `${SITE_URL}/privacy`,
    // Le pont entre la grille et le modèle — le défaut n°14 du PDF 10.
    conversation: promptState({ state: lead, booking: booked, exchanges }),
  })

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        output_config: { effort: EFFORT },
        tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
        messages,
      })

      // On ACCUMULE le texte de chaque tour au lieu de le remplacer.
      // Le modèle écrit souvent sa réponse AVANT d'appeler un outil, puis
      // n'ajoute qu'une phrase de conclusion au tour suivant : garder seulement
      // le dernier tour amputait la réponse de tout son contenu utile, et le
      // visiteur recevait « Dis-moi, et je t'orienterai » sans le prix.
      const chunk = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim()
      if (chunk) reply = reply ? `${reply}\n\n${chunk}` : chunk

      const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      if (!toolUses.length) break

      messages.push({ role: 'assistant', content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []

      for (const call of toolUses) {
        if (call.name === 'update_lead') {
          const update = parseUpdateLead(call.input, visitorMessages)
          Object.assign(lead, update.state)
          if (update.explicitIntent) {
            explicitIntent = update.explicitIntent
            events.push('intent_detected')
          }
          if (update.email) capturedEmail = update.email

          const acknowledged = ['enregistré']
          if (update.rejected.length) acknowledged.push(`non retenu : ${update.rejected.join(' ; ')}`)
          results.push({ type: 'tool_result', tool_use_id: call.id, content: acknowledged.join(' — ') })
          continue
        }

        if (call.name === 'request_human_contact') {
          const parsed = parseHumanContact(call.input)
          if (!parsed) {
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: 'raison inconnue — reformule avec une des raisons prévues, ou réponds toi-même',
              is_error: true,
            })
            continue
          }
          if (handedOff.has(sessionId)) {
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: 'déjà transmis dans cette conversation',
            })
            continue
          }
          const sent = await sendTeamEmail(
            `Chatbot site — ${parsed.reason}`,
            [
              `Motif : ${parsed.reason}`,
              `Résumé : ${parsed.summary}`,
              capturedEmail ? `Contact : ${capturedEmail}` : 'Contact : non communiqué',
              `Page : ${body?.page ?? '-'}`,
            ],
            capturedEmail ?? undefined,
          )
          if (sent) {
            handedOff.add(sessionId)
            events.push('human_handoff')
            // Chantier n°4 (§11, P2) : la promesse de délai dit la VRAIE
            // disponibilité déclarée par l'exploitation — jamais « très vite »
            // à 23 h un samedi. Sans déclaration (`CHATBOT_AVAILABILITY_WINDOWS`
            // absente), l'instruction interdit explicitement tout délai.
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: handoffPromiseInstruction(humanReplyPromise(new Date(), declaredAvailability())),
            })
            continue
          }

          // ÉCHEC — BEL-LAU-905, les points 2 et 3 du ticket.
          //
          // Un échec reste dit tel quel : le modèle doit annoncer qu'il n'a PAS
          // transmis, pas inventer un accusé de réception. Mais il le dit UNE
          // fois. Le transcript test du PDF 10 le répète à deux tours d'affilée,
          // avec l'adresse du fondateur à chaque fois : le `tool_result` d'échec
          // repart dans l'historique, le modèle le relit et le re-verbalise.
          //
          // On ne renvoie donc plus d'adresse (c'est le point 2), et on marque
          // la session pour que le tour suivant reçoive « déjà signalé » plutôt
          // qu'un second échec à commenter (c'est le point 3). `is_error` est
          // retiré volontairement : ce drapeau est ce qui pousse le modèle à
          // traiter la ligne comme un incident à raconter.
          // La mémoire de process d'abord, l'HISTORIQUE ensuite : le site
          // tourne en serverless, deux tours d'une même conversation peuvent
          // atterrir sur deux instances, et le `Set` est alors vide. C'est
          // exactement le cas où la garantie « une seule fois » tombait.
          const alreadyTold = handoffFailureAlreadyTold(history, failedHandoff.has(sessionId))
          failedHandoff.add(sessionId)
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: alreadyTold
              ? "déjà signalé plus haut — n'en reparle pas, continue la conversation normalement"
              : "impossible de transmettre — dis-le UNE fois, propose le lien de réservation, et n'en reparle plus ensuite. Ne donne aucune adresse e-mail.",
          })
          continue
        }

        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'outil inconnu', is_error: true })
      }

      messages.push({ role: 'user', content: results })
    }
  } catch {
    return fail('unavailable', 502)
  }

  if (!reply) return fail('unavailable', 502)

  // Le lead part à l'équipe UNE fois, et seulement quand le visiteur a écrit son
  // adresse lui-même (`parseUpdateLead` l'a déjà vérifié).
  if (capturedEmail && !notifiedLeads.has(sessionId)) {
    notifiedLeads.add(sessionId)
    const sent = await sendTeamEmail(
      `Chatbot site — nouveau contact${lead.companyType === 'esn' ? ' (ESN)' : ''}`,
      [
        `E-mail : ${capturedEmail}`,
        `Type : ${lead.companyType ?? '-'}`,
        `Rôle : ${lead.persona ?? '-'}`,
        `Besoin : ${lead.pain ?? '-'}${lead.painFit ? ` (${lead.painFit})` : ''}`,
        `Déclencheur : ${lead.trigger ?? '-'}`,
        `Décision : ${lead.decision ?? '-'}`,
        `Horizon : ${lead.horizon ?? '-'}`,
        `Outillage : ${lead.tooling ?? '-'}`,
        `Consultants : ${lead.teamSize ?? '-'}`,
        `Page : ${body?.page ?? '-'}`,
      ],
      capturedEmail,
    )
    if (sent) events.push('lead_created')
  }

  // Le §4.14 mesure « axes de scoring renseignés en moyenne » : c'est le nombre
  // d'axes du barème, pas le nombre de clés de l'objet — `firstName` et la forme
  // d'adresse ne qualifient personne.
  const filled = answeredAxes(lead).length
  if (filled >= 4) events.push('qualification_completed')
  else if (filled > 0) events.push('qualification_started')

  const route = resolveRoute(lead, explicitIntent, bookingVerdict({ state: lead, booking: booked, exchanges }))
  // Recalculé APRÈS les appels d'outils : les boutons proposés doivent porter
  // sur ce qui reste à savoir, pas sur ce qu'on cherchait au début du tour.
  const nextAxisAfterTurn = nextQuestion(lead)

  const warned = leaked
    ? `Un détail avant de continuer : évite de coller ici un mot de passe, une clé ou un numéro de carte — je ne les conserve pas et personne n'en a besoin.\n\n${reply}`
    : reply

  // La rédaction s'applique à la réponse ENTIÈRE avant le découpage : filtrer
  // bulle par bulle laisserait passer une adresse coupée par un séparateur.
  const safe = redactOutput(warned)

  // Chantier n°5 (§11, P2) : ce que la conversation transmettrait à l'espace
  // SI le visiteur cliquait « créer mon compte » — calculé à chaque tour, pour
  // que le widget puisse l'afficher AVANT le clic, jamais après. `buildPrefill`
  // ne fait rien d'autre que trier une liste blanche : aucun appel, aucune
  // écriture, rien ne se crée ici.
  const prefill = buildPrefill(lead)
  const cta = ctaFor(route, ctaLinks(), prefill)

  return NextResponse.json<ChatResponseBody>({
    reply: safe,
    messages: splitMessages(safe),
    quickReplies: quickRepliesFor(nextAxisAfterTurn),
    cta,
    lead,
    events: [...new Set(events)],
    ...(Object.keys(eventProps).length ? { eventProps } : {}),
    // Rendu SEULEMENT quand le bouton proposé est la création de compte :
    // c'est le seul CTA que ce contexte concerne, et l'afficher ailleurs
    // laisserait croire à une transmission qui n'a pas lieu.
    ...(cta.kind === 'signup' ? { prefill } : {}),
  })
}
