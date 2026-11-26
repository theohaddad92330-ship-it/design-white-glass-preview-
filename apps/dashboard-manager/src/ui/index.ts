/**
 * #1642 — les douze primitives du back-office. Chacune porte son
 * `.module.css` ; aucune dépendance UI n'est ajoutée (gardé par
 * `src/architecture/aucune-librairie-ui.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE COMMENTAIRE DISAIT « CE SOCLE N'A AUCUN APPELANT » — C'ÉTAIT PÉRIMÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Vrai au moment où #1642 l'a écrit ; faux depuis le commit `9c158ca32`, qui
 * a branché plusieurs écrans du palier back-office sur ces primitives sans
 * que la phrase ci-dessus ne soit corrigée — exactement le défaut qu'elle
 * dénonçait, retourné contre elle-même. Mesuré le 07/09/2026 par un balayage
 * JSX (`<Card`, `<Stat`, `<DataTable`… à travers `src/app`), pas relu sur la
 * foi de ce commentaire :
 *
 *  · **11 primitives sur 12 ont un appelant réel** : `Card`, `CardHeader`,
 *    `KpiTile`, `Stat`, `DataTable`, `Sparkline`, `SegmentBar`, `Pill`,
 *    `EmptyState`, `Skeleton` (`DataTable.tsx` le rend quand
 *    `status === 'loading'`), et — CORRIGÉ le 09/09/2026, voir ci-dessous —
 *    `Delta`.
 *  · ⚠️ **« `Delta` reste sans appelant » était FAUX** — et l'a été pendant
 *    DEUX MINUTES : ce commentaire vient du commit `9d7a43eee` (07/09/2026
 *    22:22), et `26c28842c` (« le cockpit business sur la page d'accueil »,
 *    #1646, 07/09/2026 22:24) branchait DÉJÀ `KpiTile` — qui rend `<Delta>`
 *    en interne (`KpiTile.tsx`) — sur une VRAIE variation, pour trois des six
 *    tuiles du cockpit (`cockpit-business-panel.tsx` : MRR, Clients, Burn,
 *    via `pourcentageVariation` dans `cockpit-business.logic.ts`, testée dans
 *    `cockpit-business.logic.test.ts`). Les trois autres (attrition, marge,
 *    runway) restent `delta: null` — un choix DOCUMENTÉ (GA-26 : une seconde
 *    dérivation du même calcul), pas un oubli.
 *    C'est exactement le défaut que ce commentaire dénonçait déjà une fois,
 *    retourné contre lui-même une seconde fois : un balayage JSX qui grep
 *    `<Delta` dans `src/app` rend bien 0 — mais `Delta` n'est JAMAIS écrit
 *    dans `src/app`, il l'est dans `src/ui/KpiTile.tsx`, un NIVEAU en dessous.
 *    Un grep de tag littéral ne voit pas un appel qui traverse une primitive
 *    d'enveloppe — la mesure était trop étroite, pas le constat qu'elle a
 *    produit avant #1646.
 *  · **`Heatmap` a été RETIRÉE** (#1642.1, 09/09/2026) — et c'est la seule
 *    des douze qui l'ait été. On ne lui a pas inventé un appelant : les deux
 *    écrans qui auraient pu la recevoir ont déjà leur grille, et toutes deux
 *    sont MEILLEURES qu'elle. `AnalysesHeatmap`
 *    (`app/monitoring/_components/analyses-heatmap.tsx`) fait de chaque case
 *    un `<button>` avec son détail dans une région annoncée, là où
 *    `Heatmap.tsx` rangeait sa donnée dans un `title=` — invisible au clavier,
 *    muet pour un lecteur d'écran, et un défaut répertorié de ce dépôt.
 *    `CohortGrid` (`app/_components/charts.tsx`) gère trois états (mesuré /
 *    non mesuré / futur) et le seuil d'anonymat, contre deux pour elle.
 *    La brancher aurait donc posé un TROISIÈME rendu de grille, moins
 *    accessible que les deux en production.
 *
 *    ⚠️ Ce qui RESTE, et pour cause : `Heatmap.logic.ts` a deux appelants
 *    réels (`charts.tsx`, via `CohortGrid`) et `Heatmap.module.css` un
 *    (`analyses-heatmap.tsx`). Seul le composant JSX était orphelin — le
 *    constat « 0 appelant » portait sur le tag, pas sur le module.
 *
 * `knip.json` (racine du dépôt) porte encore une exception `ignore` sur
 * `src/ui/Skeleton.tsx` — PAS `Delta.tsx`, qui ne s'y trouvait déjà pas avant
 * ce lot (à raison : il n'a jamais eu besoin de cette exception, un appelant
 * réel existait déjà). L'entrée `src/ui/Heatmap.tsx` a disparu avec le
 * fichier. Un futur lot qui branche `Skeleton` pour de bon (fait ici)
 * devrait retirer son entrée de cette liste.
 *
 * Les types de FORME des séries (`SparkPoint`, `Segment`, …) ne sont pas
 * réexportés ici pour la même raison — aucun écran ne les consomme encore.
 * Ils sont exportés par leur module de logique, pour la primitive qui les
 * rend, et remonteront ici le jour où un écran en aura besoin.
 */

export { Card } from './Card'
export { CardHeader } from './CardHeader'
export { KpiTile } from './KpiTile'
export { Stat } from './Stat'
export { Delta } from './Delta'
export { DataTable } from './DataTable'
export type { DataTableColumn } from './DataTable'
export { Sparkline } from './Sparkline'
export { SegmentBar } from './SegmentBar'
export { Pill } from './Pill'
export { EmptyState } from './EmptyState'
export { Skeleton } from './Skeleton'
// #1673.1 — le composant de filtre unique (pilules + compteur + « Effacer » +
// panneau « Filtres avancés »), qui remplace les trois formes divergentes
// listées dans `FilterBar.tsx`.
export { FilterBar } from './FilterBar'
// #1674.9 — la porte des actions irréversibles : elles ne sont PAS RENDUES
// sous 768 px. « Une suppression déclenchée par un pouce dans un métro est un
// incident » — un `display: none` laisserait le bouton tabulable et cliquable
// par script, donc la seule protection est de ne pas le rendre.
export { PosteDeTravailSeulement } from './PosteDeTravailSeulement'
