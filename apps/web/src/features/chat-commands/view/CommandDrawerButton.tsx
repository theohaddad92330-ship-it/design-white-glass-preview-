import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { COMMAND_MOMENTS, commandReads } from '@bellum/contracts'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { useCommandLibrary, type LibraryCommand } from '../api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SearchEmptyState,
  Text,
} from '@bellum/ui'

/**
 * LE CATALOGUE DES COMMANDES, DANS LA CONVERSATION — #1321.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL A DÉMÉNAGÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Ton retour : « en faire une page séparée pleine de grandes cartes crée une
 * rupture avec la conversation et donne l'impression d'une bibliothèque de
 * formulaires ». Et le risque de fond, que tu nommes toi-même : « une deuxième
 * interface concurrente » — deux endroits où demander la même chose à Laura.
 *
 * Le catalogue ne change pas. Il change d'ENDROIT : un tiroir ouvert depuis la
 * ligne d'outils du composer, là où l'on est déjà en train d'écrire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL PRÉ-REMPLIT, IL N'ENVOIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * #1321.4 : « Ne pas envoyer aveuglément une commande en un clic. Si la
 * commande nécessite de savoir quel compte, quel besoin ou quelle mission,
 * demander d'abord l'objet ou préremplir le message. »
 *
 * ⚠️ Le catalogue ne dit PAS quelles commandes ont besoin d'un objet :
 * `CommandDefinition` porte `requires`, qui liste les connecteurs, pas les
 * objets métier. Distinguer commande par commande serait deviner. On
 * pré-remplit donc TOUJOURS : la question arrive dans le composer, tu la lis,
 * tu la complètes si besoin, et c'est toi qui envoies. C'est aussi la doctrine —
 * le copilote prépare, le commercial envoie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE COMMANDE INDISPONIBLE RESTE VISIBLE
 * ─────────────────────────────────────────────────────────────────────────
 * Avec le nom de ce qui manque. La cacher ferait croire qu'elle n'existe pas ;
 * l'afficher comme prête ferait cliquer sur un mur. On dégrade, on ne ferme pas.
 * Et c'est la CAPACITÉ qui est nommée (« ton agenda »), jamais l'éditeur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1913 — DÉCOUVRIR DES USAGES, PAS UN INVENTAIRE D'OUTILS
 * ─────────────────────────────────────────────────────────────────────────
 * Le tiroir s'ouvre sur les MOMENTS MÉTIER (« Commencer ma journée »,
 * « Préparer un rendez-vous »…). Le rangement n'est pas décidé ici : chaque
 * commande porte son `moment` dans le catalogue serveur, et l'ordre des
 * moments vit dans le contrat. Un moment sans commande ne s'affiche pas — on
 * n'en invente pas pour le remplir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #5043 — « IDÉES DE DEMANDES » : UNE LISTE, UN APERÇU (Laura V8)
 * ─────────────────────────────────────────────────────────────────────────
 * Forme de la maquette, fonction gardée : on PARCOURT à gauche (libellé + début
 * de la demande), on LIT à droite (demande entière, ce qu'on obtient, les
 * données, l'état RÉEL des connexions), on PRÉPARE dans un pied fixe. La vue
 * « Par domaine » et sa bascule sont parties (décision de Louis, 31/10) ; sans
 * `moment` côté API (déploiement), la liste reste plate sous « Tout ».
 * Mobile = la borne GA-28 (768 px), pas les 680 px de la maquette : deux vues,
 * la liste puis l'aperçu, et le retour rend filtre, recherche, sélection et
 * défilement.
 */
export function CommandDrawerButton({
  onPick,
  disabled,
  open: openProp,
  onOpenChange,
  hideTrigger,
  draft,
  onRestore,
}: {
  onPick: (prompt: string) => void
  disabled?: boolean
  /**
   * #2522 — contrôlé depuis l'extérieur : le lien « Voir tout » de la ligne
   * d'amorces ouvre CE MÊME tiroir plutôt que de recopier un catalogue (loi 4
   * du tome 7). Non fourni = comportement d'avant, état interne au bouton.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * #3774.2.1 — tait le déclencheur PROPRE à ce composant quand un AUTRE
   * déclencheur visible ouvre déjà ce même tiroir (« Voir tout », quand des
   * amorces existent) : deux boutons vers le même geste, visibles en même
   * temps, sont la redondance que le lot J30 laissait « reste ». Le `Dialog`
   * reste MONTÉ et piloté par `open`/`onOpenChange` — un autre chemin (celui
   * qui reste visible) l'ouvre toujours.
   */
  hideTrigger?: boolean
  /**
   * #5043 — la saisie en cours et le geste qui la rend. Préparer REMPLACE la
   * saisie : si elle contenait du texte, un toast « Annuler » le rend.
   */
  draft?: string
  onRestore?: (previous: string) => void
}) {
  const { t, i18n } = useTranslation('chatCommands')
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [query, setQuery] = useState('')
  // #5043 — `'all'` = « Tout » ; sinon un moment du contrat.
  const [moment, setMoment] = useState<'all' | (typeof COMMAND_MOMENTS)[number]>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // #5043 — mobile : la vue affichée. Sur écran large, les deux sont toujours là.
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const { data, isLoading, isError } = useCommandLibrary()
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const isMobile = useIsMobile()
  const previewId = 'request-catalog-preview'
  const introId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)

  // #1913.14 — ⚠️ Pendant un déploiement, le front neuf peut lire une API qui ne
  // porte pas encore `moment`. #5043 : la liste reste alors PLATE sous « Tout »
  // (aucune puce) — jamais un catalogue vide qui se lirait « Laura ne sait rien faire ».
  const catalog = data ?? []
  const servesMoments = catalog.some(command => COMMAND_MOMENTS.includes(command.moment))
  const activeMoment = servesMoments ? moment : 'all'

  // #5043 — rouvrir commence par la liste (mobile) ; filtre et sélection restent.
  useEffect(() => {
    if (open) setMobileView('list')
  }, [open])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return catalog.filter(
      command =>
        (activeMoment === 'all' || command.moment === activeMoment) &&
        (!needle ||
          [command.label[locale], command.prompt[locale], command.outcome?.[locale] ?? ''].some(text =>
            text.toLowerCase().includes(needle),
          )),
    )
  }, [catalog, query, locale, activeMoment])

  const groups = useMemo(() => {
    if (!servesMoments) return [{ id: 'all', title: '', commands: matches }]
    return COMMAND_MOMENTS.map(id => ({
      id,
      title: t(`moments.${id}`),
      commands: matches.filter(command => command.moment === id),
    })).filter(group => group.commands.length > 0)
  }, [matches, servesMoments, t])

  const chips = useMemo(
    () =>
      COMMAND_MOMENTS.map(id => ({ id, count: catalog.filter(command => command.moment === id).length })).filter(
        chip => chip.count > 0,
      ),
    [catalog],
  )

  // Une seule demande sélectionnée : celle choisie si elle est encore listée, sinon la première.
  const selected = matches.find(command => command.key === selectedKey) ?? matches[0] ?? null

  /** #5043 — un filtre ou une recherche NOUVEAUX ramènent au début de leurs résultats. */
  const resetPosition = () => {
    savedScroll.current = 0
    if (listRef.current) listRef.current.scrollTop = 0
    setSelectedKey(null)
    setMobileView('list')
  }

  const choose = (key: string) => {
    if (listRef.current) savedScroll.current = listRef.current.scrollTop
    setSelectedKey(key)
    if (isMobile) setMobileView('detail')
  }

  const backToList = () => {
    setMobileView('list')
    // La liste est `hidden` pendant l'aperçu : on rend la position une fois visible.
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = savedScroll.current
      document.getElementById(`request-choice-${selected?.key}`)?.focus({ preventScroll: true })
    })
  }

  // #5043 — Préparer insère SANS envoyer ; si la saisie contenait du texte, « Annuler » le rend.
  const prepare = (command: LibraryCommand) => {
    const previous = draft ?? ''
    onPick(command.prompt[locale])
    if (previous.trim() && onRestore) {
      toast(t('drawer.undoMessage'), {
        duration: TOAST_SUCCESS_MS,
        action: { label: t('drawer.undoAction'), onClick: () => onRestore(previous) },
      })
    }
    setOpen(false)
  }

  const showList = !isMobile || mobileView === 'list'
  const showPreview = !isMobile || mobileView === 'detail'
  const browsing = !isLoading && !isError && matches.length > 0

  return (
    <>
      {/* #3709 (recette 07/10) — même traitement que « Outils et sources » dans la même
          rangée (`ToolsSourcesMenu.tsx`) : sous `sm`, le libellé entier débordait de la
          rangée `flex-nowrap` et passait par-dessus le sélecteur de profondeur voisin
          (#chat-research-mode), qui devenait inatteignable au doigt à 360 px. L'icône
          seule tient ; le nom accessible survit par `aria-label` (GA-32). */}
      {hideTrigger ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-label={t('drawer.trigger')}
          className="min-h-11 min-w-11 shrink-0 gap-1.5 text-[var(--bellum-text-secondary)]"
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden whitespace-nowrap sm:inline">{t('drawer.trigger')}</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t('common:actions.close')}
          className="flex h-[85dvh] max-h-[85dvh] flex-col gap-3 overflow-hidden sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>{t('drawer.title')}</DialogTitle>
            <DialogDescription>{t('drawer.description')}</DialogDescription>
          </DialogHeader>

          {/* #1913.13 — ⚠️ Refusé : « ce que les utilisateurs demandent le plus ». Un
              classement de popularité est une mesure d'usage (doctrine c64). Cette
              phrase est ÉDITORIALE : aucun chiffre, aucun « le plus demandé ». */}
          <Text id={introId} size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('drawer.intro')}
          </Text>

          {/* #5043 — recherche à CONTOUR UNIQUE : l'enveloppe porte l'anneau de focus,
              le champ n'a aucun contour propre. */}
          <label className="flex items-center gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 focus-within:ring-2 focus-within:ring-[var(--bellum-primary-500)] pointer-coarse:min-h-11">
            <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                resetPosition()
              }}
              placeholder={t('drawer.searchPlaceholder')}
              aria-label={t('drawer.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            />
          </label>

          {servesMoments ? (
            <div role="group" aria-label={t('drawer.momentsLabel')} className="flex flex-wrap gap-1.5">
              <MomentChip
                label={t('drawer.all')}
                count={catalog.length}
                pressed={activeMoment === 'all'}
                onClick={() => {
                  setMoment('all')
                  resetPosition()
                }}
              />
              {chips.map(chip => (
                <MomentChip
                  key={chip.id}
                  label={t(`momentsShort.${chip.id}`)}
                  count={chip.count}
                  pressed={activeMoment === chip.id}
                  onClick={() => {
                    setMoment(chip.id)
                    resetPosition()
                  }}
                />
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <SearchEmptyState title={t('states.loadingTitle')} description={t('states.loadingBody')} />
          ) : null}
          {isError ? (
            <SearchEmptyState title={t('states.errorTitle')} description={t('states.errorDescription')} />
          ) : null}
          {!isLoading && !isError && matches.length === 0 ? (
            <>
              <p role="status" className="sr-only">
                {t('drawer.count', { count: 0, total: catalog.length })}
              </p>
              <SearchEmptyState
                title={t('states.emptyTitle')}
                description={t('states.emptyDescription')}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setMoment('all')
                      resetPosition()
                    }}
                  >
                    {t('states.resetAll')}
                  </Button>
                }
              />
            </>
          ) : null}

          {browsing ? (
            <>
              <p role="status" className="text-xs text-[var(--bellum-text-muted)]">
                {t('drawer.count', { count: matches.length, total: catalog.length })}
              </p>
              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <div
                  ref={listRef}
                  hidden={!showList}
                  role="group"
                  aria-label={t('drawer.listLabel')}
                  className="min-h-0 space-y-3 overflow-y-auto pr-1"
                >
                  {groups.map(group => (
                    <div key={group.id} className="space-y-1">
                      {group.title ? (
                        <Text element="h3" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                          {group.title}
                        </Text>
                      ) : null}
                      <ul className="space-y-1">
                        {group.commands.map(command => (
                          <RequestRow
                            key={command.key}
                            command={command}
                            locale={locale}
                            selected={selected?.key === command.key}
                            previewId={previewId}
                            onChoose={() => choose(command.key)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <section
                  id={previewId}
                  hidden={!showPreview}
                  aria-label={t('drawer.previewLabel')}
                  className="flex min-h-0 flex-col rounded-md border border-[var(--bellum-border)]"
                >
                  {selected ? (
                    <RequestPreview
                      command={selected}
                      locale={locale}
                      showBack={isMobile}
                      onBack={backToList}
                      onPrepare={() => prepare(selected)}
                    />
                  ) : null}
                </section>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** #5043 — une puce de moment : libellé court + compteur discret. */
function MomentChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string
  count: number
  pressed: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'secondary' : 'ghost'}
      aria-pressed={pressed}
      onClick={onClick}
      className="gap-1.5 pointer-coarse:min-h-11"
    >
      {label}
      <span className="text-[var(--bellum-text-muted)]">{count}</span>
    </Button>
  )
}

/**
 * #5043 — une ligne de la liste : libellé + début de la demande (le texte actuel
 * tronqué — pas de champ `snippet` neuf). Une demande indisponible reste
 * visible et sélectionnable (pour lire ce qui manque), grisée ; elle ne se
 * prépare pas, c'est l'aperçu qui le refuse.
 */
function RequestRow({
  command,
  locale,
  selected,
  previewId,
  onChoose,
}: {
  command: LibraryCommand
  locale: 'fr' | 'en'
  selected: boolean
  previewId: string
  onChoose: () => void
}) {
  const { t } = useTranslation('chatCommands')
  const unavailable = command.availability.state === 'unavailable'
  return (
    <li>
      <button
        type="button"
        id={`request-choice-${command.key}`}
        aria-pressed={selected}
        aria-controls={previewId}
        onClick={onChoose}
        className={`flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] pointer-coarse:min-h-11 ${selected ? 'border-[var(--bellum-primary-400)] bg-[var(--bellum-surface-2)]' : 'border-transparent'} ${unavailable ? 'opacity-60' : ''}`}
      >
        <Text element="span" size="sm" weight="medium">
          {command.label[locale]}
        </Text>
        <Text element="span" size="xs" className="line-clamp-2 text-[var(--bellum-text-muted)]">
          {command.prompt[locale]}
        </Text>
        {unavailable ? (
          <Text element="span" size="xs" className="text-[var(--warning-soft-text)]">
            {t('states.unavailable')}
          </Text>
        ) : null}
      </button>
    </li>
  )
}

/**
 * #5043 — l'aperçu : la demande entière en citation, ce qu'on obtient, les
 * données, l'état RÉEL de disponibilité (jamais seulement les connexions
 * requises), et un pied fixe qui prépare. La CAPACITÉ est nommée (« ton
 * agenda »), jamais l'éditeur.
 */
function RequestPreview({
  command,
  locale,
  showBack,
  onBack,
  onPrepare,
}: {
  command: LibraryCommand
  locale: 'fr' | 'en'
  showBack: boolean
  onBack: () => void
  onPrepare: () => void
}) {
  const { t } = useTranslation('chatCommands')
  const { state, missing } = command.availability
  // #1913.11 — `null` = une donnée INCONNUE : le champ se tait.
  const reads = commandReads(command)
  const stateLabel = state === 'ready' ? t('card.ready') : t(`states.${state}`)

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 gap-1.5 pointer-coarse:min-h-11"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('drawer.back')}
          </Button>
        ) : null}
        <Text element="h3" size="sm" weight="medium">
          {command.label[locale]}
        </Text>
        <blockquote className="border-l border-[var(--bellum-border)] pl-3 text-sm">
          {command.prompt[locale]}
        </blockquote>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {command.outcome ? <PreviewField term={t('card.outcome')}>{command.outcome[locale]}</PreviewField> : null}
          {reads && reads.length > 0 ? (
            <PreviewField term={t('card.data')}>
              {reads.map(source => t(`dataSources.${source}`)).join(', ')}
            </PreviewField>
          ) : null}
          <PreviewField term={t('card.availability')}>
            <span className={state === 'ready' ? undefined : 'text-[var(--warning-soft-text)]'}>{stateLabel}</span>
          </PreviewField>
          <PreviewField term={t('card.connection')}>
            {state !== 'ready' ? (
              <span className="text-[var(--warning-soft-text)]">
                {t('card.missing', { tools: missing.map(family => t(`families.${family}`)).join(', ') })}
              </span>
            ) : command.requires.length > 0 ? (
              command.requires.map(family => t(`families.${family}`)).join(', ')
            ) : (
              t('card.noConnection')
            )}
          </PreviewField>
        </dl>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[var(--bellum-border)] p-3">
        <Button
          type="button"
          onClick={onPrepare}
          disabled={state === 'unavailable'}
          className="pointer-coarse:min-h-11"
        >
          {t('drawer.prepare')}
        </Button>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('drawer.editHint')}
        </Text>
      </div>
    </>
  )
}

function PreviewField({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-[var(--bellum-text-muted)]">{term}</dt>
      <dd className="min-w-0 text-[var(--bellum-text-secondary)]">{children}</dd>
    </div>
  )
}
