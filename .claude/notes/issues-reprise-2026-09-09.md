# Reprise — retours bêta, après le lot « le cockpit et Laura lisent le marché »

Coller ce fichier en entier dans une session neuve. Il **remplace**
`issues-reprise-2026-09-08-tard.md`, dont le §9 est maintenant livré.

Le diagnostic complet des 73 issues reste dans `.claude/notes/issues-vague-2026-09-07.md`
— **ne pas le refaire**, seulement re-vérifier dans le code.

## 0. ⚠️⚠️ À LIRE EN PREMIER — les outils qui MENTENT sur ce poste

- **`git`, `grep` et `ls` du PATH sont réécrits par le hook RTK** et rendent une
  sortie décalée, un RÉSUMÉ, ou du VIDE — sans erreur, avec `rc=0`. Tout ce qui
  fonde une décision passe par `/usr/bin/git`, `/usr/bin/grep`, `/bin/ls`.
  ⚠️ Payé encore dans ce lot : `/bin/ls .claude/notes/` a rendu **vide** sur un
  dossier de 90 fichiers. `/usr/bin/find` l'a listé.
- `--include=*.ts` non quoté fait planter la commande sous zsh. Toujours `'*.ts'`.
- ⚠️ **`node <chemin>/node_modules/.bin/vitest` ne marche pas** (script shell) et
  le harnais rend quand même « exit 0 » : un faux vert parfait.
  La forme qui marche : `pnpm --filter @bellum/web exec vitest run <chemins>`.
- ⚠️ **Le `cd` d'une commande de PREMIER PLAN persiste** pour les commandes
  suivantes (celui d'une commande de fond, non). Un `cd apps/api` suivi d'un
  `node /tmp/x.cjs` qui lit `apps/api/src/...` rend **0** sans échouer. Repartir
  de la racine à chaque commande qui lit des chemins relatifs.
- ⚠️ **`expect(valeur, 'message')` n'existe pas en JEST** (c'est vitest) :
  « Expect takes at most one argument ». Dans une garde d'architecture côté API,
  la cause se réinjecte DANS l'objet comparé (`expect({ key, ok }).toEqual({ key, ok: true })`).

## 1. Ce qui est TRANCHÉ — à ne pas reposer

Le §1 de `issues-reprise-2026-09-08-tard.md` tient toujours **en entier** (les
arbitrages du 08/09, les refus du 07/09, `matchingExpertises` unique, la raison de
ressemblance comme champ à part, « gagné = mission signée », le refus du profil
d'externalisation comparable, « jamais stack proche », une ESN en UNE ligne, pas de
NO-GO par absence, le seau résiduel filtré à l'affichage). **Le relire, ne pas le reposer.**

### Tranché dans CE lot (09/09)

- **La mémoire marché n'entre JAMAIS dans le premier critère d'un tri.** Elle
  départage, elle ne promeut pas. Sur les opportunités endormies l'ordre est :
  signal récent › force de la relation (nombre de preuves datées) › potentiel
  observé › date. Un compte massivement observé ne passe donc **ni** devant un
  signal récent, **ni** devant une relation mieux documentée — le sujet de ce bloc
  reste la relation qui a existé. Garde **GA-262**.
- **Le rang de marché est une PRÉSENCE, jamais un volume.** Trier sur le NOMBRE de
  parcours ferait remonter les grandes entreprises (le corpus en porte
  mécaniquement plus) : ce serait une mesure de TAILLE, le refus déjà inscrit
  contre `externalization_score` (#1640.6, GA-257). Gardé aussi par GA-262.
- **Le contexte du copilote se lit dans le CONTRÔLEUR, pas dans le service.** Un
  tour de chat est un geste d'utilisateur, et GA-07 n'a **qu'un slot libre**
  (mesuré : 253/254 imports, 124/124 fichiers). `MarketMemoryService` est donc
  injecté `@Optional()` dans `ia-proxy.controller.ts` — les `.controller.ts` sont
  exclus du balayage de GA-07 par construction, et deux lots avaient déjà été
  renvoyés du service au contrôleur pour cette raison exacte.
- **Le SENS d'un chiffre voyage AVEC le chiffre dans un prompt.** Le lecteur du
  contexte est un modèle qui PARAPHRASE : « 38 sur 62 » nu ressort en « 38 de tes
  comptes externalisent ». C'est la surface la plus risquée du dépôt pour la faute
  que GA-259 tient à l'écran. Ce n'est PAS une consigne de comportement déguisée en
  donnée : le bloc ne dit que ce que ses propres nombres signifient. Le ton, le
  format et le nombre de recommandations restent au prompt système.
- **`INTERACTION_ACTIVITY_KINDS` vit dans `@bellum/contracts`**, plus en constante
  locale du cockpit. Une note prise pour soi n'est pas un échange, et deux
  écritures de cette règle auraient divergé (la leçon de GA-53).
- **`marketPortfolioLookups`** (`apps/api/src/modules/market-memory/portfolio-lookups.ts`)
  est la SEULE mise en forme des clés du portefeuille. Ce qui se recopiait le plus
  facilement est le détail qui change le résultat : le PAYS (#1617).
- **Prochaine garde libre : GA-263.** Prochaine clé de doctrine : `c66_*`.

## 2. Ce qui est MERGÉ et RECETTÉ

- Tout le §2 de `issues-reprise-2026-09-08-tard.md` (PR #1755 → #1762). Inchangé.
- **PR #1763** (fusion `6348be593`) — #1573.6, #1573.7, #1574.1, #1574.3, #1581.1 + GA-262.
  **PASS**, mesuré : les deux cartes de « Des opportunités à réveiller » portent le badge
  (SNCF 135, BlaBlaCar 27), le popover ouvert AU CLIC dit « Bellum a observé… » sans
  aucune date, et **les deux gardent « Préparer la reprise »** alors qu'elles sont
  couvertes — le CTA ne bouge pas. « Aucun échange enregistré » remplace « Aucun échange,
  jamais » dans « Ma couverture ». Cartes à la même hauteur (144 px), aucun débordement,
  lisible en sombre (vérifié à la CAPTURE ZOOMÉE, pas au calcul). **13 routes balayées,
  0 erreur console**, deux non-2xx dont aucun n'est neuf.
  ⚠️ **Ce que la démo ne peut PAS montrer** : le nouveau rang de tri. Les deux comptes
  dormants ont le même nombre de preuves ET sont tous deux couverts — la clé de marché ne
  départage rien. Tenu par quatre tests, pas démontrable sur cette salle.
  ⚠️ **Ce que je n'ai pas pu vérifier** : ce que Laura RÉPOND (voir §3).

### La porte avant d'ouvrir Chrome

```sh
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"

gh api repos/Bellum-AI/belllum-monorepo/deployments \
  --jq '[.[] | select(.environment=="Production – bellum-web")][0] | "web \(.sha[0:9])"'
```

⚠️⚠️ **LE « RETARD DU SERVICE IA » N'EST PAS UN BLOCAGE — mesuré le 08/09 au soir, et
c'est une CORRECTION de cette note et de trois commentaires d'issue.**

```sh
git log --oneline cbe8cd335..origin/main -- apps/ia | wc -l   # → 0, sur 147 commits d'écart
```

**Zéro commit ne touche `apps/ia`.** Le service exécute un code Python identique à
`main`, copie Python des schémas comprise (`apps/ia/app/contracts/schemas/`, donc dans
le périmètre mesuré). C'est l'ÉTIQUETTE qui est périmée, pas le code : `/version` rend
le SHA du dernier build, et l'image n'a pas été reconstruite. `"environment": "unknown"`
sur le même objet est le second indice qu'on lit des variables de build.

**Donc `bellum_advisor.py` se touche normalement** : le déploiement ne portera que le
diff écrit. Les cinq points « bloqués » redeviennent du travail ordinaire.

⚠️ **ET LA CORRECTION DE LA CORRECTION — le déclencheur PART, il est LENT.**
Mesuré une heure après le merge : `api 6348be593 | ia 389f91b67`. Le service IA a bien
redéployé. Le constat « `watchPatterns` ne fire pas », écrit vingt minutes après le
merge, était **prématuré** : il n'y a pas de défaut d'infra.

Deux propriétés à connaître, et elles expliquent deux jours de confusion :

1. **la latence du service IA se compte en dizaines de minutes.** Une lecture faite trop
   tôt est indiscernable d'un déploiement qui n'est jamais parti ;
2. **le SHA rendu est la tête de `main` au moment du BUILD**, pas le commit déclencheur —
   d'où un `ia` en AVANCE sur l'`api`. La porte ne se lit donc pas « les deux SHA sont
   égaux » mais **« aucun service n'est en RETARD sur mon commit »**.

⚠️ **Bilan de la journée sur ce seul sujet : trois affirmations, deux fausses.** La seule
qui tenait portait une COMMANDE (`git log … -- apps/ia`). Les deux autres reposaient sur
une lecture d'ÉTAT prise à un instant. **Un état se relit avant d'être conclu ; une
commande se relance.**

## 3. Ce qui n'a JAMAIS pu être vérifié

- toute la recette du back-office (401 Basic Auth ; **Louis la fait lui-même**) ;
- la couverture mémoire marché **n'est pas semée en démo, et ne doit pas l'être**
  (les quatre tables `market_*` sont PARTAGÉES entre espaces concurrents) ;
- ⚠️⚠️ **ce que Laura RÉPOND — et la raison est structurelle, pas un périmètre.**
  Geste déroulé jusqu'à l'envoi le 08/09 sur `/accounts` : **la salle de démonstration
  n'appelle JAMAIS le modèle.** Réponse mot pour mot : « En espace de démonstration, mes
  réponses sont préparées à l'avance — aucun appel n'est fait au modèle. »
  **Corollaire à connaître avant de planifier quoi que ce soit sur Laura : aucun travail
  sur son CONTEXTE ni sur son PROMPT ne se recette en démo.** Ni #1581.1, ni le lot du
  format (#1581.2/.3, #1573.1). Seul l'espace de Louis peut les vérifier.
  Ce qui EST vérifié pour #1581.1 : le geste jusqu'à l'envoi, la portée annoncée
  (« 6 comptes analysés »), le CONTENU exact du bloc mesuré sur l'API de production
  (`accounts: 6, covered: 4, insufficient: 1, ambiguous: 0, unresolved: 1`,
  `structuralFit: null` ⇒ « non mesurable »), et dix tests ;
- ⚠️ **`GET /laura/plan` répond 401 sur la salle de démonstration.** Relevé au balayage du
  08/09 ; **pas causé par ce lot** (le module `laura` n'est pas touché) mais jamais
  documenté. Conséquence directe : **l'intervention proactive de Laura ne peut apparaître
  dans AUCUN cas sur la démo**, donc #1574.6 ne se verrait pas là où on montre le produit.
  À regarder avant de coder #1574.6 ;
- **#1591.1 / #1592.2 / #1611** : `expertise_areas` et `offer_domains` sont VIDES sur
  l'espace de démonstration ⇒ comportement juste, indiscernable d'un branchement
  absent. Ne se recettent que sur l'espace de Louis.

## 4. Ce qui RESTE, avec le découpage

| Lot | Issues | Pourquoi maintenant |
| --- | --- | --- |
| **#1573.1 (format), #1581.2, #1581.3** | le format de réponse de Laura | ✅ **PLUS BLOQUÉ** — la mesure du §2 renverse le blocage hérité. Lot ordinaire dans `bellum_advisor.py` : 3 recommandations max, VERDICT / pourquoi il remonte / pourquoi maintenant / ce qu'on ne sait pas / action. **C'est le lot le plus rentable qui reste** |
| **Le déclencheur de déploiement du service IA** | — | ⛔ **DÉFAUT D'INFRA, action de Louis** : `watchPatterns` ne fire pas (§2). À corriger AVANT le lot ci-dessus, sinon son travail ne partira pas |
| **#1574.6 — Laura proactive sur le cockpit** | #1574 | ⛔ décision : accepter une intervention SANS gradation (« 2 comptes silencieux que Bellum connaît ») ou attendre la normalisation par cohorte. Et `expertise_areas` vide en démo ⇒ jamais allumée là où on la montre |
| **Le dossier de compte, ce qui reste** | #1607.1, #1611, #1612, #1613, #1630, #1638 | #1607.1 (BELLUM READ) est une refonte du bloc de synthèse ; #1611 attend un profil ESN rempli ; #1613 attend une mesure SQL ; #1612/#1638 n'ont pas d'ingrédient |
| **#1632 — l'affinité techno observable** | #1632 | ⛔ livrée, **non observable** : 0 candidat couvert. Se rouvre quand le corpus ou les candidats bougent (voir #1756) |
| **#1756 — rapprochement corpus ↔ registre** | #1756 | ⛔ bloqué sur une décision (§5 de la note du 08/09, toujours valable). **Il débloquerait aussi #1632** |
| **#1634 — le territoire** | #1634 | ⛔ attend `SELECT count(*), count(city), count(region) FROM market_company_signal;`. Si `city`/`region` sont majoritairement nuls, l'issue TOMBE |
| Le traceur `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⛔ BLOQUÉ — relecture juridique RGPD (#1681.6) |
| `/billing` | #1639 | ⛔ arrêt obligatoire (facturation) |
| `/pilotage` | reste de #1440 | ⛔ valeurs de design littérales, refusées (couleurs fixes contre le thème, 13/15 px contre D80). Troisième fois qu'elles reviennent |

⚠️ **Corrigé le 08/09 au soir : il RESTE un lot non bloqué** — le format de réponse de
Laura (#1573.1 format, #1581.2, #1581.3). Le blocage qui l'en empêchait était une ligne
d'inventaire fausse, héritée sans être re-mesurée. Les sept autres lignes attendent
toujours une décision, une mesure ou une correction d'infra.

## 5. ~~La décision qui débloque le plus~~ — PÉRIMÉ, voir la correction du §2

⚠️ **Cette section était FAUSSE et se lit maintenant comme un avertissement.** Elle
présentait le retard d'étiquette du service IA comme un blocage produit ; la mesure du
§2 montre que zéro commit ne touche `apps/ia`. Elle est conservée telle quelle parce
qu'elle montre exactement comment un blocage hérité se propage : elle avait été reprise
d'une note de la veille, répétée dans trois commentaires d'issue et dans deux messages
de commit, sans qu'une seule commande ne soit lancée pour la vérifier.

**La règle qui en sort : un blocage hérité se re-mesure avant d'être répété.** Une ligne
d'inventaire datée redevient fausse toute seule — c'est la même leçon que #1440.4, payée
deux jours de suite.

Ce que le texte d'origine disait, et qui reste utile pour SAVOIR OÙ CODER :

- **#1573.1 (moitié FORMAT)** — 3 recommandations maximum, le CTA « Vérifier ce
  compte maintenant », « Un signal récent renforce la priorité » ;
- **#1581.2 / #1581.3** — le format VERDICT / pourquoi il remonte / pourquoi
  maintenant / ce qu'on ne sait pas / action proposée, aujourd'hui présent dans
  `bellum_advisor.py:204-228` mais **scopé aux questions ESN** (#1602) ;
- **#1606 / #1631** — déjà notés bloqués pour la même raison.

**Ce qu'il faut à Louis pour trancher :** est-ce qu'on déploie ces 119 commits d'un
coup (un seul merge qui touche `apps/ia`), ou est-ce qu'on veut d'abord relire ce
qu'ils contiennent ? Ce n'est pas un travail long — c'est un déploiement à faire les
yeux ouverts. **Tant que la réponse n'est pas écrite, tout ce qui touche au PROMPT de
Laura est à l'arrêt**, et la moitié des retours « mémoire marché » restants portent
sur ce que Laura DIT.

Le reste du §5 de la note du 08/09 (la piste alias de #1756, l'option A « le pack
livre les alias » contre l'option B « les alias viennent du registre ») reste valable
mot pour mot.

## 6. Les pièges d'outillage payés dans CE lot

- ⚠️⚠️ **GA-07 n'a plus qu'UN slot** : 253/254 imports service→service,
  **124/124 fichiers**. Concrètement : un service qui importe le service d'un autre
  module dans un fichier qui n'en importait aucun **fait échouer la CI**. Les
  `.controller.ts` et les `.module.ts` sont exclus du balayage — c'est là que passe
  une orchestration nouvelle. Mesure en dix secondes : le compteur est reproductible
  avec le filtre de `apps/api/src/architecture/module-boundaries.spec.ts`.
- ⚠️ **Ajouter un appel de service dans un chemin partagé casse les mocks des specs
  voisines.** `listCopilotAccountFacts` a fait tomber 4 tests de
  `chat-context.service.spec.ts` et 1 de `ia-proxy.controller.spec.ts` — aucun ne
  parlait de mémoire marché. Le mock se complète dans chaque suite, avec sa raison.
- ⚠️ **`ChatContextService` a un SECOND consommateur** : la surface MCP (`ask_bellum`)
  l'appelle pour résoudre exactement le même contexte. Elle ne passe pas
  `marketPortfolio` ⇒ le bloc marché n'apparaît pas côté MCP. Comportement juste
  (`null` = pas de bloc), mais à savoir avant de conclure à une panne.
- ⚠️ **`ReadonlyMap` contre `Map`** : extraire une lecture partagée qui rend la `Map`
  d'un contrat fait échouer le typecheck chez l'appelant. Le type de retour d'une
  lecture est `ReadonlyMap`.
- ⚠️ Le typecheck de l'API qui compte est **DEUX** commandes : `tsconfig.build.json`
  (le code) et `pnpm --filter @bellum/api check-types:tests` (les tests, exclus du
  premier).
