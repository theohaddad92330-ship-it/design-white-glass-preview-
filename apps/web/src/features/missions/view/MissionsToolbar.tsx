import {
  contractKindSchema,
  missionChannelSchema,
  missionStatusSchema,
  renewalWindowsOf,
  type ContractKind,
  type MissionChannel,
  type MissionStatus,
  type RenewalWindow,
} from '@bellum/contracts'
import { Box, FilterChips, SearchInput } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRenewalWindows } from '../api'
import {
  MISSION_FACETS,
  SATISFACTION_FILTER_VALUES,
  type MissionFacet,
  type MissionPresetView,
  type SatisfactionFilterValue,
} from '../filters'
import { renewalWindowHint, renewalWindowLabel } from '../renewalWindowLabel'

/**
 * LA BARRE D'OUTILS DES DEUX LENTILLES DE MISSIONS — #1348, #1358, #1359,
 * #1361, #1367, #1368.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX RETOURS, UN SEUL OBJET — ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ils demandaient, mot pour mot : une « synthèse d'attention » cliquable au
 * dessus du tableau (#1348), une recherche (#1358), trois filtres rapides
 * (#1359), quatre indicateurs cliquables (#1361), un point d'entrée Laura
 * (#1367) et une « mini visualisation compacte de la répartition » dont chaque
 * segment filtre (#1368).
 *
 * Livrés tels quels, ça faisait sur le même écran : trois cartes qui comptent,
 * trois pastilles qui filtrent les mêmes populations, et cinq barres qui
 * comptent les mêmes échéances. Le même chiffre trois fois, sous trois formes —
 * la loi 4 du tome 7 (« rien n'apparaît deux fois sous la même forme avec le
 * même contenu »).
 *
 * Une pastille COMPTÉE répond aux trois : elle nomme la population, elle en dit
 * le nombre, et un clic n'affiche qu'elle. C'est la reformulation, et elle est
 * écrite dans chacune des six issues.
 *
 * ⚠️ La barre est rendue par LENTILLE et pas au-dessus des onglets. « En cours »
 * et « Renouvellements » lisent deux routes et deux populations : une recherche
 * posée plus haut prétendrait resserrer les deux, et son compteur serait faux
 * dans l'une des deux.
 *
 * ⚠️ Aucune couleur écrite à la main, aucun rayon en pixels, aucune taille hors
 * échelle — les deux specs en portaient onze (`#E8E8EE`, `#FAFAFC`, `radius
 * 12–14 px`, `valeur 24–28 px`). Une couleur hexadécimale ne suit pas le thème
 * (D79) et `FilterChips` porte déjà la mesure de contraste de la décision F4.
 */
/**
 * LES CINQ PASTILLES DE FILTRES RAPIDES — extraites de `MissionsToolbar`
 * (#3144, recette écran 28/09/2026) pour pouvoir vivre SOUS le dépliable
 * « Filtres » de `MissionsPage.tsx` plutôt que dans la rangée toujours
 * visible : l'en-tête fermé les comptait sans jamais les montrer avant le
 * tableau. Un seul rendu (GA-26) — `MissionsToolbar` l'appelle aussi quand
 * `hideFacets` n'est pas posé.
 */
/** #2979 — au-delà de ce nombre, les rangées dont les valeurs viennent des DONNÉES se replient. */
const COLLAPSE_AFTER = 6

function collapseOf(t: (key: string, options?: Record<string, unknown>) => string) {
  return {
    after: COLLAPSE_AFTER,
    moreLabel: (hidden: number) => t('toolbar.showMore', { count: hidden }),
    lessLabel: t('toolbar.showLess'),
  }
}

export function MissionFacetChips({
  facets,
  onToggleFacet,
  counts,
  canReadFinance,
}: {
  facets: readonly MissionFacet[]
  onToggleFacet: (facet: MissionFacet) => void
  counts: Record<MissionFacet, number>
  canReadFinance?: boolean
}) {
  const { t } = useTranslation('missions')
  return (
    <FilterChips
      multiple
      size="sm"
      ariaLabel={t('toolbar.facetsLabel')}
      options={MISSION_FACETS.filter(facet => facet !== 'marginAtRisk' || canReadFinance === true).map(facet => ({
        value: facet,
        label: t(`toolbar.facets.${facet}`),
        hint: t(`toolbar.facetHints.${facet}`),
        count: counts[facet],
      }))}
      values={facets}
      onToggle={onToggleFacet}
    />
  )
}

export function MissionsToolbar({
  query,
  onQueryChange,
  facets,
  onToggleFacet,
  counts,
  canReadFinance,
  trailing,
  hideFacets,
}: {
  query: string
  onQueryChange: (next: string) => void
  facets: readonly MissionFacet[]
  onToggleFacet: (facet: MissionFacet) => void
  counts: Record<MissionFacet, number>
  /**
   * #2408.49 — LA PASTILLE « Marge », visible SEULEMENT avec `finance:read`.
   *
   * ⚠️ Défaut FERMÉ (`=== true` à l'appel, jamais `?? true`) : le serveur
   * retire déjà `margin_at_risk` du tableau sans le droit (`MARGIN_RISKS`,
   * `delivery.service.ts`), donc son compte y vaudrait toujours zéro — une
   * pastille à zéro qui ne peut JAMAIS se remplir se lit comme une panne, pas
   * comme une population mesurée et vide. Le montant et la marge restent
   * derrière le même droit partout sur cet écran (colonne « Marge »,
   * `MissionMargin.tsx`).
   */
  canReadFinance?: boolean
  /**
   * #1825 — « mettre colonne justifié à droite, sur la même ligne que
   * rechercher une mission, pour gagner de l'espace sur la page ».
   *
   * `MissionsPage.tsx` rendait le sélecteur de colonnes dans un second `Box`
   * empilé SOUS cette barre — deux `Box` block-level l'un sous l'autre sont
   * deux rangées, quoi qu'on mette dedans. Ce prop laisse l'appelant ajouter
   * du contenu sur CETTE rangée, à la suite du bloc Laura déjà poussé à droite
   * par `ml-auto` — même patron que la lentille « Renouvellements » (recherche
   * + action sur une seule rangée, ~ligne 287 de `MissionsPage.tsx`).
   *
   * Optionnel et par défaut absent : `PlanningPage.tsx`, l'autre appelant de
   * ce composant, ne change pas de rendu.
   */
  trailing?: ReactNode
  /**
   * #3144 (recette écran 28/09/2026) — la rangée de pastilles rapides vit
   * désormais sous le dépliable « Filtres » de `MissionsPage.tsx`
   * (`MissionFacetChips`, ci-dessus), plutôt que toujours visible ici. Absent
   * ⇒ comportement inchangé (l'autre appelant, `PlanningPage.tsx`).
   */
  hideFacets?: boolean
}) {
  const { t } = useTranslation('missions')

  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <SearchInput
        size="sm"
        value={query}
        onChange={onQueryChange}
        placeholder={t('toolbar.searchPlaceholder')}
        className="w-full sm:w-96"
        inputClassName="w-full"
      />
      {hideFacets ? null : (
        <MissionFacetChips
          facets={facets}
          onToggleFacet={onToggleFacet}
          counts={counts}
          canReadFinance={canReadFinance}
        />
      )}
      {trailing}
    </Box>
  )
}

/**
 * #2407.5 — LE FILTRE « STATUT », SUR LES 14 VALEURS DE LA MACHINE.
 *
 * RÉFUTÉ en prod le 23/09 : `/missions` n'affichait et ne filtrait que deux
 * statuts (« En cours », « Démarrage ») — ceux que le parc démo porte —
 * alors que `missionStatusSchema` (`packages/contracts`) en compte 14. Le
 * badge de `MissionsTable.tsx` traduisait déjà n'importe quel statut
 * (`t('status.' + mission.status)`, libellés FR+EN complets) : ce qui
 * manquait n'était pas la traduction, c'était le filtre lui-même.
 *
 * ⚠️ Les options viennent de `missionStatusSchema.options` — la MACHINE —
 * jamais des statuts présents dans `missions` : un statut sans mission
 * aujourd'hui doit rester choisissable demain, sinon le filtre ment sur ce
 * que la machine autorise. `statusCounts` (`filters.ts`) ne pose une entrée
 * dans sa Map QUE pour un statut rencontré ; `count: undefined` sur les
 * autres ne peint donc aucun « 0 » (doctrine : une absence n'affiche jamais
 * 0, GA-18/19).
 *
 * Multi-sélection, comme les autres filtres de cette barre (Théo, décision Louis
 * 23/10) : les statuts choisis s'additionnent, un second clic retire celui-là.
 */
export function MissionStatusFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: Map<MissionStatus, number>
  selected: readonly MissionStatus[]
  onToggle: (value: MissionStatus) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.statusLabel')}
      options={missionStatusSchema.options.map(status => ({
        value: status,
        label: t(`status.${status}`),
        count: counts.get(status),
      }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.38 — LE FILTRE « PORTEUR », même geste que `MissionStatusFilter` et
 * `MissionContractKindFilter` juste au-dessus, mais SANS énumération fermée :
 * `counts` ne porte que les porteurs RENCONTRÉS (`ownerCounts`, `filters.ts`),
 * jamais une liste complète venue d'un référentiel qui n'existe pas côté
 * missions. L'appelant ne le rend donc QUE si `counts` n'est pas vide — un
 * filtre qui ne peut proposer aucune valeur n'est pas un filtre, c'est un
 * piège (même garde que `canFilterWithoutAmount`, `InvoiceReadinessPanel.tsx`).
 */
export function MissionOwnerFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.ownerLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(owner => ({
          value: owner,
          label: owner,
          count: counts.get(owner),
        }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.41 — LE FILTRE « CLIENT », même geste que `MissionOwnerFilter` juste
 * au-dessus : un SÉLECTEUR dédié, en plus de la recherche texte libre déjà là
 * (`toolbar.searchPlaceholder`) — celle-ci demande l'orthographe exacte,
 * celui-là se parcourt. Rendu seulement si `counts` porte au moins un compte.
 */
export function MissionAccountFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.accountLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(account => ({
          value: account,
          label: account,
          count: counts.get(account),
        }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.42 — LE FILTRE « CONSULTANT », même geste et même raison que
 * `MissionAccountFilter` juste au-dessus.
 */
export function MissionConsultantFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.consultantLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(consultant => ({
          value: consultant,
          label: consultant,
          count: counts.get(consultant),
        }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.45 — LE FILTRE « FIN », complet sur les fenêtres individuelles de
 * CETTE lentille (« En cours »). `toRenew` (`filters.ts`) ne resserre QUE sur
 * échue/imminente/J-15/J-30 ; J-45 et J-60 n'avaient AUCUNE porte de filtre,
 * seule la colonne « Fin » les affichait.
 *
 * ⚠️ `far` est délibérément ABSENTE : `renewalWindowsOf` (`@bellum/contracts`)
 * rend les fenêtres qu'une lentille SERT, et `GET /delivery/missions` (cette
 * lentille) n'envoie `far` qu'avec `includeFar: true` — jamais posé ici
 * (`delivery.service.ts`). Une pastille « far » resterait bloquée à zéro pour
 * tout le monde — même garde que la pastille « Marge », #2408.49.
 *
 * ⚠️ Les libellés se CALCULENT depuis l'échelle de l'espace
 * (`useRenewalWindows`, #2195.8) : l'écran de décision de renouvellement
 * `/missions/renouvellements` a été supprimé (#3656) et cette lentille est
 * désormais le seul endroit où ces fenêtres se lisent. Sans cette lecture, un
 * espace réglé sur [20, 40, 70, 100] lirait « Sous 15 jours » sur une fenêtre
 * qui s'ouvre à vingt.
 */
const MISSION_END_WINDOWS: readonly RenewalWindow[] = renewalWindowsOf()

export function MissionEndWindowFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<RenewalWindow, number>
  selected: readonly RenewalWindow[]
  onToggle: (value: RenewalWindow) => void
}) {
  const { t } = useTranslation('missions')
  const { data: windows } = useRenewalWindows()

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.endWindowLabel')}
      options={MISSION_END_WINDOWS.map(window => ({
        value: window,
        label: renewalWindowLabel(t, window, windows?.days),
        hint: renewalWindowHint(t, window, windows?.days),
        count: counts.get(window),
      }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.43 — LE FILTRE « NATURE », même patron que `MissionStatusFilter`
 * juste au-dessus : la colonne `contractKind` existait déjà (`columns.ts`),
 * sans filtre dessus. Les libellés viennent de `table.contractKinds`, jamais
 * dupliqués ici — un réglage vit à un seul endroit (GA-26).
 */
export function MissionContractKindFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: Map<ContractKind, number>
  selected: readonly ContractKind[]
  onToggle: (value: ContractKind) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.contractKindLabel')}
      options={contractKindSchema.options.map(kind => ({
        value: kind,
        label: t(`table.contractKinds.${kind}`),
        count: counts.get(kind),
      }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.53 — LE FILTRE « DEVISE », même table et même porte que
 * `MissionChannelFilter` juste au-dessus
 * (`mission_commercial_terms.currency`, `DeliveryService.commercialTermsByMission`).
 *
 * ⚠️ Contrairement au canal, ISO 4217 est un ensemble OUVERT : il n'existe
 * pas de `missionCurrencySchema.options` à parcourir. Même patron que
 * `MissionOwnerFilter`/`MissionAccountFilter` juste au-dessus dans ce
 * fichier — les options sont celles RENCONTRÉES (`counts`), triées à
 * l'alphabétique du code, jamais un référentiel de devises qui n'existe pas
 * ici. Un code ISO se lit tel quel (« EUR », « CHF ») : aucune traduction à
 * résoudre, contrairement au canal.
 */
export function MissionCurrencyFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.currencyLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(currency => ({
          value: currency,
          label: currency,
          count: counts.get(currency),
        }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.39, #2408.40 — LE FILTRE « BU / AGENCE », celle du COMPTE porteur
 * (`MissionView.businessUnitName`, résolue serveur). Ensemble OUVERT : mêmes
 * options RENCONTRÉES que `MissionCurrencyFilter`, triées à l'alphabétique.
 */
export function MissionBusinessUnitFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.businessUnitLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(unit => ({ value: unit, label: unit, count: counts.get(unit) }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.52, #2408.62 — LE FILTRE « CANAL », même table que le PO
 * (`mission_commercial_terms.channel`, `DeliveryService.commercialTermsByMission`)
 * — sans lui, ni ce filtre ni la vue enregistrée « Partenaires/rang 2 »
 * (#2408.62) ne peuvent se poser une question sur un canal qu'ils n'ont
 * jamais reçu.
 *
 * ⚠️ Contrairement à `MissionContractKindFilter` juste au-dessus, l'énumération
 * n'est PAS parcourue en entier : un canal qu'AUCUNE mission affichée ne
 * porte (sans `finance:read`, ou une mission sans ligne de conditions
 * commerciales) reste ABSENT de la liste — on n'affiche pas ce qu'on n'a pas.
 * L'ordre reste celui du contrat (`missionChannelSchema.options`), jamais
 * alphabétique sur le libellé traduit.
 *
 * Les libellés viennent de `pilotage:finance.channels.*` — le canal est déjà
 * nommé là pour la marge par canal (`FinancePanel.tsx`) et ne se duplique pas
 * une seconde fois ici (GA-26).
 */
export function MissionChannelFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<MissionChannel, number>
  selected: readonly MissionChannel[]
  onToggle: (value: MissionChannel) => void
}) {
  const { t } = useTranslation('missions')
  const { t: tChannel } = useTranslation('pilotage')

  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.channelLabel')}
      collapse={collapseOf(t)}
      options={missionChannelSchema.options
        .filter(channel => counts.has(channel))
        .map(channel => ({
          value: channel,
          label: tChannel(`finance.channels.${channel}`),
          count: counts.get(channel),
        }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.40 — LE FILTRE « SOCIÉTÉ » (celle de l'ESN qui porte la mission),
 * même patron que `MissionBusinessUnitFilter` : seules les sociétés CONNUES.
 */
export function MissionLegalEntityFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<string, number>
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')
  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.legalEntityLabel')}
      collapse={collapseOf(t)}
      options={[...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(entity => ({ value: entity, label: entity, count: counts.get(entity) }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.51 — LE FILTRE « SATISFACTION » : les niveaux DÉCLARÉS et « non
 * mesurée ». Un niveau qu'aucune mission ne porte n'est pas proposé.
 */
export function MissionSatisfactionFilter({
  counts,
  selected,
  onToggle,
}: {
  counts: ReadonlyMap<SatisfactionFilterValue, number>
  selected: readonly SatisfactionFilterValue[]
  onToggle: (value: SatisfactionFilterValue) => void
}) {
  const { t } = useTranslation('missions')
  return (
    <FilterChips
      size="sm"
      ariaLabel={t('toolbar.satisfactionLabel')}
      options={SATISFACTION_FILTER_VALUES.filter(value => counts.has(value)).map(value => ({
        value,
        label: t(`satisfaction.filter.${value}`),
        count: counts.get(value),
      }))}
      multiple
      values={selected}
      onToggle={onToggle}
    />
  )
}

/**
 * #2408.54/.56/.57/.58/.59 — LES VUES PRÊTES : une population NOMMÉE en un
 * clic, un second clic la retire. Les vues offertes suivent le droit finance
 * (`presetViewsFor`, `filters.ts`).
 */
export function MissionPresetViewChips({
  views,
  counts,
  selected,
  onToggle,
}: {
  views: readonly MissionPresetView[]
  counts: ReadonlyMap<MissionPresetView, number>
  selected: MissionPresetView | null
  onToggle: (value: MissionPresetView) => void
}) {
  const { t } = useTranslation('missions')
  return (
    <Box className="space-y-1" data-testid="mission-preset-views">
      <FilterChips
        size="sm"
        ariaLabel={t('presetViews.title')}
        options={views.map(view => ({
          value: view,
          label: t(`presetViews.${view}`),
          hint: t('presetViews.hint'),
          count: counts.get(view),
        }))}
        multiple
        values={selected === null ? [] : [selected]}
        onToggle={onToggle}
      />
    </Box>
  )
}
