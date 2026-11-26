# Défauts vus en recette — 15/09/2026 (prod api `ce33e140f`, compte THALES `86589f46-…`)

| # | Défaut | Cause (fichier:ligne) | Famille | Où ça part |
|---|---|---|---|---|
| R15-1 | Le hero dit « Propriétaire : non mesuré — personne ne s'est encore déclaré » pendant que le bandeau Collaboration, sur le MÊME écran, dit « Propriétaire : Louis Schlegel » | hero : `AccountDetailHeroIdentity.tsx:36` lit `account.relationship_memory?.owner` (texte libre de la mémoire relationnelle) ; bandeau : `AccountCollaborationBand.tsx:99-100` lit `account.owner` (membre attribué). Deux objets, même libellé. Toujours vrai sur `integration-r`. | deux lectures du même objet qui divergent ; loi 4 (rien n'apparaît deux fois sous la même forme) | lot hero (#2117) APRÈS merge de R — une seule dérivation du propriétaire, un seul endroit qui l'affiche. Tranché sans toi : le bandeau garde le propriétaire, le hero ne le répète plus. |
| R15-2 | Hero écrasé à 0 px (identité un mot par ligne, « Priorisé » recouvre le `<h1>`) — toujours en prod | connu, corrigé sur `hero-ne-secrase-plus` (`4cea56a05`), dans l'intégration R | style/flex | recette R : largeur de la colonne d'identité à 1 024 / 1 150 / 1 512 px |
| R15-3 | À observer : un onglet du dossier chargé par URL ne rend son contenu qu'après 8-11 s (veille : 1ʳᵉ mesure vide, 2ᵉ pleine ; history : 128 caractères de texte à 11 s) | non diagnostiqué — peut être l'écrasement du hero qui pousse le contenu hors du flux mesuré | à re-mesurer APRÈS R avant d'ouvrir quoi que ce soit | recette R |

## R15-4 — la fraîcheur du hero recouvre la ligne « Prochaine action » (prod 41805f310, 1512 px, THALES)
- Mesure : `<p>` « Prochaine action : Relancer Sandrine Pata… » box [289,271,1174,16] (classe `truncate`, pleine largeur) ; `<p>` « non mesuré — Synchronisation avec ton CRM : non mesurée » box [1079,267,384,20] dans le bloc fraîcheur `lg:absolute` [1055,233,408,54]. Recouvrement x 1079-1463, y 271-287 : les deux textes se lisent l'un sur l'autre (capture 15/09 matin).
- Cause probable : le bloc fraîcheur est positionné en absolu à partir de `lg`, la ligne « Prochaine action » ne réserve pas sa place.
- Aussi : « non mesuré — Synchronisation avec ton CRM : non mesurée » dit deux fois « non mesuré » ; et « Propriétaire : » se coupe entre le mot et les deux-points.
- À corriger dans le lot hero #2117 (même fichier que R15-1). Test qui dit NON : la ligne « Prochaine action » et le bloc fraîcheur ne partagent aucune rangée à `lg`.

## R15-5 — l'info-bulle de « Plus d'actions » décrit l'ancien menu (prod 41805f310, THALES)
- `title` : « Ouvre les actions occasionnelles du dossier : aperçu et téléchargement PDF, brief, rafraîchissement par axe, partage. »
- Menu réel après le revirement Q-1816 : Rafraîchir › · Archiver · Supprimer. Aperçu, PDF, Brief et Partager sont au hero. L'info-bulle promet quatre gestes absents et tait Archiver et Supprimer.
- À corriger dans le lot hero #2117. Test qui dit NON : chaque libellé nommé par la description du bouton existe dans le menu rendu.

## R15-6 — ce qu'un lecteur sans formation ne comprend pas (proxy #2115.48/.53, 15/09)
- « Ce qui verrouille » (Écosystème & accès) : libellé vague, ne dit pas QUOI verrouille.
- Périmètres : le lien avec la vente n'est pas dit ; « 39 sites » vs « Périmètre ciblé » du plan : la différence n'est pas lisible.
- Opportunités vs Plan d'action : lues comme redondantes (ce que le compte FAIT vs ce que JE fais n'est pas écrit).
- « Programmes IT nommés — non mesuré » à côté de « 6 signaux » : lu comme une contradiction.
- « 17/25 PRUDENT » avec 6 signaux : lu comme incohérent — le score ne dit pas pourquoi prudent malgré les signaux.
- Le lecteur a supposé des « missions antérieures » d'après le seul titre « Ce que nous avons déjà réalisé » alors que la section est vide : le titre promet plus que le contenu.
Aucun n'invalide #2115.48/.53. À ranger : libellés → lot hero/grammaire (#2117) ou #2122 (Écosystème), score → #2118.

## R15-7 — la session lâche AUSSI par le plafond d'appareils, et l'app ne le dit pas (prod 3798d2783, 15/09 ~07:00 UTC)
- Constat : onglet Chrome de Louis (connecté, THALES) → toutes les routes répondent 401 « Session révoquée sur cet appareil. » (`jwt.strategy.ts:156`), y compris avec l'en-tête `X-Bellum-User`. Juste avant, Louis s'était connecté sur son téléphone (vérification #2115.46). Louis a dû se reconnecter à la main.
- Cause : `MAX_ACTIVE_DEVICES = 2` (`session-registry.service.ts:10`, f24489c61 « anti partage de mot de passe »). Chaque connexion ou refresh (`auth.controller.ts:125` `trackDevice`) enregistre l'appareil et RÉVOQUE ceux au-delà de 2, triés par `last_seen_at` — qui ne bouge qu'à la connexion ou au refresh. Un Mac en veille la nuit a donc le `last_seen_at` le plus ancien : la première connexion du matin sur un autre appareil (téléphone, autre navigateur) le révoque. **C'est une cause des « la session lâche la nuit » distincte du client Supabase partagé corrigé par T.**
- Défaut d'écran : l'onglet révoqué n'a montré AUCUN message — coquille vide, `/accounts` renvoyé vers `/chat` sans données, aucun appel `/auth/refresh`, aucune invitation à se reconnecter. Rien ne dit « déconnecté parce qu'un 3ᵉ appareil s'est connecté ».
- À trancher (Louis) : la valeur du plafond. À corriger quoi qu'il décide : le message à l'appareil révoqué, avec la raison et le geste.
- **Tranché par Louis (QCM 15/09) : 5 appareils.** Correctif lancé (`session-plafond-cinq-appareils`) : plafond à 5 à un seul endroit + code `session_revoked` + avis bloquant « déconnecté de cet appareil… Me reconnecter » à la place de la coquille vide. Revue sécurité avant merge.
- R15-1, R15-4, R15-5 : corrigés sur `hero-et-grammaire-du-dossier` (c37f526c2), non intégrés. À recetter après merge : hero sans « Propriétaire » en double ; fraîcheur sous « Prochaine action » sans recouvrement ; le titre de « … » nomme exactement les entrées du menu.

## Recette du 15/09 en fin de matinée — prod `5ca597d5a` (S + U + V + #2228 + #2230 servis)

Écran recetté : le dossier THALES, section **Personnes**, sous-onglets Organigramme et Contacts, puis la fiche d'un contact.
Ce qui marche est passé au registre ; ce qui suit est ce qui ne va pas.

### R15-8 — les deux sous-onglets de « Personnes » sont rendus EN MÊME TEMPS
- Constat : `?tab=organigramme` et `?tab=contacts` changent la puce active et l'URL, mais **les deux panneaux restent dans le DOM, empilés** — « Carte d'influence », « Corrections de l'organigramme », puis « Du contact détecté au contact prioritaire » se suivent dans la même page quel que soit l'onglet. `document.querySelectorAll('h1,h2,h3')` rend les titres des DEUX vues.
- Conséquence : « Chemin d'accès recommandé » apparaît **deux fois**, sous la même forme et avec le même contenu — exactement ce que la loi 4 du tome 7 interdit. Et une puce qui ne cache rien n'est pas un onglet.
- Ce n'est PAS un défaut de fusion de V : le comportement est le même sur les deux valeurs de `tab`.

### R15-9 — la liste « tous les contacts » annonce 2 027 et en rend 116
- Constat : en-tête « 2027 contacts au total », groupe « Entité non renseignée — **1961 contacts** », et **87 lignes rendues** dans ce groupe. Après « Tout déplier » (3 s), **116 lignes** pour 2 027 annoncés. Aucun « afficher plus », aucune pagination, aucune phrase qui dise que la liste est plafonnée.
- Aggravant : la barre de lot propose « **Sélectionner les 2027 contacts affichés** ». Un export CSV ou une attribution partirait sur 2 027 personnes dont l'utilisateur en a vu 116. Le mot « affichés » est faux.
- #2120.14 (« recherche, filtres, pagination/virtualisation ») reste donc **livré, pas recetté**.

### R15-10 — un horodatage brut, et mal formé, dans la provenance d'un champ
- Constat : fiche contact › Informations clés › Email professionnel → « lu dans un outil connecté · **le 2026-09-11T07:22:37:46.992Z** ».
- Deux défauts : l'ISO s'affiche tel quel au lieu d'une date lisible, et la chaîne est **mal formée** (`37:46.992` — deux `:` là où il en faut un). La source, elle, est nommée par capacité et pas par fournisseur : ça, c'est juste (GA-44).

### R15-11 — l'étiquette et la valeur se recouvrent dans « Informations clés »
- Constat : « **Fonc**Head of CISO Services / Chief Information S… », « **Entit**THALES COMMUNICATION & SECURITE NU… ». La colonne d'étiquettes est trop étroite et la valeur passe par-dessus au lieu de la pousser.
- Même famille que R15-4 (fraîcheur qui recouvre « Prochaine action ») : une largeur posée en dur qui ne tient pas le contenu réel.

### R15-12 — deux scores contradictoires pour la MÊME personne, sur deux écrans
- Dossier › Personnes › Contacts, carte de Ralph Graaf : « **N° 1 · 45/90 · 1 axe(s) non évaluable(s)** », dont « Niveau de décision utile **10** — comité exécutif — **arbitre en dernier, pas une porte d'entrée** ».
- Fiche du même contact : « **98/100 · Top contact** », dont « Niveau hiérarchique **15/15 pts — C-level / COMEX** ».
- Les deux grilles sont décomposées et nomment leur axe non évaluable — ça, c'est tenu. Mais elles se contredisent **sur le fond** : l'une pénalise le COMEX comme mauvaise porte d'entrée, l'autre le récompense au maximum. Une dérivation vit à un seul endroit (GA-26) ; ici il y en a deux, et elles ne disent pas la même chose.
- Conséquence sur les retours : **#2120.27/.28/.29** (« ne jamais classer le CEO / CIO / CTO en tête pour le prestige seul ») sont tenus sur le chemin d'accès du dossier et **démentis sur la fiche**, où la séniorité vaut 15 points sur 100. Ils restent donc *livré*, pas *recetté*.

### R15-13 — « Couverture décisionnelle 99 % » au-dessus de cinq axes qui disent « Manque »
- Où : QONTO › Personnes › **Qui nous manque** (`?tab=coverage`), bloc « Qui nous manque pour avancer ? ».
- Constat : le chiffre de tête annonce **99 %**. Juste en dessous, « Les dix axes à tenir » donne **Entités : Manque · Sponsor : Manque · Décideur économique : Manque · Référent technique : Manque · Achats : Manque**, puis « Entités couvertes **3/8** » et « Rôles couverts **4/8** — Manquants : Décideur économique, Référent technique, Achats, Sponsor ».
- Cause lue à l'écran : le 99 % ne mesure QUE la largeur × profondeur (« Familles couvertes 3 sur 3 », « Niveaux couverts 3 sur 3 »), c'est écrit plus bas dans « Pourquoi cette confiance ? » — « Couverture 99/100 : familles et niveaux du comité d'achat effectivement tenus ». Le NOM du chiffre (« Couverture décisionnelle ») est donc plus large que ce qu'il compte, exactement le défaut de `c65_couverture_nest_pas_un_fait_de_marche` d'un cran plus bas : **un taux nomme ce qu'il mesure, ou il ment**.
- Et il dément le retour lui-même : **#2121.51** demande qu'« une couverture à 100 % soit impossible si un rôle critique manque ». 99 % avec le décideur économique absent, c'est ce cas.
- Second écart dans le même bloc : « Champions identifiés **3** » cohabite avec « Sponsor : **Manque** ».
- Correctif attendu : soit le chiffre porte le nom de ce qu'il compte (« Familles et niveaux tenus »), soit il intègre les dix axes — et dans les deux cas un axe critique manquant plafonne le taux.

### Ce que la recette CONFIRME de bon (pour ne pas le casser)
- L'entonnoir des contacts nomme l'origine de chaque étape **par capacité** et jamais par fournisseur, affiche la baisse de chaque étape et l'action suivante, et écrit « Chaque étape compte les contacts qui l'ont atteinte — pas un stock séparé. »
- Le rang d'un contact s'explique par **neuf axes nommés**, l'axe non évaluable est **exclu du dénominateur** (45/90 · 1 axe non évaluable), et l'écran écrit « jamais sur la photo, l'âge ou la ville ».
- Le dialogue de correction écrit « Laisser vide veut dire « on ne sait pas ». Ce n'est pas la même chose que zéro » et « Ce que tu écris ici gagne sur ce que l'analyse a trouvé, et reste annulable ».
- « Vérifier aujourd'hui — nouvelle analyse · **8 crédits** » : le coût est annoncé avant le clic (GA-49/86), et « Mémoire locale · lecture incluse » sépare la lecture gratuite de la vérification créditée.
- Le bloc de couverture écrit « Calculé uniquement à partir des contacts existants — aucune donnée inventée » et distingue explicitement sa note de la « Fiabilité du dossier » de l'onglet Aperçu.

### R15-7 — VÉRIFIÉ EN PROD le 15/09 à 11h30 : le plafond à cinq appareils tient
`GET /auth/sessions` rend **trois appareils actifs** (derniers passages 09:13, 08:42 et 07:01 UTC), **aucun révoqué**. Avec l'ancien plafond de 2, le troisième aurait évincé le plus ancien — c'est exactement le scénario qui a fait lâcher la session hier soir. La session ouverte depuis la veille répond toujours 200 sur `/accounts`.
Reste à prouver par une vraie nuit : l'onglet laissé ouvert doit répondre 200 le lendemain matin sans reconnexion.
