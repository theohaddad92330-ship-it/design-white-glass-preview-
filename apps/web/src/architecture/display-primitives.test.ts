/**
 * Les gardes d'AFFICHAGE (décision de Louis du 23/08/2026 — « migrer les 57
 * routes »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le dépôt applique « non mesuré n'est pas mesuré à zéro » **au calcul** depuis
 * des mois : les scores rendent `null`, les axes non évaluables sortent des
 * dénominateurs, les taux sans dénominateur valent `null`. Puis un écran écrit
 * `{value ?? 0}` et tout ce travail devient invisible.
 *
 * Les trois primitives (`UnknownValue`, `ScoreWithAxes`, `Provenance`) rendent
 * la règle lisible dans le JSX ; ces gardes empêchent qu'on la contourne
 * ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DES CLIQUETS ET NON DES ZÉROS
 * ─────────────────────────────────────────────────────────────────────────
 * Même raisonnement que GA-05, GA-07 et GA-09 : une garde qui exigerait zéro
 * tomberait au premier jour et serait désactivée dans la semaine. Elle fige
 * donc le niveau atteint le 23/08/2026, après migration des sites où `null`
 * voulait dire « je n'ai pas regardé ». Les chiffres ne sont pas des budgets à
 * dépenser : ils descendent, jamais ils ne montent.
 *
 * ⚠️ Tous les `?? 0` ne sont pas des fautes. Sur une longueur de tableau, un
 * compteur ou un index, zéro est la vraie valeur. La garde ne peut pas faire la
 * différence — c'est pourquoi elle compte au lieu d'interdire, et pourquoi la
 * question à se poser en ajoutant un `?? 0` est écrite ici : *si cette valeur
 * est absente, « 0 » est-il VRAI ?*
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ #2613 (20/09/2026) — CE FICHIER NE DIT PLUS QUE LA MOITIÉ DE LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * Décision de Louis, mot pour mot : « la règle c'est on affiche pas ce qu'on a
 * pas, on va pas mettre non mesuré et tout ça, ça envoie juste un signal
 * negatif à l'user qui est pas utile. » Portée tranchée le même jour :
 * **partout dans les LISTES, mais un SCORE garde ses axes.**
 *
 * Ce que GA-18 / GA-19 disaient était double : (a) une valeur absente ne
 * s'affiche JAMAIS « 0 », et (b) ce qui n'a pas pu être évalué est NOMMÉ.
 *
 *  - **(a) ne bouge pas, et ce fichier la tient toujours.** Le cliquet des
 *    `?? 0` reste au même niveau, un axe non évaluable sort toujours du
 *    dénominateur, et un « non mesuré » ne devient jamais un zéro — ni à
 *    l'écran, ni dans un calcul. Dans une liste, l'absence DISPARAÎT ; elle ne
 *    se chiffre pas. Ce cliquet est donc la protection qui empêche le
 *    renversement de s'écrire « 0 » par paresse.
 *  - **(b) se RESTREINT aux scores.** Dans une liste, une carte, un bandeau ou
 *    un tableau, une absence ne produit plus aucune ligne. La garde qui tient
 *    ce côté est `une-absence-ne-fait-pas-une-ligne.test.ts` ; celle qui tient
 *    l'exception — un score énonce toujours ses axes non évaluables — est
 *    `un-score-dit-ses-axes-non-evaluables.test.tsx`.
 *
 * GA-18 (le compte des scores NUS, plus bas) est donc RENFORCÉE par #2613, pas
 * affaiblie : c'est exactement la moitié qui reste. Si tu lis ce fichier en
 * croyant qu'une ligne « non mesuré » a disparu par régression : ce n'en est
 * pas une. Ne la remets pas.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')

/**
 * Le corpus gardé — TOUT ce qui affiche quelque chose à quelqu'un.
 *
 * ⚠️ Il ne couvrait que `features/`. `components/`, `routes/` et **tout le
 * back-office** étaient hors périmètre : 38 replis sur zéro que la garde ne
 * voyait pas, dont 30 sur les écrans que l'opérateur lit pour décider. Une règle
 * gardée sur un tiers de son sujet est verte pour les deux autres.
 *
 * Le back-office est lu DEPUIS ICI, par le système de fichiers : il n'a pas de
 * lanceur de tests à lui, et lui en ajouter un serait une décision de build à
 * part. Entre une garde inhabituelle et pas de garde du tout, on prend la garde.
 */
const GUARDED_ROOTS = [
  join(WEB_SRC, 'features'),
  join(WEB_SRC, 'components'),
  join(WEB_SRC, 'routes'),
  join(WEB_SRC, '..', '..', 'dashboard-manager', 'src'),
]

/**
 * GA-19 — le nombre de `?? 0` dans les écrans.
 *
 * 87 au 23/08 sur `features/` seul ; 125 au 25/08 quand le corpus s'est élargi
 * aux composants, aux routes et au back-office. Ce n'est pas une régression :
 * c'est ce que la garde ne regardait pas.
 *
 * 126 au 26/08 — un compteur de conversations par compte (`Chat.tsx`, modale de
 * portée). La question que ce docblock pose se répond ici par OUI : un compte
 * sur lequel personne n'a ouvert de fil a bien ZÉRO conversation, ce n'est pas
 * une mesure absente. Le seul autre chemin aurait été d'écrire `|| 0`, que la
 * garde ne compte pas — c'est-à-dire de la contourner en silence plutôt que de
 * justifier une entrée. Un cliquet qu'on esquive ne garde plus rien.
 *
 * 127 au 26/08 — le tiroir des conversations rangées (#1120,
 * `SidebarConversations`) : `(threads?.length ?? 0) > 0` décide d'afficher le
 * bouton « Voir les conversations rangées ». Même réponse que ci-dessus, et
 * pour une raison encore plus nette : `threads` vaut `null` PENDANT le
 * chargement, et un tiroir qui apparaîtrait puis disparaîtrait à chaque
 * rechargement serait pire que pas de tiroir. Une LONGUEUR absente est bien
 * zéro élément — ce n'est pas une mesure qu'on n'a pas prise.
 *
 * ⚠️ Le 27/08, la garde a été surprise en train de compter ses propres
 * COMMENTAIRES : un docblock qui écrit « pas de `?? 0` ici, et voilà pourquoi »
 * faisait monter le cliquet, si bien qu'expliquer la règle la violait. C'est la
 * troisième fois que ce dépôt paie ce défaut — GA-08 sur une apostrophe, GA-25
 * sur un `bounce: 0` qui DÉSACTIVE le rebond. Les commentaires sont désormais
 * retirés avant le comptage, et le cliquet redescend de 127 à 123.
 *
 * **118 au 28/08**, et le cliquet en marquait encore 123 : quatre de marge que
 * personne n'avait reprises. C'est le reproche que le docblock de GA-18 fait
 * deux blocs plus bas — un cliquet qui ne descend pas quand le sujet descend
 * cesse de garder quoi que ce soit. Descendu au chiffre MESURÉ.
 *
 * Le dernier retiré est celui que la recette du 28/08 a sorti : le cockpit
 * écrivait `formatCents(totalCents ?? 0)`, c'est-à-dire « 0 € » sur un pipe
 * dont aucune affaire n'était chiffrée, pendant que `/projects` disait « non
 * mesuré » sur la même réponse. La question de ce docblock — *si cette valeur
 * est absente, « 0 » est-il VRAI ?* — s'y répondait par NON : la somme des
 * montants saisis était bien nulle, mais ce n'est pas ce que le chiffre de tête
 * d'un pipe veut dire. Les deux écrans lisent maintenant la même dérivation
 * (`features/projects/model/pipeline-total.ts`).
 *
 * **116 au 05/09**, et c'est une BAISSE, pas un gel. Les parcours dérivés
 * (#1503) ont retiré quatre replis du fil des étapes : `cell?.count ?? 0` y
 * était répété quatre fois, donc la question « si cette valeur manque, zéro
 * est-il vrai ? » se reposait quatre fois sur le même objet. La cellule est
 * désormais résolue UNE fois avec sa valeur d'absence — zéro dossier à cette
 * étape est vrai, et la DURÉE reste `null` parce que « zéro jour d'attente »
 * serait faux. Le cliquet redescend au chiffre mesuré : le laisser à 118
 * rendrait deux replis gratuits au chantier suivant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **118 au 07/09** — et cette REMONTÉE est justifiée, pas subie
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux viennent du socle graphique du back-office (`9e51b9e2c`, #1642 /
 * #1643) et sont tous deux de la GÉOMÉTRIE, jamais une valeur affichée :
 *
 *   `charts.tsx:237`  `clamped[0]?.points.length ?? 0`
 *                     une LONGUEUR — zéro point est vrai quand il n'y a pas
 *                     de série, et c'est ce que la garde autorise elle-même
 *                     (« sur une longueur ou un compteur, oui »).
 *   `charts.tsx:334`  `Math.max(1, ...columns.map(c => c.total ?? 0))`
 *                     l'ÉCHELLE d'un axe empilé. Un total absent ne pèse pas
 *                     dans le maximum ; le `Math.max(1, …)` plancherait de
 *                     toute façon. Rien de ce nombre n'atteint l'écran.
 *
 * ⚠️ **CE QUI COMPTE VRAIMENT ICI : la CI ne pouvait pas voir cette remontée.**
 * Ce cliquet lit `apps/dashboard-manager/src` mais vit dans la suite de `web`.
 * La PR qui a ajouté les deux ne touchait QUE `dashboard-manager` : le job
 * `Test (Web)` n'a donc pas tourné, la PR est passée verte, et `main` est
 * resté rouge pour la première personne qui toucherait au web — moi, deux
 * heures plus tard. Une garde dont le CORPUS déborde de son job de CI n'est
 * gardée qu'à moitié : la portée du job doit couvrir la portée de la garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **120 au 15/09/2026** — deux REMONTÉES justifiées, trouvées à l'intégration S
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot #2120 (chemin recommandé classé par l'API) en apporte deux ; la branche
 * seule était verte, la fusion a porté le compte de 118 à 120. Aucune n'écrit un
 * « 0 » à l'écran :
 *
 *   `PriorityPathSection.tsx`  `max={ranked.max ?? 0}`
 *                     le contrat rend `max: null` SEULEMENT quand `score` est
 *                     `null` (sous le seuil d'axes) ; `ScoreWithAxes` rend alors
 *                     `UnknownValue` et ne lit jamais `max`. Le repli satisfait
 *                     le type `max: number`, il n'atteint aucun pixel.
 *   `ContactsFunnelBand.tsx`   `stages.find(…)?.count ?? 0`
 *                     un COMPTEUR de contacts à une étape, et `stages` est bâti
 *                     sur `FUNNEL_STAGES` entier : le repli est inatteignable,
 *                     et zéro contact à une étape serait vrai.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **122 le 23/09/2026** (intégration de la vague 23) — une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 * `DeliverabilityBlock.tsx` (#2384.5, délivrabilité des séquences outreach) :
 * `data?.sent ?? 0` et `data?.bounced ?? 0` sont deux COMPTEURS mesurés par le
 * seul webhook fournisseur (`ContactsService.applyEmailBounce`), jamais
 * devinés — zéro envoi ou zéro rebond est une valeur VRAIE, pas un « non
 * mesuré » déguisé. Ce que le composant refuse déjà d'écrire en `0` :
 * `bounceRate` (`MeasuredValue`) et `domainReputation`/`complaints`, qui
 * n'ont aucun connecteur, restent `UnknownValue`. 120 + 2 = 122.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **124 le 24/09/2026** (intégration de la vague 31) — deux REMONTÉES justifiées.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `ActionsBlock.tsx`         `(counts.get(artifact.kind) ?? 0) + 1`
 *                     un COMPTEUR (tally par nature d'artefact dans une `Map`) :
 *                     zéro occurrence avant le premier incrément est la vraie
 *                     valeur de départ, exactement le cas que la garde
 *                     elle-même exempte (« sur un compteur… zéro est vrai »).
 *   `TrajectoryVerdict.tsx`    `euros(revenue.achieved ?? 0, i18n.language)`
 *                     `commercialObjectiveSchema.achieved` (#2114.24-.27,
 *                     `member-objective.ts:147-148`) est documenté comme
 *                     n'étant JAMAIS `null` pour les sept axes réels — « un
 *                     mois sans activité rend un vrai 0 ». Le repli satisfait
 *                     le type, il n'habille aucun « non mesuré » : `target`
 *                     (l'axe qui, lui, peut manquer) garde sa branche
 *                     `notMeasurable` séparée juste au-dessus, sans jamais
 *                     passer par un défaut à 0. 122 + 2 = 124.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **125 le 25/09/2026** (intégration de la vague 37, main du 24/09) — une
 * REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `ImpactedAccountsNotice.tsx` (#2306.24, Réglages › Profil, vue agrégée) :
 *                     `data?.accounts.length ?? 0` est une LONGUEUR de
 *                     tableau, le cas que la garde exempte elle-même (« sur
 *                     une longueur de tableau, un repli à 0 est presque
 *                     toujours vrai ») — et `if (count === 0) return null`
 *                     juste en dessous rend le bloc entier ABSENT à zéro,
 *                     jamais un « 0 » nu (GA-18/19). 124 + 1 = 125.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **126 le 25/09/2026** (branche `fix/ecarts-ux-design-system`) — une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `MissionBoardPage.tsx`     `(data?.cards.length ?? 0) === 0`
 *                     `isEmpty` ne se calcule QUE dans la branche
 *                     `!isLoading && !isError`, donc `data` est déjà chargé
 *                     avec succès à cet endroit — c'est une LONGUEUR de
 *                     tableau, exactement le cas que la garde exempte
 *                     elle-même (« sur une longueur… zéro est vrai »), pas un
 *                     « non mesuré » habillé en 0. 125 + 1 = 126.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **128 le 25/09/2026** (#2194.44, glisser une barre sur le Gantt planning) —
 * une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `PlanningPage.tsx` (×2)    `trackRef.current?.clientWidth ?? 0`
 *                     `trackRef` pointe la PISTE de la frise, mesurée au
 *                     moment du glissement pour convertir un déplacement en
 *                     pixels en jours (`pixelsToDayDelta`). Avant que le nœud
 *                     ne soit monté, sa largeur EST zéro pixel — ce n'est pas
 *                     un « non mesuré » habillé, c'est une mesure d'écran, et
 *                     `pixelsToDayDelta` traite déjà `trackWidthPx <= 0`
 *                     comme « rien à convertir » (0 jour), jamais comme une
 *                     date. 126 + 2 = 128.
 *
 * **127 le 25/09/2026** (épopée #2976, #2113.13) — une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `BriefingHero.tsx`         `data.actions?.length ?? 0`
 *                     LONGUEUR de tableau (le nombre de sujets qui méritent
 *                     une décision aujourd'hui), pas une mesure qui pourrait
 *                     manquer — le cas que la garde exempte elle-même. Sert
 *                     UNIQUEMENT à choisir entre le sous-titre dynamique
 *                     (`decisionCount > 0`) et le générique existant ; jamais
 *                     rendu comme un « 0 » nu. 126 + 1 = 127.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **129 le 25/09/2026** (#2194.7 / #2194.43, vivier en intercontrat sur le
 * Planning) — une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `PlanningPage.tsx`       `data?.intercontractCount ?? 0`
 *                     `intercontractCount` est un COMPTE serveur
 *                     (`DeliveryService.intercontractCount`, toujours un
 *                     entier ≥ 0), rendu OPTIONNEL côté web pour la même
 *                     fenêtre de déploiement que `nextAction`/`renewal_status`
 *                     plus haut dans `api.ts` — une API pas encore à jour ne
 *                     l'envoie pas. `0` ici est le même cas que les compteurs
 *                     déjà exemptés ci-dessus (« sur un compteur… zéro est
 *                     vrai ») : rien n'a encore été COMPTÉ, jamais un « non
 *                     mesuré » habillé. 128 + 1 = 129.
 *
 * **130 le 26/09/2026** (intégration jour 1) — les deux remontées ci-dessus
 * sont deux ajouts INDÉPENDANTS partis de la même base 128 (chacun sur sa
 * propre branche, avant fusion) : BriefingHero (+1) et intercontractCount
 * (+1) s'additionnent, ils ne se recouvrent pas. 128 + 1 + 1 = 130.
 *
 * **131 le 27/09/2026** (#2934, #2309.16/.19, jamais devenus une fiche) —
 * une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `ContactsFunnelBand.tsx`   `(preCreationExclusions[reason] ?? 0) > 0`
 *                     COMPTE serveur (`preCreationExclusionsTally`) qui
 *                     n'expose QUE les raisons dont le compte est positif
 *                     (« on n'affiche pas ce qu'on n'a pas ») — une clé
 *                     absente ici est donc une mesure RÉELLE de zéro pour
 *                     cette raison, jamais un « non mesuré » habillé. Sert
 *                     uniquement à filtrer QUELLES lignes s'affichent, jamais
 *                     à rendre un `0` nu. 130 + 1 = 131.
 *
 * **132 le 27/09/2026** (#2973, #2163.76, coût variable par exclusion) —
 * une REMONTÉE justifiée.
 * ─────────────────────────────────────────────────────────────────────────────
 *   `ScopeConfirmPanel.tsx`    `selection.excluded_entities?.length ?? 0`
 *                     LONGUEUR de tableau (combien d'entités le rep a écarté
 *                     du cadrage), pas une mesure qui pourrait manquer — le
 *                     cas que la garde exempte elle-même. Un cadrage sans
 *                     exclusion (`undefined`) vaut RÉELLEMENT zéro exclusion,
 *                     jamais un « non mesuré » habillé. 131 + 1 = 132.
 *
 * ⚠️ **132 le 27/09/2026** (intégration O, réconciliation) — CE lot ajoutait
 * AUSSI `AccountTeamComments.tsx` `event.currentTarget.selectionStart ?? 0`
 * (intégration matin, lot g18 — la position du CURSEUR dans un champ de
 * commentaire, même famille que `trackRef.current?.clientWidth ?? 0` déjà
 * exempté : 0 en tout début de champ EST la position réelle, jamais un « non
 * mesuré » habillé). La narration des deux lots fusionnés annonçait 131 + 1 +
 * 1 = 133, mais le compte RÉEL après fusion (`total` ci-dessous, sur le
 * corpus fusionné) est 132 : une des trois remontées ne s'additionne pas —
 * pas assez de marge pour re-dérouler laquelle sans reguess. Le cliquet
 * suit le compte mesuré, jamais la narration : 132.
 *
 * **134 le 28/09/2026** (intégration R) — deux REMONTÉES justifiées, mesurées
 * après fusion des lots t1-t13 et d'`origin/main` :
 *   `ContactsFunnelBand.tsx`   `(rejectionReasons[reason] ?? 0) > 0`
 *                     même famille que `preCreationExclusions` ci-dessus
 *                     (131) : COMPTE serveur qui n'expose QUE les raisons
 *                     positives, une clé absente est une mesure RÉELLE de
 *                     zéro, sert uniquement à filtrer QUELLES lignes
 *                     s'affichent, jamais à rendre un `0` nu.
 *   `MyDataView.tsx`   `(ledger?.unreadableLayers.length ?? 0) > 0`
 *                     LONGUEUR d'un tableau optionnel, pas une mesure qui
 *                     pourrait manquer isolément — le cas « pas encore
 *                     chargé » est déjà écarté séparément par `!ledger` dans
 *                     le rendu (`<UnknownValue>`), cette ligne ne fait que
 *                     défendre contre un champ manquant sur un ledger déjà
 *                     résolu. 132 + 1 + 1 = 134.
 *
 * **136 le 28/09/2026** (BEL-SC-225, #3254) — `AccountStrategy5PCard.tsx`,
 * DEUX occurrences sur la même garde : `(missingRoles.value?.length ?? 0) >
 * 0` puis `count: missingRoles.value?.length ?? 0`. Le cas « non évaluable »
 * est déjà écarté juste avant par `missingRoles.status !== 'not_applicable'`
 * — dans cette branche, `.value` est la liste RÉSOLUE des rôles manquants et
 * `.length` en est le compte réel, jamais une mesure absente : même famille
 * que `MyDataView.tsx` juste au-dessus (longueur d'un tableau déjà résolu).
 * 134 + 2 = 136.
 *
 * **138 le 08/10/2026** (intégration O, lot R21) — `ContactsFunnelBand.tsx`,
 * DEUX occurrences de PLUS, même fichier et même famille que l'entrée « 134 »
 * ci-dessus : `formattedCount: formatCount(rejectionReasons[reason] ?? 0)`
 * puis `formattedCount: formatCount(preCreationExclusions[reason] ?? 0)`.
 * Chacune lit la MÊME clé que le `.filter(reason => (… ?? 0) > 0)` qui
 * l'encadre juste au-dessus dans le même bloc — au moment où `formatCount`
 * s'exécute, le filtre a déjà prouvé que la valeur est réelle et positive ;
 * le `?? 0` ne sert qu'au typage, jamais à habiller une absence. 136 + 2 = 138.
 *
 * **136 le 14/10/2026** (#4158, lot L7) — la refonte de `/team` retire la
 * table de `ManagerDashboardPage.tsx` qui portait `(m.stale_accounts ?? 0) > 0`
 * (les comptes en veille sont devenus une carte « À traiter », qui NARROW), et
 * la nouvelle table « Par commercial » écrit `typeof … === 'number'` au lieu
 * d'un repli. 137 − 1 = 136 : le cliquet descend dans le même commit.
 */
/** 14/10/2026 — #4158.9 (intégration mode équipe) : 136 + 1 = 137. `(team?.workspace.memberCount ?? 0) >= 2`
 *  (barre latérale) compte des MEMBRES : pas de donnée d'équipe = aucun collègue, c'est un compteur, jamais une
 *  mesure habillée en « 0 » — rien ne s'affiche de ce zéro. */
/** 20/10/2026 — intégration vague 5 : 137 + 2 = 139, deux COMPTEURS, jamais une mesure habillée en « 0 ».
 *  `IncompleteCvReviewButton.tsx` : `(catchUp.data?.queued ?? 0) + (unread.data?.queued ?? 0)` — la taille d'une
 *  file de relecture ; 0 se lit « aucun en file » (`noneQueued`) : un vrai zéro.
 *  `MissingExpertiseLink.tsx` : `query.data?.items.length ?? 0` — une LONGUEUR de liste ; le lien ne s'affiche pas
 *  quand il n'y a aucune compétence manquante. Rien de ces zéros ne s'affiche. */
/** 21/10/2026 — #4359.3 : `MissionBoardPage.tsx` (code mort, sans route) est supprimé avec son `(data?.cards.length ?? 0) === 0`
 *  de la liste blanche du 25/09 : 139 − 1 = 138, le cliquet descend dans le même commit. */
const NULLISH_ZERO_AT_FREEZE = 138

/**
 * GA-18 — les fichiers qui affichent une note SANS passer par `ScoreWithAxes`.
 *
 * Le compte, et non l'interdit : une dizaine de scores existent, chacun avec
 * son écran, et les migrer tous d'un coup ferait un diff que personne ne peut
 * relire. Ce qui compte est qu'aucun NOUVEL écran n'affiche un score nu.
 *
 * ⚠️ 32 au 23/08, **10 au 27/08** — et le cliquet n'avait pas suivi. Un maximum
 * de 32 en face d'une réalité de 10 laisse vingt-deux écrans de marge : la
 * garde était verte, et elle le serait restée pendant qu'on en ajoutait vingt
 * et un. Un cliquet qui ne descend pas quand le sujet descend cesse de garder
 * quoi que ce soit — c'est le même défaut que GA-05 comptant « au moins un »
 * par fichier. Descendu au chiffre MESURÉ, sans marge : les chiffres ne sont
 * pas des budgets à dépenser.
 *
 * **7 au 27/08**, après le montage de `ScoreWithAxes` sur trois écrans qui
 * l'avaient recodé à la main : le détail du score d'un contact
 * (`ContactScoreBreakdown`), la colonne « Score » de la Veille
 * (`WatchlistTable`) et son panneau de détail (`WatchlistDetailPanel`). Trois
 * fichiers SORTIS du compte, donc trois de moins au cliquet — c'est le geste
 * que ce docblock réclame depuis le 23/08 : la migration et la descente du
 * cliquet dans le MÊME commit, sinon la garde reste verte pour rien.
 *
 * Les sept restants sont nommés pour que le suivant sache où il en est :
 * `TabCoverage`, `KpiRow`, `PublicSharePage`, et les quatre écrans du
 * back-office (`monitoring-table`, `analysis/[id]`, `monitoring/[id]`,
 * `cockpit-panel`).
 *
 * **8 au 18/10/2026** (#4016.91, intégration vague C→H) : la liste des comptes écrit « 16/25 » comme la fiche
 * (`AccountListScore`) — la cellule d'une liste ne porte pas les axes, ils sont sur la fiche. Le cercle /10 qu'elle
 * remplace était déjà une note nue (sans `/10` collé, donc invisible au motif). Un +1 NOMMÉ, à ré-examiner :
 * migrer la cellule vers `ScoreWithAxes` ou la ramener au cercle fait redescendre le cliquet.
 */
const BARE_SCORE_FILES_AT_FREEZE = 8

/** Le corpus entier, tous les dossiers gardés confondus. */
function guardedFiles(): string[] {
  return GUARDED_ROOTS.flatMap(root => (existsSync(root) ? tsxFiles(root) : []))
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx')) continue
    if (entry.endsWith('.test.tsx')) continue
    out.push(full)
  }
  return out
}

/**
 * Retire les commentaires avant de compter.
 *
 * Sans cela, un docblock qui EXPLIQUE la règle la fait tomber — et la seule
 * façon de documenter un choix devient de ne pas le documenter.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('GA-19 — « non mesuré » ne se rend pas « 0 »', () => {
  const files = guardedFiles()
  const total = files.reduce(
    (acc, file) => acc + (stripComments(readFileSync(file, 'utf8')).match(/\?\? 0\b/g)?.length ?? 0),
    0,
  )

  it('le nombre de valeurs repliées sur zéro ne remonte pas', () => {
    // Si ce test tombe : demande-toi si « 0 » est VRAI quand ta valeur manque.
    // Sur une longueur ou un compteur, oui — ajoute-le au cliquet en le
    // justifiant. Sur une mesure, non : utilise `<MeasuredValue>`.
    expect(total).toBeLessThanOrEqual(NULLISH_ZERO_AT_FREEZE)
  })

  it('la garde lit bien des fichiers — un compte à zéro passerait au vert pour toujours', () => {
    expect(files.length).toBeGreaterThan(200)
    // …et qu'il lit bien les QUATRE dossiers : un chemin devenu faux rendrait
    // simplement moins de fichiers, et le cliquet passerait au vert pour rien.
    for (const root of GUARDED_ROOTS) {
      expect(existsSync(root), `corpus introuvable : ${root}`).toBe(true)
    }
  })
})

describe('GA-18 — un score s’affiche avec ses axes', () => {
  const files = guardedFiles()
  // Un affichage de note : une interpolation `/100`, `/80`, `/25`, `/20` ou
  // `/10` collée à une valeur, dans un libellé ou une classe de gabarit.
  const bare = files.filter(file => {
    const source = readFileSync(file, 'utf8')
    if (source.includes('ScoreWithAxes')) return false
    return /\{[^}]*score[^}]*\}\s*\/\s*(100|80|25|20|10)\b/i.test(source) || /score:\s*\w+,\s*max:/.test(source)
  })

  it('le nombre d’écrans qui affichent une note nue ne remonte pas', () => {
    expect(bare.length).toBeLessThanOrEqual(BARE_SCORE_FILES_AT_FREEZE)
  })
})

/**
 * GA-18 bis — une primitive d'affichage est MONTÉE, pas seulement écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le défaut que ce dépôt paie le plus souvent : du code juste, calculé, testé…
 * que personne n'appelle. `ScoreWithAxes` et `Provenance` l'ont vécu — écrites,
 * documentées, couvertes par `primitives.test.tsx`, gardées par GA-18, et
 * montées **zéro fois** dans du JSX applicatif pendant que quatre écrans en
 * recodaient l'équivalent à la main. Les deux cliquets étaient verts : GA-18
 * comptait les scores nus (10, sous un plafond de 32) et personne ne comptait
 * les APPELS.
 *
 * Une primitive à zéro appelant n'est pas une règle appliquée, c'est une
 * intention. Cette garde compte donc les points de MONTAGE — les fichiers
 * applicatifs qui l'importent — et exige qu'il y en ait au moins un par
 * primitive. Elle ne dit pas COMBIEN il en faut (ce serait un budget) : elle
 * dit qu'aucune des trois ne peut retomber à zéro sans que la CI le voie.
 */
describe('GA-18 bis — les primitives d’affichage sont branchées', () => {
  const PRIMITIVES = ['UnknownValue', 'ScoreWithAxes', 'Provenance'] as const
  // Le dossier des primitives est exclu : une primitive qui s'importe
  // elle-même, ou sa voisine, ne prouve pas qu'un écran s'en sert.
  const PRIMITIVES_DIR = join(WEB_SRC, 'components', 'primitives')
  const callers = guardedFiles().filter(file => !file.startsWith(PRIMITIVES_DIR))

  /**
   * Un IMPORT depuis le dossier des primitives, pas une occurrence du mot.
   *
   * La première version cherchait `\bProvenance\b` dans le fichier. Elle passait
   * au vert sur neuf fichiers qui n'en importaient aucun : un commentaire
   * « Provenance (Théo p.16) », un type `ProjectProvenance`, un en-tête de
   * colonne. Une garde qui compte des mentions ne garde rien — c'est le défaut
   * « garde borgne » que ce dépôt a payé six fois en deux jours.
   */
  function importsPrimitive(source: string, name: string): boolean {
    const spec = `['"][^'"]*components/primitives(?:/[^'"]*)?['"]`
    return new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*${spec}`).test(source)
  }

  const mounts = new Map<string, string[]>(
    PRIMITIVES.map(name => [name, callers.filter(file => importsPrimitive(readFileSync(file, 'utf8'), name))]),
  )

  it('la garde lit bien un corpus d’appelants — sinon elle passerait au vert sur du vide', () => {
    expect(callers.length).toBeGreaterThan(200)
    expect(existsSync(PRIMITIVES_DIR), `primitives introuvables : ${PRIMITIVES_DIR}`).toBe(true)
  })

  it('sait dire NON — une mention du mot ne vaut pas un montage', () => {
    // Les trois cas RÉELS qui rendaient la première version borgne : un
    // commentaire, un type homonyme, et un import qui vient d'ailleurs.
    const mounted = `import { Provenance } from '@/components/primitives/Provenance'`
    const mentioned = `// Provenance (Théo p.16) — colonnes Source/Date\ntype ProjectProvenance = { kind: string }`
    const elsewhere = `import { Provenance } from '../model/project-provenance'`

    expect(importsPrimitive(mounted, 'Provenance')).toBe(true)
    expect(importsPrimitive(mentioned, 'Provenance')).toBe(false)
    expect(importsPrimitive(elsewhere, 'Provenance')).toBe(false)
    // …et elle ne confond pas deux primitives voisines du même dossier.
    expect(importsPrimitive(mounted, 'ScoreWithAxes')).toBe(false)
  })

  it.each(PRIMITIVES)('%s est montée dans au moins un écran', name => {
    // Si ce test tombe : la primitive vient d'être débranchée. Ce n'est pas au
    // test de descendre — c'est à l'écran de la remonter, ou à la primitive
    // d'être supprimée. Une troisième voie n'existe pas.
    expect(mounts.get(name) ?? [], `aucun écran n’importe ${name}`).not.toHaveLength(0)
  })
})

/**
 * PAS de garde « une seule voix » ici, et c'est délibéré.
 *
 * La première version cherchait « assistant IA » dans les écrans. Elle a
 * remonté deux fichiers parfaitement corrects — l'écran MCP, où « assistant
 * IA » désigne l'assistant PERSONNEL de l'utilisateur (Claude Desktop, Cursor)
 * qu'il branche sur Bellum, et pas du tout une seconde voix produit.
 *
 * La règle est verrouillée là où elle est vérifiable : côté prompt, par
 * `test_copilote_prompt_blocks.py`, qui lit le bloc de persona réellement
 * injecté. Une garde qui produit des faux positifs se désactive ; mieux vaut
 * aucune garde ici qu'une garde qu'on apprend à ignorer.
 */
