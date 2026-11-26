# Décisions — corpus Laura du 12/09/2026 (#1901 → #1962)

Registre des 1 166 points : `.claude/notes/registre-2026-09-12.md`.

## Tranché par Louis (12/09/2026, lot unique de questions)

| Sujet | Décision | Issues | Conséquence de travail |
| --- | --- | --- | --- |
| Pièces jointes du chat | **Fil seul par défaut** : un document sert à la conversation ; il n'entre dans la base de l'ESN que sur un choix explicite ; « retirer » supprime le document ingéré. Migration ADDITIVE (portée sur le document). | #1954 (+ #1941) | Aujourd'hui chaque pièce jointe part en silence dans le RAG durable de tout l'espace (`rag.controller.ts:63-90`). Lot dédié. |
| Mémoire | **Nature + portée perso** : le modèle reçoit nature et origine de chaque élément (une correction domine ; une sauvegarde depuis Laura = « note à vérifier » par défaut) ET une portée « moi uniquement » (migration additive). | #1916 #1917 #1918 #1919 #1962 | `kind`/`origin` perdus à `chat-context.service.ts:522` ; tout pin est ESN-wide (`memory.service.ts:307-313`). |
| Actions du chat | **Tout migrer vers Action OS** — une seule porte, un seul journal pour toutes les cartes du chat. ⚠️ PAS la voie recommandée (« brancher l'existant ») : plus longue. | #1930 #1931 #1943 #1952 #1953 #1959 | Les cartes (`PendingActions.tsx`) appellent les API métier en direct, sans idempotence ni état persisté. ⚠️ Touche la réservation/le débit de crédits : arrêt obligatoire §10 (facturation) à respecter — simulation et comptes avant d'écrire. |
| Langue & ton | **Langue de l'interface, tutoiement fixe** : Laura répond dans la langue des préférences ; le tu in-app reste l'identité (les messages EXTERNES gardent leur tu/vous). | #1958 #1928 | `bellum_advisor.py:804` force le français. |

## Tranché par Louis (12/09/2026, second envoi — vague 2)

| Sujet | Décision | Issues | Conséquence de travail |
| --- | --- | --- | --- |
| Pièces jointes DÉJÀ ingérées | **Inchangées, marquées** « jointe depuis le chat » dans Connaissances, retirables par leur auteur. Aucune visibilité retirée en silence. | #1954 | Migration additive : défaut `workspace` pour l'existant ; marquage = origine du document. |
| Portée d'un élément de mémoire créé depuis le chat | **Demandée à la confirmation, défaut « moi »**, sauf une correction d'un compte (défaut « mon espace »). | #1917 #1918 | Portée affichée dans la fiche avant enregistrement ; migration additive de portée. |
| Brief du matin ↔ amorce de Laura | **1re ouverture du jour = brief** en 3 blocs dans la voix de Laura ; ensuite l'amorce courte. | #1936 #1908 | L'amorce du lot 1 devient le point d'entrée du brief. |
| Audio du mode vocal | **Conservé 30 jours** puis supprimé — ⚠️ PAS la voie recommandée (« jamais conservé »). | #1939 | Stockage + purge à 30 j (routine de rétention, interrupteur) + mention RGPD à écrire par Louis (registre des traitements, politique de confidentialité) — pièce juridique, ne se code pas. |

## Tranché par Louis (12/09/2026, troisième envoi — vague 2b)

| Sujet | Décision | Issues |
| --- | --- | --- |
| Effacement de compte | **Tout effacer tout de suite** : audios supprimés immédiatement ET messages écrits à Laura anonymisés (le texte d'un fil partagé reste, sans l'auteur). Corrige un trou EXISTANT : `privacy-deletion.service.ts:105-155` ne touche ni `chat_messages` ni `storage_objects`. | #1939 (+ RGPD) |
| Réécoute d'un message vocal | **Même portée que le texte** du fil. | #1939 |
| Brief du matin et rôle | **Voix seulement** : mêmes données personnelles, cadrées selon le rôle. | #1936.11 |
| Fuseau de « la 1re ouverture du jour » | **Celui du navigateur, non stocké**. | #1936 |

Défauts retenus sans Louis (vague 2b) : source en panne à la 1re ouverture → « premier du jour » consommé, silence nommé bloc par bloc ; message vocal ≤ 90 s ; chaque message vocal compte dans `CHAT_DAILY_MESSAGE_LIMIT`.

## Tranché par Louis (12/09/2026, quatrième envoi — lot 4 Action OS, facturation)

| Sujet | Décision |
| --- | --- |
| Enrichissement depuis une carte (1 crédit) | **Réserver au clic** : solde affiché −1 pendant la recherche, débit si trouvé, libération sinon (même prix, même règle de débit). |
| Analyse lancée depuis la conversation (8 crédits) | **Suivi seul dans Action OS, facturation inchangée** : débit de 8 au lancement, remboursement sur échec terminal, aucune réservation. |
| Écran Actions | **En cours + historique** : une carte y apparaît dès qu'elle est lancée ou attend un manager ; onglet Historique pour refusées et expirées ; les simples propositions restent dans la conversation. |
| Reporter / expiration | **Date choisie (défaut demain 9 h), expiration de 3 jours relancée** à partir de cette date. |

Plan complet : `.claude/notes/plan-lot4-action-os-2026-09-12.md` (dont le défaut D2 : une approbation de l'Action Center n'exécute rien).

## Tranché par Louis (12/09/2026, cinquième envoi)

| Sujet | Décision | Issues |
| --- | --- | --- |
| Titre des fils | **Rédigé par Laura, sans quota** : titre court produit par un petit modèle après le 2e échange, hors des 50 messages/jour, modifiable à la main. | #1911.1 #1955.1 |
| Conservation d'un document « fil seul » | **Tant que le fil existe** : archivé / restauré / supprimé avec la conversation ; durée affichée avant l'envoi. | #1954.5 #1954.24 |
| Auteur visible dans un fil partagé | **Oui, prénom + avatar** sur chaque message et chaque validation (migration additive). | #1940.4 #1940.5 #1940.13 #1955.19 |
| Conversations sur mobile | **Tiroir depuis l'en-tête** de Laura (même liste qu'ordinateur, cibles 44 px). | #1944.4 |

Règle de Louis (12/09, soir) : **5 à 15 écrivains en vol en permanence** ; questions groupées au fil de l'eau.

## Tranché par Louis (13/09/2026, sixième envoi)

| Sujet | Décision | Issues |
| --- | --- | --- |
| Coordonnées masquées dans les réponses | **Bancaires seulement** (IBAN, BIC, RIB) ; coordonnées professionnelles visibles. | #1956.20 |
| Recette de la démo (remplace la session du navigateur piloté) | **À la toute fin** de la session ; Louis se reconnecte ensuite. | R18, #1909.8/.9, #1902.16 |
| Traces d'interventions proactives à l'effacement d'un compte | **Effacées aussi** (`laura_interventions`). | #1939 / RGPD |
| Documents « fil seul » orphelins (fil jamais écrit) | **Purge après 24 h** sans message, chaque nuit, interrupteur ; jamais un document de la base de l'ESN. | #1954 |
| Supprimer un élément de mémoire PARTAGÉ | **Auteur + managers** (owner/admin) ; les autres ne l'effacent pas. | #1918.7 |
| `/welcome` en démo | **Semer « onboarding terminé »** pour la salle de démo. | #1921 / parité démo |
| Conservation des conversations avec Laura | **Tant que l'espace existe** : suppression par l'utilisateur, auteur retiré à l'effacement d'un compte, tout effacé à la résiliation de l'espace. Aucune purge automatique. (Pièce RGPD : durée à écrire au registre des traitements par Louis.) | RGPD |
| Adresse de support proposée par Laura | **support@bellum-it.com** (celle de l'app) ; la note interne `agent_docs/ops/beta-support-process.md` qui dit « aucune boîte » est à corriger. | #1960.20 |
| Écran de suivi des signalements | **Oui, lot séparé** : « Mes signalements » avec leur état, sans lien vers un outil interne. | #1960.10 |
| Support en marque blanche | **Aucune adresse Bellum** : Laura ne propose que le signalement. | #1960.20 |
| Note de Laura modifiée par une personne | **« Confirmé par une personne »** : origine conservée, mention « confirmé par <prénom> » à la place de « à vérifier » ; Laura la traite comme un fait déclaré. | #1916, #1962 |
| Trace, réponse par réponse, des éléments de mémoire utilisés | **Oui, maintenant** — ⚠️ PAS la voie recommandée (« plus tard ») : stockage par réponse des éléments envoyés à Laura, affichage sous la réponse et dans la mémoire. | #1916.18, #1916.24 |
| Carte validée par un manager | **S'exécute au nom de l'auteur** ; le manager est tracé comme validateur. | #1940.5, Action OS |
| « On répond sous 24 h ouvrées » (fenêtre de contact) | **Retirer la promesse** : aucun délai chiffré. | #1960.14 |
| Cartes d'action par réponse | **3 au plus, 1 principale** (garde dans le code, pas seulement le prompt). | #1924.6/.7 |
| Message jugé générique | **Avertir, sans surcoût** : « Message peu personnalisé » + éléments disponibles ; aucune régénération automatique. | #1925 |
| Déblocage du secteur NAF (0/60 067 entreprises avec SIREN) | **SIREN dans le pack** `02_entreprises.csv` (côté producteur du corpus) ; en attendant, Laura ne propose aucun filtre par secteur. Le lien vers la fiche du compte (#1961.21) part seul. | #1961.8 |
| Secteur dans la mémoire marché | **Secteur via le code NAF** — migration + remplissage depuis le registre public des entreprises pour le corpus partagé. ⚠️ PAS la voie recommandée (« reporter ») : chantier de données. `ecosystemAffinity` reste écarté (aucune donnée, on n'invente pas). | #1961.8 (#1961.17 écarté, #1961.21 part avec) |

## Tranché SANS Louis — défaut retenu, dis-le si tu veux l'autre

- **#1946.22 alerte « espace à risque » sur l'usage / santé par espace** → écarté : décision du 10/09 (`client-lifecycle-alerts.ts`) + doctrine c64 (rien de comportemental par espace nommé), relecture RGPD toujours en attente.
- **#1949.23 intentions non reconnues enregistrées** → pas avant la relecture c64 ; au plus un compteur agrégé par écran, sans texte.
- **#1912.11 logos des outils dans la saisie** → refus : doctrine « jamais de nom d'éditeur hors Réglages › Intégrations ».
- **« brouillon Gmail » (#1930, #1931, #1942)** → « brouillon dans ta messagerie » (même doctrine).
- **#1907.16 personnage 3D** → D137 (tome du 01/09) maintenu : avatar statique discret.
- **#1911.7-10 regroupement Aujourd'hui/Semaine/Par compte** → décision documentée maintenue (`ConversationsPanel.tsx:134-142`).
- **#1915.10 score de confiance** → aucun score (c26) ; axes nommés à la place (nombre de sources, âge, non consulté).
- **#1910 / #1951 portées consultant / besoin / mission…** → consultant + besoin d'abord.
- **#1950 planificateur** → formaliser l'existant (cartes indépendantes) + plafond de coût agrégé ; à relire après la migration Action OS.
- **#1936 brief en 3 blocs** → chapeau 3 blocs au-dessus des sections existantes.
- **#1938 canaux** → push navigateur plus tard, SMS reporté.
- **#1939 vocal** → dernier lot.
- **#1955.14 révocation de partage** → hors (fils team-scopés, pas de fil restreint).
- **#1960 support** → Laura renvoie vers le signalement existant, pré-rempli.
- **#1945 / #1948 corpus** → enrichir les tests existants de métadonnées, pas de corpus neuf ; ⚠️ le golden « conversations » existant est celui de Laura du SITE.
- **#1920 personas** → mapper les 10 rôles existants vers 5 familles dans le prompt, sans changer le schéma.
- **#1926 objectifs de message** → 2-3 objectifs d'abord (relance, ouverture de compte).
- **#1904.12 route canonique** → abandonnée (refus documenté `laura-context.ts:9-15`).
- **#1953.1-3 bouton Arrêter** → avec la migration Action OS / le flux SSE, pas avant.
- **Constat faux « 45 outils » (#1948, #1961)** → 54 outils ; `search_market_memory` EST branché (`chat_tools.py:1547,3718`).

## Défaut de sécurité trouvé pendant le tri (sans choix produit)

- Masquage des secrets appliqué à la réponse finale (`chat.py:349`) mais pas aux fragments SSE (lot streaming du 12/09) → écrivain isolé lancé, à intégrer au lot 1.

## Batch 11 — 13/09, décisions ANTÉRIEURES à l'issue rouvertes

Règle posée par Louis le 13/09 : tout écart fondé sur une décision antérieure à l'issue lui remonte (« l'évolution c'est parfois refaire les règles »). Écrite dans le skill `livraison:issues` §2.

| Sujet | Règle d'avant | Décision de Louis |
| ----- | ------------- | ----------------- |
| Noms d'outils (#1912.11 ; « brouillon Gmail » #1930/#1931/#1942) | jamais de nom d'éditeur hors Réglages › Intégrations | **Nommer ce qui est branché** : l'outil que le client a lui-même connecté se nomme et se montre ; nos fournisseurs jamais (axe D354 du site étendu à l'app). Doctrine CLAUDE.md + gardes de nommage à réécrire. |
| Fils groupés (#1911.7-10) | liste plate (`ConversationsPanel`, 240 px) | **Date + par compte** (contre la recommandation « date seule ») |
| Avatar (#1907.16) | D137 : 3D partout | **3D gardé, statique** (sans animation ni mascotte) |
| Score de confiance (#1915.10) | c26 : aucun score nu, aucune probabilité | **Axes nommés, sans score** |

## Batch 12 — 13/09 (suite des décisions antérieures rouvertes)

| Sujet | Règle d'avant | Décision de Louis |
| ----- | ------------- | ----------------- |
| Route canonique (#1904.12) | chaque écran DÉCLARE son contexte, jamais déduit de l'URL (`packages/contracts/src/schemas/laura-context.ts`) | **Garder la déclaration** |
| Signaux d'usage (#1946.22 alerte espace à risque ; #1949.23 trace anonyme des demandes non comprises) | refus du 10/09 + doctrine c64, relecture RGPD due | **Lever les deux** (contre la recommandation « attendre la relecture RGPD ») — Louis assume le traitement avant la relecture juridique ; garde-fous techniques maintenus (anonyme, masquage, no-op sans destinataire) |
| États d'une capacité (#1902.1-8) | 10 états existants | **Garder les états actuels**, n'ajouter que les libellés manquants |
| Pièce jointe d'un fil partagé | relue pour son auteur seul | **Auteur seul** (confirmé) |

## Batch 13 — 13/09

| Sujet | Règle d'avant | Décision de Louis |
| ----- | ------------- | ----------------- |
| Dégradé derrière l'accueil de Laura (#1907.9) | `tokens.css` : « pas de dégradé, primaire plat seulement » | **Garder le plat** — le dégradé de `feat/laura-finition-visuelle` est retiré |
| Portée affichée deux fois (en-tête + saisie) | loi 4 : rien n'apparaît deux fois | **Dans l'en-tête** seulement |
| Plafond de messages Laura | le même pour tous les plans (`CHAT_DAILY_MESSAGE_LIMIT`, 50/24 h) | **Selon le plan** (contre la recommandation) — valeurs par plan à fournir par Louis ; en attendant, 50 partout dans la grille (valeur vraie d'aujourd'hui, pas inventée) |
| SMS (#1938.4) | reporté par défaut | **Oui, lot dédié** (contre la recommandation) — consentement explicite, no-op strict sans fournisseur ; fournisseur et premiers envois réels validés par Louis |

## Vérification des 255 « déjà là » sans geste (13/09)

Lecture de `main` `de5a6d23e` par deux agents : **180 confirmés · 55 partiels · 16 constats faux · 4 cassés** (`.claude/notes/deja-la/sujets-ABC.md`, `sujets-DEFG.md`). Les 75 non confirmés repassent `retenu` au registre. Cassés : 1956.14 (Laura lance une analyse payante sans le droit `analysis:run` — trou d'autorisation), 1918.8 (préférences d'un membre servies à ses collègues), 1901.12 (liste des fils coupée à 20 par identifiant), 1916.5 (`user_preferences` jamais écrite).

## Batch 14 — 13/09/2026 ~19h45 (session de consolidation)

| Sujet | Recommandation | Décision de Louis |
| --- | --- | --- |
| Plafond de messages Laura **par plan** (valeurs manquantes du batch 13) | 25 / 50 / 150 / 400 | **RETENUE** : `trial` 25 · `starter` 50 · `team` 150 · `growth` 400 · `beta` = `growth`. Plafond **opérateur inchangé à 50**. Raison : `starter` garde la valeur vraie d'aujourd'hui (aucune régression pour un client existant) et la marche devient un argument de montée en gamme. |
| SMS (#1992) | merger en **no-op strict**, brancher plus tard | **RETENUE** : la capacité part en prod sans aucune clé — zéro appel réseau, chemin byte-identique, aucun envoi possible. Fournisseur / expéditeur / pays / budget : **toujours ouverts**, à brancher sans nouveau cycle de code. |
| Vocal (#1983) | merger sans `TRANSCRIPTION_API_KEY`, Louis la posera | **RETENUE** : le code part, la capacité reste éteinte. ⚠️ Le vocal se recette **NON VÉRIFIÉ**, jamais « vérifié OK ». Rappels du 12/09 qui restent dus : audio conservé 30 j, et la **pièce RGPD** (registre des traitements + politique de confidentialité) — elle ne se code pas. |

**Ce que ce batch NE tranche pas**, et qui reste ouvert pour Louis : les 27 « résultats attendus » du catalogue d'outils · le drapeau « mémoire marché » sur l'accueil de Laura · la clé de transcription en production.

## Batch 15 — 13/09/2026 ~20h30 — l'axe des noms d'outils

**Décision de Louis** : étendre **D354** (jusqu'ici écrit pour le site public) à
l'application. L'axe n'est plus « sur quel écran on est » mais **« à qui
appartient l'outil »** :

| L'outil est… | On le nomme ? | Pourquoi |
| --- | --- | --- |
| **au CLIENT**, et il l'a branché (CRM, messagerie, agenda) | **oui** | c'est SON outil ; c'est lui qui l'a connecté |
| **notre fournisseur de données** (Apollo, Pappers, Firecrawl, SalesQL, Dropcontact, Serper, Tavily) | **jamais** | « Le client achète BellumAI, pas une addition d'APIs » — et ils sont interchangeables |
| **un registre PUBLIC** (BOAMP, BODACC, DECP, France Travail, APEC, SEC EDGAR) | **oui** | le nom EST la garantie : un commercial qui cite le BOAMP en rendez-vous cite une source officielle |

⚠️ **La question que j'ai posée à Louis portait un exemple FAUX** — j'avais
attribué les 8 chaînes fautives de la garde aux 8 outils connectés visibles sur
`/chat` (HubSpot, Gmail…). Vérification faite : le corpus `VENDORS` de
`lexicon.test.ts:222` ne contient AUCUN de ces huit. Les vrais fautifs sont
**4 libellés × FR/EN** — `boamp`, `decp`, `franceTravail`, `bodacc` — ajoutés par
le lot #1912.11. Le compte de 8 était une coïncidence. **La décision reste la
bonne** : c'est précisément l'axe qui résout le vrai cas, et il était déjà écrit
dans `CLAUDE.md` pour le site public.

⚠️⚠️ **ET LA QUESTION N'AURAIT PAS DÛ ÊTRE POSÉE** — Louis avait déjà tranché
exactement ce point au **batch 11**, le même jour : « l'outil que le client a
branché se nomme / se montre (axe D354 étendu à l'app), nos fournisseurs
jamais », et le point #1912.11 était déjà `recetté` en production sur
`1a4da151f` (les 8 outils de `/chat` sont ses connexions de `/integrations`).
Le registre le disait ; je ne l'ai pas relu avant de demander. C'est le défaut
que le socle nomme : **un § de reprise périmé envoie reposer des décisions déjà
prises.** Le geste qui l'évite coûte une seconde :
`grep '^| 1912.11 |' .claude/notes/registre-2026-09-12.md`.

**Ce qui RESTE vrai et utile de ce batch** — le seul point réellement ouvert :
- La garde `apps/web/src/i18n/lexicon.test.ts:222` mélange dans un seul corpus
  nos **fournisseurs privés** (Apollo, Pappers, Firecrawl, SalesQL, Dropcontact,
  Serper, Tavily) et des **registres PUBLICS** (BOAMP, BODACC, DECP, France
  Travail, APEC, SEC EDGAR). D354 les sépare depuis toujours — « notre
  fournisseur jamais, un registre public oui parce que le nom EST la garantie ».
  C'est ce mélange, et lui seul, qui bloque #1997 (8 fautifs = 4 libellés × FR/EN).
- La doctrine écrite dans `CLAUDE.md` mentionne encore D354 comme une règle du
  **site public** ; elle vaut pour l'app depuis le batch 11. À reformuler quand
  les intégrations en vol auront atterri (le fichier conflicte sinon).
