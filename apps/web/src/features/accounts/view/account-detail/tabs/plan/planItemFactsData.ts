import {
  actionMissingData,
  actionNoGoReasons,
  actionOwnerPage,
  blockedByDependency,
  type ActionPlanItem,
} from '@bellum/contracts'

/**
 * #2123.1-.10, .21-.33, .35 — ce qu'une action du plan DIT d'elle-même.
 *
 * Constat de recette du 15/09 (prod, THALES) : l'objet canonique visé et les
 * neuf champs d'une action étaient livrés au contrat et dans l'API
 * (`68c90ecb0`, `6e1c1802a`), et AUCUN écran ne les lisait — `depends_on_item_id`
 * n'avait pas un seul lecteur. « Actions du plan » ne montrait ni raison, ni
 * source, ni confiance, ni coût, ni statut. Ce module est la lecture.
 *
 * Deux règles tenues ici, pas dans le composant :
 *  - **rien n'est dérivé une seconde fois** : la page propriétaire vient de
 *    `actionOwnerPage`, ce qui manque vient de `actionMissingData` (GA-26). Ce
 *    fichier ne fait que traduire une page en URL ;
 *  - **non mesuré reste `null`** : ni « faible », ni « gratuit » (GA-18 / GA-19).
 *    `cost_credits: 0` est une AUTRE affirmation, et elle passe telle quelle.
 */

/**
 * La route de chaque page propriétaire, par la CLÉ que rend `actionOwnerPage`.
 * `agenda` n'a pas de route dans l'application, et une vérification vit dans le
 * dossier qu'on regarde déjà : la page se NOMME, on n'invente pas de lien.
 */
const ROUTE_BY_OWNER_PAGE = {
  contacts: (id: string) => ({ to: '/contacts/$id', id }) as const,
  besoins: (id: string) => ({ to: '/projects/needs/$needId', id }) as const,
  projets: () => ({ to: '/projects' }) as const,
  sequences: () => ({ to: '/actions/sequences' }) as const,
  partenaires: () => ({ to: '/accounts/partners' }) as const,
  actions: () => ({ to: '/actions' }) as const,
}

function linkTo(ownerPage: string, id: string) {
  const route = ROUTE_BY_OWNER_PAGE[ownerPage as keyof typeof ROUTE_BY_OWNER_PAGE]
  return route ? route(id) : null
}

export function buildPlanItemFacts(item: ActionPlanItem, items: readonly ActionPlanItem[]) {
  const target = item.target
    ? {
        kind: item.target.kind,
        label: item.target.label,
        ownerPage: actionOwnerPage(item.target.kind),
        link: linkTo(actionOwnerPage(item.target.kind), item.target.id),
      }
    : null
  return {
    status: item.execution_status,
    // #2123.21 — une raison vide n'est pas une raison.
    reason: item.reason?.trim() || null,
    target,
    // #2123.24 — le NOM du contact n'est connu que lorsque l'objet visé est ce
    // contact ; ailleurs on lie la fiche sans deviner qui c'est.
    contact: item.contact_id
      ? {
          id: item.contact_id,
          label: item.target?.kind === 'contact' && item.target.id === item.contact_id ? item.target.label : null,
        }
      : null,
    // #2123.28 — la dépendance se LIT par le libellé de l'action à faire avant.
    // Retirée du plan : la dépendance existe toujours, son libellé non.
    dependency: item.depends_on_item_id
      ? { label: items.find(other => other.id === item.depends_on_item_id)?.label ?? null }
      : null,
    // #2317.9 — une action conditionnelle n'est pas exécutable tant que sa
    // dépendance n'est pas faite. `null` = rien à bloquer (pas de dépendance,
    // ou dépendance déjà faite).
    blocked: blockedByDependency(item, items),
    provenance: item.provenance,
    confidence: item.confidence,
    costCredits: item.cost_credits,
    // #2153.57 — le résultat, DÉCLARATIF, distinct de l'attendu (`expected_outcome`/`kpi`).
    result: item.result,
    // #2396.1 — RÉFUTÉ en prod (23/09) : `completion_mode` était persisté
    // (manuel/preuve/événement/proposé) et AUCUN écran ne le lisait. Voyage
    // tel quel, jamais deviné — `null` sur une ligne pas encore faite, ou sur
    // une ligne faite AVANT l'existence de cette colonne (GA-18/GA-19 : une
    // absence ne se lit jamais comme « manuel » par défaut).
    completionMode: item.completion_mode,
    // #3416 (recette 30/09) — l'issue CHOISIE à la complétion : persistée, mais
    // aucun écran ne la relisait (les quatre issues ajoutées ne se voyaient
    // qu'en ouvrant le sélecteur, donc en écrivant). `null` tant que la ligne
    // n'est pas faite : une absence ne fait aucune puce.
    outcome: item.execution_status === 'done' ? (item.outcome ?? null) : null,
    missing: actionMissingData(item),
    // #2317.15 — le NO-GO du plan : non cliquable, non attribuée, ou sans
    // date et résultat attendu. `[]` = pas de NO-GO, jamais un booléen nu.
    noGoReasons: actionNoGoReasons(item),
  }
}

/**
 * #2123.35 — ce qu'il faut VÉRIFIER passe devant, le reste garde l'ordre du plan.
 *
 * Même partition que `nextActions` du contrat, appliquée à toutes les lignes
 * d'une phase et non aux trois premières : proposer « rappeler le DSI » avant
 * de savoir qui est le DSI fait perdre le rendez-vous. Une ligne sans état
 * persisté (démo, déconnecté) n'est pas une vérification : on ne sait rien
 * d'elle, on ne la déplace pas.
 */
export function verificationFirst<T>(rows: readonly T[], itemOf: (row: T) => ActionPlanItem | null | undefined): T[] {
  const needsCheck = (row: T): boolean => {
    const item = itemOf(row)
    return item ? actionMissingData(item) !== null : false
  }
  return [...rows.filter(needsCheck), ...rows.filter(row => !needsCheck(row))]
}
