import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Check,
  CircleDashed,
  Download,
  FileText,
  Gavel,
  HelpCircle,
  Lightbulb,
  Link2,
  ShieldAlert,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  chatArtifactId,
  chatStructuredSectionId,
  invalidBlockTableShape,
  replyBlockLeaves,
  splitReplyBlocks,
  type InvalidBlockTableShape,
  type ReplyBlock,
  type ReplySegment,
} from '@bellum/contracts'
import { Text, useCopiedFlash } from '@bellum/ui'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { dropRestatedBlockText } from '../lib/restated-block-text'
import { ReplyDensityProvider } from './reply-kit'
import { renderMarkdown } from './markdown'
import { ArtifactVersionBar } from './ArtifactVersionBar'
import { ReplyBlockView } from './reply-blocks/ReplyBlockView'
import { ReplyCard } from './reply-blocks/ReplyCard'
import { ExportTable } from './reply-blocks/FileExportCard'
import { detailKindOf, splitWhyForDisclosure } from './reply-disclosure'

/**
 * Rendu en carte structurée de la réponse du copilote (restitution V2 §14,
 * maquette p.15). Le prompt IA peut organiser sa réponse en sections nommées ;
 * quand c'est le cas, on les encadre en blocs distincts au lieu d'un markdown à
 * plat. Sinon, rendu markdown normal — AUCUNE régression. On n'invente JAMAIS
 * une section : seul un intitulé réellement écrit par le modèle et reconnu
 * déclenche le mode carte.
 *
 * #1924.1 — DEUX JEUX D'INTITULÉS, PAS UN (décision Louis, 16/09/2026).
 *  - un PLAN, une RECOMMANDATION, une approche commerciale : « Objectif / Angle
 *    d'accroche / Cas d'usage » — la structure d'avant, inchangée ;
 *  - un CONSEIL : « Verdict / Pourquoi / Ce qui manque / Prochaine action » —
 *    la structure orientée DÉCISION, arbitrée contre l'antériorité.
 *
 * Les deux vivent dans la même table parce qu'ils arrivent par le même canal :
 * le TEXTE de la réponse. L'écran ne sait pas — et n'a pas à savoir — quelle
 * intention le modèle a détectée ; il reconnaît des intitulés, un par un. C'est
 * ce qui permet à une réponse de n'en porter qu'une partie sans rien casser.
 *
 * ⚠️ Un intitulé ABSENT d'ici ne casse rien visiblement : la réponse retombe en
 * markdown à plat. C'est précisément pour ça que le lien est tenu des DEUX
 * côtés — `apps/ia/tests/test_advisor_structured_reply.py` vérifie que le prompt
 * ne demande que des intitulés que cette table connaît.
 *
 * #1914 — ET LES CARTES DE RÉPONSE. Le même texte peut porter des blocs
 * `bellum-block` (verdict, classement de comptes, comparaison… — contrat
 * `reply-blocks.ts`). Ils voyagent DANS le texte, donc un fil relu depuis
 * l'historique se rend exactement comme au moment de la réponse (#1914.14) :
 * c'est ce texte que `chat_messages.content` garde. Une réponse SANS bloc passe
 * par le chemin d'avant, inchangé.
 *
 * #2429.4 — CHAQUE bloc de CE message est ADRESSABLE : `messageId` (le prop)
 * donne à chaque bloc un rang stable (`chatArtifactId`, MÊME calcul que
 * `buildChatReplyEnvelope` côté API), copiable en lien (« partage interne »,
 * recette #2429). Sans `messageId` — l'amorce de Laura, jamais persistée —
 * aucune adresse, aucun bouton.
 *
 * #2429.1 — LES SECTIONS MARKDOWN RECONNUES SONT ADRESSABLES COMME LES BLOCS.
 * Même bouton, même geste — un espace de numérotation SÉPARÉ
 * (`chatStructuredSectionId`, préfixe `s`) compté sur TOUT le message (across
 * les segments texte, dans l'ordre), pour qu'ajouter une adresse de section ne
 * décale JAMAIS le rang d'un bloc déjà adressé. Seules les sections RECONNUES
 * (`key !== null`) reçoivent une adresse : une section voisine non cataloguée
 * n'est pas une carte, elle ne mérite pas de lien.
 */

type StructuredSectionKey =
  'objective' | 'angle' | 'usecase' | 'verdict' | 'why' | 'missing' | 'nextAction' | 'summary' | 'caveats'

type StructuredSection = {
  /** Intitulé exact écrit par le modèle (déjà dans la langue de l'utilisateur). */
  title: string
  /** Corps de la section, en markdown (rendu par le moteur partagé). */
  body: string
  /** Nature reconnue (icône), ou `null` pour une section voisine non cataloguée. */
  key: StructuredSectionKey | null
}

type ParsedStructuredReply = {
  /** Texte introductif avant la première section (peut être vide). */
  preamble: string
  sections: StructuredSection[]
}

/** Intitulés reconnus → nature. FR + EN, insensible aux accents / à la casse / à
 *  la ponctuation finale, pour coller à ce que le modèle produit réellement. */
const RECOGNIZED_TITLES: Record<string, StructuredSectionKey> = {
  objectif: 'objective',
  objectifs: 'objective',
  objective: 'objective',
  objectives: 'objective',
  goal: 'objective',
  but: 'objective',
  "angle d'accroche": 'angle',
  "angle d'approche": 'angle',
  "angle d'attaque": 'angle',
  angle: 'angle',
  'approach angle': 'angle',
  hook: 'angle',
  "cas d'usage": 'usecase',
  "cas d'usages": 'usecase',
  "cas d'usage pertinent": 'usecase',
  "cas d'utilisation": 'usecase',
  'use case': 'usecase',
  'use cases': 'usecase',
  'use-case': 'usecase',
  'relevant use case': 'usecase',
  // #1924.1 — les quatre sections d'un CONSEIL. Volontairement ÉTROITES : une
  // entrée large (« pourquoi maintenant », « prochaine étape suggérée ») ferait
  // d'une phrase en gras ordinaire un titre de carte, et découperait une réponse
  // conversationnelle en fausses sections.
  verdict: 'verdict',
  'ma recommandation': 'verdict',
  recommendation: 'verdict',
  pourquoi: 'why',
  why: 'why',
  'ce qui manque': 'missing',
  'ce qui manque encore': 'missing',
  "what's missing": 'missing',
  'what is missing': 'missing',
  'prochaine action': 'nextAction',
  'prochaine etape': 'nextAction',
  'next action': 'nextAction',
  'next step': 'nextAction',
  // #3763.5 (reste du lot J19) — une réponse EXPLICATIVE (une analyse, un
  // constat) qu'aucune carte ni aucun autre gabarit ne couvre : « Résumé » et
  // « Réserves » sont NEUFS, « Pourquoi » est RÉUTILISÉ (même nature — la
  // justification — que dans le gabarit CONSEIL, GA-26 : on ne duplique pas
  // le même sens sous deux intitulés). « Sources » n'a pas besoin d'entrée
  // ici : une fois la réponse sectionnée par au moins un intitulé reconnu,
  // `detailKindOf` l'écarte déjà du corps vers le panneau Sources (#5044, voir `reply-aside.ts`).
  resume: 'summary',
  summary: 'summary',
  reserves: 'caveats',
  caveats: 'caveats',
}

const SECTION_ICON: Record<StructuredSectionKey, LucideIcon> = {
  objective: Target,
  angle: Sparkles,
  usecase: Lightbulb,
  // #1924.1 — `CircleDashed` pour « ce qui manque » : un cercle OUVERT, jamais
  // un zéro ni une croix. Ce qu'on n'a pas pu regarder n'est ni une absence
  // constatée ni un échec.
  verdict: Gavel,
  why: HelpCircle,
  missing: CircleDashed,
  nextAction: ArrowRight,
  // #3763.5 — le gabarit EXPLICATIF : un résumé (FileText, comme une note de
  // synthèse), des réserves (ShieldAlert — une prudence NOMMÉE, jamais une
  // alerte d'échec).
  summary: FileText,
  caveats: ShieldAlert,
}

/** Normalise un intitulé pour la reconnaissance (jamais pour l'affichage). */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u02bc]/g, "'") // apostrophes typographiques → ascii
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques
    .replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '') // puce / numérotation en tête
    .replace(/[\s:\uff1a.-]+$/, '') // ponctuation finale (dont « : » pleine largeur)
    .replace(/\s+/g, ' ')
    .trim()
}

function recognizedKey(title: string): StructuredSectionKey | null {
  return RECOGNIZED_TITLES[normalizeTitle(title)] ?? null
}

type HeadingMatch = { title: string; inline: string; key: StructuredSectionKey | null }

/**
 * Une ligne est-elle un en-tête de section ?
 *  - titre ATX (`## Objectif`) : toujours un en-tête (le key peut être null) ;
 *  - ligne entièrement en gras (`**Objectif :** …`) : en-tête si l'intitulé
 *    est reconnu, OU si c'est un intitulé de DÉTAIL déjà curaté par
 *    `detailKindOf` (sources, limites, méthode… — #3763.5, reste du lot J19 :
 *    Laura écrit ses sections EXPLICATIVES en gras, pas en ATX, et « Sources »
 *    doit s'y plier comme elle le fait déjà derrière un `##`) — sinon c'est
 *    une phrase en gras ordinaire, pas un titre (on n'invente pas de structure).
 */
function matchHeading(line: string): HeadingMatch | null {
  const atx = line.match(/^\s*#{1,6}\s+(.+?)\s*$/)
  if (atx) {
    const title = atx[1].trim()
    return { title, inline: '', key: recognizedKey(title) }
  }
  const bold = line.match(/^\s*\*\*\s*([^*]+?)\s*\*\*\s*:?\s*(.*)$/)
  if (bold) {
    const title = bold[1].trim()
    const key = recognizedKey(title)
    if (key) return { title, inline: bold[2].trim(), key }
    if (detailKindOf(title)) return { title, inline: bold[2].trim(), key: null }
  }
  return null
}

function trimBlankEdges(lines: string[]): string {
  return lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '').trim()
}

/**
 * Découpe une réponse markdown en préambule + sections. Retourne `null` (→ rendu
 * markdown à plat) quand AUCUNE section connue n'est présente : c'est le garde
 * anti-régression et anti-invention.
 */
export function parseStructuredReply(text: string): ParsedStructuredReply | null {
  const lines = (text ?? '').split('\n')
  const preambleLines: string[] = []
  const sections: { title: string; key: StructuredSectionKey | null; bodyLines: string[] }[] = []

  for (const line of lines) {
    const heading = matchHeading(line)
    if (heading) {
      sections.push({
        title: heading.title,
        key: heading.key,
        bodyLines: heading.inline ? [heading.inline] : [],
      })
      continue
    }
    if (sections.length === 0) {
      preambleLines.push(line)
    } else {
      sections[sections.length - 1].bodyLines.push(line)
    }
  }

  const recognized = sections.some(section => section.key !== null)
  if (sections.length === 0 || !recognized) return null

  return {
    preamble: trimBlankEdges(preambleLines),
    sections: sections.map(section => ({
      title: section.title,
      key: section.key,
      body: trimBlankEdges(section.bodyLines),
    })),
  }
}

/** #2429.9 — la version la plus récente d'un artefact modifié, par adresse (`envelope.artifacts`). */
export type ArtifactVersionOverrides = Readonly<Record<string, { version: number; block: ReplyBlock }>>

export function StructuredReply({
  text,
  messageId,
  artifactVersions,
  supersededCards,
}: {
  text: string
  messageId?: string
  artifactVersions?: ArtifactVersionOverrides
  /** #3769 — `messageId:cardId` des cartes actualisées plus bas dans le fil. */
  supersededCards?: ReadonlySet<string>
}) {
  // #4006 — une réserve écrite dans la carte n'est pas redite en prose dessous.
  const segments = dropRestatedBlockText(splitReplyBlocks(text))
  // #2429.1 — compté sur TOUT le message, avant le fractionnement en segments :
  // une section markdown dans le deuxième segment texte continue la numérotation
  // du premier, jamais remise à zéro par segment.
  const sectionRank = { current: 0 }
  // #3761.16 — la densité des pièces de `reply-kit` (MissingDataCard, et toute
  // pièce de la bibliothèque composée plus tard) se resserre sous 768 px, LA
  // MÊME borne que tout le dépôt (`useIsMobile`, GA-26). Sur un écran large,
  // on ne pose PAS de Provider : un appelant déjà dans un volet latéral
  // compact (`ReplyDensityProvider` posé plus haut) garde sa densité — en
  // poser un ici l'écraserait avec « comfortable » (un réglage vit à un seul
  // endroit, jamais deux Providers qui se disputent la même réponse).
  const isMobile = useIsMobile()
  const withDensity = (node: ReactNode) =>
    isMobile ? <ReplyDensityProvider density="compact">{node}</ReplyDensityProvider> : node
  // Sans carte : le rendu d'avant #1914, tel quel.
  if (segments.every(segment => segment.kind === 'text')) {
    return withDensity(<SectionedReply text={text} messageId={messageId} sectionRank={sectionRank} />)
  }
  // #2429.4 — CHAQUE bloc de CE message reçoit une adresse stable
  // (`message_id:rang`), dans l'ordre où le texte les écrit : le même ordre
  // que `buildChatReplyEnvelope` (côté API) donne à `envelope.artifacts`. Sans
  // `messageId` (l'amorce de Laura, jamais persistée) : aucune adresse, aucun
  // bouton — on n'adresse pas ce qui n'existe nulle part ailleurs.
  let blockRank = 0
  return withDensity(
    <div className="space-y-3">
      {segments.map((segment, index) => {
        const artifactId = segment.kind === 'block' && messageId ? chatArtifactId(messageId, blockRank++) : null
        return (
          <ReplySegmentView
            key={`${segment.kind}-${index}`}
            segment={segment}
            artifactId={artifactId}
            messageId={messageId}
            sectionRank={sectionRank}
            override={artifactId ? artifactVersions?.[artifactId] : undefined}
            superseded={
              segment.kind === 'block' &&
              segment.block.type === 'account_ranking' &&
              !!messageId &&
              !!segment.block.card_id &&
              !!supersededCards?.has(`${messageId}:${segment.block.card_id}`)
            }
          />
        )
      })}
    </div>,
  )
}

function ReplySegmentView({
  segment,
  artifactId,
  messageId,
  sectionRank,
  override,
  superseded,
}: {
  segment: ReplySegment
  artifactId: string | null
  messageId?: string
  sectionRank: { current: number }
  override?: { version: number; block: ReplyBlock }
  superseded?: boolean
}) {
  const { t } = useTranslation('chat')
  // #2429.9 — la version MONTRÉE : celle du serveur au chargement, puis celle qu'on vient d'écrire.
  const [saved, setSaved] = useState<{ version: number; block: ReplyBlock } | null>(null)
  switch (segment.kind) {
    case 'text':
      return <SectionedReply text={segment.text} messageId={messageId} sectionRank={sectionRank} />
    case 'block':
      // #3769 — la carte a été actualisée plus bas dans le fil : un renvoi, pas une seconde carte.
      if (superseded) {
        return (
          <div data-artifact-id={artifactId ?? undefined} data-superseded-card="true">
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('blocks.superseded')}
            </Text>
          </div>
        )
      }
      return (
        <div data-artifact-id={artifactId ?? undefined} className="relative">
          <ReplyBlockView block={(saved ?? override)?.block ?? segment.block} />
          {artifactId ? <CopyArtifactLinkButton artifactId={artifactId} /> : null}
          {artifactId ? (
            <ArtifactVersionBar
              artifactId={artifactId}
              block={(saved ?? override)?.block ?? segment.block}
              version={(saved ?? override)?.version ?? 1}
              onSaved={setSaved}
            />
          ) : null}
        </div>
      )
    case 'invalid': {
      // #3864.6 / #3903.7 — recette prod 09/10 : une forme de TABLEAU reconnue
      // dans un bloc refusé (`invalidBlockTableShape`) rend un vrai `<table>`,
      // jamais un bloc refusé aplati puce par puce — voir sa documentation.
      const table = invalidBlockTableShape(segment.value)
      if (table) return <InvalidTableFallback table={table} />
      // #1914.9 — un bloc refusé redevient ses propres textes : ni carte, ni JSON.
      const leaves = replyBlockLeaves(segment.value)
      return leaves.length ? <>{renderMarkdown(leaves.map(leaf => `- ${leaf}`).join('\n'))}</> : null
    }
    case 'unterminated':
      // Le flux écrit encore la carte : sa syntaxe ne s'affiche jamais.
      return (
        <Text size="sm" color="text-[var(--bellum-text-muted)]" className="italic">
          {t('blocks.preparing')}
        </Text>
      )
  }
}

/**
 * #3864.6 / #3903.7 — le TABLEAU d'un bloc `file_export` refusé par le
 * contrat strict, rendu comme la carte valide le ferait (`ExportTable`,
 * partagée avec `FileExportCard`, GA-26 : un seul rendu de tableau). Pas de
 * bouton de téléchargement ici : `filename` n'est pas garanti valide sur un
 * bloc refusé, et cette carte n'a qu'un rôle d'affichage.
 */
function InvalidTableFallback({ table }: { table: InvalidBlockTableShape }) {
  const { t } = useTranslation('chat')
  const title = table.title ?? t('blocks.kind.file_export')
  return (
    <ReplyCard type="file_export" title={title} icon={Download}>
      <ExportTable scrollLabel={title} columns={table.columns} rows={table.rows} />
    </ReplyCard>
  )
}

/**
 * #2429.4 / recette #2429 « partage interne » — copie un lien qui désigne CE
 * bloc, jamais un texte inventé : l'adresse est celle que `chatArtifactId`
 * calcule (message_id + rang), rien de plus. `MessagesArea` (`Chat.tsx`) lit
 * ce même hash au montage pour faire défiler jusqu'au bloc qu'il adresse.
 */
function CopyArtifactLinkButton({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation('chat')
  // Même patron que `CopyQuestion.tsx` (#2226) : icône seule (nom accessible
  // via `aria-label`, GA-32), confirmation brève (`useCopiedFlash`), et un
  // presse-papiers refusé le DIT plutôt que de prétendre avoir copié.
  const [copied, flashCopied] = useCopiedFlash(2000)

  async function copy() {
    try {
      const url = new URL(window.location.href)
      url.hash = `artifact=${encodeURIComponent(artifactId)}`
      await navigator.clipboard.writeText(url.toString())
      flashCopied()
      toast.success(t('blocks.linkCopied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('blocks.linkCopyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t('blocks.copyLink')}
      className="absolute right-1.5 top-1.5 flex items-center justify-center rounded p-1 text-[var(--bellum-text-muted)] transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
    </button>
  )
}

function SectionedReply({
  text,
  messageId,
  sectionRank,
}: {
  text: string
  messageId?: string
  sectionRank?: { current: number }
}) {
  const { t } = useTranslation('chat')
  const parsed = parseStructuredReply(text)
  if (!parsed) return <>{renderMarkdown(text)}</>
  // #5044 — Sources / Limites / Méthode / Contexte ne s'affichent plus dans le corps : leur texte est dans le
  // panneau Sources du pied (`extractReplyAside`). Revient sur #3763 (replis du corps) en gardant sa règle.
  const shown = parsed.sections.filter(section => section.key !== null || !detailKindOf(section.title))

  return (
    <div>
      {parsed.preamble ? <div className="mb-2">{renderMarkdown(parsed.preamble)}</div> : null}
      <div role="group" aria-label={t('structured.aria')} className="space-y-2">
        {shown.map((section, index) => {
          // #2429.1 — seule une section RECONNUE reçoit une adresse : une
          // section voisine non cataloguée (`key === null`) n'est pas une
          // carte, on n'invente pas de lien vers elle.
          const artifactId =
            section.key && messageId && sectionRank ? chatStructuredSectionId(messageId, sectionRank.current++) : null
          return <SectionCard key={`${section.title}-${index}`} section={section} artifactId={artifactId} />
        })}
      </div>
    </div>
  )
}

/**
 * #5044 — « Pourquoi » garde sa raison courte dans le corps ; la preuve qui suit est dans le panneau Sources du
 * pied (`extractReplyAside`), plus derrière un repli. Revient sur #3763 sans en perdre la règle : rien de critique
 * n'est caché, et « Ce qui manque », le verdict et la prochaine action restent entiers ici.
 */
function SectionBody({ section }: { section: StructuredSection }) {
  if (!section.body) return null
  const body = section.key === 'why' ? splitWhyForDisclosure(section.body).lead : section.body
  return <div className="text-sm text-[var(--bellum-text-secondary)]">{renderMarkdown(body)}</div>
}

function SectionCard({ section, artifactId }: { section: StructuredSection; artifactId: string | null }) {
  const Icon = section.key ? SECTION_ICON[section.key] : null
  return (
    <div
      data-structured-section
      data-artifact-id={artifactId ?? undefined}
      className="relative rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden /> : null}
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bellum-text-primary)]">
          {section.title}
        </span>
      </div>
      <SectionBody section={section} />
      {artifactId ? <CopyArtifactLinkButton artifactId={artifactId} /> : null}
    </div>
  )
}
