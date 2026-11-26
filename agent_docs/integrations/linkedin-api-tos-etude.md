# Étude — LinkedIn API & ToS : ce qu'on peut promettre (et ce qu'on ne peut pas)

> **Statut** : étude de cadrage (recherche web, sources officielles LinkedIn/CNIL en priorité).
> **Date** : 2026-07-16.
> **Contexte produit** : la roadmap veut permettre au commercial ESN d'« envoyer des demandes de connexion LinkedIn, enrichir des profils, programmer des séquences ». Cette étude conditionne ce qu'on a le droit de promettre.
> **Décision demandée par la roadmap** : _API officielle / outil partenaire / export manuel ?_
> **Réponse courte** : **aucune API officielle LinkedIn ne permet à Bellum d'envoyer des connexions ou des messages pour le compte d'un membre. Toute automatisation directe (côté serveur ou via extension) viole le User Agreement de LinkedIn et expose le compte du commercial à une restriction. On recommande la voie « préparation + export », pas l'automatisation.**

---

## 0. Résumé exécutif (pour décideurs)

| Question                                                                                           | Réponse                                                                                                                                                                                           | Confiance |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Existe-t-il une API officielle pour envoyer une **demande de connexion** au nom d'un membre ?      | **Non.** Aucune API LinkedIn publique/partenaire n'expose l'envoi d'invitations de connexion membre.                                                                                              | Élevée    |
| Existe-t-il une API officielle pour envoyer un **message 1-to-1 (InMail/DM)** au nom d'un membre ? | **Non** pour les DM membre. La messagerie API existe seulement pour les **Pages** (marque → audience) et est réservée à ~6 partenaires approuvés.                                                 | Élevée    |
| Peut-on **enrichir / récupérer les données d'un profil membre** via API officielle ?               | Très limité. Uniquement des données que le membre authentifié partage (Sign in with LinkedIn) ou, en tant que **partenaire SNAP approuvé**, du matching CRM. Pas de « scrape profil à la volée ». | Élevée    |
| L'automatisation via cookie de session / extension Chrome est-elle « safe » ?                      | **Non.** Interdite par le User Agreement §8.2 ; vagues de restrictions de comptes documentées en 2025-2026.                                                                                       | Élevée    |
| Risque RGPD sur l'enrichissement de données LinkedIn ?                                             | **Réel et déjà sanctionné** : CNIL a condamné **Kaspr à 240 000 €** (déc. 2024) pour collecte illicite sur LinkedIn.                                                                              | Élevée    |
| Recommandation Bellum                                                                              | **Option A (préparation messages + copier-coller + reminders)** en V1, **Option B (export CSV vers l'outil que le client a déjà)** en V1.5. Pas d'automatisation directe.                         | —         |

---

## 1. Les APIs officielles LinkedIn (2025-2026)

### 1.1 Cadre général d'accès

LinkedIn expose ses APIs via OAuth 2.0. La doc officielle est catégorique : **« Most permissions and partner programs require explicit approval from LinkedIn. Open Permissions are the only permissions that are available to all developers without special approval. »**
Source : [Getting Access to LinkedIn APIs — Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

Il y a donc **deux mondes** :

- **Open Permissions** (self-service, tout développeur) — très limitées.
- **Programmes partenaires** (Marketing, Sales/SNAP, Talent, Learning, Compliance) — sur candidature, revue manuelle, sélection discrétionnaire.

### 1.2 Open Permissions (self-service) — ce qui est réellement accessible sans partenariat

D'après la table officielle ([source](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)) :

| Produit                                | Permission        | Ce que ça permet                                              |
| -------------------------------------- | ----------------- | ------------------------------------------------------------- |
| Sign in with LinkedIn (OpenID Connect) | `profile`         | Nom, headline, photo du **membre authentifié** (lui-même).    |
| Sign in with LinkedIn (OpenID Connect) | `email`           | Email principal du membre authentifié.                        |
| Share on LinkedIn                      | `w_member_social` | Publier / commenter / liker **au nom du membre authentifié**. |

**Implication cas sales Bellum** : le self-service ne donne accès à **aucune donnée d'un prospect tiers**, **aucune messagerie 1-to-1**, **aucune demande de connexion**. `w_member_social` permet de _poster/commenter/liker au nom du membre connecté_, pas de prospecter des tiers.

### 1.3 Marketing Developer Platform (MDP / Marketing API)

- Orienté **publicité et gestion de campagnes**, pas prospection 1-to-1.
- Accès sur candidature MDP : « detailed use case, legal entity verification, review that can take weeks or months ». Deux tiers (Development / Standard) ; il faut construire et tester en Development avant d'obtenir Standard.
  Sources : [Marketing API Program Access Tiers — Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/marketing-tiers), [LinkedIn API 2026 guide — outx.ai](https://www.outx.ai/blog/linkedin-api-guide)
- Réservé de fait aux **entreprises B2B marketing établies** avec un use case validé. LinkedIn « reserves the right to review applications and select partners at its discretion ». Coût rapporté par des tiers : plusieurs milliers à dizaines de milliers €/an (non officiel, à traiter comme indicatif).
  Source : [getphyllo.com — LinkedIn API Access 2026](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)

**Implication Bellum** : ne couvre pas le besoin (connexion/messagerie prospect). Hors scope.

### 1.4 Sales Navigator Application Platform (SNAP) — le plus proche du besoin, mais fermé

SNAP est **le** programme « sales » de LinkedIn. Il expose 3 familles de services : **Display**, **Analytics**, **Sync (validation/matching CRM)**.
Source : [SNAP Overview — Sales Navigator Help](https://www.linkedin.com/help/sales-navigator/answer/a105094), [Sales-Integration SNAP Partners](https://business.linkedin.com/sell/sales-integrations/sales-partners)

Permissions SNAP (table officielle, [source](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)) :

| Permission               | Ce que ça permet                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `r_sales_nav_analytics`  | Récupération d'analytics Sales Navigator.                                           |
| `r_sales_nav_display`    | Embarquer des composants UI Sales Nav dans son produit.                             |
| `r_sales_nav_validation` | Endpoints de **validation de données CRM**.                                         |
| `r_sales_nav_profiles`   | Endpoints qui présentent **des infos de profil publiquement disponibles matchées**. |

Points critiques pour Bellum :

- **Tout est en lecture (`r_...`)** : matching/validation/affichage. **Aucune écriture** — ni envoi de connexion, ni envoi de message.
- Accès **sur candidature et revue de sécurité rigoureuse** (« rigorous application process », « code and security review »).
  Source : [Become a SNAP Partner](https://business.linkedin.com/sales-solutions/partners/become-a-partner)
- **⚠️ Fermé aux nouveaux partenaires** : « As of August 20, 2025, LinkedIn isn't accepting new SNAP partners. »
  Source : [SNAP Integrations and New Partners — LinkedIn Help](https://www.linkedin.com/help/sales-navigator/answer/a105096)

**Implication Bellum** : même en supposant l'effort de candidature, (1) le programme n'accepte pas de nouveaux entrants depuis août 2025, et (2) il ne permettrait de toute façon **pas** l'envoi de connexions/messages — seulement de l'enrichissement/matching CRM en lecture.

### 1.5 Pages Messaging API — messagerie de marque, pas de prospection

La **Pages Messaging API** permet à une **Page entreprise** d'envoyer/recevoir des messages (support client / audience), pas au commercial de DM un prospect. Réservée à ~6 partenaires initiaux (Bird CRM, Brandwatch, Hootsuite, Oktopost, Sprinklr, Zoho).
Sources : [Set up an API integration for LinkedIn Pages messaging — LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a6246714), [Social Media Today — Company Page Messaging](https://www.socialmediatoday.com/news/linkedins-rolling-company-page-messaging-brands/711413/)

**Implication Bellum** : hors scope (c'est de la messagerie Page→audience, pas commercial→prospect).

### 1.6 Talent / Learning / Compliance

- **Talent** (Recruiter System Connect, Apply Connect…) : recrutement, hors scope sales.
- **Learning** : contenu de formation, hors scope.
- **Compliance** (`r_compliance`, `w_compliance`) : **fermé** — « Access is closed and may not be requested. »
  Source : [Getting Access — Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

### 1.7 Conclusion section 1

> **Il n'existe, en 2025-2026, aucune API officielle LinkedIn permettant à un outil tiers d'envoyer une demande de connexion ou un message 1-to-1 au nom d'un membre.** Le plus proche (SNAP) est en lecture seule, réservé à des partenaires approuvés, et **fermé aux nouveaux entrants depuis le 20 août 2025**. La messagerie API existe seulement pour les Pages (marque). Donc : toute promesse d'« automatisation LinkedIn » chez Bellum reposerait nécessairement sur un moyen **non officiel** (cookie de session / extension), c.-à-d. une violation du User Agreement (section 2).

---

## 2. ToS / User Agreement / usages interdits + jurisprudence + RGPD

### 2.1 Ce que le User Agreement interdit (verbatim)

Extraits du **LinkedIn User Agreement, section 8.2 « Dos and Don'ts »** ([source](https://www.linkedin.com/legal/user-agreement)) :

- **§8.2(1)** — « Create a false identity on LinkedIn, misrepresent your identity, create a Member profile for anyone other than yourself (a real person), or **use or attempt to use another's account** (such as sharing log-in credentials or **copying cookies**). »
- **§8.2(2)** — « **Develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons or any other technology) to scrape or copy the Services**, including profiles and other data from the Services. »
- **§8.2(4)** — « Copy, use, display or distribute any information (including content) obtained from the Services… without the consent of the content owner. »
- **§8.2(13)** — « **Use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages**, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement. »

Ces clauses touchent **directement** les 3 promesses de la roadmap :

- « envoyer des demandes de connexion » → automatisation d'ajout de contacts = §8.2(13).
- « programmer des séquences » (messages) → send/redirect messages automatisés = §8.2(13).
- « enrichir des profils » (si scraping) → scrape/copy profiles = §8.2(2)+(4).
- Toute automatisation via **cookie `li_at`** (méthode des outils tiers, cf. §3) → « copying cookies » / « use another's account » = §8.2(1).

### 2.2 Politique « Prohibited software and extensions » (Help Center)

LinkedIn : « **We don't permit the use of any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website.** » Conséquence : les membres qui utilisent ces outils « **risk having their accounts restricted or shut down** », et les outils eux-mêmes « may become non-operational without notice ».
Source : [Prohibited software and extensions — LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1341387) ; voir aussi [Automated activity on LinkedIn — LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1340567)

### 2.3 Jurisprudence — hiQ Labs v. LinkedIn (à ne pas mal citer)

hiQ v. LinkedIn est souvent invoqué pour dire « scraper LinkedIn est légal ». **C'est une lecture dangereuse et incomplète.** L'affaire s'est terminée **en faveur de LinkedIn** :

- Déc. 2022 : **consent judgment + injonction permanente**. Jugement de **500 000 $ contre hiQ**, fondé sur (1) rupture de contrat (User Agreement), (2) violation du **CFAA** (accès via **faux comptes** à des pages protégées par mot de passe), (3) violation de la loi californienne d'accès non autorisé, (4) trespass to chattels / misappropriation, (5) sanctions pour destruction de preuves.
- L'injonction oblige hiQ à **cesser tout scraping** et **détruire** le code/les données issus des profils scrapés.
- Nov. 2022 : le tribunal a jugé que **les clauses d'un user agreement interdisant le scraping et les faux profils sont exécutoires** (breach of contract).
  Sources : [Proskauer — Settlement in Landmark Scraping Case](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/), [Morgan Lewis — LinkedIn v. hiQ](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2022/12/linkedin-v-hiq-landmark-data-scraping-suit-provides-guidance-to-data-scrapers-and-web-operators), [Wikipedia — hiQ Labs v. LinkedIn](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)

**Nuance à retenir** : la décision de la Cour d'appel du 9e circuit (2019/2022) portait sur le **CFAA appliqué à des données _publiques_** — elle n'a **pas** légalisé le scraping en général. Le volet contractuel a été tranché **contre** hiQ. Bref : scraper LinkedIn, même de la donnée publique, reste une **violation contractuelle** opposable, et l'usage de faux comptes tombe sous le CFAA. **Ce n'est pas un feu vert.**

### 2.4 Risque RGPD — déjà matérialisé (CNIL / Kaspr)

C'est le point le plus concret pour une boîte française qui vend à des ESN françaises.

- **CNIL, 5 décembre 2024 : Kaspr sanctionné à 240 000 €.**
  Kaspr exploite une extension Chrome payante qui extrait des coordonnées professionnelles depuis LinkedIn (base ~160 M de contacts).
  Manquements retenus :
  1. **Licéité (art. 6)** : collecte de coordonnées de personnes ayant **restreint la visibilité** (ex. « relations de 1er et 2e niveau uniquement ») — « **dépasse ce que les personnes pouvaient raisonnablement s'attendre** ».
  2. **Durée de conservation disproportionnée (art. 5.1.e)** : 5 ans, extension automatique.
  3. **Transparence (art. 12 & 14)** : information tardive (2022, 4 ans après), en anglais.
  4. **Droit d'accès (art. 15)** : réponses insuffisantes sur la source des données.
     Sources : [CNIL — Aspiration de données : 240 000 € contre Kaspr](https://www.cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr), [L'Informaticien — la CNIL condamne Kaspr](https://www.linformaticien.com/magazine/tendances/968-donnees-personnelles/62866-la-cnil-condamne-kaspr-pour-collecte-illicite-de-donnees-sur-linkedin.html)

- **Distinction fondamentale** (à graver côté produit) : **« outil conforme RGPD » ≠ « votre traitement est licite ».** Un outil peut se dire conforme ; c'est le **responsable de traitement** (donc l'ESN cliente, et Bellum si elle fournit la donnée) qui répond de la licéité, de l'info des personnes (mention de source), de la base légale (intérêt légitime + balance), des durées, des droits.
  Source : [Eco-conscient TMT — Le mirage du « 100% conforme RGPD »](https://www.eco-conscient.com/art-89269-le-mirage-du-100-conforme-rgpd-pourquoi-vos-outils-de-growth-vous-mettent-en-danger.html)

### 2.5 Conclusion section 2

> Automatiser des actions LinkedIn (connexions, messages) ou scraper des profils **viole le User Agreement §8.2**, expose **le compte du commercial** (pas seulement Bellum) à la **restriction/fermeture**, s'appuie sur un socle juridique fragile (**hiQ a _perdu_** sur le terrain contractuel + CFAA), et crée un **risque RGPD documenté** (**Kaspr, 240 k€**). Pour un produit vendu à des ESN françaises, c'est un risque réputationnel et juridique disproportionné par rapport au gain.

---

## 3. Panorama des outils tiers

**Deux modèles techniques** structurent tout le marché :

1. **« Cookie session » / extension** (la grande majorité pour la partie _actions_ LinkedIn) : l'outil pilote la session LinkedIn du membre (extension Chrome locale, ou cookie `li_at` réinjecté côté cloud). C'est ce qui permet d'envoyer connexions/messages « comme si » c'était l'utilisateur. **→ Techniquement puissant, mais = §8.2 violé, risque de restriction sur le compte de l'utilisateur.**
2. **Enrichissement de données** (emails/téléphones B2B) : bases pré-scrapées (Apollo, Lusha, Kaspr, Cognism…) **ou** génération algorithmique sans stockage (Dropcontact). **→ Risque RGPD porté par le responsable de traitement ; modèles très inégaux.**

| Outil                                 | Modèle                                                                       | Ce qu'il fait                             | Statut conformité / risque                                                                                                                                                                    | Pertinence intégration Bellum                                               |
| ------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Waalaxy**                           | Extension Chrome + app desktop (session locale, IP réelle du user)           | Connexions + séquences LinkedIn           | **Risque de ban** sur le compte user (actions exécutées depuis le navigateur du user). Limites LinkedIn resserrées (~100 connexions/**semaine**).                                             | **Ne pas intégrer.** Éventuellement _recommander_ au client (Option B).     |
| **La Growth Machine (LGM)**           | Cloud multicanal (LinkedIn + email + X), sync CRM native                     | Séquences multicanal                      | Même risque structurel côté LinkedIn (automatisation d'actions membre). Entité EU.                                                                                                            | **Ne pas intégrer.** Recommandable en Option B.                             |
| **Lemlist**                           | Email-first + extension LinkedIn                                             | Cold outreach, LinkedIn en complément     | Présenté comme risque _moindre_ car email-first + extension (pas session cloud). Le risque LinkedIn subsiste dès qu'on automatise des actions.                                                | **Ne pas intégrer** la partie LinkedIn ; complémentaire email.              |
| **Kaspr**                             | Extension + base ~160 M contacts                                             | Enrichissement (emails/tél)               | **Sanctionné CNIL 240 k€ (déc. 2024).** À éviter comme dépendance.                                                                                                                            | **Ne pas intégrer.**                                                        |
| **Apollo**                            | Base US pré-scrapée                                                          | Enrichissement + séquences                | Se dit « GDPR compliant » mais base pré-scrapée ; la CNIL continue de sanctionner ce modèle. Risque RGPD porté par le client.                                                                 | Prudence. Pas de dépendance structurante.                                   |
| **Clay**                              | Orchestrateur d'enrichissement (agrège d'autres sources/waterfalls)          | Enrichissement multi-sources + séquençage | Hérite du risque des sources sous-jacentes (dont scraping/bases).                                                                                                                             | Pas de dépendance structurante.                                             |
| **Dropcontact**                       | **Algorithmique, sans base stockée** (génère/vérifie en temps réel via SMTP) | Enrichissement email B2B                  | Positionné comme le plus aligné CNIL (pas de base de données personnelle stockée). **Reste à valider par nos soins.**                                                                         | **Candidat privilégié** pour un enrichissement _email_ conforme, si besoin. |
| **Unipile** (couche « API LinkedIn ») | **Cookie `li_at` non officiel** (convertit le login en token chiffré)        | Messagerie + invitations via API          | **Explicitement non officiel** : « LinkedIn could restrict or suspend accounts that use it. » Limites ~80-100 actions/jour. Le risque de restriction reste porté par le **compte du client**. | **Ne pas s'appuyer dessus** pour promettre de l'automatisation « safe ».    |

Sources : [connectsafely — LinkedIn automation ToS 2026](https://connectsafely.ai/articles/is-linkedin-automation-safe-tos-scraping-guide-2026), [northlight.ai — HeyReach ban wave](https://northlight.ai/blog/is-linkedin-automation-against-the-rules), [linkedintools.site — Is Waalaxy safe](https://linkedintools.site/is-waalaxy-safe/), [Dropcontact — enrichissement RGPD](https://growth-hacker.fr/dropcontact/) / [Salesdorado — avis Dropcontact](https://salesdorado.com/automatisation/avis-dropcontact/), [Unipile — Getting Started (li_at cookie)](https://developer.unipile.com/docs/linkedin), [Omentir — Unipile safe LinkedIn API](https://omentir.com/blogs/unipile-safe-linkedin-api).

**Constat transversal** : tous les outils qui _envoient_ des connexions/messages LinkedIn reposent sur le contournement cookie/extension → risque sur le compte **de l'utilisateur final**. Aucun ne s'appuie sur une API officielle « membre » — parce qu'elle n'existe pas (section 1). Intégrer l'un d'eux **transfère ce risque à Bellum** (dépendance, image, support des bans). **Recommander** un outil que le client choisit lui-même **laisse le risque et le choix chez le client**, sans que Bellum ne le porte.

---

## 4. Options pour Bellum — matrice risque / valeur / effort

| Option                                                        | Description                                                                                                                                                                                        | Risque (ToS / RGPD / compte)                                                                                                                          | Valeur commerciale                                                                               | Effort                                                                            | Verdict                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A. Préparation + copier-coller + reminders**                | Bellum génère le message de connexion / le DM personnalisé, un bouton « copier », un rappel de relance (J+3/J+7), un suivi du statut saisi manuellement. **Zéro action automatique sur LinkedIn.** | **Nul.** Aucune interaction programmatique avec LinkedIn.                                                                                             | Élevée : c'est 80 % de la valeur perçue (le message pertinent + le rappel), sans le risque.      | **Faible** (déjà proche de l'existant : messages prêts à envoyer, plan d'action). | ✅ **V1 — à faire**                                                                                                 |
| **B. Export CSV → outil tiers choisi par le client**          | Export propre (contacts + message préparé + colonnes attendues par Waalaxy/LGM/Lemlist). Le client branche son propre outil, sous **son** compte et **sa** responsabilité.                         | **Faible pour Bellum** (on n'exécute rien ; on informe). Le risque ToS/RGPD reste chez le client, qui l'assume déjà. Mention RGPD à afficher.         | Élevée : couvre les clients qui _veulent_ automatiser, sans que Bellum ne porte le risque.       | **Faible-moyen** (format d'export + doc de mapping).                              | ✅ **V1.5 — à faire**                                                                                               |
| **C. Partenariat officiel LinkedIn (SNAP / MDP)**             | Devenir partenaire approuvé pour de l'enrichissement/matching en lecture.                                                                                                                          | Faible (dans le cadre), mais **SNAP fermé aux nouveaux depuis 20/08/2025** ; ne donne **pas** l'écriture (connexion/message).                         | Moyenne (enrichissement/validation CRM), **pas** l'automatisation voulue.                        | **Très élevé** (candidature, revue sécurité, mois de délai, incertain, coûteux).  | ⏸️ **Veille** — rouvrir si LinkedIn réaccepte + si un besoin lecture le justifie. Ne rien promettre sur cette base. |
| **D. Automatisation directe (cookie/extension/API non off.)** | Bellum envoie connexions/messages au nom du user via cookie `li_at` ou extension.                                                                                                                  | **Élevé** : viole §8.2 (bots/scrape/copie de cookie), **restriction du compte du client**, socle juridique perdant (hiQ), risque RGPD (Kaspr 240 k€). | Élevée en apparence, **destructrice** en réalité (churn dès le premier compte restreint, image). | Moyen technique, **rédhibitoire** en risque.                                      | ❌ **À ne pas faire**                                                                                               |

### Pourquoi D est déconseillée (résumé argumenté)

1. **Contrat** : viole explicitement User Agreement §8.2(1)(2)(13).
2. **Sanction plateforme** : le compte **du commercial client** (son outil de travail n°1) peut être **restreint ou fermé** — churn immédiat + bad buzz.
3. **Juridique** : hiQ a **perdu** sur le contrat + CFAA ; pas de jurisprudence protectrice, au contraire.
4. **RGPD** : la CNIL **sanctionne déjà** ce modèle (Kaspr 240 k€) ; Bellum deviendrait co-responsable d'un traitement fragile.
5. **Dépendance technique** : les vagues de bans 2025-2026 cassent régulièrement ces outils (« may become non-operational without notice ») → dette de support permanente.

---

## 5. Recommandation finale + wording produit/marketing

### 5.1 Recommandation

**Séquencer A puis B ; ne pas faire D ; garder C en veille passive.**

- **V1 (maintenant)** — **Option A** : Bellum est le **copilote de préparation**. On génère le bon message de connexion et le bon DM, on affiche un bouton _Copier_, on ouvre le profil LinkedIn dans un onglet (lien simple, pas d'injection), on pose des **reminders de relance** et un **suivi de statut manuel** (« Invitation envoyée / Accepté / Relancé »). C'est cohérent avec l'existant (« messages prêts à envoyer », plan d'action) et **zéro risque**.
- **V1.5** — **Option B** : **export CSV** propre vers l'outil que le client utilise déjà (Waalaxy / LGM / Lemlist / son CRM). Bellum prépare, le client exécute chez lui, sous sa responsabilité.
- **Enrichissement de données** : si un enrichissement email devient nécessaire, **évaluer Dropcontact en priorité** (modèle algorithmique sans base stockée), **jamais** intégrer Kaspr/bases pré-scrapées comme dépendance structurante ; toujours afficher la **mention de source** RGPD côté client.
- **Ne jamais** promettre publiquement d'« automatisation LinkedIn », de « connexions automatiques » ou de « messages envoyés automatiquement ». Ne pas construire D.

### 5.2 Wording exact — ce qu'on PEUT dire (produit & marketing)

✅ **À utiliser** :

- « **Préparez** vos messages de connexion et vos relances LinkedIn en un clic. »
- « Bellum **rédige le message parfait** pour chaque contact — vous **copiez-collez** et envoyez depuis votre compte. »
- « **Rappels de relance** automatiques : Bellum vous dit qui relancer et quand. »
- « **Exportez** vos contacts et vos messages vers votre outil d'outreach (Waalaxy, La Growth Machine, votre CRM). »
- « Bellum **ne prend jamais la main sur votre compte LinkedIn** : vous gardez le contrôle, LinkedIn reste content. » _(argument de confiance)_

⛔ **À bannir** (promesses illégales / trompeuses) :

- ❌ « Envoi **automatique** de demandes de connexion »
- ❌ « **Séquences LinkedIn automatisées** » / « messages envoyés automatiquement »
- ❌ « **Scraping** de profils » / « on récupère tous les profils LinkedIn »
- ❌ « **Connexion à votre compte LinkedIn** » sous-entendant du pilotage automatisé
- ❌ « **100 % conforme RGPD** » présenté comme une garantie absolue (la licéité dépend du traitement du client)

### 5.3 Micro-copy de garde-fou (à afficher sur les features export)

> « Bellum prépare vos messages et vos listes. L'envoi se fait depuis **votre** outil et **votre** compte : vous restez responsable du respect des conditions de LinkedIn et du RGPD (information des personnes, base légale, durées). Bellum n'automatise **aucune** action sur LinkedIn. »

---

## 6. Limites de cette étude

- Sources ToS/API primaires = LinkedIn (User Agreement, Help Center) et Microsoft Learn (doc dev officielle) ; RGPD = CNIL. Les **coûts** des programmes partenaires et certains détails opérationnels proviennent de **sources tierces** (blogs spécialisés) et sont signalés comme **indicatifs**, non officiels.
- L'état d'ouverture de SNAP (« fermé aux nouveaux depuis 20/08/2025 ») est susceptible d'évoluer — **à re-vérifier** avant toute décision de partenariat (Option C).
- Rien ici ne constitue un avis juridique. Avant toute feature touchant des données personnelles LinkedIn en prod, faire valider par un conseil RGPD.

## 7. Index des sources

**LinkedIn (officiel)**

- User Agreement (Dos and Don'ts §8.2) — https://www.linkedin.com/legal/user-agreement
- Getting Access to LinkedIn APIs — https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- Marketing API Program Access Tiers — https://learn.microsoft.com/en-us/linkedin/marketing/integrations/marketing-tiers
- SNAP Overview — https://www.linkedin.com/help/sales-navigator/answer/a105094
- SNAP Integrations and New Partners (fermé depuis 20/08/2025) — https://www.linkedin.com/help/sales-navigator/answer/a105096
- Become a SNAP Partner — https://business.linkedin.com/sales-solutions/partners/become-a-partner
- Sales-Integration SNAP Partners — https://business.linkedin.com/sell/sales-integrations/sales-partners
- Pages Messaging API setup — https://www.linkedin.com/help/linkedin/answer/a6246714
- Prohibited software and extensions — https://www.linkedin.com/help/linkedin/answer/a1341387
- Automated activity on LinkedIn — https://www.linkedin.com/help/linkedin/answer/a1340567

**Jurisprudence hiQ v. LinkedIn**

- Proskauer — Settlement (déc. 2022) — https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/
- Morgan Lewis — LinkedIn v. hiQ — https://www.morganlewis.com/blogs/sourcingatmorganlewis/2022/12/linkedin-v-hiq-landmark-data-scraping-suit-provides-guidance-to-data-scrapers-and-web-operators
- Wikipedia — hiQ Labs v. LinkedIn — https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn

**RGPD / CNIL**

- CNIL — Kaspr 240 000 € (déc. 2024) — https://www.cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr
- L'Informaticien — condamnation Kaspr — https://www.linformaticien.com/magazine/tendances/968-donnees-personnelles/62866-la-cnil-condamne-kaspr-pour-collecte-illicite-de-donnees-sur-linkedin.html
- Eco-conscient TMT — mirage du « 100 % conforme RGPD » — https://www.eco-conscient.com/art-89269-le-mirage-du-100-conforme-rgpd-pourquoi-vos-outils-de-growth-vous-mettent-en-danger.html

**Outils tiers (indicatif)**

- connectsafely — LinkedIn automation ToS 2026 — https://connectsafely.ai/articles/is-linkedin-automation-safe-tos-scraping-guide-2026
- northlight.ai — HeyReach ban wave 2026 — https://northlight.ai/blog/is-linkedin-automation-against-the-rules
- linkedintools.site — Is Waalaxy safe — https://linkedintools.site/is-waalaxy-safe/
- Dropcontact (RGPD) — https://growth-hacker.fr/dropcontact/ · https://salesdorado.com/automatisation/avis-dropcontact/
- Unipile — Getting Started (li_at cookie, non officiel) — https://developer.unipile.com/docs/linkedin
- Omentir — Unipile safe LinkedIn API — https://omentir.com/blogs/unipile-safe-linkedin-api
