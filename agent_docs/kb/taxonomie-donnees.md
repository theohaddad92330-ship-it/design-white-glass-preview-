# Taxonomie des données & invariants métier — BellumAI

> Source : note d'onboarding métier "BESOINS MÉTIERS USERS — BELLUMAI" (rédigée par un profil
> commercial, non technique). Ce fichier en distille la **substance métier** : taxonomie des
> données, couches d'interprétation, invariants de vente, et sorties attendues pour le commercial.
> Méthodologie uniquement — aucune donnée personnelle ni contact réel n'est recopié.

---

## 0. Boussole produit (à garder en tête)

> **Bellum doit produire une décision commerciale, pas seulement afficher de la donnée.**

BellumAI n'est ni un scraper d'entreprises ni un chatbot générique. C'est un **système de vente**
qui transforme des données (publiques, enrichies, internes/CRM, terrain) en **lecture de compte
exécutable** : quel compte attaquer, quel périmètre viser, quels signaux prouvent qu'il se passe
quelque chose, qui contacter, quoi proposer, comment ouvrir les achats, quoi faire cette semaine.

Le produit doit être **transversal** (pas enfermé dans le vocabulaire « IT / data / cyber ») :
il doit raisonner sur des périmètres métiers/fonctionnels (produit, design, PMO, agilité, finance,
supply chain, industrie, RH, conformité, ERP, CRM, énergie, opérations…) puis se spécialiser via le
contexte utilisateur, les sources internes et la méthodologie métier.

---

## 1. Les 4 couches d'interprétation (taxonomie fait / signal / hypothèse / action)

C'est l'invariant central. **Toute donnée affichée doit porter sa couche d'interprétation et son
niveau de confiance.** Le front comme les prompts doivent distinguer explicitement :

| Couche                      | Définition métier                                                                                                                                              | Niveau de confiance                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Fait**                    | Donnée sûre, sourcée, vérifiable (identité légale, poste, site, presse publique).                                                                              | Élevé, sourcé.                         |
| **Signal**                  | Indice récent ou structurant qui suggère qu'il se passe quelque chose (offre d'emploi, news, recrutement de dirigeant, réorg). N'est pas une preuve de projet. | Moyen, à interpréter.                  |
| **Hypothèse**               | Déduction probable mais non prouvée (nom probable d'un projet interne, owner pressenti, budget probable, vendor supposé).                                      | Faible / à valider.                    |
| **Action (recommandation)** | Sortie générée : message, pitch, next step, ordre d'activation des contacts, angle d'entrée. Doit être cohérente avec la méthode métier.                       | N/A — c'est une suggestion exécutable. |

Sur les projets/sujets, la note impose un **statut de preuve explicite** : `hypothèse / probable / validé`.

> Le profil utilisateur (onboarding) influence la **priorisation, les messages, l'angle
> concurrentiel, le lexique du compte et le plan d'action** — **PAS** la résolution brute des faits.

---

## 2. Invariants métier à préserver

Comment pense un commercial — et ce que Bellum doit respecter (ne jamais violer ces règles) :

- **Un compte n'est pas une liste infinie de pistes : c'est un champ de bataille à travailler avec méthode.**
- **Un périmètre clair vaut mieux qu'un groupe mal compris.** (Choisir un périmètre attaquable plutôt que viser l'organisation entière.)
- **Quelques angles commerciaux priorisés valent mieux qu'une dizaine de projets mal suivis.** (Shortlist, pas liste exhaustive.)
- **Le multi-threading est obligatoire :** utilisateurs, décideurs, politique, achats — plusieurs threads humains en parallèle.
- **L'historique CRM, les missions passées, les recommandations et la prospection inversée sont une matière première précieuse.**
- **Un bon plan de compte doit déboucher sur des next steps datés, pas sur un simple diagnostic.**
- **Lancer les achats tôt** (procurement/référencement) fait partie de la méthode.
- Logique d'entrée : commencer avec une info **suffisante mais incomplète**, lancer la prospection, corriger les hypothèses en faisant, puis élargir. Le commercial n'a pas besoin d'un miroir du web, mais d'une base exploitable.

---

## 3. Ce qu'un commercial doit pouvoir FAIRE avec Bellum

- Qualifier vite un compte et éviter de perdre du temps sur un mauvais compte.
- Choisir un périmètre attaquable au lieu de viser une organisation entière.
- Comprendre ce qui relève du fait, du signal, de l'hypothèse ou de l'action suggérée.
- Repérer quelques sujets commerciaux priorisés au lieu d'une liste de pistes trop large.
- Identifier les bonnes personnes, leur rôle, leur influence et **l'ordre dans lequel les activer**.
- Préparer messages, pitchs, next steps et thread achats avec la bonne couche d'expertise métier.
- Capitaliser sur l'historique CRM, les missions existantes, les notes terrain et les documents internes.

## 3 bis. Ce que Bellum doit PRODUIRE en sortie (livrables commerciaux)

1. Une **fiche identité compte** propre et sourcée.
2. Une **cartographie des entités / BU / directions / équipes / périmètres**.
3. Une **vue des signaux** récents ou structurants.
4. Une **shortlist de contacts** qualifiés et hiérarchisés.
5. Une **lecture des concurrents, vendors, achats, risques et blocages**.
6. **Quelques sujets commerciaux priorisés** (et non une longue liste).
7. Des **messages, scripts, pitchs, recommandations et prochaines actions** cohérents avec la méthode métier.

À cela s'ajoutent (effets sur le front) : un **score explicable** avec rapport de confiance, et un
**organigramme + prochaine action explicables**.

---

## 4. Taxonomie exhaustive des données à gérer

> Logique : partir des **catégories de données qu'un commercial doit avoir sous la main pour
> décider et agir**, pas des APIs disponibles. Toutes ne sont pas automatisables — certaines seront
> publiques, d'autres enrichies, d'autres importées du CRM, d'autres saisies/validées humainement.

### 4.1 Identité du compte

Nom exact, alias, marques, raison sociale, logo, domaines, siège, SIREN/SIRET ; secteur principal,
sous-secteurs, taille, CA public, pays et sites clés ; groupe / maison mère / filiales / structure.

### 4.2 Périmètres / entités / équipes / BU

Nom du périmètre (BU, direction, tribu, domaine, squad, factory, site, département, ou terme propre
au groupe) ; rôle du périmètre dans l'entreprise, taille, localisation, owner probable,
accessibilité, vendors visibles, signaux visibles ; priorité commerciale et angle d'entrée recommandé.

### 4.3 Contexte business et transformation

Priorités publiques, risques business, enjeux marché, contraintes sectorielles, roadmap de
transformation, industrialisation, réduction des coûts, conformité, expansion, réorganisation ;
initiatives métier/opérations transverses (finance, supply chain, produit, design, marketing, RH,
énergie, industrie…).

### 4.4 Signaux et opportunités

Offres d'emploi (compétences demandées, séniorité, localisation, métiers) ; actualités, presse,
conférences, interviews, partenariats, projets publics, technos visibles ; appels d'offres /
consultations visibles ; incidents, risques, changements d'organisation, recrutements de dirigeants,
changements d'équipes.

### 4.5 Projets / besoins / sujets commerciaux priorisés

Nom probable du projet/programme ; direction porteuse, métiers impliqués, stack/expertise probable ;
urgence, accessibilité, budget probable, owner pressenti, risque achats ; **preuve/source et statut :
`hypothèse / probable / validé`**.

### 4.6 Contacts et organigramme

Poste exact, entité, localisation, profil social, email, téléphone, photo si possible ; niveau
hiérarchique, rôle dans la décision, sujet d'intérêt, priorité, historique, prochaine action ; lien
au périmètre, à un sujet priorisé, à un risque ou à un signal.
_(Champs personnels listés comme structure de données, non instanciés ici.)_

### 4.7 Vendors, achats, référencement, sécurité, juridique

Vendors visibles, concurrents, intégrateurs ou freelances en place ; responsables
achats/procurement/vendor management/juridique/sécurité ; portail panel, documents requis,
certifications, politique sécurité, process d'onboarding, MSA, grilles de profils, contraintes
contractuelles si connues.

### 4.8 Historique interne, CRM / terrain

Historique CRM (mails, appels, RDV, propositions, profils envoyés, résultats) ; motifs de non,
objections, points de friction, timing, notes terrain, verbatims, alumni, consultants en mission,
partenaires, recommandations, reverse prospecting.

### 4.9 Contexte utilisateur / workspace

Offres et profils vendus ; secteurs ou territoires visés ; références et preuves ; freins,
exclusions, style de prospection, langage, objectifs et pricing.

---

## 5. Faisabilité réelle des données — matrice oui / partiel / non

> Distinction clé : **capacités théoriques d'une API ≠ ce qu'on récupère réellement** avec les
> outils branchés et les paramètres réellement utilisés.

| Source / famille                    | Oui, plutôt fort                                                            | Partiel / à vérifier                                                         | Non ou pas fiable seul                                               |
| ----------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Pappers**                         | Identité légale, structure, dirigeants, SIREN, sièges, filiales visibles    | Groupe vs filiale vraiment attaquable ; chiffres utilisables commercialement | Owner métier, budget précis, organigramme politique, vendors, achats |
| **Firecrawl**                       | Pages site, offres, presse, docs publics, pages métier, certains signaux    | Pages très dynamiques, structures profondes, couverture hétérogène           | Emails / mobiles privés, validation terrain, politique réelle        |
| **Brave / web search**              | Presse, annonces, interviews, événements, appels d'offres visibles          | Projet précis, budget, owner si peu public                                   | Structure interne complète, process achats détaillé                  |
| **Apollo / enrichissement contact** | Nom, poste, entreprise, parfois email / téléphone / profil social           | BU exacte, fraîcheur, rôle réel dans la décision                             | Budget, pouvoir politique, achats, vrais projets                     |
| **CRM / notes / docs internes**     | Historique, verbatims, vrais signaux, points de friction, personnes connues | Qualité variable si l'utilisateur remplit mal                                | Rien si aucune donnée n'est importée ou saisie                       |

### 5.1 Champs difficiles / impossibles à garantir automatiquement

Ne jamais les **promettre comme automatiques** ; leur prévoir une place (CRM / RAG / réseaux perso /
notes terrain / enrichissement manuel) plutôt que prétendre les générer à coup sûr :

- Budget exact d'un périmètre ou d'une BU.
- Nom exact d'un projet interne non public.
- Nom certain du vendor en place par sujet.
- Nom exact de la plateforme achats / process achat détaillé si non public.
- Grilles de TJM ou conditions marché fermes.
- Date de fin exacte d'un contrat fournisseur.
- Photo de profil / logo pour tous les contacts et sociétés sans source enrichie adaptée.
- Téléphone mobile pour tous les contacts.
- Organigramme politique complet sans intervention humaine.

### 5.2 Outils complémentaires à challenger (pas à brancher d'office)

SalesQL ou équivalents (contacts enrichis : email/mobile/social) ; Salesforce et connecteurs CRM
self-service (import/sync) ; outils moins chers/plus robustes pour réduire la dépendance aux sources
principales ; outils logos / résolution de domaines. **Règle :** l'existence d'un outil ne justifie
pas son branchement — challenger coût, fiabilité, couverture, intérêt V1, insertion propre dans
l'archi.

---

## 6. Familles de prompts à prévoir (côté IA)

> La liste n'est pas figée : elle dépend du front final et des objets backend conservés. Chaque
> brique doit avoir un **contrat de sortie stable**. La **méthodologie métier (SalesConnect) doit
> nourrir les sorties dès la V1**, sans attendre un RAG complet.

- Résolution entreprise / entité / périmètre.
- Synthèse compte.
- Priorisation des entités, sujets et périmètres.
- Lecture business des signaux.
- Classification contact / rôle / accessibilité.
- Synthèse vendors / achats / risques.
- Scoring et rapport de confiance.
- Messages et pitchs contextualisés.
- Plan d'action / prochaines étapes.
- Copilote contextuel (compte / contact / conversation).

---

## 7. Garde-fous transversaux

- Le front doit **distinguer** fait, signal, hypothèse, recommandation, action — et afficher le niveau de confiance.
- Les maquettes V2 sont une **cible à challenger** contre la réalité data, pas une promesse ferme : certains blocs doivent peut-être disparaître/fusionner si la donnée n'est pas soutenable.
- Prévoir un **mode dégradé** : une source critique (ex. Firecrawl) ne doit pas fragiliser tout le système.
- Prévoir **provenance, fraîcheur et confiance par donnée** ; observabilité + coût par run dès tôt.
- Backend applicatif = owner (auth, base, persistance, crédits, jobs, contrats). Couche IA = moteur de calcul/enrichissement/interprétation/génération, **pas** owner du produit.
- Mémoire / RAG / cache / multi-provider = **couches progressives**, pas le point de départ.
