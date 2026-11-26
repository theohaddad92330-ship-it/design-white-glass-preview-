# Les 131 points à trancher — 15/09/2026

Extrait des quatre registres. **Un point n'est ici que si la décision est PRODUIT
ou si elle touche un arrêt du dépôt.** Tout ce qui se tranche par une règle déjà
écrite a été tranché et documenté dans son registre, pas ici.

| Famille | Points | Qui tranche |
| --- | ---: | --- |
| Facturation | 21 | **toi seul** — arrêt du dépôt |
| Droits / cloisonnement | 39 | **toi seul** — arrêt du dépôt |
| Doctrine (couverture, confiance) | 10 | moi, si tu confirmes la ligne |
| Analytique produit (c64) | 2 | **toi** — relecture juridique due |
| Écran / parcours | 59 | **moi**, si tu me laisses la main |

---

## A. Facturation — 21 points

Le §10 du profil du dépôt en fait un arrêt : on n'y code pas seul. **Aucun n'a été codé.**

La question qui les résume tous : **est-ce qu'un geste du parcours d'accueil peut débiter un crédit, et si oui lequel et quand l'annonce-t-on ?** Tant qu'elle n'a pas de réponse, les vingt-et-un restent dehors.

Ma recommandation : **rien ne débite pendant l'accueil.** Un utilisateur qui découvre le produit ne doit pas pouvoir dépenser sans l'avoir voulu, et #2084.45 (« ne jamais consommer à chaque sous-étape du questionnaire ») dit déjà la bonne intuition. Le coût s'annonce AVANT tout appel externe, et jamais après.

| Point | Demande |
| --- | --- |
| #2003.22 | Recette : utilisateur sans crédit · facturation |
| #2003.23 | Recette : retour Stripe / abandon avant paiement · facturation |
| #2004.16 | Reprise après paiement · facturation |
| #2089.25 | Avant le clic : coût éventuel · facturation |
| #2008.11 | Jamais plusieurs dépenses IA SILENCIEUSES · facturation |
| #2009.16 | Journaliser : coût et durée · facturation |
| #2011.11 | Ne pas consommer silencieusement des crédits · facturation |
| #2074.26 | 0 crédit, aucun compte créé automatiquement · facturation + doctrine |
| #2076.4 | Avant lancement : COÛT · facturation |
| #2084.11 | État « crédits insuffisants » · facturation |
| #2084.19 | … coût ou REMBOURSEMENT · facturation |
| #2084.40 | 0 crédit : questionnaire · facturation |
| #2084.41 | 0 crédit : audit local sur données déclarées · facturation |
| #2084.42 | 0 crédit : consultation, Market Memory, corrections, imports locaux, prévisualisations · facturation |
| #2084.43 | Crédit ANNONCÉ avant recherche fraîche / enrichissement / analyse externe / vérification payante · facturation |
| #2084.44 | Afficher coût, durée, périmètre, crédits restants, remboursement · facturation |
| #2084.45 | Ne jamais consommer à chaque sous-étape du questionnaire · facturation |
| #2091.32 | Carte : résultat attendu, raison, temps, coût, bouton · facturation + écran |
| #2030.17 | Afficher coût éventuel et durée · L8 |
| #2033.7 | Collecter la responsabilité marge et facturation · L14 |
| #2053.3 | Coût d'intercontrat et panier moyen · L19 |

---

## B. Droits et cloisonnement — 39 points

Arrêt du dépôt lui aussi. ⚠️ **Mais tu en as déjà levé une grosse part** : la couche BU est livrée (PR #2236, sept règles d'accès prouvées). Beaucoup de ces 39 points deviennent codables dès que tu auras relu cette PR — ils décrivent l'ÉCRAN d'une mécanique qui existe désormais.

Les trois vrais arbitrages qui restent, eux, ne se déduisent pas :

1. **Rejoindre un espace existant** (#2016.1→.10) — on détecte qu'un domaine correspond à un espace, on ne crée jamais un doublon, on nomme les admins **sans exposer leurs coordonnées**, on propose de demander l'accès. Ce qui se décide : qui reçoit la demande, et ce qui arrive quand l'admin ne répond jamais.
2. **Ce qu'un rôle peut faire** (#2033.9/.10/.11) — « ne pas proposer à un Business Manager une action réservée au dirigeant », « ne pas interpréter *directeur* comme un accès à toutes les données ». C'est une table de droits, et elle ne s'invente pas.
3. **Les chiffres d'argent réservés** (#2053.1→.7) — marge par consultant, concentration du risque, coût d'intercontrat, délai d'encaissement. Facultatifs, **réservés aux dirigeants et autorisés**, et jamais affichés aux autres. Recoupe A.

| Point | Demande |
| --- | --- |
| #1918.2 | Distinguer "Mon équipe / ma BU" · D |
| #1962.13 | Option "Règle pour mon équipe" · D |
| #1910.2 | Périmètre "Tout mon espace" · A |
| #1911.15 | Suppression selon droits · A |
| #2072.2 | Bloc CONTRAINTES (capacité, territoire, budget, accès, processus, maturité, dépendances) · écran |
| #2077.9 | Étape « Premier collègue invité » · parcours |
| #2016.1 | Détecter qu'un domaine correspond à un espace existant · L2 |
| #2016.4 | Proposer de demander l'accès · L2 |
| #2016.5 | Nommer les admins sans exposer leurs coordonnées · L2 |
| #2016.6 | Parcours alternatif si plusieurs BU séparées · L2 |
| #2016.7 | Après acceptation, profil entreprise récupéré et partagé selon droits · L2 |
| #2016.9 | Traiter l'invitation expirée · L2 |
| #2016.10 | Traiter l'admin absent et la mauvaise entreprise · L2 |
| #2017.1 | Poser « toute l'entreprise ou un périmètre ? » après l'entreprise · L3 |
| #2017.3 | Choix « Une BU » · L3 |
| #2017.4 | Choix « Une agence » · L3 |
| #2017.5 | Choix « Une équipe commerciale » · L3 |
| #2017.9 | Collecter le nom du périmètre · L3 |
| #2017.17 | Permettre de choisir une BU existante · L3 |
| #2017.18 | Demander l'accès à une BU ou en créer une avec permission · L3 |
| #2017.19 | Permettre de travailler sans BU (petite structure) · L3 |
| #2017.20 | La BU hérite du profil entreprise sans le dupliquer · L3 |
| #2018.7 | Signaler une info entreprise fausse sans l'écraser sans droits · L4 |
| #2018.8 | L'administrateur reçoit une demande de correction · L4 |
| #2018.9 | Tester associé, manager, membre standard, invité lecture seule · L4 |
| #2030.2 | Bloc de récap « BU » · L8 |
| #2031.2 | Vérifier la BU avant chaque bloc · L13 |
| #2033.8 | Collecter l'accès aux outils et la possibilité d'inviter · L14 |
| #2033.10 | Ne pas interpréter « directeur » comme accès à toutes les données · L14 |
| #2033.11 | Alimenter RBAC, recommandations, cockpit et plan d'action · L14 |
| #2034.5 | Situation « Plusieurs agences / BU » · L15 |
| #2035.2 | Distinguer les consultants de la BU · L15 |
| #2036.5 | Collecter les règles territoriales · L15 |
| #2036.6 | Collecter périmètre exclusif ou partagé · L15 |
| #2037.9 | Collecter l'owner des comptes · L15 |
| #2046.7 | Collecter le consentement · L18 |
| #2053.5 | Facultatif, réservé aux dirigeants et autorisés · L19 |
| #2053.7 | Ne pas afficher ces données aux membres non autorisés · L19 |
| #2057.10 | …l'owner · L19 |

---

## C. Doctrine — 10 points

Ceux-là, je peux les trancher seul si tu confirmes la ligne, parce que la doctrine existe déjà et qu'ils ne font que l'appliquer à un écran de plus.

- **« Recours externe OBSERVÉ »** (#2074.21, #2090.40, #2165.30, #2083.16) — c'est un bloc de COUVERTURE, garde GA-259. Il dit ce qu'on SAIT, jamais ce que le marché FAIT. « 72 % de couverture » ne veut pas dire « 72 % externalisent », et le complément ne veut pas dire « 28 % n'externalisent pas ».
- **La confiance portée par chaque élément** (#2063.13, #2072.5, #2090.29, #2027.3) — « non mesurée », jamais « faible ». Un axe non évaluable SORT du dénominateur.
- **#2065.20** est le seul qui demande un vrai arbitrage : il propose de séparer « complétude / maturité / potentiel / **probabilité de signature** ». Les trois premiers, oui. **Le quatrième est refusé six fois** (`c26_probabilite`). Ma recommandation : garder les trois axes, refuser le quatrième, et l'écrire dans le registre pour qu'il ne revienne pas une septième fois.

| Point | Demande |
| --- | --- |
| #2012.12 | Source facultative indisponible : continuer + signaler couverture réduite · doctrine (couverture) |
| #2063.13 | … sa CONFIANCE · contrat |
| #2065.20 | Séparer complétude / maturité / potentiel / probabilité de signature · doctrine |
| #2072.5 | Chaque élément porte sa CONFIANCE · doctrine |
| #2074.21 | Montrer : recours externe OBSERVÉ · doctrine (couverture) |
| #2083.16 | Cette liste est un bloc de COUVERTURE · doctrine (GA-259) |
| #2085.21 | … le TAUX DE CONNEXION · doctrine (couverture) |
| #2090.29 | … confiance · doctrine |
| #2090.40 | Carte : recours externe OBSERVÉ · doctrine (GA-259) |
| #2027.3 | L'audit dit « non mesurée », jamais « faible » · L10 |

---

## D. Analytique produit — 2 points

- **#2085.16** — mesurer l'abandon **par QUESTION**. C'est une unité d'analyse plus fine que l'écran, et c'est exactement la frontière de `c64` : on agrège par écran, par fonction, par parcours, jamais par quelqu'un. Une question abandonnée reste du produit ; mais sous le plancher de 5 sessions distinctes, « les gens abandonnent la question 7 » désigne quelqu'un. Faisable **si et seulement si** le plancher s'applique à la lecture (GA-267 le fait déjà).
- **#2085.21** — le TAUX DE CONNEXION. Hors du namespace `market-memory`, donc hors GA-259 : à reformuler comme une couverture, sinon il se lira comme un fait de marché.

| Point | Demande |
| --- | --- |
| #2085.16 | … l'abandon par QUESTION · analytique produit |
| #2022.8 | Mesurer taux de reprise et abandons par question · L7 |

---

## E. Écran et parcours — 59 points

**C'est la famille que je peux prendre en charge**, et c'est la plus grosse. Aucun n'est un arrêt ; ce sont des choix de forme dont je peux prendre le plus conservateur et le documenter — tu défais ce qui ne te va pas.

Les deux seuls qui méritent ton œil :

- **#2091.40** — « le premier écran après l'accueil est Laura, ou une action préparée par Laura ». C'est une décision de POSITIONNEMENT, pas de mise en page : elle dit que le produit s'ouvre sur le copilote et pas sur un tableau de bord.
- **#2089.29** — « six phases réelles (vérification → sauvegarde) ». Nommer six phases, c'est promettre six phases. Si elles ne sont pas toutes réelles, on ment à l'écran.

| Point | Demande |
| --- | --- |
| #1911.11 | Recherche · A |
| #1952.25 | Bouton annuler lorsque possible · E |
| #1957.2 | Afficher durée approximative · E |
| #1926.4 | Connaître le niveau hiérarchique · C |
| #1926.5 | Connaître tutoiement/vouvoiement · C |
| #1903.24 | Jamais page générique/vide · B |
| #1932.4 | Même logique agenda/messagerie/Drive/ATS · B |
| #1933.10 | Jamais redirection vers page sans résultat · B |
| #2151.25 | Éviter les doublons Laura/Aujourd'hui/notif/email/Veille · contrainte |
| #2165.3 | Sous-titre personnalisé nommant les cinq axes · libellé |
| #2165.30 | Filtre comptes : Recours externe observé · filtre |
| #2166.56 | Sélection : lancer une analyse de lot · action lot |
| #2166.79 | Recette : aucune notification dupliquée · recette |
| #2088.29 | Préremplissage : bloc clair « Proposé depuis le registre public · mis à jour en 2025 » · écran |
| #2089.29 | Six phases réelles (vérif → sauvegarde) · parcours |
| #2072.1 | Bloc ACTIFS (compétences, relations, données, vivier, références, outils, temps) · écran |
| #2072.3 | Bloc RUPTURES (étapes où les dossiers cessent d'avancer) · écran |
| #2077.3 | Étape « Profil validé » · parcours |
| #2090.18 | Bloc 2 : Actifs / Contraintes / Inconnues, 3 colonnes max · écran |
| #2091.40 | Le premier écran après onboarding est Laura ou une action préparée par Laura · parcours |
| #2015.9 | Expliquer pourquoi l'arbitrage est nécessaire · L3 |
| #2016.2 | Ne pas créer un doublon d'espace automatiquement · L2 |
| #2016.3 | Expliquer qu'un espace existe et afficher son nom · L2 |
| #2017.2 | Choix « Toute l'entreprise » · L3 |
| #2017.6 | Choix « Un territoire » · L3 |
| #2017.7 | Choix « Une activité à créer » · L3 |
| #2017.8 | Choix « Autre » · L3 |
| #2017.10 | Collecter son territoire · L3 |
| #2017.11 | Collecter sa spécialité · L3 |
| #2017.12 | Collecter sa taille · L3 |
| #2017.13 | Collecter ses consultants · L3 |
| #2017.14 | Collecter ses commerciaux · L3 |
| #2017.15 | Collecter son responsable · L3 |
| #2017.16 | Collecter les comptes déjà possédés · L3 |
| #2021.3 | Contrastes accessibles (AA dans les deux thèmes) · L6 |
| #2021.19 | Desktop, tablette et mobile gardent la même logique · L6 |
| #2022.4 | Ne demander que neuf, ambigu, contradictoire, obsolète · L7 |
| #2022.7 | L'ancienne version reste active tant que la nouvelle n'est pas validée · L7 |
| #2023.7 | Le vocabulaire des sept étapes remplace celui des trois stages · L8 |
| #2028.8 | La source doit émettre la date pour que 2028.2 existe · L11 |
| #2031.7 | Vérifier la messagerie avant chaque bloc · L13 |
| #2033.2 | Collecter les décisions autonomes · L14 |
| #2033.3 | Collecter les décisions nécessitant validation · L14 |
| #2033.4 | Collecter les personnes managées · L14 |
| #2033.5 | Collecter la responsabilité recrutement et comptes · L14 |
| #2033.6 | Collecter la responsabilité staffing · L14 |
| #2033.9 | Ne pas proposer à un Business Manager une action réservée au dirigeant · L14 |
| #2036.4 | Collecter comptes réservés et comptes groupe accessibles · L15 |
| #2037.7 | Collecter les responsabilités · L15 |
| #2040.18 | …modifient le scoring · L16 |
| #2052.7 | Objectif « CA » · L19 |
| #2053.1 | Marge par consultant et seuil mensuel recherché · L19 |
| #2053.2 | Concentration du risque · L19 |
| #2053.4 | Délai d'encaissement et visibilité actuelle · L19 |
| #2054.4 | …la messagerie · L19 |
| #2054.8 | …les outils d'enrichissement · L19 |
| #2056.9 | …le taux de shortlist · L19 |
| #2056.11 | …l'économie du dossier · L19 |
| #2060.6 | Exemple « conflit de territoire » · L19 |
