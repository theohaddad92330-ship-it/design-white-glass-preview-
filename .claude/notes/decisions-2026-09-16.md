# Décisions de Louis — 16/09/2026

Sept arbitrages pris dans la session `/issues` du matin. Chacun porte ce qu'il
renverse, pour qu'aucun ne se re-litigie dans trois semaines.

## 1. Le compte de production se répare par le produit, pas par la base

Louis avait demandé une réparation en base. **Meilleur chemin trouvé et appliqué :
`POST /onboarding/complete`.** La transition `refresh_required → completed` a été
ouverte le 16/09 par `bcffaa56b`, et ce commit EST servi en production.
`complete()` relit les réponses déjà enregistrées — aucune réponse inventée,
aucune écriture directe. État après : `completed`, étape `transition_summary`,
`/welcome` rouvert.

## 2. #2120.49 — corriger le geste, pas relotir

Le bouton était câblé mais navigue vers Historique au lieu d'ouvrir la note
terrain décidée le 15/09. **Corrigé dans le lot en cours**, pas reporté.

## 3. #2123.46/.47 — brancher `/actions` maintenant

La porte serveur `/plan-items/mine` était prête et testée, l'écran ne l'appelait
pas. Lot dédié lancé. C'est le motif récurrent du dépôt : du code juste que
personne n'appelle.

## 4. #1938.3 — le canal de notification navigateur se fait

Chantier lancé, borné : permission demandée sur un GESTE (jamais au chargement —
un `requestPermission()` sans clic bloque le site de façon permanente), réglage
par utilisateur éteint par défaut, quatre états distincts (`default` / `granted` /
`denied` / API absente), `denied` irréversible depuis la page donc on le DIT sans
jamais redemander, et sans permission : **no-op strict**.

## 5. ⚠️ RENVERSEMENT — `/missions` passe de treize onglets à quatre

**Louis renverse son propre arbitrage** du 31/08 (lui-même un revirement de celui
du 29/08). `sections.ts` écrivait : *« sinon elle se re-litigie tous les deux
mois »* — c'est donc la troisième fois, et c'est assumé.

Cinq invariants conditionnent l'accord, parce qu'ils sont ce à quoi Louis avait
conditionné le sien le 31/08 :
1. **rien ne disparaît** — chaque route absorbée reste atteignable (`sections.ts:14`) ;
2. **le lien profond des notifications vers le CRA** continue d'arriver au bon
   endroit (c'est pourquoi cet onglet était de premier rang, `sections.ts:314-317`) ;
3. **les trois populations de la table de Suivi** — « sans objet » / « à faire » /
   « non mesuré » — ne se fondent pas en deux, sinon la table ment sur trois colonnes ;
4. « Historique » ne redevient pas « Piloter » (#1376, 04/09) ;
5. le revirement s'écrit **en tête de `sections.ts`**, daté, avec ce qui tient encore.

Argument qui le renforce : **la doctrine mobile du dépôt dit déjà quatre onglets**
(au-delà, les cibles passent sous 44 px — GA-28/29/30). La décision CONVERGE avec
une règle écrite ; ce n'est pas un simple changement d'avis.

## 6. #2112.18 · #2145.4 · #2145.29 — l'écran d'arrivée reste Laura

⚠️ **L'agent avait durci le constat** : #1786 ne fixe pas Laura, il fixe que la
route d'arrivée se **DÉRIVE** (garde `landing-route-is-derived.test.ts`, GA-26).
La dérivation dit : Laura sur mobile quoi qu'il arrive, et sur desktop l'écran
choisi dans Préférences › Démarrage, **dont le défaut est Laura** depuis le 23/08.

Les trois points ne violaient donc pas #1786 : ils demandaient de changer une
**valeur par défaut**. Louis garde Laura. Réponse postée dans #2112 et #2145 —
elle rappelle que **le réglage existe déjà** et invite à revenir avec l'argument
« pour tout le monde » s'il tient, qui se tranchera sur l'usage mesuré.

## 7. GA-345 — les conclusions NON TIRÉES entrent dans « Ce qui n'a pas pu être établi »

Trois blocs de l'audit (`verdict`, `maturity`, `priority`) rendent une absence
d'une nature différente : ils ne manquent pas d'une donnée, ils **n'ont pas pu
conclure**. Ils entrent dans la section, **chacun avec sa raison dérivée** — de la
forme « Le verdict n'a pas pu être établi : deux axes sur sept mesurés ».

Raison : sans eux, l'utilisateur lit la section, la croit **exhaustive**, et rate
trois absences. C'est « non mesuré rendu 0 » d'un cran plus haut.

## Tranché par moi, et pourquoi

- **Les 7 statuts `livré`/`retenu` divergents** du registre questionnaire → **`retenu`**,
  le moins avancé. Après la découverte des 184 faux `recetté`, on ne monte pas un
  état sans preuve.
- **Les 184 faux `recetté`** ne servent à fermer aucune issue. Une seule issue a
  été fermée aujourd'hui (#2069), sur une preuve lancée et verte.

---

# Suite — les trois arbitrages du dossier `arbitrages-a-trancher-16-09.md`

## 8. G6 « Entretien » — les deux, sous des mots différents

`2170.5` · `2170.50` · `2152.9` (la même question posée dans deux registres qui
ne s'étaient pas vus).

**La source de vérité reste `Submission.interview`** (`submission.ts:37`) — un
entretien concerne une personne présentée, pas une affaire. **Le Projet AFFICHE
un stade DÉRIVÉ, au PLURIEL — « En entretien(s) » — jamais saisi.** Le pluriel
est ce qui empêche les deux de se confondre : un projet à trois candidats dont un
seul est en entretien n'est pas « en entretien ».

Coût accepté : une dérivation à écrire, **et elle vit à un seul endroit** (GA-26).
Rend `2170.50` réalisable sans migration.

## 9. G7 lecture « dirigeant » — TOUT sur `/pilotage`

⚠️ **Contre la recommandation** (qui proposait une accroche sur `/dashboard` et la
lecture sur `/pilotage`). Louis tranche plus net : **`/pilotage` porte la lecture,
et la page d'arrivée n'en porte RIEN.**

**Conséquence assumée, à dire clairement** : `2108.21` à `2108.25` — le persona
Dirigeant (Revenu, Risque, Adoption, Cash, Décisions structurantes) sur la page
d'arrivée — **sont REFUSÉS**. Le dirigeant a deux pages à ouvrir, et la page
d'arrivée ne lui dit rien de particulier. C'est le coût que la décision paie, en
échange de : un seul endroit qui fait foi, et aucun quatrième cockpit.

Ce qui l'éclaire : **GA-254** a réglé exactement ce problème pour l'ÉQUIPE (un
seul cockpit, et c'est `/team`) — et c'est **la règle la plus re-litigée du
corpus, 11 points la redemandent**, ce que son propre docblock avait prédit
(« se refait toujours, additivement »). ⚠️ Et **11 des 62 indicateurs du
dictionnaire sont `measurable: false`** : un sixième du cockpit ne se calcule pas
encore, ce qui rend un deuxième endroit encore plus coûteux à tenir honnête.

`2108.1` (« conserver la même architecture, les mêmes objets, quel que soit le
rôle ») devient une RÉPONSE et non une question : oui — ce qui change par rôle,
ce sont les PORTES ouvertes, pas la page.

## 10. G9 séquences — l'ÉTIQUETAGE d'abord, pas d'objet « campagne »

`2203.32` à `.38` · `2203.59` · `2203.68` · `2153.29`.

Le moteur crée une séquence PAR contact (#1515) ; #2203 décrivait une campagne
multi-contacts. **Les séquences partagent une ÉTIQUETTE, le tableau filtre
dessus** — 80 % de la lecture pour 20 % du coût, sans nouvel objet.

**L'objet « campagne » ne se crée QUE si la cadence commune est réclamée après
usage.** Ce qu'on n'aura pas d'ici là : ajouter un contact « à la campagne », et
une cadence partagée.

Reste ouvert et distinct (tranché en partie 1, mais il appartient à ce sujet) :
« preuve de chaque envoi » est refusée parce que **Bellum n'envoie pas**. La
question qui demeure est autre — faut-il **OBSERVER** l'envoi dans la boîte
connectée ? Le journal stocke déjà le corps des messages (arbitrage du 16/08),
donc ce n'est pas interdit : c'est un chantier non lancé. Ça ne change pas ce que
Bellum FAIT, seulement ce qu'il SAIT.

---

## 11. #2117.46 — le fond clair reste BLANC PUR

**Ce que le retour demandait** : « le fond de la page en mode clair est un blanc
cassé, pas un blanc pur ni une couleur arbitraire ».

**Ce que ça contredisait** : la décision « FA » du 01/09/2026, écrite dans
`apps/web/src/styles/tokens.css:55-80`. Le fond clair ÉTAIT un beige (`#f5f4f0`)
— on le lisait comme un gris sale, et il salissait le blanc des cartes. Il a été
remplacé par `--bellum-bg: #ffffff`, l'inverse littéral de ce que le retour demande.

**Pourquoi ce n'est pas qu'une couleur** : toute la grammaire du produit en
dérive. Une CARTE se tient par sa BORDURE (fond `--bellum-surface-1`, blanc sur
blanc — le trait devient structurel) ; un CONTRÔLE au repos se tient par un FOND
CREUX (`--bellum-surface-2`). La raison n'est pas esthétique : WCAG 1.4.11 exige
3:1 pour ce qui délimite un contrôle, et `--bellum-border` fait **1,27:1** sur le
blanc — durcir les ~1 200 traits du produit à 3:1 serait dur à l'œil.

**Décision de Louis, 16/09/2026** : le blanc pur tient. Point `écarté`.

**Ce que ça implique** : revenir à un fond cassé rendrait les cartes blanches
visibles par CONTRASTE, ce qui retirerait sa raison d'être à la règle « la
bordure est structurelle » — donc ce n'était pas un changement de token, c'était
la reprise de la grammaire carte/contrôle en entier.

**Ce qui reste dû** : la réponse dans #2117 porte cette raison ENTIÈRE, pas
« c'est décidé ». Celui qui a signalé voit peut-être un vrai manque de relief ;
s'il le redit, la réponse est le relief par les surfaces creuses et les bordures
déjà prévues, jamais par la couleur du fond.

---

## 12. #2195.25 — on nomme le FAIT, jamais le pronostic

**Ce que le retour demandait** : un statut « Renouvellement probable » dans
l'écran de renouvellement de contrat.

**Ce que ça contredisait** : la doctrine « aucune PROBABILITÉ » (`c26_probabilite`
au registre, refusée **six fois** — arbitrage n°4 du 16/08, D10 du PDF 1, §7.7 du
PDF 2, PDF 4, PDF 5, PDF 8). « Probable » est un pronostic présenté comme un état.

**Décision de Louis, 16/09/2026** : **nommer le FAIT, pas le pronostic**.
« Renouvellement probable » devient **« Reconduction annoncée par le client »** —
un fait daté, avec sa source, qu'on peut montrer à qui le conteste.

**Ce que ça débloque** : les 8 statuts de l'écran de renouvellement et les 5
points qui en dépendent, soit **13 points** sur
`feat/ecran-de-renouvellement-2195-16-09`.

**La règle qui en sort, pour les statuts suivants** : un statut nomme un
ÉVÉNEMENT qui a eu lieu (annoncé, signé, résilié, échu, en négociation) ou une
ÉCHÉANCE qui arrive (expire dans 30 jours). Il ne nomme jamais une chance. Si on
ne sait pas, le statut est « non renseigné » — pas « incertain », qui est encore
un pronostic déguisé.

---

## 13. RBAC — on le construit MAINTENANT

**Ce que j'ai mesuré** : `useUserPermissions()` rend `[]` partout. Le
cloisonnement par ESPACE existe (RLS Supabase, `auth.uid() = user_id`) ; les
RÔLES À L'INTÉRIEUR d'un espace n'existent pas. Deux points en dépendent
(#2150.60, #2167.14), et plusieurs écrans montrent déjà une interface de rôles.

**Ma recommandation était** : chantier à part, cadré, pas un point de lot — avec
l'avertissement que **des rôles qui ne cloisonnent pas vraiment sont PIRES que
pas de rôles du tout, parce qu'ils PROMETTENT un cloisonnement**.

**Décision de Louis, 16/09/2026, CONTRE ma recommandation** : le construire
maintenant.

**Ce que ça implique, dans cet ordre** (GA-11 / GA-12 : la contrainte SQL
s'élargit AVANT le code qui écrit) :

1. La migration : une colonne de rôle sur l'appartenance à l'espace, contrainte
   élargie d'abord, enum qui ne perd jamais de valeur (GA-08).
2. Les politiques RLS par rôle — c'est ÇA le cloisonnement. Un garde NestJS seul
   se contourne par la clé de service.
3. Le garde côté API en première ligne (`router.use`, pas par route — checklist
   sécurité), et l'`ownership check` à chaque endpoint qui prend un id.
4. `role` EXCLU des schémas Zod user-facing (mass assignment).
5. `useUserPermissions()` branché sur la vraie source, et les écrans qui le lisent.
6. Le test qui sait dire NON : l'utilisateur A ne peut PAS lire la ressource de
   B (403), et `PATCH /profile { role: "ADMIN" }` est ignoré.

**Le risque assumé** : tant que (2) n'est pas là, (5) ment. On ne montre aucune
interface de rôle avant que la base cloisonne.

---

## 14. #2167.29 — le tiroir, mais avec une URL

**Ce que le retour demandait** : que le détail d'un élément s'ouvre en tiroir
plutôt qu'en pleine page.

**Ce qui était en jeu** : #2150.34 est déjà `recetté` — le lien profond vers un
élément. Un tiroir sans URL le DÉFERAIT : plus de lien à coller dans un message,
plus de retour arrière, plus d'onglet.

**Décision de Louis, 16/09/2026** : **le tiroir, mais avec une URL**. Le tiroir
est une route à part entière ; l'ouvrir pousse une entrée d'historique, la fermer
la retire, et coller l'URL dans un autre onglet rouvre le tiroir sur son élément.

**Ce que ça exclut** : un état local (`useState`) qui ouvre le tiroir. C'est la
forme qui se code en cinq minutes et qui casse le point déjà recetté.

---

## 15. #1962.23 — la provenance est DÉJÀ LÀ

**Ce que le retour demandait** : « un fait promu affiche un niveau de confiance
explicite » — mesuré `ABSENT` au registre, aucun champ de confiance nulle part.

**Le piège** : un « niveau de confiance » est une PROBABILITÉ déguisée. « Fiable
à 80 % » est un pronostic sur la vérité d'un fait, et il se répète en rendez-vous
comme s'il était mesuré. C'est le refus n°6 de `c26_probabilite`, appliqué à un
fait au lieu d'une affaire.

**Décision de Louis, 16/09/2026** : ce que le retour appelle « confiance », c'est
la **PROVENANCE**, et elle est **déjà là**. La primitive `Provenance` porte la
SOURCE et la DATE ; le geste « confirmer » existe. Ce qui fonde la confiance dans
un fait promu, c'est de savoir d'où il vient et quand — pas un pourcentage.

**Ce qui reste dû** : la réponse dans #1962 cite le `fichier:ligne` de la
primitive et l'écran où on la voit, et dit POURQUOI un niveau chiffré ne viendra
pas — pas « c'est déjà fait ».

---

## 16. #2195.18 — « signaux » et « risques » sont UNE colonne (tranché par Claude)

Ce n'est pas un arbitrage produit, c'est l'application d'une règle écrite. Le
produit calcule DÉJÀ six motifs sous « Risques ». Afficher les mêmes six sous un
second nom est exactement la **loi 4 du tome 7** — « rien n'apparaît deux fois
sous la même forme avec le même contenu » — que ce lot vient précisément réparer
ailleurs dans l'écran. Une colonne, « Risques ». Point `.18` `écarté` avec cette
raison ; si un signal NON couvert par les six motifs apparaît un jour, il
s'ajoute aux motifs, pas à une colonne jumelle.

## 17. #2195.12 — « manager » = le manager du CONSULTANT

**Décision de Louis, 16/09/2026.** Les deux existaient dans le métier ESN et ne
se lisent pas au même endroit. Le référent commercial est déjà la colonne
`owner` (.13) ; ce qui manque au moment de décider d'un renouvellement, c'est ce
que seul le responsable interne du consultant sait — veut-il continuer, est-il
fatigué de la mission, est-il déjà pressenti ailleurs. Le référent CLIENT reste
un contact, et les contacts ont leur fiche.

## 18. #2195.17 — pas de colonne « satisfaction »

**Décision de Louis, 16/09/2026, contre ma recommandation** (je proposais de
renommer la colonne « Dérive » et d'y verser le signal déjà calculé par
`mission-drift.service.ts`). Point **`écarté`**.

**La raison qui s'écrit dans l'issue** : le REX se collecte APRÈS la mission,
donc jamais au moment où l'on décide du renouvellement. Sans source, la colonne
afficherait « non mesuré » sur 100 % des lignes — et un « 0 » y serait faux.
Une satisfaction collectée EN COURS de mission est un vrai chantier (collecte,
relance, qui répond, ce que le client en voit), pas une colonne.

**Ce que ça laisse sur la table** : le signal de dérive existe, il est calculé,
et il n'est affiché nulle part. À reprendre sous son propre nom, séparément.

## 19. #2195.33 — la proposition de renouvellement est une OPPORTUNITÉ au pipe

**Décision de Louis, 16/09/2026.** Ni un devis, ni un document rédigé : un
renouvellement EST une affaire commerciale — montant, échéance, étape,
propriétaire. L'objet existe et se suit déjà. Le gain n'est pas d'économiser du
code : c'est que **le renouvellement rejoint le prévisionnel** au lieu de rester
un angle mort à côté. Un devis ne se suit pas dans le pipe ; un document rédigé
par Laura non plus.

## 20. #2195.8 — les fenêtres se règlent en JOURS, avec trois garde-fous nommés

**Décision de Louis, 16/09/2026.** Le blocage n'était pas le réglage, c'était
l'absence de plancher écrit : « sans supprimer les garde-fous » ne se code pas
tant qu'on n'a pas nommé CE QU'UN ESPACE NE PEUT PAS FAIRE. Les voici :

1. **Jamais sous J-15.** Sous ce délai, un renouvellement ne se prépare plus, il
   se subit — la fenêtre cesserait de servir à quoi que ce soit.
2. **Les bornes strictement croissantes.** Une échelle qui se croise rend deux
   fenêtres vraies en même temps, et la ligne tombe dans les deux.
3. **« Sans date de fin » n'est jamais retirable.** C'est le cas qui ne se
   règle pas : une mission sans échéance n'entre dans aucune fenêtre, et la
   masquer la ferait disparaître de l'écran qui existe pour la rattraper.

L'échelle cesse d'être une énumération et devient une liste ordonnée de bornes.

---

## 21. #2062.4/.19 — la clarification gagne, la garde se réécrit

**Le conflit** : deux décisions du MÊME jour (15/09/2026) se contredisent dans le
dépôt. `apps/ia/tests/test_profiler_prompt_doctrine.py:206-218` porte un refus
DATÉ d'écrire ces points dans `bellum_profiler.py` (« lot isolé, revue
sécurité ») ; la clarification du même jour dit « libellé déclaratif, ni droits
ni cloisonnement ».

**Décision de Louis, 16/09/2026** : la clarification gagne. Si le libellé est
purement déclaratif — il NOMME une business unit, il n'accorde aucun droit et ne
cloisonne rien — alors la revue sécurité n'a pas d'objet.

**Ce que ça implique, et c'est le vrai travail** : la garde ne se supprime pas,
elle se **réécrit pour refuser ce qu'elle vise vraiment** — un libellé de BU qui
PROMETTRAIT un cloisonnement (« visible par », « réservé à », « accès »). Une
garde qui refuse le sujet entier parce qu'un de ses usages serait dangereux est
une garde qui invente sa règle au lieu de la protéger. Elle doit prouver les
trois choses : qu'elle sait dire NON (un libellé qui promet un cloisonnement
rougit), qu'elle LIT un corpus non vide, et qu'elle n'attrape pas ce qu'elle ne
vise pas (un libellé déclaratif reste vert).

## 22. #2122 — « Qualifier » ne FIGE pas la ligne

**Décision de Louis, 16/09/2026**, confirmant ce que l'agent avait livré.
Basculer `source` en `declared` fermerait le geste « Ce n'est pas exact » et
gèlerait note, certitude et date. Ce n'est pas nécessaire : l'upsert du pipeline
ne réécrit **déjà** ni `rank` ni `relationship`, donc la correction humaine est
protégée sans qu'on ait à couper la ligne du rafraîchissement.

C'est la doctrine « une correction humaine gagne toujours » appliquée au bon
grain : elle gagne sur LES CHAMPS qu'elle a corrigés, pas sur la ligne entière.

## 23. #1624 — « seulement observée » veut dire « aucune preuve DÉCLARÉE »

**Le défaut mesuré** (agent dossier-de-compte, 16/09) : `isObservedOnly`
(`TabPartners.tsx:167-171`) ne peut **jamais** être vrai sur une ligne de
`landscape.partners`, parce que `mergePartnerEvidence`
(`apps/api/src/modules/partners/observed-esn.ts:162-167`) pousse toujours
`workspace_declared` ou `current_inference` à côté de `market_observation`. Deux
boutons et le libellé « Route partenaire potentielle » ne sont donc **jamais
rendus en production**. C'est le motif n°1 de ce dépôt : du code juste que
personne n'atteint.

**Décision de Louis, 16/09/2026** : **une inférence du produit n'est pas une
déclaration de l'équipe**. « Seulement observée » = personne chez le client ne
l'a confirmée. Le prédicat redevient vrai sur de vraies lignes, les deux boutons
et le libellé réapparaissent, et la distinction garde son sens — ce qu'on a vu
sur le marché contre ce que le client a confirmé.

**À corriger dans #1624**, pas dans #2122 : c'est le sens du mot qui était en
cause, pas le bouton.

## 24. Les témoins de recette restent en production

**Décision de Louis, 16/09/2026** : « RECETTE 1612 TEMOIN » (onglet Preuves) et
« RECETTE 1889 - Reprise du socle data » (onglet Veille) du compte THALES
restent en place ; Louis s'en occupe. **Je ne supprime rien en production.**

Consigné ici pour qu'un balayage futur ne les prenne pas pour de vraies données
client — ce sont des témoins d'écriture, et ils prouvent que la chaîne marche.

---
## 25. #2022.7 — on ne régénère le profil ESN qu'à la COMPLÉTION

**Le défaut mesuré** (agent questionnaire, 16/09) : `esn-profile.service.ts:110`
appelle `triggerGeneration(..., { reedited: true })` à **chaque sous-étape** du
questionnaire. L'ancienne version du profil ne reste donc jamais active pendant
qu'on réédite — ce que le point demandait précisément.
**Décision de Louis, 16/09/2026** : ne régénérer qu'à la complétion. L'ancienne
version reste active tant que la réédition n'est pas finie.
**Le bénéfice qui n'était pas dans la question** : une génération par sous-étape,
c'est un appel modèle PAYÉ pour un état intermédiaire que personne ne lit. Le
correctif est donc aussi une économie, pas seulement une correction.

**L'alternative écartée** : versionner `esn_profiles` (les colonnes `version` et
`is_current` existent et ne bougent jamais). Elle résout le même symptôme, mais
en continuant de payer les générations intermédiaires ; son seul gain propre est
le retour arrière, que personne n'a demandé. À rouvrir si l'édition concurrente
devient un vrai cas.
## 26. #2024.3 — une recommandation se fonde sur une RÉPONSE ANTÉRIEURE, et rien d'autre
**Le blocage mesuré** : le point demande qu'une recommandation du questionnaire
porte une « source nommée » — et aucune source non inventée n'existe pour ça.

**Décision de Louis, 16/09/2026** : la seule source honnête est **ce que la
personne a elle-même répondu plus tôt**. Exemple : proposer `reference_sectors`
à partir de `target_sectors`, en NOMMANT la source (« d'après vos secteurs
cibles »). Vérifiable, et rien d'inventé.

**Ce qui est explicitement refusé** : fonder la recommandation sur la mémoire
marché de l'espace (« les ESN de votre taille ciblent souvent X »). Ça se lit
comme un fait de marché alors que ça mesure ce qu'on SAIT — c'est la doctrine du
taux de couverture (GA-259) appliquée à un préremplissage, et un libellé se lit
toujours hors contexte.
## 27. #1960 — un incident se DÉCLARE, il ne se devine pas
**Décision de Louis, 16/09/2026** : « incident connu » n'apparaît que si un
**opérateur a posé un drapeau** dans le back-office ; le refus le sert alors avec
le message. Personne ne devine.

**Ce qui est écarté** : déduire l'incident d'un taux d'erreur. Une panne isolée
chez un client n'est pas un incident connu, et **annoncer un incident qui n'existe
pas coûte plus cher qu'un refus nu** — l'utilisateur cesse de signaler, en
croyant qu'on sait déjà.
C'est le même principe que le reste du produit : on nomme un FAIT constaté, pas
un pronostic tiré d'un signal.
## 28. #1911.5 — le statut décrit le FIL, pas l'action
**Décision de Louis, 16/09/2026** : « en attente / reçu / terminé » décrit la
CONVERSATION — « j'ai écrit, Laura n'a pas encore répondu ». C'est ce qu'on lit
dans une liste de fils.

**Ce que ça implique techniquement** : l'agent a mesuré que
`AgentChatHistoryItem` **ne porte pas le rôle du dernier message**, donc il n'y a
rien à dériver honnêtement aujourd'hui. Le travail est donc de faire porter cette
information par l'objet d'historique, puis d'en dériver le statut — pas de
deviner à partir d'une date.

**Ce qui est écarté** : le statut d'une ACTION en attente de validation. C'est un
autre objet, commercialement utile, et il a déjà sa place dans le plan d'action —
le mettre dans la liste des conversations ferait apparaître deux fois la même
chose sous deux noms (loi 4).
