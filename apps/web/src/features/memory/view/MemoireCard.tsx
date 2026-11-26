import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, CalendarClock, Lock, Pin, Users, X } from 'lucide-react'
import { defaultMemoryScope, memoryItemKinds, type MemoryItemKind, type MemoryScopeOffer } from '@bellum/contracts'
import { Badge, Button, Card, cn, SelectField, Text } from '@bellum/ui'
import { trackMemoryAdded } from '@/lib/product-tracker'
import { MEMORY_GESTURE_SCREEN } from '@/features/memory/memory-gesture-screen'
import { usePinnedFacts } from '@/features/memory/hooks/usePinnedFacts'
import { visibleMemoryItems } from '@/features/memory/lib/visible-memory-items'
import { useMemoryScopeOptions } from '@/features/memory/hooks/useMemoryScopeOptions'
import { usePinFact } from '@/features/memory/hooks/usePinFact'
import { useUnpinFact } from '@/features/memory/hooks/useUnpinFact'
import type { PinnedFact } from '@/features/memory/api'
import { endOfDayIso, formatMemoryDate } from '@/features/memory/lib/memory-dates'
import { MemoryScopeChoice } from '@/features/memory/view/MemoryScopeChoice'

/**
 * The copilot's durable "Mémoire" (Théo P2): the pinned facts it remembers +
 * a pin-a-fact affordance. Lives in the copilot context panel. When an account
 * is active, a newly pinned fact is scoped to it; otherwise it is workspace-global.
 *
 * L'objet MemoryItem complet (restitution V2 §20) : on épingle une NATURE (fait
 * / préférence / correction) et, si on veut, une ÉCHÉANCE (« valable jusqu'au …
 * »). Passée cette date, l'élément n'est plus injecté dans le contexte du
 * copilote — l'API ne le renvoie même plus. Sans choix explicite, l'épinglage
 * reste exactement ce qu'il était : un fait, sans échéance.
 *
 * `headless` : le panneau vit désormais dans une MODALE, qui porte déjà son
 * titre. Répéter « Ce que Bellum garde en tête » juste en dessous serait le
 * doublon que la loi 4 du tome 7 interdit — d'où un mode sans cadre ni entête,
 * plutôt qu'une deuxième copie du panneau qui aurait divergé au premier
 * changement.
 */
export function MemoireCard({
  accountId,
  conversationId = null,
  headless = false,
}: {
  accountId: string | null
  /**
   * #1918.5 — LE FIL OUVERT, quand cette carte est montée depuis un fil. Il
   * rend « cette conversation » proposable ET fait remonter les mémoires de ce
   * fil-là. `null` (Réglages › Mémoire) : la carte se comporte comme avant ce
   * lot — aucune mémoire de fil, aucune portée de fil offerte.
   */
  conversationId?: string | null
  headless?: boolean
}) {
  const { t } = useTranslation('knowledge')
  const { data: facts, isLoading, isError } = usePinnedFacts(accountId, conversationId)
  // #1918.2 / #1918.5 — les portées que CETTE carte a le droit de proposer.
  const scopeOptions = useMemoryScopeOptions(conversationId)
  const pin = usePinFact()
  const unpin = useUnpinFact()
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<MemoryItemKind>('fact')
  // `YYYY-MM-DD` tel que saisi dans le champ date — vide = pas d'échéance.
  const [until, setUntil] = useState('')
  // #1917.3 — la portée CHOISIE, ou `null` tant que la personne n'y a pas
  // touché : le défaut suit alors la nature et le compte (`defaultMemoryScope` —
  // « toi uniquement », sauf la correction d'un compte). Un choix explicite
  // n'est plus écrasé quand la nature change ensuite.
  const [scopeChoice, setScopeChoice] = useState<MemoryScopeOffer | null>(null)
  const scope: MemoryScopeOffer = scopeChoice ?? { scope: defaultMemoryScope({ kind, accountId }) }
  // L'API ne renvoie jamais un élément expiré, mais la liste est CACHÉE côté
  // client : un onglet resté ouvert peut la garder après l'échéance. On refiltre
  // donc à l'affichage, pour que la carte montre exactement ce que le copilote
  // lit.
  // #3775 (compteur) — la MÊME sélection pour le compteur de la barre et la liste du panneau.
  const visible = visibleMemoryItems(facts)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const fact = draft.trim()
    if (!fact || pin.isPending) return
    pin.mutate(
      {
        fact,
        accountId,
        kind,
        expiresAt: endOfDayIso(until),
        scope: scope.scope,
        // #1918.2 / #1918.5 — ce que la portée DÉSIGNE, porté par le choix
        // lui-même : le retrouver ailleurs serait une seconde source.
        businessUnitId: scope.businessUnitId ?? null,
        conversationId: scope.conversationId ?? null,
      },
      {
        onSuccess: () => {
          // #1946.11 — au SUCCÈS. Ni le fait, ni sa nature, ni sa portée : ce
          // panneau est monté depuis la barre du fil, donc l'écran est celui-là.
          trackMemoryAdded(MEMORY_GESTURE_SCREEN)
          setDraft('')
          setKind('fact')
          setUntil('')
          setScopeChoice(null)
        },
      },
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') submit()
  }

  return (
    <Shell headless={headless}>
      {!headless && (
        <>
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-[var(--bellum-text-accent)]" />
            <Text size="sm" weight="semibold">
              {t('memory.title')}
            </Text>
          </div>
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
            {t('memory.subtitle')}
          </Text>
        </>
      )}

      <form className="mt-3 space-y-1.5" onSubmit={submit}>
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('memory.pinPlaceholder')}
            aria-label={t('memory.pinInputAria')}
            className="h-8 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2.5 text-xs text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={t('memory.pinAria')}
            disabled={!draft.trim() || pin.isPending}
            isLoading={pin.isPending}
          >
            <Pin className="size-4" />
          </Button>
        </div>

        {/* La NATURE de ce qu'on épingle (V2 §20) : un constat, une façon de
            travailler, ou une correction imposée au copilote. Défaut « fait » =
            le comportement historique. */}
        <div className="flex items-center gap-1.5">
          <SelectField
            ariaLabel={t('memory.kindAria')}
            value={kind}
            onChange={next => setKind(next as MemoryItemKind)}
            options={memoryItemKinds.map(option => ({ value: option, label: t(`memory.kind.${option}`) }))}
            size="sm"
            className="min-w-0 flex-1"
          />
          {/* L'ÉCHÉANCE, optionnelle : « valable jusqu'au … ». Vide = sans
              échéance, comme avant. */}
          <input
            type="date"
            value={until}
            onChange={event => setUntil(event.target.value)}
            aria-label={t('memory.untilAria')}
            title={t('memory.untilAria')}
            className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 text-xs text-[var(--bellum-text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          />
        </div>

        {/* #1917.3 — POUR QUI, demandé avant d'épingler, avec qui pourra le voir. */}
        <MemoryScopeChoice options={scopeOptions} value={scope} onChange={setScopeChoice} />
      </form>

      <div className="mt-3 space-y-1.5">
        {isLoading ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('memory.unavailable')}
          </Text>
        ) : visible.length > 0 ? (
          visible.map(fact => (
            <FactRow key={fact.id} fact={fact} onUnpin={() => unpin.mutate(fact.id)} removing={unpin.isPending} />
          ))
        ) : (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('memory.empty')}
          </Text>
        )}
      </div>
    </Shell>
  )
}

/** Le cadre : une carte dans un rail, rien du tout dans une modale qui en a
 *  déjà un. Un seul composant pour les deux — deux copies auraient divergé. */
function Shell({ headless, children }: { headless: boolean; children: ReactNode }) {
  if (headless) return <div className="min-w-0">{children}</div>
  return <Card className="p-3">{children}</Card>
}

/**
 * Au-delà de cette longueur, un fait épinglé est REPLIÉ à deux lignes.
 *
 * Le seuil se compte en CARACTÈRES et non en pixels mesurés : une mesure prise
 * après le rendu ferait clignoter la liste au chargement, et ne vaudrait que
 * pour une largeur. Cent vingt caractères, c'est deux lignes pleines dans la
 * modale — en dessous, un « voir plus » ne masquerait rien et ne ferait
 * qu'ajouter un bouton.
 */
const CLAMP_AT_CHARS = 120

function FactRow({ fact, onUnpin, removing }: { fact: PinnedFact; onUnpin: () => void; removing: boolean }) {
  const { t, i18n } = useTranslation('knowledge')
  const until = formatUntil(fact.expiresAt, i18n.language)
  // #1962.22 — Réglages › Mémoire (`MemoryFactRow.tsx`) affiche déjà cette
  // date ; cette carte, dans le chat, ne l'affichait pas du tout. Toujours
  // montrée (contrairement aux badges plus haut) : une date d'enregistrement
  // n'a pas de valeur « par défaut » qui n'apprendrait rien.
  const recorded = formatMemoryDate(fact.createdAt, i18n.language)
  const [expanded, setExpanded] = useState(false)
  const clampable = fact.fact.length > CLAMP_AT_CHARS
  // #1918.1 — la portée se lit TOUJOURS (les deux valeurs disent quelque chose),
  // mais seulement quand l'API l'a rendue : une API plus ancienne que ce champ
  // ne produit aucun badge plutôt qu'une portée devinée.
  const scope = fact.scope === 'user' || fact.scope === 'workspace' ? fact.scope : null
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-[var(--bellum-border)] px-2.5 py-1.5',
        'bg-[var(--bellum-surface-1)]',
      )}
    >
      <Pin className="mt-0.5 size-3 shrink-0 text-[var(--bellum-text-accent)]" />
      <div className="min-w-0 flex-1">
        <Text
          size="xs"
          color="text-[var(--bellum-text-secondary)]"
          className={cn('break-words', clampable && !expanded && 'line-clamp-2')}
        >
          {fact.fact}
        </Text>
        {/* Le texte reste ENTIER dans le DOM — il est replié, jamais tronqué :
            un lecteur d'écran lit le fait complet, et « voir plus » ne va rien
            rechercher. */}
        {clampable && (
          <button
            type="button"
            onClick={() => setExpanded(current => !current)}
            className="mt-0.5 rounded text-xs font-medium text-[var(--bellum-text-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          >
            {expanded ? t('memory.less') : t('memory.more')}
          </button>
        )}
        {/* On ne montre que ce qui DIT quelque chose : la nature par défaut
            (« fait ») et l'origine par défaut (« à la main ») n'ajoutent rien,
            donc pas de badge. Aucune valeur devinée n'est affichée. */}
        {(fact.kind !== 'fact' || fact.origin !== 'manual' || until || scope) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {scope && (
              <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
                {scope === 'user' ? (
                  <Lock className="size-2.5" aria-hidden="true" />
                ) : (
                  <Users className="size-2.5" aria-hidden="true" />
                )}
                {t(`memory.scope.${scope}`)}
              </Badge>
            )}
            {fact.kind !== 'fact' && (
              <Badge variant="outline" className="text-xs">
                {t(`memory.kind.${fact.kind}`)}
              </Badge>
            )}
            {fact.origin !== 'manual' && (
              <Badge variant="outline" className="text-xs">
                {/* Q1 (13/09) — une note de Laura confirmée par une personne n'est
                    plus « à vérifier ». Le prénom du confirmateur vit sur Réglages ›
                    Mémoire : cette carte lit la liste du contexte, sans identité. */}
                {t(
                  fact.origin === 'copilot' && fact.confirmedAt
                    ? 'memory.origin.copilotConfirmed'
                    : `memory.origin.${fact.origin}`,
                )}
              </Badge>
            )}
            {until && (
              <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
                <CalendarClock className="size-2.5" aria-hidden="true" />
                {t('memory.until', { date: until })}
              </Badge>
            )}
          </div>
        )}
        {recorded && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('memory.recordedAt', { date: recorded })}
          </Text>
        )}
      </div>
      {/* #1918.7 — un élément PARTAGÉ ne se retire que par son auteur ou un
          manager : la croix n'apparaît que si le serveur dit `canForget` (et
          reste là quand une API plus ancienne ne le dit pas — le serveur est
          la vraie garde). Absente plutôt que grisée : un bouton désactivé sans
          explication laisse croire à un droit qu'on n'a pas. */}
      {fact.canForget !== false && (
        <button
          type="button"
          onClick={onUnpin}
          disabled={removing}
          aria-label={t('memory.removeAria')}
          className="shrink-0 rounded p-0.5 text-[var(--bellum-text-muted)] outline-none transition-colors hover:text-[var(--danger-soft-text)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:cursor-not-allowed"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Échéance ISO → date courte localisée. `null` si absente ou illisible. */
function formatUntil(iso: string | null, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
