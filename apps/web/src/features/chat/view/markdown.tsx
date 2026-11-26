import { useLocation, useNavigate } from '@tanstack/react-router'
import { splitInternalHref } from '@/lib/internal-href'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, HORIZONTAL_OVERSCROLL_CLASS } from '@bellum/ui'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { ReportProblemLink } from '@/features/feedback/ReportProblemLink'
import { parseReportLink } from '@/features/feedback/reportLink'
import { trackAssistantRedirectFollowed } from '@/lib/product-tracker'
import { readableTemplate } from '@/lib/readable-template'
import { tidyReplyText } from './reply-text-tidy'
import { withReturnToConversation } from '@/lib/return-to-conversation'
import { discoverHandoffTarget, useDiscoverCriteria } from './discover-handoff'
import { useReplyConversationId } from './reply-conversation'
import { translateVerdictCodes } from './verdict-codes'
import { stripToolCallText } from './tool-call-leak'

/**
 * #3273 — RENDU MARKDOWN PAR BLOCS, PAS PAR LIGNE.
 *
 * « faut retravailler l'UX design texte gros gras, variation de texte, retour
 * à la ligne… faire ressortir les bons éléments » : une réponse mesurée à
 * 3 572 px de haut, sans titre, sans liste, sans tableau, sans citation, sans
 * code — un mur de `<p>` identiques (`MarkdownLine` d'avant ce lot, une ligne
 * = un paragraphe, `text-sm`, couleur secondaire — voir `chat-surface.ts`).
 *
 * `renderMarkdown` groupe d'abord le texte en BLOCS (titre, liste, citation,
 * tableau, code, paragraphe), puis rend chaque bloc — au lieu de décider ligne
 * par ligne, ce qui empêchait toute liste numérotée, tout tableau, toute
 * citation de se former (une ligne ne sait pas, seule, qu'elle appartient à un
 * tableau de trois lignes). Le moteur INLINE (gras, liens, code) ne change
 * pas : `processInline`, déjà la fondation partagée avec `StructuredReply` et
 * les cartes (`renderInlineMarkdown`), gagne seulement le code inline.
 *
 * ⚠️ Le conteneur racine garde EXACTEMENT `space-y-1 break-words`
 * (`#1944.11`) : `break-words` doit rester posé ici, hérité par tout enfant.
 * L'espacement « franc » entre sections (brief #3273) vit dans un conteneur
 * DE BLOCS imbriqué (`space-y-3`) plutôt que dans une marge posée sur chaque
 * bloc : un `mt-*` écrit sur un enfant DIRECT de `.space-y-1` perdrait contre
 * la marge que Tailwind injecte via `.space-y-1 > * + *` — sélecteur à trois
 * classes contre une, la spécificité CSS tranche pour `space-y-1`, pas pour
 * l'ordre d'apparition. Imbriquer un second conteneur évite le conflit : la
 * racine n'a plus qu'UN enfant, donc plus aucun frère à qui injecter sa marge.
 */
export function renderMarkdown(text: string): ReactNode {
  const blocks = parseBlocks(tidyReplyText(readableTemplate(translateVerdictCodes(stripToolCallText(text)))))
  return (
    <div className="space-y-1 break-words [overflow-wrap:anywhere]">
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </div>
  )
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'hr' }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; lines: string[] }

const HR = /^(-{3,}|\*{3,}|_{3,})$/
const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^[-•*]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const FENCE = /^```/

/** Une ligne de tableau : `trim`, pipes de tête/queue retirés, cellules `trim`ées. */
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

/** La ligne de séparation d'un tableau (`| --- | :-: |`) — jamais son en-tête ni son corps. */
function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

/**
 * Découpe le texte en blocs. Une ligne vide sépare deux blocs sans en
 * produire elle-même — l'espacement vient du conteneur (`space-y-3`), plus
 * jamais d'un `<br/>` littéral.
 */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (trimmed === '') {
      i++
      continue
    }
    if (HR.test(trimmed)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }
    if (FENCE.test(trimmed)) {
      const codeLines: string[] = []
      let j = i + 1
      while (j < lines.length && !FENCE.test(lines[j].trim())) {
        codeLines.push(lines[j])
        j++
      }
      blocks.push({ kind: 'code', lines: codeLines })
      i = j + 1 // saute aussi la clôture — si elle manque (flux en cours), on est déjà à la fin
      continue
    }
    const heading = trimmed.match(HEADING)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    if (QUOTE.test(trimmed)) {
      const quoteLines: string[] = []
      let j = i
      while (j < lines.length && QUOTE.test(lines[j].trim())) {
        quoteLines.push(lines[j].trim().replace(QUOTE, '$1'))
        j++
      }
      blocks.push({ kind: 'quote', lines: quoteLines })
      i = j
      continue
    }
    // Tableau : la ligne courante porte un `|`, et la SUIVANTE est la séparation.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(lines[i])
      let j = i + 2
      const rows: string[][] = []
      while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
        rows.push(splitTableRow(lines[j]))
        j++
      }
      blocks.push({ kind: 'table', header, rows })
      i = j
      continue
    }
    const bullet = trimmed.match(BULLET)
    const numbered = trimmed.match(NUMBERED)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      const marker = ordered ? NUMBERED : BULLET
      const items: string[] = [(bullet ?? numbered)![1]]
      let j = i + 1
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim()
        // #3939.1
        if (nextTrimmed === '') {
          // liste RELÂCHÉE (une ligne vide entre deux items, forme
          // markdown valide) : on la tolère SEULEMENT si un item de la MÊME liste
          // suit — sinon la ligne vide referme bien la liste, comme avant.
          let k = j + 1
          while (k < lines.length && lines[k].trim() === '') k++
          if (k < lines.length && marker.test(lines[k].trim())) {
            j = k
            continue
          }
          break
        }
        const match = nextTrimmed.match(marker)
        if (!match) break
        items.push(match[1])
        j++
      }
      blocks.push({ kind: 'list', ordered, items })
      i = j
      continue
    }
    // Paragraphe : les lignes ordinaires qui suivent, jusqu'au prochain bloc.
    const paragraphLines: string[] = [raw]
    let j = i + 1
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      !HR.test(lines[j].trim()) &&
      !FENCE.test(lines[j].trim()) &&
      !HEADING.test(lines[j].trim()) &&
      !QUOTE.test(lines[j].trim()) &&
      !BULLET.test(lines[j].trim()) &&
      !NUMBERED.test(lines[j].trim()) &&
      !(lines[j].includes('|') && j + 1 < lines.length && isTableSeparator(lines[j + 1]))
    ) {
      paragraphLines.push(lines[j])
      j++
    }
    blocks.push({ kind: 'paragraph', lines: paragraphLines })
    i = j
  }
  return blocks
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'hr':
      return <hr className="border-[var(--bellum-border)]" />
    case 'heading':
      return <Heading level={block.level} text={block.text} />
    case 'quote':
      return (
        // GA-328 — les traits de la surface de Laura font UN pixel : `border-l`,
        // jamais `border-l-2` (déjà refusé une fois sur le bandeau du tiroir).
        <blockquote className="space-y-1 border-l border-[var(--bellum-border)] pl-3 italic text-[var(--bellum-text-secondary)]">
          {block.lines.map((line, index) => (
            <p key={index}>{processInline(line)}</p>
          ))}
        </blockquote>
      )
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-lg bg-[var(--bellum-surface-2)] p-3 font-mono text-sm text-[var(--bellum-text-primary)]">
          <code>{block.lines.join('\n')}</code>
        </pre>
      )
    case 'table':
      return <Table header={block.header} rows={block.rows} />
    case 'list':
      return <List ordered={block.ordered} items={block.items} />
    case 'paragraph':
      return (
        <div className="space-y-1">
          {block.lines.map((line, index) => (
            <ParagraphLine key={index} line={line} />
          ))}
        </div>
      )
  }
}

/**
 * #3273 — titres HIÉRARCHISÉS : `##`/`#` (niveau ≤ 2) se distinguent de
 * `###` et plus, par la taille ET le poids — dans l'échelle GA-31
 * (`text-lg` 18px, `text-base` 16px), jamais une valeur arbitraire. Les deux
 * en couleur PRIMAIRE : un titre qui reste en gris secondaire ne « ressort »
 * pas plus que le texte qu'il introduit.
 */
function Heading({ level, text }: { level: number; text: string }) {
  const Tag = level <= 2 ? 'h2' : 'h3'
  return (
    <Tag
      className={cn('text-[var(--bellum-text-primary)]', level <= 2 ? 'text-lg font-bold' : 'text-base font-semibold')}
    >
      {processInline(text)}
    </Tag>
  )
}

/**
 * #4445.1 — au-delà de ce nombre d'éléments, une liste se REPLIE : les premiers
 * restent visibles, un bouton montre les autres. Le seuil vit ICI, une seule
 * fois (GA-26) ; les tests le relisent plutôt que de le recopier.
 */
export const LIST_FOLD_THRESHOLD = 5

/** #3273 — puces ou numéros : le marqueur est décoratif (`aria-hidden`), la liste porte le sens. */
function List({ ordered, items }: { ordered: boolean; items: string[] }) {
  const { t } = useTranslation('chat')
  const [expanded, setExpanded] = useState(false)
  const Tag = ordered ? 'ol' : 'ul'
  // #4445.1 — repliée : les 5 premiers ; la numérotation vient de l'INDEX dans
  // la liste complète, donc reste continue après dépliage.
  const foldable = items.length > LIST_FOLD_THRESHOLD
  const visible = foldable && !expanded ? items.slice(0, LIST_FOLD_THRESHOLD) : items
  const hidden = items.length - LIST_FOLD_THRESHOLD
  const list = (
    <Tag className="space-y-1">
      {visible.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span aria-hidden className="shrink-0 text-[var(--bellum-text-accent)]">
            {ordered ? `${index + 1}.` : '•'}
          </span>
          <span>{processInline(item)}</span>
        </li>
      ))}
    </Tag>
  )
  if (!foldable) return list
  return (
    <div className="space-y-1">
      {list}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="min-h-11 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:underline"
      >
        {expanded ? t('listFold.collapse') : t('listFold.showMore', { count: hidden })}
      </button>
    </div>
  )
}

/**
 * #3273 — D81 / GA-34 : « listes, tableaux et tableaux de bord en pleine
 * largeur — ils ont besoin de leurs colonnes ». `w-full` occupe toute la
 * largeur DISPONIBLE, c'est-à-dire celle de la bulle (`CHAT_SURFACE.reading`,
 * bornée à 70ch/92% — la borne de la BULLE, jamais celle du composant
 * `Text`) : un tableau de chat n'a pas la largeur d'un tableau de bord plein
 * écran, mais il n'est plus RÉTRÉCI en plus par une mise en page de prose. Ce
 * qui déborde défile dans SON propre conteneur (`overflow-x-auto`), jamais le
 * fil — la même règle que `#3050` pour un jeton sans espace.
 */
function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-[var(--bellum-border)]', HORIZONTAL_OVERSCROLL_CLASS)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th
                key={index}
                className="border-b border-[var(--bellum-border)] px-2 py-1.5 text-left font-semibold text-[var(--bellum-text-primary)]"
              >
                {processInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-[var(--bellum-border)] px-2 py-1.5 align-top">
                  {processInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Une ligne de paragraphe ordinaire — même patron qu'avant ce lot (#1861 : le gras qui
 *  couvre toute la ligne reste un cas à part, reconnu avant de passer par `processInline`). */
function ParagraphLine({ line }: { line: string }) {
  const trimmed = line.trim()
  // #1861 — l'intérieur d'une ligne entièrement en gras passe par le moteur
  // inline. Il était rendu BRUT : `**Voir [la liste](/accounts)**` affichait les
  // crochets et l'URL. La syntaxe markdown ne s'affiche JAMAIS, ici non plus.
  if (trimmed.length > 4 && trimmed.startsWith('**') && trimmed.endsWith('**')) {
    return <p className="font-semibold text-[var(--bellum-text-primary)]">{processInline(trimmed.slice(2, -2))}</p>
  }
  return <p>{processInline(line)}</p>
}

/**
 * #1778 — UN LIEN VERS UN ÉCRAN DE L'APPLICATION, ET RIEN D'AUTRE.
 *
 * Le moteur ne traitait que le gras : Laura ne pouvait pas montrer un chemin,
 * seulement le décrire — et #1768 vient de là, elle a décrit un bouton qui
 * n'existe pas.
 *
 * Deux refus, tous deux dans `appRouteTarget` (GA-277) :
 *  - ce qui SORT de l'application (une redirection ouverte pilotée par un
 *    modèle n'est pas un défaut d'affichage) ;
 *  - ce qui n'EXISTE pas (`/decouvrir` reste dans le domaine et rend un 404 —
 *    déjà servi en production avec `/messagerie` contre `/mailbox`).
 *
 * ⚠️ Un lien refusé rend son LIBELLÉ, jamais la syntaxe : montrer
 * `[Découvrir](/decouvrir)` à quelqu'un serait remplacer un lien mort par du
 * bruit.
 */
/**
 * #1861 — « c'est quoi ces ** ? »
 *
 * Le gras et le lien se lisaient l'un APRÈS l'autre : on découpait d'abord sur
 * le LIEN, puis on cherchait le gras DANS chaque morceau. Une paire `**…**` qui
 * ENCADRE un lien était donc coupée en deux par ce premier découpage — l'étoile
 * ouvrante terminait un morceau, la fermante commençait le suivant, et aucune
 * des deux moitiés ne ressemblait plus à du gras. Les quatre caractères
 * s'affichaient tels quels, collés au lien :
 *
 *     - **[Comptes](/accounts)** : tes comptes suivis
 *       →  ** Comptes ** : tes comptes suivis
 *
 * Or c'est très exactement ce que Laura écrit : le prompt lui demande des liens
 * (`MONTRER LE CHEMIN`, #1778) ET des intitulés en gras — les deux tombent donc
 * ensemble, dans la même puce.
 *
 * D'où UN SEUL passage, et une alternance où **le gras vient en premier** :
 * `**[Comptes](/accounts)**` est un GRAS QUI CONTIENT un lien, pas un lien
 * flanqué de deux étoiles. Chaque forme reconstruit ensuite son contenu par le
 * même moteur, ce qui traite l'imbrication dans les DEUX sens — le gras autour
 * du lien, et le gras dans le LIBELLÉ du lien (`[**Comptes**](/accounts)`).
 *
 * La récursion termine : chaque niveau consomme ses propres délimiteurs, et ni
 * `[^*]+` (gras) ni `[^\]\n]+` (libellé) ne peuvent contenir le délimiteur qui
 * les rouvrirait à l'identique.
 *
 * ⚠️ Rien n'est assoupli côté sûreté : aucune balise n'est interprétée (tout
 * passe par des enfants React, jamais par du HTML), et les DEUX refus de
 * `appRouteTarget` (GA-277) restent au même endroit — ce qui SORT de
 * l'application et ce qui n'EXISTE pas ne deviennent pas des liens. Un lien
 * refusé rend son libellé, et ce libellé est lui aussi rendu par le moteur :
 * remplacer `[Découvrir](/decouvrir)` par `**Découvrir**` serait remplacer une
 * syntaxe visible par une autre.
 */
// #3273 — CODE INLINE (`` `pnpm test` ``) REJOINT LE GRAS ET LE LIEN. Un mot de
// code entouré d'un seul backtick de chaque côté ne s'affiche jamais interprété
// (un `*` ou un `[` à l'intérieur ne doit PAS déclencher le gras ou un lien) :
// il est donc reconnu ICI, dans la MÊME passe que `MARKDOWN_INLINE` — pas une
// seconde regex qui recouperait le texte différemment — et son contenu n'est
// JAMAIS repassé par `processInline` (le code ne se met pas en forme lui-même).
// #3489 — l'ITALIQUE `*texte*` vient APRÈS le gras (`**` doit gagner) et refuse un espace
// collé aux étoiles : « 2 * 3 et 4 * 5 » reste une multiplication, pas de l'italique.
const MARKDOWN_INLINE = /(\*\*[^*]+\*\*|\*[^\s*](?:[^*\n]*[^\s*])?\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`)/g
const MARKDOWN_BOLD_PARTS = /^\*\*([^*]+)\*\*$/
const MARKDOWN_LINK_PARTS = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/
const MARKDOWN_ITALIC_PARTS = /^\*([^\s*](?:[^*\n]*[^\s*])?)\*$/
const MARKDOWN_CODE_PARTS = /^`([^`\n]+)`$/

/**
 * #2594 — LA MARCHE SUIVANTE SE CLIQUE, DANS UNE CARTE COMME DANS LE FIL.
 *
 * `renderMarkdown` rend un BLOC (plusieurs lignes, `<div>` englobant) : posé
 * dans une carte — un champ `Text`, `InlineLabel`, une puce de `LabeledLines`
 * — il casserait la mise en page « libellé : contenu » sur une seule ligne. Un
 * champ de carte a donc besoin du même moteur INLINE, pas d'un second : c'est
 * `processInline`, déjà la fondation de `renderMarkdown` ligne par ligne,
 * exposé ici tel quel (GA-26 — un seul moteur, jamais un deuxième chemin de
 * rendu, et surtout pas une regex de plus qui divergerait à la première
 * phrase inhabituelle).
 *
 * Avant ce lot, une carte « Comment l'obtenir » affichait `[Contacts](/contacts)`
 * au lieu d'un lien : le champ passait en texte brut alors que le corps du
 * message, lui, passait déjà par ce moteur.
 */
export function renderInlineMarkdown(text: string): ReactNode {
  return processInline(translateVerdictCodes(text))
}

function processInline(text: string): ReactNode {
  return text.split(MARKDOWN_INLINE).map((chunk, index) => {
    const bold = chunk.match(MARKDOWN_BOLD_PARTS)
    if (bold) {
      return (
        <strong key={`bold-${index}`} className="font-semibold text-[var(--bellum-text-primary)]">
          {processInline(bold[1])}
        </strong>
      )
    }
    const italic = chunk.match(MARKDOWN_ITALIC_PARTS)
    if (italic) return <em key={`italic-${index}`}>{processInline(italic[1])}</em>
    const code = chunk.match(MARKDOWN_CODE_PARTS)
    if (code) {
      return (
        <code
          key={`code-${index}`}
          className="rounded bg-[var(--bellum-surface-2)] px-1 py-0.5 font-mono [overflow-wrap:anywhere]"
        >
          {code[1]}
        </code>
      )
    }
    const link = chunk.match(MARKDOWN_LINK_PARTS)
    if (link) {
      // #1960.4 — « Signaler ce problème » : un jeton, pas un chemin. Il ouvre le
      // widget de signalement pré-rempli, et se lit AVANT `appRouteTarget`, qui
      // le refuserait (il ne commence pas par `/`).
      const report = parseReportLink(link[2])
      if (report) return <ReportProblemLink key={`report-${index}`} request={report} label={processInline(link[1])} />
      const target = appRouteTarget(link[2])
      if (target) return <InternalLink key={`link-${index}`} to={target} label={processInline(link[1])} />
      // #2721 (suite, 23/09) — une source citée par `web_search` (FrenchWeb,
      // Maddyness…) : `appRouteTarget` la refuse (elle ne commence pas par
      // `/`), et jusqu'ici elle tombait dans « cible inconnue » juste
      // au-dessous — nommée, jamais cliquable. Une adresse `http(s)://`
      // VÉRITABLE (jamais `//ailleurs.example`, qui reste refusée par
      // `appRouteTarget` au-dessus, ni `javascript:`/un autre protocole)
      // ouvre désormais dans un nouvel onglet.
      if (isHttpUrl(link[2]))
        return <ExternalLink key={`external-${index}`} href={link[2]} label={processInline(link[1])} />
      // Cible inconnue : le libellé, sans les crochets ni l'URL.
      return <span key={`label-${index}`}>{processInline(link[1])}</span>
    }
    // Le texte ordinaire reste un texte, jamais un `<span>` : l'envelopper
    // ferait de `<strong>Objectif :</strong>` un `<strong><span>…</span></strong>`,
    // et le gras ne serait plus l'élément qui PORTE le texte. React accepte une
    // chaîne dans un tableau d'enfants — elle n'a pas besoin de clé.
    return chunk
  })
}

/**
 * Un `<a>` RÉEL qui navigue sans recharger.
 *
 * L'ancre porte son `href` — sinon le clic du milieu, le `cmd+clic` et le
 * survol qui montre la cible disparaissent, et un lien qu'on ne peut pas ouvrir
 * dans un onglet n'est pas tout à fait un lien. Le clic simple, lui, passe par
 * le routeur : recharger l'application perdrait la conversation en cours.
 *
 * #2472 — LE LIEN EMPORTE CE QUE LA RÉPONSE A PRÉPARÉ.
 *
 * « quand je clique sur découvrir la requete de decouvrir est pas préremplie » :
 * la carte de proposition ouvrait Découvrir pré-rempli, ce lien-ci partait NU,
 * dans la MÊME bulle. `discoverHandoffTarget` rend la cible INCHANGÉE partout
 * ailleurs — les autres écrans, un lien déjà paramétré, une réponse sans
 * proposition — et le chemin reste alors byte-identique à celui d'avant ce lot.
 *
 * #1903.20 / #1933.8 — LE FIL SOURCE EMPORTE DE MÊME.
 *
 * `withReturnToConversation` (`@/lib/return-to-conversation.ts`) n'était
 * appelé que par `PendingActions.tsx` (les cartes de proposition) : ce lien-ci,
 * le JUMEAU rendu au fond du moteur markdown, partait sans `from=chat:<id>` —
 * l'écran d'arrivée n'affichait donc jamais « Revenir à la conversation ».
 * Sans fil connu (`useReplyConversationId()` rend `null` hors d'une réponse
 * enveloppée par `ReplyConversation`), la cible reste inchangée.
 *
 * ⚠️ UNE chaîne, portée par l'ancre ET donnée au routeur : le cmd+clic recharge
 * l'application, le clic simple passe par `navigate`, et les deux doivent
 * emporter la même chose. Deux formes auraient été deux dérivations.
 */
export function InternalLink({ to, label, className }: { to: string; label: ReactNode; className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const withDiscover = discoverHandoffTarget(to, useDiscoverCriteria())
  const href = withReturnToConversation(withDiscover, useReplyConversationId())
  return (
    <a
      href={href}
      className={className ?? 'text-[var(--bellum-text-accent)] underline underline-offset-2'}
      onClick={event => {
        // #1946.4 — « redirection suivie » : Laura a rendu une destination, le
        // clic la suit. Le clic du milieu / cmd+clic (nouvel onglet) SUIT le
        // lien tout autant que le clic simple — seule la navigation diffère,
        // pas la décision — donc la mesure ne dépend pas des touches. Le motif
        // de route (`to`), jamais `href` : le `from=chat:<id>` que porte `href`
        // est un repère de retour, pas une destination.
        trackAssistantRedirectFollowed(location.pathname, to)
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        // #4868.1 — le découpage chaîne → { to, search, hash } vit à UN endroit (`splitInternalHref`).
        void navigate(splitInternalHref(href))
      }}
    >
      {label}
    </a>
  )
}

/** Une adresse est un lien externe seulement si c'est VRAIMENT une URL http(s)
 *  — jamais `javascript:`, `//ailleurs.example` (qui imite un chemin interne,
 *  refusé plus haut par `appRouteTarget`, GA-277) ni un autre protocole. Même
 *  garde que `isHttpUrl` (`CopilotCards.tsx`, `ActionCenter.tsx`) : un préfixe
 *  simple, jamais une invention devinée. */
function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * #2721 (suite, 23/09) — UNE SOURCE, PAS UN ÉCRAN DE BELLUM.
 *
 * `web_search` (`apps/ia/app/services/web_search_tool.py`) rend `results[].url`
 * depuis toujours ; le prompt nomme désormais la source (FrenchWeb,
 * Maddyness…) en lien markdown — mais rien ne la rendait cliquable : elle
 * tombait dans « cible inconnue » (voir `processInline`), nommée sans jamais
 * pouvoir s'ouvrir.
 *
 * Nouvel onglet, jamais le routeur (`InternalLink`) : ce n'est pas un écran de
 * cette application, personne ne doit quitter le fil de conversation.
 * `rel="noopener noreferrer"` — la page ouverte n'hérite ni de `window.opener`
 * (tabnabbing) ni du `Referer` de ce fil.
 */
function ExternalLink({ href, label }: { href: string; label: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--bellum-text-accent)] underline underline-offset-2 [overflow-wrap:anywhere]"
    >
      {label}
    </a>
  )
}
