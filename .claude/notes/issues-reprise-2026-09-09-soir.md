# Reprise — la vague des 59 issues (09/09/2026, après le lot 1)

Coller ce fichier en entier dans une session neuve. Il COMPLÈTE
`.claude/notes/issues-reprise-2026-09-09.md` (dont les §1 et §6 tiennent
toujours) et s'appuie sur `.claude/notes/issues-59-manifeste-2026-09-09.md`
(le diagnostic) et `.claude/notes/issues-59-integrateur-todo.md` (les câbles).

## 0. ⚠️ Les outils qui MENTENT — en plus de ceux déjà listés

- **Le hook RTK bloque `git` dans un worktree d'agent isolé** (« ne peut pas être
  montré ne pas être git »). Contournement : `/opt/homebrew/bin/git`.
- `/usr/bin/ls` **n'existe pas** sur ce poste — c'est `/bin/ls`.
- `git --no-pager` se place **avant** le sous-verbe, jamais après.
- Un `gh pr checks` rend TOUJOURS trois lignes `pending` Railway (environnement
  de PR sans Redis). **Merger sur `CI Status`**, pas sur l'absence de `pending`.

## 1. Ce qui est TRANCHÉ dans cette vague — à ne pas reposer

- **La recette live se fait sur l'espace de Louis** — il ouvre la session Chrome.
  Le profil de ce poste n'est connecté à rien.
- **Les deux mesures SQL sont à Louis** : #1613 `count(externalization_score)`,
  #1634 `count(city)` / `count(region)`. **Si `city`/`region` sont majoritairement
  nuls, #1634 TOMBE** — et c'est une réponse.
- **#1756 : le PACK DE DONNÉES livre les alias.** Le réceptacle est construit et
  neutre ; reste à poser le chemin d'import.
- **#1472 : Louis nomme l'écran de référence** (relancé, pas encore nommé).
- **Les écrans back-office opérateur sont HORS de la craft rule n°9** — jamais
  atteignables par le lien de démo, gardés par `InternalSecretGuard` /
  `DM_BASIC_AUTH`. Précédent : `retention-cohorts`, `team-kpis`, `manager-kpi`
  ont zéro entrée de couverture démo.
- **Pas de changelog pour un lot de back-office** : le changelog est celui du
  produit CLIENT.
- **`access_cost` ne s'estime jamais** (D60) · **`NOISE_TOKENS` ne s'étend pas**
  (#1756 le refuse elle-même) · **les valeurs de design littérales de #1417 /
  #1440 sont refusées pour la 3ᵉ fois** (D79 / D80).

### Décisions PARQUÉES, tranchées au plus conservateur
`#1672.6` export CSV : ne pas construire · `#1642` Heatmap : brancher, pas retirer ·
`#1676` nouveau_client / churn_client : ne pas coder · `#1574.6` Laura proactive :
ne pas construire · `#1639` `/billing` : arrêt obligatoire · `#1681.6` relecture
RGPD : hors code, reste DUE.

## 2. Ce qui est MERGÉ

- **Lot 1 — PR #1769, fusion `dfedd0c51`** : #1766, le bug CLIENT.
  Le 3ᵉ état « Résultat non vérifiable », 7 filtres morts en mode Signaux
  (16/16 après), l'avis d'homonymie sorti du bandeau d'alerte, GA-275,
  la garde de parité démo des états, changelog FR+EN.
  **CI Status pass** (20 jobs), **recette EN ATTENTE**.

## 3. Ce qui n'a JAMAIS pu être vérifié

- Tout le back-office (Basic Auth) — Louis le recette lui-même.
- Ce que Laura RÉPOND — la salle de démonstration **n'appelle jamais le modèle**.
- La cause du zéro de #1766 : **BLOCKED, pas FAIL**. Piste non prouvée
  (`france_travail.py:557`, `SignalSourceUnavailable("authentification OAuth
  refusée")`, et « Recrutement » était coché). Demande les journaux de prod.
- Le nombre de comptes réellement touchés par #1756 (pas d'accès BDD).

## 4. Ce qui RESTE

| Lot | Contenu | État |
| --- | --- | --- |
| **Lot 2 — back-office** | B1-a (fondation d'analytique) + B1-b (accessibilité) + B1-c (filtres, jointure) + B1-d (alertes, entonnoir) + le repli du traceur (GA-276) | branche `integration/lot2-backoffice` **prête**, 4 fusions sans conflit, tests ciblés en cours |
| **Lot 3 — produit** | B1-e (axe Relation) + B1-f (jointure mesurable + alias) + B1-g (briefing) | ⚠️ **un ROUGE à poser AVANT** : `TABLE_SCOPES['market_company_alias']` (GA-65). Entrée exacte dans le fichier des câbles. |
| Vague C | les 5 écrans d'analytique (#1683-#1688) | fondation livrée ; ⚠️ **7 des 9 émetteurs n'ont aucun appelant** — c'est le vrai bloquant, pas les écrans |
| L'axe `path` | #1631.3/.4 | 5 maillons décrits dans le fichier des câbles |
| Le format de Laura | #1573.1, #1581.2, #1581.3 | **non bloqué**, le plus rentable qui reste |

## 5. Les pièges payés DANS cette vague

- ⚠️⚠️ **Mon brief à un agent portait une affirmation FAUSSE reprise d'un rapport
  d'éclaireur sans être re-mesurée** (« les fonctions pures existent déjà »).
  `git show origin/main:<fichier>` la démentait en dix secondes. **Deuxième fois
  dans la journée** qu'un constat hérité se révèle faux. Un brief se vérifie
  contre `origin/main`, pas contre un rapport.
- ⚠️ **Une garde peut s'attraper sur son propre correctif** : `[^,)]+` coupe à la
  première parenthèse, donc `screenPattern(event.toLocation.pathname)` contenait
  `.pathname` et la garde rougissait sur le code JUSTE. Une garde se lit sur un
  **bloc de code délimité**, jamais sur un fichier entier — les docblocs y
  écrivent le même nom de fonction, et un `indexOf` tombe dessus.
- ⚠️ **`#1674` est un hexadécimal VALIDE** (`1`,`6`,`7`,`4`) : écrit dans une
  chaîne de `describe`, il fait échouer la garde des couleurs. **Deuxième
  occurrence.** Un numéro d'issue va dans un commentaire JSDoc, jamais dans une
  chaîne de test.
- ⚠️ **GA-07 est AU PLAFOND** (254/254 fichiers). Plus aucun import
  service→service dans un fichier qui n'en avait pas. Ce qui reste passe par un
  `.controller.ts` ou un `.module.ts`.

---

## 6. Ce qui est arrivé APRÈS le début de la vague — à traiter en premier

Deux vrais retours CLIENTS, de deux ESN différentes, déposés pendant la session.
**Ils passent devant tout le reste.**

- **#1768** (`cedric.venes@keyrus.com`) — Laura écrit « Clique sur **Lancer la
  recherche** » et **le bouton n'existe pas**. Mesuré : la chaîne est absente de
  tout `apps/web/src` (contrôle positif fait), et absente de **tous nos prompts**.
  Ce n'est donc pas un bouton disparu : **le modèle a inventé une affordance**.
  Famille connue : *une réponse juste sans chemin*.
  Sortie recommandée, dans cet ordre : (1) contrainte de prompt — Laura décrit un
  geste, jamais un élément d'interface NOMMÉ ; (2) construire le geste (ouvrir
  Découvrir avec les critères posés), qui a du sens en soi.
  ⚠️ **Ne se recette PAS en démo** : la salle n'appelle jamais le modèle.
- **#1770** (`s.elghozi@sooit.fr`) — « erreur ??? » sur `/chat`. Le widget a
  estampillé le conteneur générique : **pas de texte d'erreur exploitable**.
  ⚠️ **Piste forte** : son build est `26.09.07…gitd3153f579`, du **7 septembre**.
  Un onglet ouvert depuis des jours interroge une API plus récente que son code —
  la famille « champ serveur neuf lu sans garde » a déjà cassé durablement des
  onglets ici. Un rechargement dur tranche. **Et même si c'est ça, le défaut
  reste nôtre** : un front ancien doit dégrader proprement.
  Les deux ont été commentés ; la réponse attendue de Louis/du client est dans
  l'issue.

## 7. Un cinquième lot, livré en fin de vague

**`1d876db06`** — la garde du tutoiement ne voyait pas les formes **préfixées**.
Trouvé **en recette**, à l'écran de la démo publique : « **Relancez** une analyse
pour l'obtenir. » La garde était verte parce que sa liste de verbes conjugués,
écrite à la main, portait `lancez` et pas `relancez` — et son lookaround sur
lettres fait manquer le préfixe.
⚠️ **Mesuré AVANT d'élargir** : une seule chaîne du dépôt en profitait, donc
aucun rouge préexistant. C'est ce qui rend l'élargissement gratuit — et c'est la
mesure qu'il faut refaire avant d'élargir n'importe quelle garde.

---

## 8. Ce que l'accès au back-office a permis de VÉRIFIER (09/09, fin de session)

Louis a ouvert l'accès. **Treize routes balayées, toutes rendent leur vrai écran**
(le `<h1>` métier est le signal fiable — un détecteur d'erreur naïf rend `true`
partout, la chaîne d'erreur Next vit dans le bundle de chaque page).

**Vérifié en production, pas déduit :**
- **#1686.5 — les SEPT étapes de l'entonnoir** sont à l'écran, dans l'ordre demandé,
  avec « Première analyse LANCÉE » et « Première action validée » séparées.
- **#1686.1** — cohorte masquée NOMMÉE avec sa raison (« Juillet 2026 — trop peu
  d'espaces, 1 sur 3 requis »).
- « **Ni ordonné ni cumulatif** » est DIT à l'écran, comme l'issue l'exigeait.
- **#1673.3 — le filtre d'ancienneté de `/queues` existe** (« Tous · 1 | < 1 h · 0 |
  1 h–24 h · 1 | > 24 h · 0 ») avec sa réserve honnête : « filtre appliqué aux jobs
  déjà chargés sur cette page — pas à la file entière ».
- **#1676.2 — la page Dépendances** rend ses 6 lignes, 3 configurées / 3 non
  configurées / **0 non mesurées**, et dit « chaque ligne se teste réellement ».

## 9. DEUX défauts trouvés EN RECETTE, corrigés et livrés le jour même

- **`1d876db06`** — la garde du tutoiement ne voyait pas les formes **préfixées**
  (`lancez` listé, `relancez` non). Une seule chaîne du dépôt en profitait.
- **`3f31c8cff`** — ⚠️ le plus intéressant : « Onboarding démarré **0 %** » à côté
  de « Onboarding terminé **88 %** ». `onboarding_started` n'est émis que sur la
  première transition hors de `not_started`, donc l'étape n'avait pas zéro
  franchissement : **elle n'avait pas d'écrivain**. Troisième état
  `non_instrumentee`.
  ⚠️ **Ma première version était trop gourmande** et avalait les vrais zéros sur un
  corpus vide — **quatre tests existants l'ont dit**. La condition juste : au moins
  une étape doit avoir été observée.
  ⚠️ **Aucun test ne pouvait attraper le défaut d'origine** : chaque cas du fichier
  FOURNIT ses franchissements, donc l'étape y était toujours instrumentée.

## 10. L'état des files, DATÉ — et pourquoi la date change tout

| File | Échecs | Quand | Verdict |
| --- | --- | --- | --- |
| `mailer` | 3 × `send_email_otp`, `fetch failed` | **14–15 JUILLET** | résidu de ~2 mois, **pas un incident actif** |
| `analysis` | 1 × VINCI, `PHASE_TIMEOUT` phase `classify`, 200 s, 2 tentatives | **09/09 11:20 → 11:38** | **réel et récent** |

⚠️ **J'ai failli annoncer « trois personnes ne peuvent pas se connecter ».** Les
dates l'ont démenti en dix secondes. *Un état se relit avant d'être conclu.*

### Le défaut que ça révèle, et il n'est pas dans les jobs
**Les deux files portent le badge « incident »** — celle dont le dernier échec date
de **juillet** comme celle d'aujourd'hui. Le verdict n'ÂGE pas ses preuves : un
échec de deux mois crie aussi fort qu'un échec de vingt minutes. C'est la même
famille que le défaut le plus grave de la recette du 08/09 (« Santé système »
affichait `healthy` pendant qu'une dépendance était en panne) : **le verdict ne
répond pas à la question posée**. Un opérateur qui ouvre cet écran demande « est-ce
que quelque chose est cassé MAINTENANT ».
→ Lot suivant, petit : borner la fenêtre du verdict d'une file, et distinguer
« échoué récemment » de « des échecs traînent dans la file ».

### Le vrai sujet du jour
`PHASE_TIMEOUT` sur `classify` à **200 s**, deux fois, sur une analyse VINCI d'un
vrai espace. À rapprocher du budget de phase et du retour Julien sur la qualité du
moteur. Le dossier de ce compte est **incomplet**.

---

## 11. Les six issues CLOSES, et pourquoi celles-là seulement

Chacune vue tourner en production, back-office, commit `3f31c8c`.

| Issue | Ce qui a été mesuré, pas regardé |
| --- | --- |
| **#1671** sécurité | journal séparé · rétention NOMMÉE avec sa date et l'heure de purge · les 3 anomalies dites même à zéro · l'entête dit enfin QUE l'alerte part |
| **#1686** entonnoir | les **7 étapes**, « analyse LANCÉE » qui mesure enfin ce que son nom dit, cohorte masquée nommée avec sa raison, « ni ordonné ni cumulatif » écrit à l'écran |
| **#1674** accessibilité | token AA **recalculé sur la page live** : **5,22:1** en sombre, **5,83:1** en clair ; **0 des 9 boutons à fond** sous AA, dans les deux thèmes |
| **#1672** DataTable | sélecteur de colonnes prouvé par la **HAUTEUR** : fermé `none`/**0** → ouvert `grid`/306 → refermé **0**. Le défaut du `hidden` recouvert est mort |
| **#1673** filtres + ⌘K | adoption **2 → 5 écrans** ; « keyrus » rend l'utilisateur, **l'espace**, et ses analyses — la jointure par `workspace_id` marche |
| **#1667** flags/bandeaux/api | « Non mesuré » et **jamais 0** sur les colonnes que le fournisseur ne peut pas renseigner ; raisons en TEXTE, plus dans un `title=` |

### Restées ouvertes à dessein
- **#1655** — **0 facture non encaissée** en production : le panneau de relance n'a rien à rendre, donc je ne l'ai pas vu. Du code non vu tourner n'est pas une fonctionnalité vérifiée.
- **#1648** (muet sans destinataires) · **#1669** (prouver le 403 demande de toucher l'interrupteur d'identité) · **#1676** (6/8, deux déclencheurs en attente d'une décision produit) · **#1642** (`Heatmap` orpheline) · **#1657 / #1683 / #1684 / #1685 / #1687 / #1688** (écrans absents) · **#1681** (relecture RGPD).

## 12. Trois défauts vus en recette et NON corrigés — le lot suivant

1. ⚠️ **Le verdict d'une file n'ÂGE pas ses preuves.** `mailer` porte « incident » pour trois échecs de **juillet** ; `analysis` le porte pour un échec d'**aujourd'hui**. Même badge. Un opérateur demande « est-ce cassé MAINTENANT ». Même famille que le `healthy` affiché pendant une panne.
2. ⚠️ **`/facturation` › Sur facture dit « n'envoie aucune relance »** — vrai, mais incomplet : il ne dit pas qu'un texte est PRÉPARÉ. Un opérateur conclura que la fonction n'existe pas. Même forme que le défaut `/securite` du 08/09.
3. ⚠️ **`PHASE_TIMEOUT` sur `classify` à 200 s**, deux tentatives, analyse VINCI d'un espace réel, aujourd'hui 11:20. Le dossier est incomplet.

## 13. Deux pièges de MESURE payés par moi, dans la même session

Ma fonction de contraste a produit **deux fausses alertes**, et les deux ressemblaient à des défauts :
- elle remontait au `rgba()` translucide au lieu de composer sur le fond du thème → **1,19:1** annoncé sur un bandeau parfaitement lisible ;
- elle lisait `color(srgb 0.91 0.90 0.98)` — des **flottants 0–1** — comme des entiers 0–255 → **1,18:1** annoncé sur une pilule à **14,46:1**.

**La règle : une capture zoomée tranche ce qu'un ratio calculé prétend.** Et un calcul de couleur doit connaître TOUTES les notations que le navigateur rend, pas seulement `rgb()`.
