import { APPLICATION_SECTORS, sectorCodesForGroup, type ApplicationSectorGroup } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SECTOR_GROUP_ORDER,
  applicationSectorLabel,
  MAX_SEARCH_SECTORS,
  groupAddPreview,
  groupSelectionState,
  sectorsForGroupToggle,
} from '@/features/discover/lib/discover-sectors'
import { ToggleChip } from './filter-controls'

/**
 * Le choix du secteur, à DEUX niveaux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX NIVEAUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Découvrir proposait dix pastilles plates qui étaient en réalité les dix
 * GROUPES du vocabulaire partagé. Conséquence vue sur un compte réel le
 * 04/09/2026 : la cible avait « Aéronautique & Défense » en secteur prioritaire
 * et ne pouvait le cocher NULLE PART — le vocabulaire partagé les sépare, parce
 * que ce sont « des cycles, des habilitations et des acheteurs différents ».
 *
 * À plat, les 41 secteurs auraient rempli l'écran et fait perdre le geste
 * « tout l'industrie » en un clic. Le groupe reste donc cochable d'un coup, et
 * se DÉPLIE pour ceux qui veulent viser juste.
 *
 * ⚠️ Le chevron et la pastille sont DEUX boutons distincts : replier un groupe
 * ne doit pas modifier la sélection, et cocher un groupe ne doit pas le replier
 * sous les doigts de celui qui vient de l'ouvrir.
 *
 * #2506 (17/09/2026) — « pour les secteurs par exemple c'est ni fait ni à
 * faire, c'est illisible ». Deux ajouts, la grille de groupes ne change pas :
 *   1. une RECHERCHE qui filtre aux groupes ayant une correspondance et les
 *      déplie automatiquement — plus besoin de parcourir dix groupes fermés
 *      pour trouver un secteur précis ;
 *   2. les secteurs déjà choisis se retrouvent en PASTILLES RETIRABLES
 *      au-dessus de la liste, lisibles sans rouvrir chaque groupe.
 * La recherche compare en minuscules SANS `i18n.language` (évite une
 * dépendance à la langue active pour une simple sous-chaîne, et garde le test
 * de colonnes — qui ne fournit pas `i18n` dans son mock — silencieux tant
 * qu'aucune recherche n'est tapée).
 */
export function SectorPicker({
  selected,
  onChange,
  tone = 'include',
  layout = 'groups',
}: {
  selected: readonly string[]
  onChange: (sectors: string[]) => void
  /** #4301.1 — `exclude` : les secteurs EXCLUS se voient autrement que les inclus. */
  tone?: 'include' | 'exclude'
  /**
   * #4494 (maquette V22, « Secteurs à inclure ») — `families` : une carte par famille, ses secteurs en cases à
   * cocher et « Tout choisir » ; la recherche, le plafond et les pastilles restent ceux du sélecteur.
   */
  layout?: 'groups' | 'families'
}) {
  const { t, i18n } = useTranslation(['discover', 'common'])
  const [expanded, setExpanded] = useState<ApplicationSectorGroup[]>([])
  const [search, setSearch] = useState('')

  const toggleExpanded = (group: ApplicationSectorGroup) =>
    setExpanded(current => (current.includes(group) ? current.filter(g => g !== group) : [...current, group]))

  // #3815.3 — à 5/5, les cases non cochées sont DÉSACTIVÉES avant tout clic
  // (`ToggleChip` : aria-disabled + `title`), au lieu d'un clic qui part puis
  // se fait refuser. Retirer un secteur reste permis à 5/5 — seul l'AJOUT l'est plus.
  const atCap = selected.length >= MAX_SEARCH_SECTORS
  const capReachedHint = t('rail.sectorCapHint', { max: MAX_SEARCH_SECTORS })

  // #3815 — « clic sur secteur refusé alors que le compteur affiche 3/5 » :
  // cocher un groupe plus grand que la place restante AJOUTE maintenant ce qui
  // tient et NOMME ici ce qui n'a pas tenu, au lieu d'un refus muet en bloc.
  // #3815 (recette prod 08/10) — « 6 sous-secteurs non ajoutés » ne NOMMAIT
  // que le compte : les codes voyagent désormais avec lui pour être traduits
  // et LISTÉS, pas seulement comptés.
  const [groupCapDrop, setGroupCapDrop] = useState<{ count: number; codes: string[] } | null>(null)

  const applySelection = (next: string[]) => {
    setGroupCapDrop(null)
    onChange(next)
  }

  const toggleSector = (code: string) =>
    applySelection(selected.includes(code) ? selected.filter(value => value !== code) : [...selected, code])

  const removeSector = (code: string) => applySelection(selected.filter(value => value !== code))

  const toggleGroup = (group: ApplicationSectorGroup) => {
    const { sectors: next, droppedCount, droppedCodes } = sectorsForGroupToggle(selected, group)
    setGroupCapDrop(droppedCount > 0 ? { count: droppedCount, codes: droppedCodes } : null)
    onChange(next)
  }

  const normalizedSearch = search.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-3">
      {/* #2506 — recherche dans la liste : plus court que parcourir dix
          groupes fermés pour trouver un secteur précis. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
          style={{ color: 'var(--text-ghost)' }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label={t('rail.sectorSearchLabel')}
          placeholder={t('rail.sectorSearchPlaceholder')}
          className="h-9 w-full rounded-md py-1.5 pl-8 pr-3 text-xs transition-colors focus:outline-none"
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--bg-glass-border)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* #2506 — les secteurs choisis, en pastilles RETIRABLES : lisibles sans
          rouvrir chaque groupe pour vérifier ce qui est coché. */}
      {selected.length > 0 ? (
        <p data-testid="sector-cap-counter" className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {t('rail.sectorCapCounter', { count: selected.length, max: MAX_SEARCH_SECTORS })}
          {/* KEVIN-FIX K.5 — la place qui reste se dit avant le clic, pas seulement à 5/5. */}
          <span data-testid="sector-room-left">
            {' · '}
            {atCap
              ? t('rail.sectorRoomNone')
              : t('rail.sectorRoomLeft', { count: Math.max(0, MAX_SEARCH_SECTORS - selected.length) })}
          </span>
        </p>
      ) : null}
      {/* #3815 — ce qu'un clic sur un GROUPE n'a pas pu faire entrer sous le
          plafond, NOMMÉ ici plutôt qu'un refus muet en bloc. #3815 (recette
          prod 08/10) — le compte seul ne nomme rien : les libellés des
          sous-secteurs écartés suivent, dans la même phrase. */}
      {groupCapDrop !== null ? (
        <p
          data-testid="sector-group-cap-hint"
          role="status"
          className="text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('rail.sectorGroupCapHint', {
            count: groupCapDrop.count,
            max: MAX_SEARCH_SECTORS,
            names: groupCapDrop.codes.map(code => applicationSectorLabel(code, i18n.language)).join(', '),
          })}
        </p>
      ) : null}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t('rail.sectorSelectedLabel')}>
          {selected.map(code => {
            const label = applicationSectorLabel(code, i18n.language)
            return (
              <button
                key={code}
                type="button"
                onClick={() => removeSector(code)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11 hover:opacity-80"
                style={{
                  background: 'var(--accent-soft-bg)',
                  border: '1px solid var(--accent-soft-border)',
                  color: 'var(--accent-soft-text)',
                }}
              >
                {label}
                <X className="size-3" aria-hidden="true" />
                <span className="sr-only">{t('rail.sectorRemove', { sector: label })}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {layout === 'families' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3">
          {SECTOR_GROUP_ORDER.map(group => {
            const state = groupSelectionState(selected, group)
            const groupLabel = t(`common:sectorGroups.${group}`, { defaultValue: group })
            const groupSectors = APPLICATION_SECTORS.filter(sector => sector.group === group)
            const visibleSectors = normalizedSearch
              ? groupSectors.filter(sector =>
                  applicationSectorLabel(sector.code, i18n.language).toLowerCase().includes(normalizedSearch),
                )
              : groupSectors
            const groupMatches = normalizedSearch ? groupLabel.toLowerCase().includes(normalizedSearch) : true
            if (normalizedSearch && visibleSectors.length === 0 && !groupMatches) return null
            return (
              <section
                key={group}
                aria-label={groupLabel}
                data-testid={`sector-family-${group}`}
                className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-sm font-semibold text-[var(--bellum-text-primary)]">{groupLabel}</h5>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    disabled={atCap && state !== 'all'}
                    title={atCap && state !== 'all' ? capReachedHint : undefined}
                    aria-label={t(state === 'all' ? 'rail.sectorGroupNoneAria' : 'rail.sectorGroupAllAria', {
                      group: groupLabel,
                    })}
                    className="min-h-11 shrink-0 px-1 text-xs font-medium text-[var(--bellum-text-accent)] disabled:opacity-50"
                  >
                    {t(state === 'all' ? 'rail.sectorGroupNone' : 'rail.sectorGroupAll')}
                  </button>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {visibleSectors.map(sector => {
                    const checked = selected.includes(sector.code)
                    const blocked = atCap && !checked
                    return (
                      <li key={sector.code}>
                        <label
                          title={blocked ? capReachedHint : undefined}
                          className={cn(
                            'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors',
                            checked
                              ? tone === 'exclude'
                                ? 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--bellum-text-primary)]'
                                : 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-primary)]'
                              : 'border-[var(--bellum-border)] text-[var(--bellum-text-primary)] hover:border-[var(--bellum-text-muted)]',
                            blocked && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={blocked}
                            onChange={() => toggleSector(sector.code)}
                            className="size-4 shrink-0"
                          />
                          {applicationSectorLabel(sector.code, i18n.language)}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <>
          {/* #2466 — les groupes de secteurs sur PLUSIEURS colonnes en large, pas un
          empilement. Retour bêta du 16/09/2026 : « mettre sur trois colonnes, ça
          prend bcp trop de hauteur » — mesuré à 372 px de haut sur 847 de large,
          c'est-à-dire une colonne de texte dans un écran qui en tenait trois.
          #2652 — CE `sm:grid-cols-2 lg:grid-cols-3` posait son compte de
          colonnes sur la largeur de la FENÊTRE, alors que cette grille vit
          DANS `Group()` (`FilterRail.tsx`), qui divise déjà la modale sur ce
          même signal : à `lg`, une puce héritait d'~65 px, un mot par ligne.
          `auto-fit`/`minmax` mesure la largeur RÉELLE de la cellule reçue,
          quel que soit ce qui la contient — la garde `une-colonne-se-mesure-
          a-son-conteneur.test.ts` (GA-373) refuse qu'un palier de fenêtre
          revienne ici. Elle retombe à UNE colonne sous 200 px, parce qu'en
          mobile la hauteur se défile et la largeur ne se partage pas. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
            {SECTOR_GROUP_ORDER.map(group => {
              const state = groupSelectionState(selected, group)
              const members = sectorCodesForGroup(group)
              const picked = members.filter(code => selected.includes(code)).length
              // Les libellés de groupe vivent dans `common` — ils étaient recopiés dans
              // `projects.json` ET `profile.json`, soit trois listes à tenir à jour.
              const groupLabel = t(`common:sectorGroups.${group}`, { defaultValue: group })
              const groupSectors = APPLICATION_SECTORS.filter(sector => sector.group === group)
              // KEVIN-FIX K.5 — ce que le clic fera, dit AVANT : un groupe plus gros que la place restante annonce
              // « +N/M » et le plafond, au lieu de saturer en silence.
              const preview = state === 'all' ? null : groupAddPreview(selected, group)
              const announce = preview !== null && preview.missing > 0 && preview.room > 0 ? preview : null

              // #2506 — la recherche ne touche `i18n.language` QUE si elle est
              // non vide : à vide, ce bloc rend le groupe complet, comme avant.
              const visibleSectors = normalizedSearch
                ? groupSectors.filter(sector =>
                    applicationSectorLabel(sector.code, i18n.language).toLowerCase().includes(normalizedSearch),
                  )
                : groupSectors
              const groupMatches = normalizedSearch ? groupLabel.toLowerCase().includes(normalizedSearch) : true
              if (normalizedSearch && visibleSectors.length === 0 && !groupMatches) return null

              const open = normalizedSearch ? visibleSectors.length > 0 : expanded.includes(group)

              return (
                // #2652.1 — un groupe OUVERT (dépli manuel ou auto par la
                // recherche) prend toute la largeur de la grille : confiné à son
                // tiers de colonne, sa liste de secteurs s'empilait en une
                // colonne de texte étroite et dense — le motif même que #2466
                // avait corrigé pour la grille, jamais propagé à son contenu
                // déplié.
                // #2652 — `col-span-full` plutôt que `sm:col-span-2 lg:col-span-3` :
                // la grille ne compte plus ses colonnes sur un palier de fenêtre
                // fixe (auto-fit), donc un span fixe n'aurait plus de sens — «
                // toute la largeur » se dit à n'importe quel nombre de colonnes.
                <div key={group} className={cn('flex flex-col gap-1.5', open && 'col-span-full')}>
                  {/* KEVIN-FIX K.5 — libellé + chevron ne passent JAMAIS à la ligne l'un sans l'autre : en
                  `flex-wrap`, une puce qui remplissait la cellule laissait le chevron seul sur sa ligne
                  (x587, y622) et la rangée mesurait 64 px contre 34. Le libellé, lui, se replie. */}
                  <div className="flex flex-nowrap items-center gap-1.5">
                    <ToggleChip
                      tone={tone}
                      active={state !== 'none'}
                      // #3815.3 — un groupe déjà COMPLET se retire toujours (jamais
                      // plafonné) ; un groupe PAS complet n'a plus de place à 5/5 —
                      // désactivé, même raison que les secteurs restants ci-dessous.
                      disabled={atCap && state !== 'all'}
                      disabledHint={capReachedHint}
                      title={
                        announce
                          ? t('rail.sectorGroupPreview', {
                              add: announce.willAdd,
                              total: announce.willAdd + announce.missing,
                              max: MAX_SEARCH_SECTORS,
                            })
                          : undefined
                      }
                      onClick={() => toggleGroup(group)}
                    >
                      {groupLabel}
                      {announce ? (
                        <span className="ml-1 tabular-nums opacity-80">
                          +{announce.willAdd}/{announce.willAdd + announce.missing}
                        </span>
                      ) : null}
                      {/* Un groupe partiel DIT qu'il est partiel. Sans ce compte, il
                      se lit comme « tout coché » et on ne sait plus ce qu'on
                      cherche. Aucun « 0 » ici : à zéro, rien ne s'affiche. */}
                      {state === 'partial' ? (
                        <span className="ml-1 tabular-nums opacity-80">
                          {picked}/{members.length}
                        </span>
                      ) : null}
                    </ToggleChip>

                    {/* Le chevron se tait pendant une recherche : l'ouverture est
                    alors automatique, le manuel n'aurait plus de sens. */}
                    {normalizedSearch ? null : (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(group)}
                        aria-expanded={open}
                        aria-label={t(open ? 'rail.sectorGroupCollapse' : 'rail.sectorGroupExpand', {
                          group: groupLabel,
                        })}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    )}
                  </div>

                  {open ? (
                    <div className="flex flex-wrap gap-1.5 pl-3">
                      {visibleSectors.map(sector => (
                        <ToggleChip
                          tone={tone}
                          key={sector.code}
                          active={selected.includes(sector.code)}
                          // #3815.3 — retirer reste permis à 5/5 (`selected.includes`
                          // au-dessus prime) ; seul l'AJOUT d'un secteur non coché
                          // est désactivé, avec la raison visible AVANT le clic.
                          disabled={atCap && !selected.includes(sector.code)}
                          disabledHint={capReachedHint}
                          onClick={() => toggleSector(sector.code)}
                        >
                          {applicationSectorLabel(sector.code, i18n.language)}
                        </ToggleChip>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
