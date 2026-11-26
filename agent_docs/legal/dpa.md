# Accord de traitement des données (DPA) — modèle BellumAI

> **Statut : MODÈLE.** Document à faire relire par un conseil juridique avant
> signature. Il matérialise la promesse de la landing (« nous fournissons un
> DPA ») ; il n'a pas valeur d'avis juridique. Version 1.0 — 2026-07-16.

Ce Data Processing Agreement (DPA) encadre le traitement de données à caractère
personnel effectué par **BellumAI** (le « Sous-traitant ») pour le compte de son
**Client** (le « Responsable de traitement »), au sens du Règlement (UE)
2016/679 (RGPD). Il complète les Conditions Générales de Service (CGS) et prévaut
en cas de contradiction sur les questions de protection des données.

---

## 1. Définitions

Les termes « données à caractère personnel », « traitement », « responsable de
traitement », « sous-traitant », « personne concernée », « violation de données »
et « autorité de contrôle » ont le sens que leur donne l'article 4 du RGPD.

- **Sous-traitant ultérieur** : tout prestataire tiers auquel BellumAI confie une
  partie du traitement (voir Annexe 2).
- **Données Client** : les données à caractère personnel traitées par BellumAI
  pour le compte du Client dans le cadre du Service.

## 2. Objet, durée, nature et finalité

- **Objet** : la fourniture du Service BellumAI — copilote d'intelligence
  commerciale pour ESN (recherche d'entreprises cibles, identification de
  contacts décideurs, plan d'action, messages).
- **Durée** : la durée du contrat de Service, jusqu'à suppression/restitution des
  Données Client (art. 10).
- **Nature** : collecte, structuration, enrichissement, stockage, analyse par IA,
  restitution et export de données ; envoi d'e-mails à l'initiative du Client.
- **Finalité** : permettre au Client de mener sa prospection commerciale B2B.

## 3. Catégories de personnes concernées et de données

**Personnes concernées**

- Utilisateurs du Client (commerciaux, managers de l'ESN).
- Contacts prospects B2B identifiés lors des analyses (décideurs des entreprises
  ciblées).

**Catégories de données**

| Catégorie            | Exemples                                                       | Origine                            |
| -------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Identité utilisateur | e-mail, prénom, nom, avatar                                    | Fournie par le Client              |
| Authentification     | jeton de session, appareils (IP, user-agent), 2FA              | Générée par le Service             |
| Données prospect B2B | nom, fonction, e-mail pro, téléphone pro, LinkedIn, entreprise | Sources publiques + enrichissement |
| Données d'usage      | actions commerciales, crédits consommés                        | Générée par le Service             |
| Facturation          | plan, identifiants Stripe (client/abonnement), factures        | Stripe                             |
| Documents            | contenus déposés dans « Mes documents » (RAG)                  | Fournis par le Client              |

> **Aucune donnée sensible** (art. 9 RGPD) n'est requise ni sollicitée par le
> Service. Le Client s'engage à ne pas en injecter (ex. dans les documents RAG ou
> les notes).

## 4. Obligations et instructions du Responsable de traitement

- Le Client est responsable de la licéité de la collecte (base légale : intérêt
  légitime de prospection B2B, art. 6-1-f RGPD) et de l'information des personnes.
- BellumAI ne traite les Données Client que sur **instruction documentée** du
  Client. Le Service lui-même, ses réglages et ce DPA constituent ces
  instructions. Toute instruction complémentaire se fait par écrit.

## 5. Obligations du Sous-traitant

BellumAI s'engage à :

1. **Ne traiter** les Données Client que pour fournir le Service (pas de
   réutilisation à des fins propres ; **les données Client ne sont pas utilisées
   pour entraîner de modèles**).
2. **Confidentialité** : n'autoriser l'accès qu'aux personnes habilitées et
   tenues à la confidentialité.
3. **Sécurité (art. 32)** : mettre en œuvre des mesures techniques et
   organisationnelles appropriées (Annexe 3 + `agent_docs/security.md`).
4. **Assistance (art. 28-3-e/f)** : aider le Client à répondre aux demandes des
   personnes et à ses obligations de sécurité, de notification de violation et
   d'AIPD.
5. **Sous-traitance** : n'engager de sous-traitant ultérieur que dans les
   conditions de l'art. 6.
6. **Suppression/restitution** en fin de contrat (art. 10).
7. **Registre & audits** : tenir un registre des traitements et se soumettre aux
   audits prévus à l'art. 11.

## 6. Sous-traitants ultérieurs

Le Client autorise BellumAI à recourir aux sous-traitants listés en **Annexe 2**.
BellumAI informe le Client de tout ajout ou remplacement **au moins 30 jours** à
l'avance ; le Client peut s'y opposer pour un motif raisonnable lié à la
protection des données. BellumAI impose contractuellement à chaque
sous-traitant des obligations équivalentes à celles du présent DPA.

## 7. Droits des personnes concernées

Le Service fournit des mécanismes self-serve qui aident le Client à honorer les
droits d'accès (art. 15), de portabilité (art. 20) et d'effacement (art. 17) :

- **Export** : `GET /privacy/export` → copie JSON complète des données de
  l'utilisateur (écran Réglages › Sécurité › « Exporter mes données »).
- **Effacement** : `POST /privacy/delete-account` → anonymisation du compte,
  révocation des sessions, annulation de l'abonnement (écran « Supprimer mon
  compte »). Voir `agent_docs/legal/privacy-retention-policy.md` pour la
  ventilation supprimé / anonymisé / conservé.

Pour les demandes des **prospects** (personnes concernées non-utilisatrices),
BellumAI relaie au Client, qui reste responsable de la réponse ; l'anonymisation
du compte scrube les contacts prospects associés.

## 8. Violation de données à caractère personnel

BellumAI notifie le Client **sans retard injustifié et au plus tard 72 heures**
après avoir eu connaissance d'une violation affectant les Données Client, avec
les informations de l'art. 33-3 (nature, catégories/volumes approximatifs,
conséquences probables, mesures prises). Le monitoring d'erreurs (Sentry) et les
journaux d'audit facilitent l'investigation.

## 9. Transferts internationaux

Les Données Client sont hébergées dans l'**Union européenne** (Supabase,
eu-west-1). Lorsqu'un sous-traitant ultérieur traite des données hors UE/EEE
(voir Annexe 2), le transfert est encadré par une décision d'adéquation ou par
les **Clauses Contractuelles Types** (CCT / SCC 2021) de la Commission
européenne, complétées si nécessaire de mesures supplémentaires.

## 10. Suppression et restitution

À l'expiration ou la résiliation du contrat, et au choix du Client, BellumAI
**restitue** (via l'export) puis **supprime ou anonymise** les Données Client
dans un délai raisonnable, sauf obligation légale de conservation (ex. factures —
voir politique de rétention). Les copies de sauvegarde sont purgées selon leur
cycle de rotation.

## 11. Audit

BellumAI met à disposition du Client les informations nécessaires pour démontrer
le respect de l'art. 28 et permet des audits (y compris inspections), au plus une
fois par an sauf incident, moyennant préavis raisonnable et confidentialité.

---

## Annexe 1 — Détails du traitement

- **Finalités** : cf. art. 2.
- **Durée** : durée du contrat + rétention légale résiduelle (Annexe / politique
  de rétention).
- **Fréquence** : continue (à l'usage du Service).
- **Localisation** : UE (eu-west-1) pour le stockage primaire.

## Annexe 2 — Liste des sous-traitants ultérieurs

> Liste réelle dérivée du CODE (#4472, 27/10/2026) : chaque ligne correspond à un client réseau du dépôt, et
> `apps/api/src/legal-docs/dpa-sous-traitants.spec.ts` la relit contre `enrichment-providers.ts`,
> `source_registry.py`, `job_aggregators.py` et les URL par défaut des clients de modèle, d'OCR, de transcription
> et de traces. Les prestataires marqués « optionnel » ne reçoivent rien tant que la clé associée n'est pas
> posée (aucun appel réseau sans clé). « Non publiée par le fournisseur » : ni le code ni une page publique du
> fournisseur ne fixe la localisation à cette date — elle est alors traitée comme un transfert hors UE.
> Hunter : serveurs principaux Google Cloud en Belgique selon son centre d'aide (help.hunter.io, lu le
> 27/10/2026).

> **Localisations d'hébergement vérifiées le 26/10/2026 contre le code** (#4472) : Railway = `REGION` de
> `.railway/railway.ts` (`europe-west4-drams3a`, Pays-Bas — API, IA et Redis) ; Supabase = projet `eu-west-1`
> (Irlande) ; Vercel = aucun `regions` dans `apps/web/vercel.json` ni `apps/website/vercel.json`, donc la région
> de fonctions par défaut de Vercel (États-Unis) derrière un CDN mondial — d'où « États-Unis + edge ».
>
> Chaque localisation ci-dessus est lue dans le code, à la date indiquée. **La console de projet Vercel
> n'a pas été consultée : la région de ses fonctions est donc « non vérifiée auprès du fournisseur »,
> et seule la valeur déduite du code est écrite** (28/10/2026, #4472.2). Si Vercel change sa région par
> défaut sans que `vercel.json` change, cette ligne devient fausse sans prévenir — elle se relit à chaque
> revue du présent document.

| Sous-traitant                                                                                        | Rôle / traitement                                                                                                                        | Données concernées                                                               | Localisation                                                                                          | Encadrement transfert                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Supabase**                                                                                         | Base de données PostgreSQL, Auth, stockage                                                                                               | Toutes catégories                                                                | UE (eu-west-1)                                                                                        | Intra-UE                                     |
| **Railway**                                                                                          | Hébergement API / IA / Redis                                                                                                             | Toutes catégories (en transit/traitement)                                        | UE (europe-west4, Pays-Bas)                                                                           | CCT si hors-UE                               |
| **Vercel**                                                                                           | Hébergement frontend / CDN                                                                                                               | Données techniques, en transit                                                   | États-Unis + edge (CDN)                                                                               | CCT                                          |
| **Anthropic (Claude)**                                                                               | Analyse IA (génération des dossiers)                                                                                                     | Données prospect/entreprise, contexte ESN                                        | US                                                                                                    | CCT (pas d'entraînement sur les données API) |
| **Apollo**                                                                                           | Enrichissement de contacts B2B                                                                                                           | Données prospect (e-mail/tél. pro)                                               | US                                                                                                    | CCT                                          |
| **Stripe**                                                                                           | Paiement et facturation                                                                                                                  | Données de facturation                                                           | US/UE                                                                                                 | CCT + adéquation                             |
| **Resend**                                                                                           | E-mails transactionnels                                                                                                                  | E-mail utilisateur                                                               | US                                                                                                    | CCT                                          |
| **Firecrawl**                                                                                        | Scraping de pages web publiques                                                                                                          | Contenu web public                                                               | US                                                                                                    | CCT                                          |
| **Brave Search**                                                                                     | Recherche web                                                                                                                            | Requêtes de recherche                                                            | US                                                                                                    | CCT                                          |
| **Serper / Tavily** (optionnel)                                                                      | Recherche web (Data Gateway v2)                                                                                                          | Requêtes de recherche                                                            | US                                                                                                    | CCT                                          |
| **OpenAI** (optionnel)                                                                               | Modèle d'IA routé (`LLM_ROUTE_*`) ; transcription par défaut (`TRANSCRIPTION_API_KEY`) ; embeddings RAG par défaut (`EMBEDDING_API_KEY`) | Contenu soumis au modèle, audio des comptes rendus, contenu des documents Client | US                                                                                                    | CCT (pas d'entraînement sur les données API) |
| **Mistral AI** (optionnel)                                                                           | OCR des PDF scannés et transcription vocale (`OCR_API_KEY`, `api.mistral.ai` par défaut)                                                 | Documents Client scannés, audio des messages vocaux                              | UE (société française)                                                                                | Intra-UE                                     |
| **Langfuse** (optionnel)                                                                             | Traces des appels au modèle, contenu masqué (`LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`)                                              | Données techniques, contenu masqué (ni e-mail, ni téléphone, ni secret)          | UE (`cloud.langfuse.com`, hôte par défaut ; autre région seulement si `LANGFUSE_HOST` la fixe)        | Intra-UE                                     |
| **Hunter** (optionnel)                                                                               | Enrichissement de contacts B2B (cascade)                                                                                                 | Données prospect (nom, entreprise, e-mail pro)                                   | UE (Belgique, Google Cloud) + sous-traitants US                                                       | CCT                                          |
| **Lusha** (optionnel)                                                                                | Enrichissement de contacts B2B (cascade)                                                                                                 | Données prospect (e-mail/tél. pro)                                               | Israël                                                                                                | Décision d'adéquation                        |
| **Kaspr** (optionnel)                                                                                | Enrichissement de contacts B2B (cascade)                                                                                                 | Données prospect (e-mail/tél. pro)                                               | Société française ; hébergement non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE  | CCT                                          |
| **FullEnrich** (optionnel)                                                                           | Enrichissement de contacts B2B (cascade)                                                                                                 | Données prospect (e-mail/tél. pro)                                               | Société américaine ; hébergement non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE | CCT                                          |
| **SalesQL** (optionnel)                                                                              | Enrichissement de contacts B2B                                                                                                           | Données prospect (e-mail/tél. pro)                                               | Non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE                                  | CCT                                          |
| **Dropcontact** (optionnel)                                                                          | Enrichissement d'e-mail professionnel                                                                                                    | Données prospect (nom, entreprise, e-mail pro)                                   | Société française ; hébergement non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE  | CCT                                          |
| **Agrégateurs d'offres d'emploi** (optionnel) : Adzuna, Jooble, TheirStack, Mantiks, Fantastic.jobs  | Offres d'emploi publiées par les entreprises                                                                                             | Requêtes par entreprise (aucune donnée de personne attendue)                     | Non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE                                  | CCT si applicable                            |
| **MessageBird (Bird)** (optionnel)                                                                   | SMS d'alerte à l'utilisateur                                                                                                             | Numéro de téléphone de l'utilisateur                                             | UE (Pays-Bas)                                                                                         | Intra-UE                                     |
| **Reflag** (optionnel)                                                                               | Interrupteurs de fonctionnalités                                                                                                         | Identifiant d'espace et d'utilisateur                                            | Non publiée par le fournisseur au 27/10/2026 — traitée comme hors UE                                  | CCT                                          |
| **GitHub**                                                                                           | Signalements de bug in-app (texte et capture, à l'initiative de l'utilisateur)                                                           | Texte du signalement, capture d'écran, identifiant de l'utilisateur              | US                                                                                                    | CCT                                          |
| **Sentry**                                                                                           | Supervision des erreurs                                                                                                                  | Données techniques + identifiant de corrélation                                  | US/UE                                                                                                 | CCT                                          |
| **Pappers / INSEE / France Travail / INPI / BODACC / BOAMP / DECP / GitHub / recherche-entreprises** | Sources de données publiques (registres, offres, marchés)                                                                                | Données d'entreprise publiques                                                   | UE/US                                                                                                 | Données publiques ; CCT si applicable        |
| **HubSpot / Salesforce** (optionnel)                                                                 | Intégration CRM à l'initiative du Client                                                                                                 | Contacts exportés par le Client                                                  | US                                                                                                    | Responsable↔Responsable ; CCT                |

## Annexe 3 — Mesures techniques et organisationnelles (art. 32)

Synthèse — le détail vit dans `agent_docs/security.md`.

- **Chiffrement** : TLS en transit ; chiffrement au repos (Supabase) ; secrets
  d'intégration chiffrés **AES-256-GCM** (tokens CRM, URLs de webhook).
- **Contrôle d'accès** : authentification JWT + cookies HttpOnly ; **RLS
  Postgres** (`auth.uid() = user_id`) ; scoping strict par utilisateur/espace ;
  2FA TOTP disponible ; cap anti-partage de mot de passe (5 appareils, éviction
  LRU).
- **Cloisonnement** : gate d'authentification interne API↔IA (`x-internal-secret`).
- **Minimisation** : pas de collecte de données sensibles ; secrets jamais
  loggés ; export/effacement self-serve.
- **Journalisation & supervision** : journal d'audit des crédits et des actions ;
  supervision Sentry avec identifiant de corrélation.
- **Résilience** : hébergement managé UE, sauvegardes Supabase.
- **Sous-traitance** : obligations répercutées contractuellement (art. 6).

---

**Signatures**

|           | Responsable de traitement (Client) | Sous-traitant (BellumAI) |
| --------- | ---------------------------------- | ------------------------ |
| Nom       |                                    |                          |
| Fonction  |                                    |                          |
| Date      |                                    |                          |
| Signature |                                    |                          |
