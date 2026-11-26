import { z } from 'zod'
import { RECETTE_2208_SPECS } from './route-migration-2208-conditions.js'

/**
 * Les conditions NO-GO / GO de la migration de routes — #2154.31/.32.
 *
 * #2154 pose onze conditions de blocage et huit conditions de livraison
 * (dont trois recettes humaines nommées) pour la « nouvelle architecture ».
 * Aucun fichier ne les portait avant ce commit — la question « peut-on
 * livrer ? » n'avait nulle part où se répondre autrement qu'en relisant
 * l'issue à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE PRÉTEND PAS
 * ─────────────────────────────────────────────────────────────────────────
 * La migration décrite par #2154 (feature flags progressifs, coexistence de
 * projections, rollback de déploiement, dix-huit scénarios E2E nommés) n'est
 * PAS en cours — #2958 l'a elle-même déclarée absente, plusieurs jours de
 * travail. La plupart des conditions ci-dessous ont donc le statut
 * `not_yet_evaluable` : ni « clair » ni « bloqué », parce qu'il n'y a rien à
 * évaluer tant que la migration n'a pas commencé. Leur confondre avec
 * `clear` ferait dire « rien ne bloque » d'une chose qu'on n'a pas regardée
 * — exactement l'erreur que « non mesuré n'est jamais 0 » interdit ailleurs
 * dans ce produit, transposée ici.
 *
 * Les trois recettes (Hervé, Antoine, manager) — DÉCISION LOUIS 11/10 : elles
 * suivent la décision du 09/10 qui a basculé leurs cousines #2958.106/.107/.109
 * (`route-migration-2208-conditions.ts`) — même personne, même geste, donc
 * SIGNÉES par le MÊME scénario e2e Playwright (`RECETTE_2208_SPECS`, un seul
 * endroit) : « vert en CI = signé ». Ce registre ne lit pas la CI : leur statut
 * reste `unknown` (le verdict est celui du job e2e), `humanOnly: false`, et
 * AUCUNE garde ne les fait passer à `met` toute seule. Une recette dont le
 * scénario disparaîtrait redeviendrait humaine (`humanOnly: true`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS CONDITIONS DU LOT #2208 (#2958.95/.101/.102)
 * ─────────────────────────────────────────────────────────────────────────
 * Le tri du 28/09 (`TRI-RESTES-28-09.md`) signale un écart : trois conditions
 * NO-GO du lot #2208 (« objet dupliqué », « statut sans preuve », « source
 * indisponible rendue zéro ») n'étaient mentionnées NULLE PART dans ce
 * registre alors que #2208 les classait déjà `déjà là` (17/09/2026) sur la
 * foi d'un pattern PRODUIT-WIDE, jamais vérifié pour LA PORTÉE de cette
 * migration précise. Ce commit les ajoute avec leur preuve fichier:ligne
 * réelle, à la fois le pattern produit-wide (le filet qui s'appliquerait si
 * la migration touchait un jour ces objets) et la preuve SCOPÉE aux quatorze
 * routes de ce registre — jamais une seule affirmation à main levée.
 */

export const NO_GO_CONDITION_KEYS = [
  'capacite_sans_destination',
  'route_partagee_casse',
  'laura_page_vide',
  'objet_deux_maisons',
  'bouton_sans_effet',
  'nav_desktop_mobile_divergentes',
  'permission_contournee',
  'donnee_privee_fuit',
  'import_incomplet',
  'job_non_repris',
  'utilisateur_doit_connaitre_anciennes_pages',
  'objet_duplique',
  'statut_sans_preuve',
  'source_indisponible_zero',
] as const
export const noGoConditionKeySchema = z.enum(NO_GO_CONDITION_KEYS)
export type NoGoConditionKey = (typeof NO_GO_CONDITION_KEYS)[number]

export const GO_CONDITION_KEYS = [
  'registre_migration_complet',
  'tests_e2e_verts',
  'recette_herve',
  'recette_antoine',
  'recette_manager',
  'comparaison_avant_apres',
  'captures_desktop_mobile',
  'laura_parcours_sans_apprentissage',
] as const
export const goConditionKeySchema = z.enum(GO_CONDITION_KEYS)
export type GoConditionKey = (typeof GO_CONDITION_KEYS)[number]

export const NO_GO_STATUSES = ['not_yet_evaluable', 'blocked', 'clear'] as const
export const noGoStatusSchema = z.enum(NO_GO_STATUSES)
export type NoGoStatus = (typeof NO_GO_STATUSES)[number]

export const GO_STATUSES = ['not_met', 'met', 'unknown'] as const
export const goStatusSchema = z.enum(GO_STATUSES)
export type GoStatus = (typeof GO_STATUSES)[number]

export const noGoConditionSchema = z.object({
  key: noGoConditionKeySchema,
  /** `#2154.31` pour les onze conditions d'origine ; `#2958.9x` pour les
   *  trois conditions du lot #2208 reprises par #2958 (tri du 28/09). */
  sourceIssue: z.union([z.literal('#2154.31'), z.literal('#2958.95'), z.literal('#2958.101'), z.literal('#2958.102')]),
  /** Le texte de #2154 ou #2208, verbatim. */
  label: z.string().min(1),
  status: noGoStatusSchema,
  /** Ce qui justifie le statut — jamais vide, jamais « à vérifier ». */
  evidence: z.string().min(1),
})
export type NoGoCondition = z.infer<typeof noGoConditionSchema>

export const goConditionSchema = z.object({
  key: goConditionKeySchema,
  sourceIssue: z.literal('#2154.32'),
  label: z.string().min(1),
  status: goStatusSchema,
  evidence: z.string().min(1),
  /** `true` pour une recette qu'aucun scénario e2e ne signe : seul un geste
   *  humain le peut. Les trois recettes dotées d'un scénario (décision Louis
   *  11/10) sont `false` — jamais `met` pour autant. */
  humanOnly: z.boolean(),
})
export type GoCondition = z.infer<typeof goConditionSchema>

type RecetteKey = 'recette_herve' | 'recette_antoine' | 'recette_manager'

/** Une recette #2154.32 : signée par le scénario de sa cousine #2208 s'il existe, humaine sinon — jamais `met` déclaré. */
function recette2154(key: RecetteKey, label: string): GoCondition {
  const spec = (RECETTE_2208_SPECS as Partial<Record<RecetteKey, string>>)[key]
  if (spec === undefined)
    return {
      key,
      sourceIssue: '#2154.32',
      label,
      status: 'unknown',
      humanOnly: true,
      evidence: 'Recette humaine — aucun test ne peut la signer à sa place.',
    }
  return {
    key,
    sourceIssue: '#2154.32',
    label,
    status: 'unknown',
    humanOnly: false,
    evidence: `Signée par le scénario ${spec} — le même que sa cousine #2208 (décision Louis 09/10 : vert en CI = signé ; étendue aux recettes #2154.32 le 11/10). Une seule URL tapée, on ne clique que ce que l'écran propose, chaque écriture vérifiée. Le verdict « vert » est celui du job e2e de la CI, que ce registre ne peut pas signer.`,
  }
}

export const NO_GO_CONDITIONS: readonly NoGoCondition[] = [
  {
    key: 'capacite_sans_destination',
    sourceIssue: '#2154.31',
    label: "une ancienne capacité n'a pas de destination",
    status: 'clear',
    evidence:
      "Vérifié UNIQUEMENT sur les 21 routes du registre #2154.3/#2208.10-.31 (28/09, extension #2958) : les 8 redirigées ont une destination confirmée par le code (route-migration-registry.test.ts), les 13 autres n'ont jamais changé de route ou ne sont pas vérifiables (clone superficiel). Ne couvre PAS « toutes les routes actuelles » — la portée est les 21 routes nommées, pas le produit entier.",
  },
  {
    key: 'route_partagee_casse',
    sourceIssue: '#2154.31',
    label: 'une route partagée casse',
    status: 'not_yet_evaluable',
    evidence:
      'Aucune migration en cours à cette échelle — rien à casser encore. Réévaluer quand une route partagée change réellement de forme.',
  },
  {
    key: 'laura_page_vide',
    sourceIssue: '#2154.31',
    label: 'Laura ouvre une page vide ou générique',
    status: 'not_yet_evaluable',
    evidence:
      'Aucune nouvelle destination Laura créée par ce lot — les 7 redirections vérifiées mènent à des écrans déjà peuplés (comptes, projets, vivier), aucune page neuve à vérifier vide.',
  },
  {
    key: 'objet_deux_maisons',
    sourceIssue: '#2154.31',
    label: 'un objet existe dans deux maisons',
    status: 'not_yet_evaluable',
    evidence: 'Non vérifié pour le produit entier ; hors de la portée du registre à 21 routes de ce lot.',
  },
  {
    key: 'bouton_sans_effet',
    sourceIssue: '#2154.31',
    label: 'un bouton ne mène à rien',
    status: 'not_yet_evaluable',
    evidence: 'Non vérifié — aucun écran neuf créé par ce lot, rien à auditer de nouveau.',
  },
  {
    key: 'nav_desktop_mobile_divergentes',
    sourceIssue: '#2154.31',
    label: 'la navigation desktop et mobile divergent fonctionnellement',
    status: 'not_yet_evaluable',
    evidence:
      'e2e/tests/web-mobile/screen-reach.spec.ts existe et garde le plancher tactile 44px et la portée mobile de /onboarding, mais ne couvre pas les 21 routes de ce registre.',
  },
  {
    key: 'permission_contournee',
    sourceIssue: '#2154.31',
    label: 'une permission est contournée',
    status: 'not_yet_evaluable',
    evidence:
      'Les 7 redirections vérifiées ne posent aucune permission elles-mêmes (`permissions: null` au registre) — la porte, si elle existe, vit à la destination, non auditée ici.',
  },
  {
    key: 'donnee_privee_fuit',
    sourceIssue: '#2154.31',
    label: 'une donnée privée fuit',
    status: 'not_yet_evaluable',
    evidence: 'Non audité par ce lot.',
  },
  {
    key: 'import_incomplet',
    sourceIssue: '#2154.31',
    label: 'un import ne remplit pas les surfaces attendues',
    status: 'not_yet_evaluable',
    evidence: 'Aucun import concerné par les 21 routes de ce registre.',
  },
  {
    key: 'job_non_repris',
    sourceIssue: '#2154.31',
    label: 'un job ne peut pas être repris',
    status: 'not_yet_evaluable',
    evidence: 'Aucun job asynchrone concerné par une redirection de route pure.',
  },
  {
    key: 'utilisateur_doit_connaitre_anciennes_pages',
    sourceIssue: '#2154.31',
    label: "l'utilisateur doit encore connaître les anciennes pages pour finir son travail",
    status: 'clear',
    evidence:
      "Pour les 8 routes redirigées du registre #2154.3/#2208 (28/09, extension #2958), l'ancienne URL fonctionne encore et mène directement à la nouvelle capacité (vérifié par route-migration-registry.test.ts) : rien n'y oblige à connaître la nouvelle adresse. Statut scopé aux 21 routes nommées, pas au produit entier.",
  },
  {
    key: 'objet_duplique',
    sourceIssue: '#2958.95',
    label: 'un objet dupliqué (=#2208.95)',
    status: 'clear',
    evidence:
      "Scopé aux 14 routes : aucune des 7 redirections ne CRÉE de ligne (pur `redirect()` client-side, `route-migration-registry.test.ts` le vérifie) — rien de nouveau à dupliquer. Le filet produit-wide qui s'appliquerait si un écran de destination créait un doublon : `packages/contracts/src/schemas/talent-duplicates.ts:14-16` (« on PROPOSE une fusion, on ne fusionne JAMAIS ») et `packages/contracts/src/schemas/opportunity-duplicate.ts:6-8`, tous deux avec un appelant réel (`apps/api/src/modules/consultants/talent-identity.service.ts:126-129`, `apps/api/src/modules/projects/project-pipeline.service.ts:387-388`) — jamais un merge automatique.",
  },
  {
    key: 'statut_sans_preuve',
    sourceIssue: '#2958.101',
    label: 'un statut sans preuve (=#2208.101)',
    status: 'clear',
    evidence:
      "Scopé aux 14 routes : `targetStatus` du registre (#2154.3) n'est JAMAIS déclaré à la main — `route-migration-registry.test.ts` relit le contenu réel du fichier de route et fait échouer la CI en cas de désaccord ; c'est la condition « statut sourcé » appliquée À CETTE migration, pas seulement invoquée. Le filet produit-wide : `packages/contracts/src/schemas/provenance.ts:32-42,136` (rang `human > connector > pipeline > model`, `decideFieldWrite`) avec appelant réel `apps/api/src/modules/crm/crm-import.service.ts:486` et `packages/contracts/src/schemas/org-graph-merge.ts:1,158`.",
  },
  {
    key: 'source_indisponible_zero',
    sourceIssue: '#2958.102',
    label: 'une source indisponible rendue zéro (=#2208.102)',
    status: 'clear',
    evidence:
      'Scopé aux 14 routes : les 4 dimensions `gap` de `route-migration-nonregression.ts` (erreur, mobile, lien_partage, retour_navigateur) portent `file: null` et une raison nommée — jamais une valeur inventée qui ressemblerait à une mesure. Le filet produit-wide : `apps/web/src/components/primitives/UnknownValue.tsx:44` (jamais `{value ?? 0}`), gardé mécaniquement par GA-19 (`apps/web/src/architecture/display-primitives.test.ts:384`, cliquet sur `?? 0`) et GA-18 bis (`:443`, vérifie que `UnknownValue` a un appelant réel, ex. `apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:787`).',
  },
]

export const GO_CONDITIONS: readonly GoCondition[] = [
  {
    key: 'registre_migration_complet',
    sourceIssue: '#2154.32',
    label: 'registre de migration complet',
    status: 'not_met',
    humanOnly: false,
    evidence:
      "route-migration-registry.ts (#2154.3) couvre les 21 routes nommées par #2154.4/.5 et #2208.10-.31 (28/09, extension #2958), pas « toutes les routes actuelles » que #2154 exige pour ce GO — le registre existe, il n'est pas complet au sens de la condition.",
  },
  {
    key: 'tests_e2e_verts',
    sourceIssue: '#2154.32',
    label: 'tests E2E verts',
    status: 'not_met',
    humanOnly: false,
    evidence:
      "e2e/tests/ existe et est mesuré vert (42/45 exécutions le 14/09/2026, e2e-nightly.yml) mais ne couvre qu'onboarding, login et mobile — sur les 18 scénarios nommés par #2154.11-.29, seuls 5 ont un test d'intégration Vitest dédié (manager/membre sur Pilotage, favori/Veille/Écritures) ; les 13 autres (demande Laura multi-étapes, matching depuis un besoin, deux utilisateurs simultanés…) n'en ont aucun. legacy-addresses.test.ts couvre en plus, séparément, les 8 anciennes URLs du registre (#2208.71) — une capacité générale, pas les 18 scénarios nommés.",
  },
  recette2154('recette_herve', 'recette Hervé'),
  recette2154('recette_antoine', 'recette Antoine'),
  recette2154('recette_manager', 'recette manager'),
  {
    key: 'comparaison_avant_apres',
    sourceIssue: '#2154.32',
    label: 'comparaison avant/après',
    status: 'not_met',
    humanOnly: false,
    evidence: 'Aucune des onze métriques de #2154.30 n’est instrumentée — rien à comparer.',
  },
  {
    key: 'captures_desktop_mobile',
    sourceIssue: '#2154.32',
    label: 'captures desktop/mobile',
    status: 'not_met',
    humanOnly: false,
    evidence: 'Aucune capture versionnée trouvée pour les 21 routes du registre.',
  },
  {
    key: 'laura_parcours_sans_apprentissage',
    sourceIssue: '#2154.32',
    label:
      'validation que Laura peut accomplir un parcours commercial complet sans apprentissage préalable de la navigation',
    status: 'unknown',
    humanOnly: false,
    evidence: 'Aucun scénario E2E nommé (#2154.11-.29) ne le vérifie encore.',
  },
]

/** GO seulement si aucun NO-GO n'est `blocked` ET que chaque GO est `met`.
 *  Avec l'état actuel du produit, ceci vaut nécessairement `false` — un
 *  résultat `true` aujourd'hui serait la preuve que la fonction ment. */
export function canGo(): boolean {
  const noBlocker = NO_GO_CONDITIONS.every(condition => condition.status !== 'blocked')
  const allMet = GO_CONDITIONS.every(condition => condition.status === 'met')
  return noBlocker && allMet
}
