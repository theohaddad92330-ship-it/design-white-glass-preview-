# Installer BellumAI depuis la Marketplace BoondManager — pas à pas

> **À qui s'adresse ce document** : l'administrateur BoondManager d'une ESN qui installe l'app BellumAI depuis la Marketplace.
> **Statut** : brouillon d'exploitation du 28/10/2026 (épopée #4700, #4697 point 5).
>
> **Comment le lire.** Deux parties de nature différente :
>
> - **Partie 2 (côté BellumAI)** est décrite **depuis le code en main** : libellés, routes et scopes sont ceux du produit.
> - **Partie 1 (côté BoondManager)** : nous n'avons **jamais vu** la Marketplace de l'éditeur. Chaque geste que nous n'avons pas pu vérifier est dans un bloc **« À confirmer au premier passage réel »**, jamais rédigé comme un fait. Un contrat qu'on ne peut pas vérifier ne se devine pas.
>
> Source publique de l'éditeur : https://help.boondmanager.com/fr/articles/373727 (⚠️ non relue par nous au moment de l'écriture : la page ne s'est pas rendue depuis notre environnement).

## Avant de commencer

- Un compte BoondManager avec le profil **Administrateur** : c'est lui qui installe l'app.
- Un compte BellumAI, dans l'espace de travail à connecter.
- BellumAI lit votre BoondManager ; il peut y **écrire trois choses seulement** — créer une mission, corriger un TJM, changer le statut d'un besoin — et **uniquement après la validation d'un responsable**. Rien ne part tout seul.
- BellumAI ne demande **aucun secret collé** : il n'y a pas de champ « jeton » ou « clé d'API » à remplir. La connexion passe par l'écran de consentement de BoondManager (OAuth 2.0).

## Partie 1 — Côté BoondManager

### 1.1 Installer l'app (Administrateur)

L'installation est réservée à un utilisateur **Administrateur**. Un utilisateur sans ce profil ne peut pas installer l'app.

> **À confirmer au premier passage réel**
>
> - Le chemin exact dans l'interface pour trouver la Marketplace et l'app BellumAI (menu, intitulé, libellé du bouton d'installation).
> - Si l'installation se fait en une étape ou demande une confirmation supplémentaire.
> - Si l'installation d'un administrateur suffit pour **toute** l'instance, ou si elle est par entité.
>
> Source à relire : https://help.boondmanager.com/fr/articles/373727

### 1.2 Donner les droits aux utilisateurs (section Apps)

Une fois l'app installée, l'Administrateur choisit **qui peut s'en servir**, dans la section **Apps** des droits.

> **À confirmer au premier passage réel**
>
> - Le nom exact de la section et de la case à cocher dans la page des droits.
> - Si les droits s'accordent par profil, par utilisateur, ou les deux.
> - Si un utilisateur sans droit voit l'app grisée ou absente.
>
> Source à relire : https://help.boondmanager.com/fr/articles/373727

### 1.3 Le code d'installation (quand BoondManager n'est pas l'éditeur)

Quand l'app est publiée par un éditeur tiers (c'est le cas de BellumAI : BoondManager n'est pas l'éditeur), l'installation demande un **code d'installation**. BellumAI vous le communique ; il ne se publie nulle part.

> **À confirmer au premier passage réel**
>
> - À quelle étape le code est demandé, son format et sa durée de validité.
> - Qui le génère (l'éditeur, ou la Marketplace), et s'il est à usage unique.
> - Ce qui se passe quand il est faux ou expiré.
>
> Source à relire : https://help.boondmanager.com/fr/articles/373727

### 1.4 Liste blanche d'adresses IP (si votre instance en filtre)

Les appels de BellumAI vers BoondManager partent **tous** d'un seul service, l'API de BellumAI (`apps/api`) ; le moteur d'IA de BellumAI n'appelle jamais BoondManager. Ils sortent par **trois adresses IPv4 fixes** (haute disponibilité), activées le 28/10/2026 :

| Adresse IPv4     |
| ---------------- |
| `208.77.244.241` |
| `152.55.184.241` |
| `152.55.185.189` |

Déclarez les trois : une seule serait un point de défaillance unique, et les trois se déclarent aussi simplement qu'une.

**Deux réserves de l'hébergeur, que nous vous déclarons** (source : https://docs.railway.com/reference/static-outbound-ips) :

1. l'adresse IPv4 n'est **pas garantie dédiée** : elle peut être partagée avec d'autres clients de l'hébergeur ;
2. un **changement de région** change l'adresse.

BellumAI surveille l'adresse réellement observée et prévient son équipe d'exploitation si elle sort de cette liste.

> **À confirmer au premier passage réel** : si BoondManager exige ou non cette déclaration côté Marketplace, et où elle se saisit.

## Partie 2 — Côté BellumAI

### 2.1 Ouvrir l'écran Intégrations

Dans BellumAI : **Réglages › Intégrations** (adresse `/integrations`). Vous y trouvez la carte **« BoondManager (ATS / ERP) »**, avec un badge d'état.

> Si la carte indique « La connexion BoondManager n'est pas encore activée sur ce serveur. », le bouton de connexion n'est pas affiché : l'App n'est pas encore configurée côté BellumAI. Prévenez le support.

### 2.2 Le bouton de connexion

Cliquez sur **« Connecter mon BoondManager »** (le libellé devient **« Reconnecter mon BoondManager »** quand l'accès doit être renouvelé). Le bouton affiche **« Redirection vers BoondManager… »** pendant l'aller-retour. Vous êtes envoyé chez BoondManager ; il n'y a aucun secret à saisir dans BellumAI.

La connexion n'est **pas disponible dans l'espace de démonstration**.

### 2.3 Le consentement

BoondManager affiche son **écran de consentement** (le sien, pas celui de BellumAI) : vous y acceptez les accès demandés. Sous le capot : OAuth 2.0 « authorization code » avec PKCE (S256) ; le retour se fait sur l'API de BellumAI (`/ats/oauth/callback`) puis vous revenez sur `/integrations`. Le secret de vérification (`code_verifier`) reste côté serveur, chiffré ; les jetons sont chiffrés au repos et n'apparaissent jamais dans un journal ni dans une réponse.

- **Vous acceptez** → retour sur Intégrations, la carte passe à « Branché ».
- **Vous refusez** → « Tu as refusé l'accès chez BoondManager : rien n'a été branché. »
- **Autre échec** → « La connexion à BoondManager n'a pas abouti. Réessaie ; si cela se répète, préviens le support. »

> **À confirmer au premier passage réel** : l'aspect exact de l'écran de consentement de BoondManager et la façon dont il présente les scopes ci-dessous.

### 2.4 Les accès (scopes) demandés

BellumAI demande **le minimum, capacité par capacité** — onze scopes, lus dans `boond-scopes.ts` :

| Scope                 | Pour quoi faire                                  |
| --------------------- | ------------------------------------------------ |
| `companies:read`      | rattacher le compte à sa société dans votre ATS  |
| `contacts:read`       | lire les contacts déjà connus                    |
| `opportunities:read`  | lire les affaires ouvertes                       |
| `opportunities:write` | changer le statut d'un besoin — après validation |
| `positionings:read`   | lire les profils déjà proposés                   |
| `actions:read`        | lire l'historique et les relances                |
| `actions:write`       | écrire une relance — après validation            |
| `deliveries:read`     | lire les missions qui se terminent               |
| `deliveries:write`    | corriger un TJM — après validation               |
| `resources:read`      | lire les consultants sur le banc                 |
| `candidates:read`     | lire les entretiens                              |

**Aucun scope `admin:*`** n'est demandé : rien dans le produit n'en a besoin.

Les accès **accordés** sont ceux que BoondManager rend, jamais ceux qu'on suppose : la carte les affiche (« Accès accordés par BoondManager : … »). Si un scope n'a pas été accordé, la capacité correspondante est **absente** et un message nomme le scope manquant ; la solution est de **reconnecter** et d'accepter à nouveau.

### 2.5 Les trois états de la connexion

La carte affiche toujours un état nommé, jamais deviné :

| Badge             | Ce que cela veut dire                                                                                                                                              | Que faire                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Non branché**   | Aucune connexion pour cet espace.                                                                                                                                  | Cliquer sur « Connecter mon BoondManager ».               |
| **Branché**       | Connexion active. La carte donne la date du dernier échange réussi (ou « Aucun échange réussi enregistré pour l'instant »), l'instance et les accès accordés.      | Rien.                                                     |
| **À reconnecter** | BoondManager a refusé de renouveler l'accès : « Clique sur « Reconnecter » et accepte à nouveau la connexion : tant que ce n'est pas fait, BellumAI ne lit rien. » | Cliquer sur « Reconnecter mon BoondManager » et accepter. |

Deux états de transition peuvent aussi apparaître pour des connexions **antérieures** à la Marketplace : « Branché (mode jeton, à migrer) » (un jeton permanent, que BoondManager n'autorise plus pour les nouvelles connexions — se reconnecter le remplace par OAuth 2.0 et supprime le secret collé) et « Configuré côté serveur ».

Le bouton **« Déconnecter »** est proposé dès qu'une connexion existe : il révoque l'accès.

## Quand BoondManager répond « trop de requêtes » ou refuse l'adresse

- BellumAI respecte les limites de l'éditeur (réponse 429 et en-tête `Retry-After` suivis à la seconde, puis temporisation progressive) ; un échec d'écriture sans réponse n'est jamais rejoué : son état devient « inconnu ».
- Si **toutes** les requêtes d'un coup sont refusées pour tous vos utilisateurs, vérifiez d'abord que les trois adresses du § 1.4 sont bien déclarées chez vous, puis prévenez le support BellumAI.
