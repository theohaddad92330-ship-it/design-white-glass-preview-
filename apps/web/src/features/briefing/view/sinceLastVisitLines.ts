import { INTERVENTION_THRESHOLDS } from '@bellum/contracts'
import type { SinceLastVisitLine, SinceLastVisitLineKind } from '@bellum/contracts'

/**
 * Une ligne typée → UNE phrase, en français ou en anglais.
 *
 * Fonction PURE et hors de React : c'est ce qui permet de vérifier les trois
 * états de chacune des cinq lignes — une valeur, rien à dire, non mesurable —
 * sans monter un arbre, et surtout de vérifier que le SILENCE ne s'écrit jamais
 * « 0 ».
 *
 * ⚠️ Le seuil de trente jours n'est pas recopié ici : il vient de
 * `INTERVENTION_THRESHOLDS.renewalHorizonDays`, l'endroit unique où il vit et
 * que le balayeur d'interventions applique. Une phrase qui dirait « 30 » en dur
 * continuerait de le dire le jour où le seuil change — et l'écran mentirait
 * sans que rien ne tombe.
 */

/** L'état de mesure → le fragment de clé i18n. Les quatre silences, nommés. */
const UNMEASURED_KEY = {
  partial: 'partial',
  not_connected: 'notConnected',
  missing_scope: 'missingScope',
  unavailable: 'unavailable',
} as const

/** Ce que le composant passe : `t` du namespace `briefing`, rien de plus. */
type Translate = (key: string, vars?: Record<string, unknown>) => string

/**
 * `null` = cette ligne n'a rien à écrire.
 *
 * Le cas arrive quand le serveur rend `ready` sans compte — une réponse que le
 * contrat interdit (`superRefine`), mais que le navigateur peut recevoir d'une
 * API plus ANCIENNE que lui : l'app et l'API se déploient séparément. Écrire
 * « 0 » là serait exactement le faux zéro qu'on refuse ; ne rien écrire est le
 * seul énoncé vrai.
 */
export function sinceLastVisitLineText(t: Translate, line: SinceLastVisitLine): string | null {
  if (line.state !== 'ready') {
    return t(`sinceLastVisit.lines.${line.kind}.${UNMEASURED_KEY[line.state]}`)
  }
  const count = line.count
  if (count === null) return null

  switch (line.kind) {
    case 'account_signals':
      // « 3 nouveaux signaux sur 2 comptes » : deux pluriels dans une phrase,
      // donc deux clés — i18next n'accorde que sur `count`. Le second nombre
      // vit à côté du premier et non fondu dedans : « 3 nouveaux signaux » tout
      // seul laisse croire à trois clients qui bougent.
      return line.scope === null
        ? t('sinceLastVisit.lines.account_signals.valueOnly', { count })
        : t('sinceLastVisit.lines.account_signals.value', {
            count,
            accounts: t('sinceLastVisit.lines.account_signals.accounts', { count: line.scope }),
          })
    case 'missions_moving':
      return t('sinceLastVisit.lines.missions_moving.value', {
        count,
        days: INTERVENTION_THRESHOLDS.renewalHorizonDays,
      })
    default:
      return t(`sinceLastVisit.lines.${line.kind}.value`, { count })
  }
}

/**
 * #2106.22/.23/.24/.25 — une ligne qui ANNONCE un changement mène à un écran
 * qui le MONTRE, filtré sur la même notion — jamais une liste par défaut où le
 * changement visé se cherche dans le tas.
 *
 * Fonction PURE : les trois destinations sont des filtres RÉELS, déjà câblés
 * ailleurs dans le produit, jamais inventés pour ce lien —
 *  - `account_signals` rejoue le bandeau de tête `newSignals7d` du portefeuille
 *    comptes (`ACCOUNT_LIST_HEADLINE_FILTERS`, `accountsSearchSchema.headline`) ;
 *  - `replies_received` rejoue l'intention de recherche mailbox `unread`
 *    (`mailSearchIntentSchema`) — PAS `positive_reply` : le compte que cette
 *    ligne annonce (`repliesLine`, `briefing.service.ts`) est TOUTE activité
 *    entrante depuis la fenêtre, sans tri de sentiment ; filtrer sur
 *    `positive_reply` ouvrirait un sous-ensemble plus étroit que ce que le
 *    chiffre affiché promet — la même notion que le chiffre, pas une notion
 *    voisine (relevé le 24/09, fusion vague 31/33) ;
 *  - `missions_moving` mène à `/missions` (#3656 : l'écran de décision de
 *    renouvellement est supprimé), dont la lentille « Échéance » porte les
 *    fenêtres de fin ; aucun paramètre d'URL n'existe pour elles, une query
 *    string mentirait sur ce que la page affiche.
 *
 * #2834 (#2106.24) — `job_changes` mène désormais à `/contacts?sourceTag=RISQUE`,
 * le filtre que `narrowToSourceTag` (`contacts.service.ts`) sait désormais
 * servir : il rejoue `contactSourceTag`, la même fonction que ce digest lit
 * pour compter cette ligne (`jobChangesLine`, `briefing.service.ts`), sur les
 * candidats de la liste — jamais une notion voisine. Avant ce point, aucune
 * page ne filtrait `/contacts` par changement de poste et cette fonction
 * rendait `null` (voir git blame) : promettre un clic aurait ouvert une liste
 * NON filtrée, ce que la doctrine « un objet sans écran où atterrir ne se
 * promet pas cliquable » refuse ailleurs dans ce même fichier (voir
 * `href: null` du conflit d'agenda, `briefing-actions.ts`).
 *
 * `attack_angles_added` rend `null` : aucun filtre n'existe pour « angle
 * d'attaque créé récemment » sur `/accounts` — un angle d'attaque n'a pas de
 * fiche à lui, il vit dans le dossier du compte ; promettre un clic ouvrirait
 * une liste NON filtrée.
 *
 * `night_routines_run` rend `null` pour la même raison : une exécution de
 * routine n'a pas de fiche ni de liste filtrable à elle (`routine_runs` n'a
 * aucun écran).
 */
export function sinceLastVisitLineHref(kind: SinceLastVisitLineKind): string | null {
  switch (kind) {
    case 'account_signals':
      return '/accounts?headline=newSignals7d'
    case 'replies_received':
      return '/mailbox?intent=unread'
    case 'missions_moving':
      return '/missions'
    case 'job_changes':
      return '/contacts?sourceTag=RISQUE'
    case 'attack_angles_added':
    case 'night_routines_run':
      return null
  }
}
