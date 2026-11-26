/**
 * Les OUTILS de Laura — liste blanche, validés côté serveur.
 *
 * Le rapport du 17/08 est explicite : « aucun outil générique », et « valider
 * côté serveur tous les paramètres de tool calls ». Deux décisions en découlent,
 * et elles vont plus loin que la lettre du document :
 *
 * 1. **Les outils de LECTURE n'existent pas.** Le rapport en listait quatre
 *    (faits produit, tarifs, statuts, liens) ; leur contenu est déjà injecté
 *    dans le contexte, en entier, à chaque tour. Un outil dont la réponse est
 *    déjà sous les yeux du modèle ajoute un aller-retour, de la latence, et une
 *    surface d'appel de plus à valider — pour rien. On garde la contrainte
 *    (« Laura ne dit que ce que la base publique contient ») et on retire le
 *    mécanisme.
 *
 * 2. **Les outils d'ÉCRITURE sont deux, et ils n'écrivent rien d'irréversible.**
 *    `update_lead` tient l'état de qualification, `request_human_contact`
 *    prévient l'équipe. Aucun ne débite, ne crée de compte, ni n'envoie quoi que
 *    ce soit au visiteur.
 *
 * Le verrou qui porte tout le reste est la PROVENANCE : une adresse e-mail n'est
 * retenue que si le visiteur l'a réellement écrite. Un modèle qui invente
 * `contact@acme.com` parce que la conversation parlait d'ACME produirait un lead
 * fantôme — et l'équipe commerciale écrirait à un inconnu au nom de BellumAI.
 */

import { isPainCovered } from './public-kb'
import {
  ADDRESS_FORMS,
  COMPANY_TYPES,
  DECISION_POWERS,
  HORIZONS,
  PAIN_FITS,
  PERSONAS,
  TEAM_SIZES,
  TOOLINGS,
  TRIGGERS,
  type ExplicitIntent,
  type LeadState,
} from './routing'

/* ------------------------------------------------------------------ */
/*  Schémas exposés au modèle                                          */
/* ------------------------------------------------------------------ */

/**
 * Les énumérations viennent de `routing.ts` et ne sont PAS recopiées ici.
 *
 * Ce sont les mêmes valeurs qui sont exposées au modèle, validées au retour et
 * notées par le barème. Trois copies auraient divergé au premier ajustement, et
 * le symptôme aurait été silencieux : un axe que le modèle renseigne, que la
 * validation accepte, et que le barème ne sait pas compter.
 */
const EXPLICIT_INTENTS = ['book', 'demo', 'signup', 'existing_customer', 'bug', 'press', 'candidate'] as const
const HUMAN_REASONS = ['press', 'candidate', 'bug', 'partnership', 'explicit_request', 'unanswered_question'] as const

/**
 * Un champ facultatif, en `anyOf` plutôt qu'en `type: ['string', 'null']`.
 *
 * Le mode strict documente `anyOf` ; il ne documente pas les tableaux de types.
 * Écrire la forme non documentée marcherait probablement — et se casserait un
 * jour, en production, sur un site public, avec pour seul symptôme un chatbot
 * qui ne répond plus.
 */
function optional(inner: Record<string, unknown>, description: string) {
  return { anyOf: [inner, { type: 'null' }], description }
}

export const TOOL_DEFINITIONS = [
  {
    name: 'update_lead',
    description:
      "Enregistre ce que la conversation vient d'apprendre sur le visiteur. À appeler dès qu'une information nouvelle apparaît, jamais pour redire ce qui est déjà connu. Mets null pour tout ce que tu ne sais pas : ne devine pas, ne déduis pas d'un nom d'entreprise. L'adresse e-mail n'est acceptée que si le visiteur l'a écrite lui-même dans la conversation.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        companyType: optional(
          { type: 'string', enum: [...COMPANY_TYPES] },
          "Type d'entreprise : esn (prestation de services numériques), staffing (conseil ou portage), recruitment (cabinet de recrutement), internal_sales (direction commerciale interne), other.",
        ),
        teamSize: optional(
          { type: 'string', enum: [...TEAM_SIZES] },
          'Nombre de CONSULTANTS de la structure, pas de commerciaux.',
        ),
        persona: optional(
          { type: 'string', enum: [...PERSONAS] },
          "Rôle : founder (dirigeant ou associé), sales_director (directeur commercial ou d'agence), business_manager (business manager, ingénieur d'affaires), recruiter, ops, other.",
        ),
        pain: optional({ type: 'string' }, 'Le besoin principal, dans les mots du visiteur (une ligne).'),
        painFit: optional(
          { type: 'string', enum: [...PAIN_FITS] },
          'À quel point ce besoin est traité par BellumAI : covered (la base publique le traite de front), adjacent (proche, sans être le sujet), uncovered (hors sujet).',
        ),
        tooling: optional(
          { type: 'string', enum: [...TOOLINGS] },
          'Outillage actuel : excel_or_none, generic_crm, esn_erp (ERP métier ESN installé), direct_competitor.',
        ),
        trigger: optional(
          { type: 'string', enum: [...TRIGGERS] },
          'Pourquoi maintenant : funded_project (projet chiffré ou budget identifié), acute_problem (problème aigu récent), active_watch (veille active), curiosity.',
        ),
        decision: optional(
          { type: 'string', enum: [...DECISION_POWERS] },
          'Pouvoir de décision : decider, prescriber (accès au décideur), influencer, none.',
        ),
        horizon: optional({ type: 'string', enum: [...HORIZONS] }, 'Échéance : this_quarter, this_semester, no_date.'),
        firstName: optional({ type: 'string' }, "Le prénom, uniquement si le visiteur l'a donné."),
        addressForm: optional(
          { type: 'string', enum: [...ADDRESS_FORMS] },
          "Comment s'adresser à la personne. Par défaut on tutoie ; mets « vous » si elle vouvoie ou si le contexte l'appelle.",
        ),
        explicitIntent: optional(
          { type: 'string', enum: [...EXPLICIT_INTENTS] },
          'Une demande EXPLICITE du visiteur, qui prime sur toute qualification.',
        ),
        email: optional({ type: 'string' }, "E-mail professionnel, uniquement si le visiteur l'a écrit."),
        company: optional({ type: 'string' }, "Nom de l'entreprise, uniquement si le visiteur l'a écrit."),
      },
      required: [
        'companyType',
        'teamSize',
        'persona',
        'pain',
        'painFit',
        'tooling',
        'trigger',
        'decision',
        'horizon',
        'firstName',
        'addressForm',
        'explicitIntent',
        'email',
        'company',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'request_human_contact',
    description:
      "Transmet la conversation à un humain de l'équipe BellumAI. À utiliser pour la presse, une candidature, un bug, un partenariat, une demande explicite de parler à quelqu'un, ou une question à laquelle tu ne peux pas répondre. Une seule fois par conversation.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: [...HUMAN_REASONS], description: 'Pourquoi un humain doit reprendre.' },
        summary: {
          type: 'string',
          description: "Résumé factuel de la demande, en une ou deux phrases. Pas d'interprétation.",
        },
      },
      required: ['reason', 'summary'],
      additionalProperties: false,
    },
  },
] as const

type ToolName = (typeof TOOL_DEFINITIONS)[number]['name']

/* ------------------------------------------------------------------ */
/*  Validation côté serveur                                            */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/

/**
 * Les domaines qu'on n'enregistre pas comme lead professionnel.
 *
 * Pas un rejet : l'adresse est simplement écartée du lead. Un commercial d'ESN
 * qui écrit depuis son adresse personnelle reste un visiteur légitime — ce qu'on
 * refuse, c'est de la faire remonter à l'équipe comme un contact d'entreprise.
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.fr',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'sfr.fr',
  'laposte.net',
  'icloud.com',
  'proton.me',
  'protonmail.com',
])

export function isPersonalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return domain ? PERSONAL_DOMAINS.has(domain) : false
}

/**
 * L'adresse a-t-elle réellement été écrite par le visiteur ?
 *
 * LE verrou anti-invention. On compare sur le texte des messages VISITEUR
 * uniquement : reprendre une adresse que Laura a elle-même écrite au tour
 * précédent bouclerait sur sa propre hallucination.
 */
export function emailAppearsInVisitorMessages(email: string, visitorMessages: readonly string[]): boolean {
  const needle = email.trim().toLowerCase()
  if (!needle) return false
  return visitorMessages.some(message => message.toLowerCase().includes(needle))
}

type LeadUpdate = {
  state: LeadState
  explicitIntent: ExplicitIntent
  email: string | null
  company: string | null
  /** Ce qui a été refusé, et pourquoi — remonté au modèle tel quel. */
  rejected: string[]
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function pickText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

/**
 * Valide un appel `update_lead`.
 *
 * Rien n'est pris pour argent comptant : une valeur hors énumération est
 * IGNORÉE (pas une erreur — le tour de conversation ne doit pas tomber parce que
 * le modèle a écrit « CEO » au lieu de « leader »), et l'e-mail est écarté s'il
 * n'apparaît pas mot pour mot dans ce que le visiteur a écrit. Ce qui est écarté
 * est NOMMÉ, pour que le modèle sache qu'il n'a pas obtenu ce qu'il croyait.
 */
export function parseUpdateLead(input: unknown, visitorMessages: readonly string[]): LeadUpdate {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const rejected: string[] = []

  const state: LeadState = {}
  const companyType = pickEnum(record.companyType, COMPANY_TYPES)
  if (companyType) state.companyType = companyType
  const teamSize = pickEnum(record.teamSize, TEAM_SIZES)
  if (teamSize) state.teamSize = teamSize
  const persona = pickEnum(record.persona, PERSONAS)
  if (persona) state.persona = persona
  const tooling = pickEnum(record.tooling, TOOLINGS)
  if (tooling) state.tooling = tooling
  const trigger = pickEnum(record.trigger, TRIGGERS)
  if (trigger) state.trigger = trigger
  const decision = pickEnum(record.decision, DECISION_POWERS)
  if (decision) state.decision = decision
  const horizon = pickEnum(record.horizon, HORIZONS)
  if (horizon) state.horizon = horizon

  const firstName = pickText(record.firstName, 40)
  if (firstName) state.firstName = firstName
  const addressForm = pickEnum(record.addressForm, ADDRESS_FORMS)
  if (addressForm) state.addressForm = addressForm

  const pain = pickText(record.pain, 160)
  if (pain) state.pain = pain

  // La couverture du besoin NE VIENT PAS du modèle.
  //
  // C'est l'axe le mieux payé du barème (5 points), et un modèle qui s'auto-
  // attribue « covered » sur n'importe quel besoin ferait de la grille un
  // générateur de faux leads chauds. Le catalogue public tranche : il accorde
  // `covered`, et il le refuse. Le modèle ne garde que la nuance qui relève
  // vraiment du jugement — adjacent ou hors sujet.
  const claimedFit = pickEnum(record.painFit, PAIN_FITS)
  if (pain) {
    if (isPainCovered(pain)) {
      state.painFit = 'covered'
    } else if (claimedFit === 'covered') {
      state.painFit = 'adjacent'
      rejected.push(
        "ce besoin n'est pas dans la base publique : compté comme adjacent, ne promets pas qu'on le traite de front",
      )
    } else if (claimedFit) {
      state.painFit = claimedFit
    }
  } else if (claimedFit) {
    rejected.push("painFit sans besoin nommé — demande d'abord ce qui bloque")
  }

  const explicitIntent = pickEnum(record.explicitIntent, EXPLICIT_INTENTS) ?? null

  let email: string | null = null
  const rawEmail = pickText(record.email, 254)
  if (rawEmail) {
    const candidate = rawEmail.toLowerCase()
    if (!EMAIL_RE.test(candidate)) {
      rejected.push("l'adresse e-mail n'a pas une forme valide")
    } else if (!emailAppearsInVisitorMessages(candidate, visitorMessages)) {
      rejected.push("l'adresse e-mail n'a pas été écrite par le visiteur — demande-la-lui plutôt que de la supposer")
    } else {
      email = candidate
    }
  }

  const company = pickText(record.company, 120) ?? null

  return { state, explicitIntent, email, company, rejected }
}

type HumanContactRequest = {
  reason: (typeof HUMAN_REASONS)[number]
  summary: string
}

/** Valide un appel `request_human_contact`. Une raison hors liste = pas de transmission. */
export function parseHumanContact(input: unknown): HumanContactRequest | null {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const reason = pickEnum(record.reason, HUMAN_REASONS)
  const summary = pickText(record.summary, 600)
  if (!reason || !summary) return null
  return { reason, summary }
}
