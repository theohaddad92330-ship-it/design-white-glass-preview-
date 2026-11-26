# Reprise — retours bêta, après le lot « raisons de ressemblance » du 08/09/2026

Coller ce fichier en entier dans une session neuve. Il **remplace**
`issues-reprise-2026-09-08-nuit.md`, dont le « reste » a bougé.

Le diagnostic complet des 73 issues reste dans `.claude/notes/issues-vague-2026-09-07.md`
— **ne pas le refaire**, seulement re-vérifier dans le code.

## 0. ⚠️⚠️ À LIRE EN PREMIER — deux outils qui MENTENT sur ce poste

- **`git` du PATH est réécrit par le hook RTK et rend une sortie DÉCALÉE D'UNE
  LIGNE**, sans erreur, avec `rc=0`. **Tout ce qui fonde une décision passe par
  `/usr/bin/git`.**
- **`grep` du PATH est réécrit aussi** et rend un RÉSUMÉ (« 70 matches in 1F »)
  au lieu des lignes. **`/usr/bin/grep`.** Idem `/bin/ls` (le `ls` du PATH a rendu
  une sortie VIDE sur un dossier de 90 entrées).
- `--include=*.ts` non quoté fait planter la commande sous zsh. Toujours
  `--include='*.ts'`.
- ⚠️ **`node <chemin>/node_modules/.bin/vitest` ne marche pas** (script shell) —
  et le harnais rend quand même « exit 0 » : un faux vert parfait. La forme qui
  marche : `pnpm --filter @bellum/web exec vitest run <chemins>`.
- ⚠️ Le `cd apps/api` d'une commande de fond **ne persiste pas** ; le `cd` d'une
  commande de premier plan, SI. Toujours repartir de la racine.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

Le §1 de `issues-reprise-2026-09-08-nuit.md` tient toujours (les quatre arbitrages
de Louis du 08/09, les refus du 07/09, `matchingExpertises` dans `@bellum/contracts`,
`MarketPreview` réduite à dessein, #1592.2 écarté). **Le relire, ne pas le reposer.**

### Tranché dans CE lot (08/09, fin de journée)

- **La raison d'une suggestion est UN champ à part** (`similarity_headline`), pas
  une quatrième valeur de `similarityReason`. Les deux répondent à des questions
  différentes : « en quoi ce compte ressemble à ce que TU cherches » (les critères
  du profil) contre « à quel compte de TON portefeuille il ressemble ».
- **Une seule raison par carte**, ordre `twin` › `tech` › critères du profil ›
  `sector`. Quand une raison NOMME un compte, la ligne des critères se tait.
- **« Gagné » = une mission SIGNÉE** (`missions.account_id`), jamais
  `commercial_status = 'customer'` qui est un tri manuel. Arbitrage de Louis.
  Seuil `SIMILAR_TWIN_MIN_MISSIONS = 3` dans l'espace.
  ⚠️ Ne pas confondre avec le refus du 21/08 (`SIMILAR_SEED_FLOOR`) qui refusait
  d'AMORCER sur les missions gagnées — ici on ne fait que NOMMER.
- **« Profil d'externalisation comparable » est ÉCARTÉ**, deux fois demandé
  (#1576 raison 3, #1632 critère 2). `externalization_score` n'est pas normalisé
  par cohorte ⇒ il mesure la TAILLE. Refus inscrit #1640.6, gardé GA-257.
  **Ne pas le re-proposer sans la normalisation par cohorte.**
- **L'aveu anonyme est remplacé par la provenance NOMMÉE** quand elle est connue
  (arbitrage de Louis : ses deux règles se contredisaient). L'aveu d'origine reste
  le repli pour une réponse d'API antérieure au champ.
- **Jamais « stack proche »** — le libellé est « Environnement technologique proche
  de {compte} : {technos} ». Garde **GA-260**.
- **Une garde peut CHANGER DE CÔTÉ sans que sa règle bouge.** GA-127 classait la
  barre du dossier « un seul niveau, pas de pastilles » ; #1604 lui en a donné
  deux, donc la garde en EXIGE désormais les pastilles. Quand une garde rougit sur
  un changement conforme, se demander si c'est sa CLASSIFICATION qui a vieilli,
  pas sa règle.
- **Une ESN se rend en UNE ligne**, portant ses `evidence_origins[]`. Revient sur
  #1579 : on fusionne la LIGNE, on garde les PREUVES. **Ne pas re-séparer.**
- **La mémoire marché ne peut JAMAIS produire un NO-GO par absence** (#1611).
  « PHP absent de la stack observée » ne prouve rien : c'est « non mesuré n'est pas
  zéro » appliqué à un échantillon. Règle générale, pas propre au plan d'action.
- **Le seau résiduel se filtre à l'AFFICHAGE**, jamais côté API — sinon deux
  dérivations. `isResidualRoleFamily`, le même que l'aperçu de `/search`.
- **Prochaine garde libre : GA-262.** Prochaine clé de doctrine : `c66_*`.

## 2. Ce qui est MERGÉ et RECETTÉ

- **PR #1757** (`530fba505`) — #1575.1, #1575.3. **PASS en production.**
- **PR #1758** (`cf85ccda2`) — les deux filtres qui ne partaient pas. **PASS.**
- **PR #1755** (`5b7a8a398`) — **PASS, vérifié le 08/09** : `market-preview` sur
  ORANGE rend `role_families: ["Chef de projet", "Data / IA"]` — le fourre-tout
  « Autre » ne mène plus.
- **PR #1759** (`fc7549021`) — #1576 + #1632, les raisons de ressemblance.
  **PARTIAL** : deux défauts trouvés à la recette (voir §2 bis).
- **PR #1760** (`166874498`) — les deux défauts de la recette. **PASS**, mesuré :
  la phrase passe de **91 px / 6 lignes** à **232 px / 2 lignes**, les trois cartes
  font la même hauteur (94 px contre 174/110 avant), « SOCIETE NATIONALE SNCF » a
  disparu de ses propres suggestions (remplacée par ITALO), contraste 6,37/5,28 en
  clair et 6,21/5,24 en sombre, **12 routes balayées, 0 erreur console**, un seul
  non-2xx (`412 /crm/pipeline/report`, préexistant, CRM non branché).
- **PR #1762** (`25d34fda4`) — #1605 + #1609 + #1611. **PASS**, mesuré : « Atos »
  déclarée sur SNCF sort en UNE ligne portant « Déclarée par ton équipe » +
  « Observation {{brand}} » + 3 parcours, et n'apparaît qu'UNE fois dans la page
  (bloc observé 6 → 5) ; les pistes de recherche écartent « Autre » (42 parcours,
  le plus gros) et rendent « Chef de projet 22 » + « Infra / Cloud 19 », le clic
  pré-remplissant la recherche ; 9 surfaces balayées, 0 erreur console, un seul
  412 préexistant. **#1605 et #1609 CLOSES**, **#1611 reste OUVERTE** (carte
  livrée, `expertise_areas: []` en démo ⇒ jamais allumée).
  ⚠️ Donnée créée pour la recette et LAISSÉE : « Atos » est déclarée sur SNCF dans
  l'espace de démonstration.
- **#1576 est CLOSE**, preuve écrite dans l'issue. **#1632 reste OUVERTE** — le
  moteur techno est livré et ne s'allume sur aucune carte (voir §2 bis c).
- **PR #1761** (`ae96f7171`) — #1604 (dossier en 4 familles) + #1607.2 (stack
  observée). **PASS** : deux portées mesurées (`y=315` / `y=358`), `?tab=partners`
  ouvre « Ouvrir » sans clic, 14 onglets relevés famille par famille, aucun
  débordement à 1 512 px, 9 routes balayées, 0 erreur console, un seul non-2xx
  (`412` CRM, préexistant). **#1604 et #1608 sont CLOSES**, #1607 reste ouverte
  pour son point 1 (BELLUM READ).

### La porte avant d'ouvrir Chrome

```sh
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"

gh api repos/Bellum-AI/belllum-monorepo/deployments \
  --jq '[.[] | select(.environment=="Production – bellum-web")][0] | "web \(.sha[0:9])"'
```

⚠️ **Le service IA reste 119 commits en retard** (`cbe8cd335`, PR #1717). Aucun
lot récent ne touche `apps/ia`, donc sans effet — mais la porte « TOUS les commits
servis sont les miens » ne se franchit pas telle quelle. **À signaler à Louis.**
⚠️ Le déploiement web ne part pas toujours tout seul (mesuré sur #1750). Vérifier
la ligne `Production – bellum-web` ; absente au bout de 5 min ⇒ Vercel → projet
`bellum-web` → ⋯ → **Create Deployment** → `main` → *Deploy to Production*.

## 2 bis. ⚠️ CE QUE LA RECETTE A TROUVÉ, ET QUI SE REFERA AILLEURS

**a. Un compte du portefeuille se proposait LUI-MÊME** — « SOCIETE NATIONALE
SNCF » proposée à partir de l'amorce « SNCF ». C'est le **jumeau non corrigé** du
défaut réglé deux heures plus tôt sur l'autre méthode (#1632, PR #1747).
Deux causes cumulées : l'exclusion se faisait sur le **nom d'affichage** (le
portefeuille porte ce que le commercial a tapé, le registre rend la raison
sociale — les deux ne se rencontrent jamais), et elle se lisait sur la **fenêtre
bornée à dix comptes** qui sert à amorcer.
⚠️ **Le geste à refaire ailleurs** : partout où une exclusion compare des
entreprises, vérifier qu'elle compare des **identités** (SIREN) et pas des
étiquettes, et qu'elle lit **la population entière** et pas une fenêtre.

**b. La ligne de raison ne disposait que de 91 px.** Mesuré au DOM :
« Ressemble à NOVA LOGISTIQUE (client d'exemple), où tu as gagné une mission »
tenait sur **six lignes, 112 px**, contre 110 px pour la carte voisine ENTIÈRE.
Un nom de compte est du **texte libre** : sa longueur n'est bornée par rien.
⚠️ jsdom ne met rien en page : le test tient la **structure** (la raison est sœur
de la ligne, pas enfant de la colonne du milieu), et il a été vérifié qu'il rougit
quand on remet la raison dans la colonne.

**c. `tech` ne s'allume sur AUCUNE carte** — et c'est mesuré, pas supposé :
`GET /companies/market-paths` rend `null` sur les 4 candidats proposés, alors que
les comptes du portefeuille sont bien couverts (SNCF 135, Thales 272, Société
Générale 267, BlaBlaCar 27). Le moteur est livré et testé ; il attend que les
suggestions deviennent des entreprises que le corpus connaît. **#1632 reste
OUVERTE pour ça.** C'est aussi ce que #1756 (table d'alias) améliorerait —
« SOCIETE NATIONALE SNCF » n'est pas couverte alors que « SNCF » l'est.

## 2 ter. ⚠️ CE QUE LA RECETTE DU 1761 A APPRIS SUR LA MESURE ELLE-MÊME

**Un ratio de contraste calculé peut mentir dans les DEUX sens.** J'ai mesuré
1,12 et 2,56 sur la barre d'onglets en mode sombre — sous AA — et conclu à un
défaut. Puis les mêmes chiffres exacts sont sortis sur `/missions`, un écran non
touché. Puis le VRAI basculeur de thème a donné les mêmes.

**C'est la capture zoomée qui a tranché : la barre est parfaitement lisible.**
`getComputedStyle` visait un nœud qui ne peint pas le texte visible — le libellé
est peint plus profond, et la descente « tant qu'il n'y a qu'un enfant » s'arrête
au mauvais endroit.

⚠️ La règle « MESURER, ne pas lire les classes » reste juste, mais elle a une
condition : **mesurer suppose de viser le bon nœud, et le vérifier demande de
REGARDER**. Une capture zoomée de 700×55 px a réglé en une image ce que trois
mesures avaient embrouillé.

⚠️ Au passage, deux choses CONFIRMÉES et à garder : la bascule de thème se fait
par la **classe `dark` sur `<html>`** (`data-theme` reste à `light` même après le
vrai bouton) ; et un `a.click()` suivi d'une mesure à 1,5 s attrape le **premier
tick vide** du routeur — deux routes ont été marquées « VIDE » à tort, elles
rendaient 2 847 et 5 400 caractères avec 3,5 s d'attente.

## 3. Ce qui n'a JAMAIS pu être vérifié

- toute la recette du back-office (401 Basic Auth ; **Louis la fait lui-même**) ;
- la couverture mémoire marché **n'est pas semée en démo, et ne doit pas l'être**
  (les quatre tables `market_*` sont PARTAGÉES entre espaces concurrents) ;
- la contradiction de la vue d'ensemble d'un compte (`last_analyzed_at` à `null`) ;
- **#1591.1 et #1592.2** : `GET /esn-profile` de la démo rend `expertise_areas: []`
  et `offer_domains: []` ⇒ comportement JUSTE, indiscernable d'un branchement
  absent. Ne se recettent que sur l'espace de Louis, avec des expertises saisies.
  ⚠️ **C'est la même cause qui rendait les cartes de #1576 muettes** : un profil
  vendeur vide fait retomber tout le classement hybride sur l'ordre de découverte.

## 4. Ce qui RESTE, avec le découpage

| Lot | Issues | Pourquoi maintenant |
| --- | --- | --- |
| **Le dossier de compte, ce qui reste** | #1607.1, #1611, #1612, #1613, #1630, #1638 | #1607.1 (BELLUM READ) est une refonte du bloc de synthèse ; #1611 attend un profil ESN rempli ; #1613 attend une mesure SQL ; #1612/#1638 n'ont pas d'ingrédient |
| **#1632 — l'affinité techno observable** | #1632 | ⛔ livrée, **non observable** : 0 candidat couvert. Se rouvre quand le corpus ou les candidats bougent (voir #1756) |
| **#1756 — rapprochement corpus ↔ registre** | #1756 | ⛔ le plus rentable du backlog `/search`, bloqué sur une décision — voir §5. **Il débloquerait aussi #1632** |
| **#1634 — le territoire** | #1634 | ⛔ attend `SELECT count(*), count(city), count(region) FROM market_company_signal;`. Si `city`/`region` sont majoritairement nuls, l'issue TOMBE |
| ~~`/pilotage`~~ | — | ⚠️ **PÉRIMÉ — cette ligne était FAUSSE.** #1440.4 est livré depuis le 06/09 (PR #1594) ET vérifié à l'écran le 08/09 : « Contacts ciblés · 259 · Source : contacts · État courant, pas une période · Calculé à 21:01 ». Il ne reste de #1440 que les valeurs de design littérales, bloquées (couleurs fixes contre le thème, 13/15 px contre D80) |
| `/dashboard` + `/accounts` | #1573, #1574, #1581 | **le SEUL lot non bloqué qui reste.** ⚠️ Plus gros qu'il n'en a l'air : ce sont des specs de RANKING et de contexte Laura, pas des écrans. Lire §9 avant de commencer |
| Le dossier de compte | #1603→#1613, #1630, #1631, #1638 | gros, à découper par onglet |
| Le traceur `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⛔ BLOQUÉ — relecture juridique RGPD (#1681.6) |
| `/billing` | #1639 | ⛔ arrêt obligatoire (facturation) |

## 5. #1756 — la piste alias, et le trou qu'elle rencontre

Louis a tranché : **table d'alias au corpus**, pas rapprochement par domaine.

Mesuré : le pack n'a pas de quoi la remplir. `parseCompanySignal`
(`market-memory-import.ts:233-270`) lit `cle · nom · site_web · est_esn ·
freelances_* · score_externalisation · familles_de_roles · tranche_effectif ·
effectif_* · ville · region · pays · esn_observees · technos_observees ·
anciens_esn_presents`. **Aucun alias, sigle ni dénomination alternative.**

- **A — le pack livre les alias.** Question pour Louis. Si oui : trois lignes dans
  `parseCompanySignal`, une migration additive, lot court.
- **B — les alias viennent du REGISTRE.** `_to_response`
  (`apps/ia/app/routers/companies.py:170`) fait `hit.legal_name or hit.denomination`
  et JETTE l'autre, alors que le fournisseur rend les DEUX
  (`pappers/models.py:208-209`). Aucun appel supplémentaire.
  ⚠️ Mesurer d'abord la réponse brute sur « societe generale ».
  ⚠️⚠️ **Toucher `apps/ia` déclencherait le déploiement d'un service 119 commits
  en retard.** À faire les yeux ouverts, pas en passant.

Ce qui ne change pas : pas de repli sur le texte tapé, pas de retrait des mots
courts en tête. `marketMatchKey` écarte déjà une liste FERMÉE de formes juridiques
(`market-company-key.ts:28-42`) ; ce qui manque, c'est la légitimité d'y mettre
`SG`, qui est une marque.

**Nouvelle preuve du 08/09** : « SOCIETE NATIONALE SNCF » rend `null` sur
`market-paths` alors que « SNCF » rend 135. Le corpus connaît l'entreprise ; c'est
la raison sociale du registre qui ne le retrouve pas. #1756 n'est donc pas un
confort : elle est ce qui rend la mémoire marché atteignable depuis la découverte.

## 6. Les pièges d'outillage payés dans CE lot

- ⚠️⚠️ `git`, `grep`, `ls` du PATH mentent — voir §0.
- ⚠️ **Mesurer l'API de PROD depuis la session Chrome** transforme un « bloqué sur
  une mesure » en mesure :
  `await (await fetch('https://api.bellum-ai.com/…',{credentials:'include'})).json()`.
  C'est ce qui a déplacé tout le diagnostic de #1576 en cinq minutes.
  ⚠️ Toujours **vérifier dans QUEL espace on est** (une capture suffit : le bandeau
  « MODE DÉMO » change l'interprétation de tout ce qu'on vient de lire).
- ⚠️ **Le web lit le `dist/` des contracts.** Après toute modif de
  `packages/contracts` : `pnpm --filter @bellum/contracts build` AVANT le typecheck
  et la suite web.
- ⚠️ `MarketStacksRead` exporté et consommé nulle part = **knip rouge**. Un type de
  retour d'une méthode publique se laisse inliner dans la signature.
- ⚠️ `container.querySelector('span.font-semibold')` attrape **l'initiale de
  l'avatar** avant la phrase : un test de structure passait au vert sur la mauvaise
  structure. Cibler par le TEXTE.
- ⚠️ Ajouter une lecture dans un service **casse les mocks positionnels** des specs
  voisines (`mockResolvedValueOnce` en cascade). Relire les specs qui empilent des
  `Once`.

## 7. LOT LIVRÉ le 08/09 au soir — #1605 + #1609 + #1611 (PR #1762)

Les trois touchent les mêmes surfaces, et **aucun ingrédient ne manque** : c'est
mesuré, pas supposé.

- **#1605 — la FUSION des preuves dans Partenaires.** La troisième nature de preuve
  existe déjà (#1579, bloc « Sociétés de services observées »), mais une ESN
  déclarée ET observée apparaît **deux fois**. Ce que Louis demande : UNE ligne,
  toutes les preuves conservées. Le contrat garde `source` (l'origine du record) et
  gagne `evidence_origins[]` — sa phrase « ne pas utiliser un seul enum `source`
  comme vérité finale » est la clé du découpage.
  ⚠️ **Un point signalé, non tranché** : « observation + inférence concordantes →
  augmenter la confiance » — deux preuves ne sont indépendantes que si leurs
  chemins le sont. Proposé de rendre un FAIT (« trois preuves concordent ») plutôt
  qu'un niveau relevé.
- **#1609 — les pistes de recherche par famille de rôles + le filtre « expérience
  en société de services ».** Mesuré : `contacts.apollo_enrichment` persiste
  `employment_history[]` (`ia.ts:341`, écrit par `contacts.service.ts:472`), donc
  le filtre se fait sur les contacts ACTUELS sans jamais lire une identité de la
  mémoire marché. Et `roleFamilies` est calculé par `coverageFor` mais **pas
  exposé** par la façade — la même ligne manquante que celle corrigée pour
  `observed_stack` dans #1607.2.
  ⚠️ Le filtre ne voit que les contacts dont l'enrichissement a rendu un
  historique : « 3 contacts avec une expérience ESN » veut dire « parmi ceux dont
  on connaît le parcours », jamais « il n'y en a que 3 ».
- **#1611 — les angles renforcés.** DÉBLOQUÉ par #1607.2 : la moitié
  « environnement observé » n'existait pas sur le dossier. L'autre moitié est
  `expertise_areas` du profil ESN, et l'appariement vit déjà à un seul endroit
  (`matchingExpertises`, `@bellum/contracts`) — **ne jamais en écrire un second**.
  ⚠️ Sur l'espace de démonstration `expertise_areas` est VIDE : aucun angle ne se
  renforcera, comportement juste et indiscernable d'un branchement absent. Ne se
  recette que sur l'espace de Louis.

**Et la règle générale que #1611 a posée, qui vaut au-delà de son écran** : la
mémoire marché ne peut **jamais** produire un NO-GO par absence. « PHP absent de la
stack observée » ne prouve rien. C'est « non mesuré n'est pas zéro » appliqué à un
échantillon.

## 8. ⚠️ Deux pièges d'outillage payés dans le lot #1762

- **Le hook `pre-commit` échoue pour une raison PRÉEXISTANTE**, dès qu'on stage
  `apps/web/.../TabContacts.tsx` : `lint-staged` lance eslint depuis la RACINE, et
  sa configuration ne résout pas `react-hooks/exhaustive-deps` pour un
  `eslint-disable` posé ligne 118 par `3fca3090e`. Le job `Lint` de la CI passe à
  **0 erreur**. Commit avec `--no-verify` en passant les deux gates du hook à la
  main (prettier `--list-different`, eslint web). ⚠️ À ne pas confondre avec un
  vrai rouge : vérifier d'abord que la ligne fautive est HORS de son diff.
- **Ajouter un hook réseau à un composant largement monté fait dépendre TOUTES
  ses suites de ce hook.** `ObservedRoleFamilyPriors` dans `TabContacts` a fait
  tomber 8 tests d'un coup, dans 4 fichiers qui ne parlent pas de mémoire marché.
  Le mock se pose dans chaque suite, avec sa raison.
- ⚠️ **`renderWithRouter` partage un `QueryClient` de niveau module** — son
  docbloc annonce l'inverse. Deux tests qui montent le même `accountId` lisent la
  même réponse en cache. Utiliser un identifiant DIFFÉRENT par test.
- ⚠️ **Les `sleep` en arrière-plan ne font pas avancer l'horloge** sur ce poste :
  un `sleep 590` revient en quelques secondes. Pour attendre un déploiement, la
  seule forme fiable est la boucle `until <condition>; do sleep 30; done` — et
  elle doit tourner au PREMIER PLAN pour bloquer réellement.

## 9. Le dernier lot non bloqué — #1573 + #1574 + #1581

**Lu, pas commencé.** Ce qu'il faut savoir avant d'ouvrir le sujet :

- **#1574 est le plus concret et le seul vraiment autonome.** `DormantOpportunitiesCard`
  existe déjà — le retour dit **explicitement** de ne pas en créer un second. Il
  s'agit d'enrichir son CLASSEMENT et son EXPLICATION, et de distinguer deux CTA :
  « Préparer la reprise » (signal actuel exploitable) contre « Vérifier
  maintenant » (mémoire marché seule).
- ⚠️ **Une moitié de #1574 n'a PAS d'ingrédient, et c'est mesurable** : « si le
  réseau privé de l'utilisateur contient un contact dont le hash croise la
  mémoire ». Le corpus **ne porte aucun hash de personne** — la table
  `market_person_path_hashes` demandée par #1603 n'a aucune source dans le pack,
  et #1609 le dit avec les mots de Louis (« la base ne fournit AUCUNE personne
  exploitable »). Cette moitié se répond, elle ne se code pas.
- **La règle transverse des trois issues, et elle est bonne** : la mémoire marché
  peut augmenter le POTENTIEL d'un compte, **jamais fabriquer une URGENCE**. Ne
  jamais présenter une observation comme un état actuel. C'est la même famille
  que le NO-GO par absence de #1611 — et `ContributionPanel` / `structuralFit`
  (`portfolioFor`) fournissent déjà la compatibilité structurelle à l'échelle du
  portefeuille, sans rien recalculer.
- **#1573 et #1581 touchent le CONTEXTE de Laura**, pas un écran : ce qu'on lui
  transmet, et la forme de sa réponse (3 recommandations max, VERDICT / pourquoi
  il remonte / pourquoi maintenant / ce qu'on ne sait pas). ⚠️ Vérifier AVANT de
  commencer si le chemin passe par `apps/ia` — si oui, c'est bloqué par le retard
  de 119 commits, comme #1606/#1631.
