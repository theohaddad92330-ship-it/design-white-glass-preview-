import type { DocSection } from '../documents/document-builders'
import type { ChatMessageAuthor } from './chat-message-authors'

/**
 * #1955.7 / #1955.15-.23 — EXPORTER un fil de Laura : le modèle de contenu
 * partagé par les trois formats (`.md`, `.pdf`, `.json`), et ses deux
 * dérivations pures.
 *
 * Même arbitrage que les dossiers de compétences (03/08) : UN modèle,
 * plusieurs rendus. Les trois ne peuvent pas raconter des choses différentes.
 *
 * ⚠️ Le CORPS d'un message reste ici : cet export part vers le lecteur du fil
 * lui-même (D65 porte sur le partage vers un AUTRE humain ou vers le modèle,
 * pas sur ce qu'un membre de l'équipe télécharge d'un fil qu'il peut déjà
 * lire à l'écran). Ce qui n'entre volontairement PAS ici : le `content`
 * (corps rédigé) d'une action proposée par Laura (`CardPreview.content`) —
 * seuls son intitulé et sa destination sortent, pour rester du côté prudent
 * de la distinction stocker/exposer tant qu'aucun arbitrage ne l'étend aux
 * actions.
 */
export type ChatThreadExportMessage = {
  role: 'user' | 'assistant'
  author: ChatMessageAuthor | null
  content: string
  createdAt: string
}

type ChatThreadExportSource = { label: string; url: string }

type ChatThreadExportAction = {
  whatWillHappen: string
  targetObject: string
  destination: string | null
  outcome: string | null
  occurredAt: string | null
}

export type ChatThreadExport = {
  title: string
  generatedAt: string
  scope: { accountId: string | null; accountName: string | null }
  authors: string[]
  messages: ChatThreadExportMessage[]
  sources: ChatThreadExportSource[]
  actions: ChatThreadExportAction[]
  limits: string[]
  /** #3895.5 — le fil porté est-il COMPLET ou un EXTRAIT ? Absent : l'appelant ne l'a pas mesuré. */
  coverage?: { messageCount: number; truncated: boolean }
  /** #3895.5 — la version du produit qui a émis l'export, quand le déploiement la connaît (jamais devinée). */
  productVersion?: string | null
}

/** #1958.8 — même paire de langues que le reste de l'interface, jamais un troisième canal deviné ici. */
export type ChatThreadExportLanguage = 'fr' | 'en'

/**
 * #1955.18 — LE FUSEAU DE RÉFÉRENCE nommé du produit, même valeur et même rôle
 * que `REFERENCE_TIMEZONE` côté service IA (`apps/ia/app/prompts/current_time.py`)
 * et que les ~7 littéraux `'Europe/Paris'` déjà posés dans cette API
 * (`contacts/cadence.service.ts`, `outreach.service.ts`,
 * `notifications.scheduler.ts`…) : un fuseau absent ou illisible ne vaut ni
 * UTC ni une devinette, il vaut ce défaut NOMMÉ.
 */
const EXPORT_REFERENCE_TIMEZONE = 'Europe/Paris'

/**
 * #1955.18 — une date se lit, elle ne se décode pas.
 *
 * Mesuré en production (0ccc8961a) : l'export Markdown d'un fil affichait
 * `2026-09-15T21:51:03.654Z` en toutes lettres — millisecondes, fuseau Zoulou,
 * une heure qui n'est même pas celle de qui lit. Aucune dérivation bilingue de
 * ce genre n'existe déjà côté API (celle qui existe,
 * `apps/web/src/lib/locale.ts`, est propre au NAVIGATEUR — elle lit
 * `i18n.language` en mémoire et ne peut pas traverser vers un service NestJS) ;
 * on reprend ici la MÊME convention de locales que ce fichier (`fr-FR` /
 * `en-GB`, l'anglais européen — jour avant mois) avec le MÊME mécanisme natif
 * (`Intl.DateTimeFormat`) déjà posé à une quinzaine d'endroits de cette API,
 * jamais une table de mois écrite à la main (ce que `current_time.py` doit
 * faire côté Python, pour une raison qui ne s'applique pas ici : `Intl` avec
 * une locale EXPLICITE ne dépend jamais de `LC_TIME`/l'hôte).
 *
 * `timezone` est celui du PROFIL (`ChatContextService.resolveTimezone` — la
 * même dérivation que le tour de chat, jamais une seconde lecture) ; absent,
 * vide ou invalide ⇒ {@link EXPORT_REFERENCE_TIMEZONE}. Une date illisible
 * rend la chaîne D'ORIGINE plutôt qu'« Invalid Date » : un export ne doit
 * jamais perdre une ligne pour une date qu'il ne sait pas lire.
 */
export function formatExportTimestamp(
  iso: string,
  language: ChatThreadExportLanguage,
  timezone?: string | null,
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const locale = language === 'en' ? 'en-GB' : 'fr-FR'
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone || EXPORT_REFERENCE_TIMEZONE }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: EXPORT_REFERENCE_TIMEZONE }).format(date)
  }
}

/** #1955.21 — un lien markdown `[texte](url)`. Rien d'inféré au-delà. */
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

/**
 * Les sources CITÉES par Laura : les liens markdown de SES réponses (jamais
 * ceux d'un message humain — un commercial peut coller une URL sans que
 * Laura l'ait « citée »), dédoublonnés par URL, dans l'ordre d'apparition.
 */
export function extractSources(messages: readonly ChatThreadExportMessage[]): ChatThreadExportSource[] {
  const seen = new Map<string, ChatThreadExportSource>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const match of message.content.matchAll(MARKDOWN_LINK)) {
      const label = match[1]?.trim()
      const url = match[2]
      if (!url || seen.has(url)) continue
      seen.set(url, { label: label && label.length > 0 ? label : url, url })
    }
  }
  return [...seen.values()]
}

function authorLabel(message: ChatThreadExportMessage): string {
  if (message.role === 'assistant') return 'Laura'
  return message.author?.firstName ?? 'Un membre de l’espace'
}

/** #3895.5 — « , du <premier> au <dernier> » quand le fil porte au moins deux dates. */
function firstToLast(data: ChatThreadExport, language: ChatThreadExportLanguage, timezone?: string | null): string {
  const first = data.messages[0]?.createdAt
  const last = data.messages[data.messages.length - 1]?.createdAt
  if (!first || !last || first === last) return ''
  return `, du ${formatExportTimestamp(first, language, timezone)} au ${formatExportTimestamp(last, language, timezone)}`
}

/**
 * Le fil, mis en `DocSection[]` — le modèle rendu par le Markdown et le PDF.
 *
 * `language`/`timezone` (#1955.18) ne portent QUE la lisibilité des dates —
 * le reste du document reste écrit en français, comme avant ce lot : traduire
 * les intitulés de section est un chantier séparé, pas ce défaut de forme.
 */
export function chatThreadExportSections(
  data: ChatThreadExport,
  language: ChatThreadExportLanguage = 'fr',
  timezone?: string | null,
): DocSection[] {
  const sections: DocSection[] = [
    {
      heading: 'Fil',
      paragraphs: [
        `Émis le ${formatExportTimestamp(data.generatedAt, language, timezone)}.`,
        `Périmètre : ${data.scope.accountName ?? (data.scope.accountId ? 'compte' : 'portefeuille')}.`,
        data.authors.length > 0
          ? `Auteurs : ${data.authors.join(', ')}.`
          : 'Auteurs : aucun message humain sur ce fil.',
        // #3895.5 — complet ou extrait, dit tel quel ; rien n'est affirmé sans mesure.
        ...(data.coverage
          ? [
              data.coverage.truncated
                ? `Extrait : les ${data.coverage.messageCount} derniers messages — le fil en compte davantage.`
                : `Fil complet : ${data.coverage.messageCount} messages${firstToLast(data, language, timezone)}.`,
            ]
          : []),
        ...(data.productVersion ? [`Version du produit : ${data.productVersion}.`] : []),
      ],
    },
    {
      heading: 'Messages',
      paragraphs: data.messages.map(
        message =>
          `[${formatExportTimestamp(message.createdAt, language, timezone)}] ${authorLabel(message)} — ${message.content}`,
      ),
    },
  ]
  if (data.sources.length > 0) {
    sections.push({
      heading: 'Sources citées',
      paragraphs: data.sources.map(source => `${source.label} — ${source.url}`),
    })
  }
  if (data.actions.length > 0) {
    sections.push({
      heading: 'Actions confirmées',
      paragraphs: data.actions.map(action => {
        const destination = action.destination ? ` (${action.destination})` : ''
        const outcome = action.outcome ? ` — ${action.outcome}` : ' — résultat non encore connu.'
        return `${action.whatWillHappen}${destination} : ${action.targetObject}.${outcome}`
      }),
    })
  }
  sections.push({
    heading: 'Limites',
    paragraphs: [
      data.limits.length > 0
        ? `Laura n'a pas eu accès à : ${data.limits.join(', ')}.`
        : 'Aucune capacité non connectée mesurée pour cet espace au moment de l’export.',
    ],
  })
  return sections
}
