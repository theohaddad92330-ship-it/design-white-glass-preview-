import { useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle, Text, cn } from '@bellum/ui'
import { ChevronRight, Compass, X } from 'lucide-react'
import {
  overlayGroupLabelClassName,
  overlayHeadClassName,
  overlaySideClassName,
  overlayTitleClassName,
} from '@/components/layout/overlay'
import { useUserPermissions } from '@/lib/permissions'
import { GUIDE_REGISTRY, guideSessionFromDefinition } from './guide-registry'
import { orderGuidesByPersona } from './guide-persona-order'
import { routeMatches } from './guide-step-gate'
import { useGuideStore } from './guide-store'

/**
 * #2214.24 — LE CENTRE D'AIDE : les guides du registre, et le geste qui en lance un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS PAR GUIDE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * - l'écran du guide est l'écran où l'on est (ou le guide vaut partout) :
 *   « Lancer le guide » le démarre tout de suite ;
 * - l'écran est ailleurs mais s'ouvre sans paramètre : « Ouvrir l'écran et
 *   lancer » l'ouvre D'ABORD, puis démarre le guide. Démarré avant, chaque pas
 *   fermerait sa porte de route et sauterait en silence (#2212.32). Ouvrir
 *   l'écran est le geste de la personne, sur son clic : le guide, lui, ne
 *   navigue jamais (GA-371, #1787) ;
 * - l'écran demande un objet précis (un dossier compte) : aucun bouton, une
 *   phrase qui dit où aller. Deviner quel compte ouvrir serait prendre la main.
 *
 * La liste se lit sur `GUIDE_REGISTRY`, jamais recopiée (GA-26) : un guide
 * ajouté au registre apparaît ici sans rien toucher.
 */
export function GuideHelpCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['guide', 'common'])
  return (
    // Théo `dialog.t-side` + MAQ-SHELL `#lay-aide` (validé 19/10) : un tiroir de droite, un seul point d'entrée.
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className={overlaySideClassName}>
        <div className={cn(overlayHeadClassName, 'pr-3 md:pr-4')}>
          <SheetTitle className={cn(overlayTitleClassName, 'flex-1')}>{t('helpCenter.title')}</SheetTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('common:actions.close')}
            onClick={() => onOpenChange(false)}
            className="size-8 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[1.125rem] py-4 md:px-6">
          <SheetDescription className="text-sm leading-relaxed text-[var(--bellum-text-secondary)]">
            {t('helpCenter.description')}
          </SheetDescription>
          {/* La liste lit le routeur : elle n'est montée qu'une fois le tiroir
              ouvert, jamais au rendu de l'écran qui porte la porte d'entrée. */}
          {open ? <GuideHelpCenterList onClose={() => onOpenChange(false)} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function GuideHelpCenterList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('guide')
  const navigate = useNavigate()
  const pathname = useRouterState({ select: state => state.location.pathname })
  const start = useGuideStore(state => state.start)
  // #2214.17-.22 — le rôle CHANGE L'ORDRE du catalogue, jamais son contenu
  // (voir le docblock de `orderGuidesByPersona`) : `unknown`/`error` retombe
  // sur `role: undefined`, c'est-à-dire l'ordre du registre tel quel — le
  // doute n'interdit ni ne réordonne rien (même doctrine que `permissions.ts`).
  const access = useUserPermissions()
  const guides = useMemo(
    () => orderGuidesByPersona(GUIDE_REGISTRY, access.status === 'known' ? access.role : undefined, g => g.audience),
    [access],
  )

  const launch = async (definition: (typeof GUIDE_REGISTRY)[number], openScreenFirst: string | null) => {
    // La modale se ferme d'abord : elle recouvrirait précisément ce que le
    // halo doit montrer.
    onClose()
    if (openScreenFirst) await navigate({ to: openScreenFirst })
    start(guideSessionFromDefinition(definition))
  }

  const isHere = (definition: (typeof GUIDE_REGISTRY)[number]) => {
    const screen = definition.help.screen
    return screen !== null && routeMatches(screen.route, pathname)
  }
  // MAQ-SHELL `#lay-aide` : « Sur cet écran » d'abord, puis « Partout » — l'ordre du rôle tenu dans chaque groupe.
  const groups = [
    { key: 'here', label: t('helpCenter.groupHere'), items: guides.filter(isHere) },
    { key: 'everywhere', label: t('helpCenter.groupEverywhere'), items: guides.filter(g => !isHere(g)) },
  ].filter(group => group.items.length > 0)

  const rowClassName =
    'flex w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left transition-colors duration-immediate ease-bellum-out'

  return (
    <div className="mt-4 flex flex-col gap-4">
      {groups.map(group => (
        <section key={group.key} aria-label={group.label}>
          <h3 className={cn(overlayGroupLabelClassName, 'px-2.5')}>{group.label}</h3>
          <ul className="flex flex-col">
            {group.items.map(definition => {
              const screen = definition.help.screen
              const here = screen === null || routeMatches(screen.route, pathname)
              const end =
                screen === null
                  ? t('helpCenter.whereAnywhere')
                  : t('helpCenter.stepCount', { count: definition.steps.length })
              const body = (
                <>
                  <Compass aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                      {t(definition.help.titleKey)}
                    </Text>
                    <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t(definition.help.summaryKey)}
                    </Text>
                  </span>
                  <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
                    {end}
                  </Text>
                </>
              )
              return (
                <li
                  key={definition.id}
                  data-testid="guide-help-center-item"
                  className="border-t border-[var(--bellum-border)] first:border-t-0"
                >
                  <div data-testid={`guide-help-center-item-${definition.id}`}>
                    {here || screen.navigable ? (
                      // Théo `.menu-item` : la ligne entière est le geste, son verbe dit ce qu'elle fait.
                      <button
                        type="button"
                        onClick={() => void launch(definition, here ? null : screen.route)}
                        className={cn(
                          rowClassName,
                          'min-h-11 hover:bg-[var(--bellum-surface-2)] focus-visible:bg-[var(--bellum-surface-2)] focus-visible:outline-none',
                        )}
                      >
                        {body}
                        <span className="sr-only">{here ? t('helpCenter.launch') : t('helpCenter.openAndLaunch')}</span>
                        <span
                          aria-hidden="true"
                          className="hidden shrink-0 items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] sm:inline-flex"
                        >
                          {here ? t('helpCenter.launch') : t('helpCenter.openAndLaunch')}
                          <ChevronRight className="size-3.5" />
                        </span>
                      </button>
                    ) : (
                      <div className={cn(rowClassName, 'flex-wrap')}>
                        {body}
                        <Text element="p" size="xs" className="w-full pl-7 text-[var(--bellum-text-secondary)]">
                          {t('helpCenter.needsAccount')}
                        </Text>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
