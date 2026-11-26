# Méta-analyses besoins & workflows (03/08/2026) — triage contre le code

Deux documents reçus le 03/08/2026 :

- `BellumAI_Meta_Analyse_Besoins_Utilisateurs_2026.pdf` (30 p) — personas,
  familles de besoins, workflows multi-outils, exigences produit/IA, roadmap
  P0/P1/P2, critères d'acceptation.
- `BellumAI_Meta_Analyse_Besoins_Workflows_Requetes.pdf` (25 p) — audit terrain
  de 60+ utilisateurs, 100 besoins PRIO 1, 50 PRIO 2, 60 requêtes exécutables,
  30 requêtes conseil, 25 déclencheurs, 30 garde-fous UX, protocole PASS/FAIL.

Le troisième PDF transmis le même jour
(`BELLUMAI_RECETTE_FINALE_PRODUIT_CODE_VISION_2026-08-02.pdf`, 80 p) est le
rapport du 02/08 **déjà traité et clos** — P0 en #856, écrans et P1 en #857,
tutoiement et provenance du profil en #858, addendum p69-80 en #854. Rien à y
refaire ; voir `agent_docs/addendum-final-2026-08-02.md`.

---

## 1. Ce que ces deux documents changent

Ils ne demandent pas d'améliorer l'existant : ils demandent **une autre surface
produit**. Bellum sait aujourd'hui comprendre un compte (intelligence, contacts,
score, plan, messages). Les méta-analyses décrivent un agent qui **exécute dans
les outils du commercial** — messagerie, agenda, CRM, ATS, documents — et qui le
fait de façon vérifiable.

La preuve la plus nette est le sondage cité : 71,5 % des 604 répondants placent
« prospection, relances, plan de compte » en premier besoin, 8,8 % « mise à jour
automatique du CRM ». Aucun de ces deux verbes n'est « analyser ».

## 2. Décisions prises par Louis le 03/08

| Sujet        | Décision                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Envois       | **Envoi réel autorisé en masse après approbation d'un lot.** Le brouillon reste le défaut ; un lot validé peut partir.                    |
| BoondManager | **Identifiants par espace de travail** (Réglages › Intégrations, chiffrés AES-256-GCM comme les tokens CRM). L'env global reste en repli. |
| PRIO 2       | **APIs officielles + imports CSV. Pas de scraping LinkedIn** — l'étude ToS au dépôt conclut que c'est interdit et bannissable.            |
| Documents    | **Ajouter des bibliothèques de génération** (docx / exceljs / pptxgenjs) pour produire des livrables même sans connecteur.                |

## 3. État vérifié du code au 03/08 (avant ce chantier)

| Capacité demandée                                                           | État                                                         | Preuve                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Brouillon Gmail réel                                                        | livré                                                        | `google.service.ts` `createGmailDraft`                  |
| Envoi Gmail / Outlook, avec opt-out                                         | livré                                                        | `sendGmail`, `microsoft.service` + `SuppressionService` |
| Lecture Gmail par contact / domaine                                         | partiel — 2 requêtes figées                                  | `listGmailWithContact/Domain`                           |
| Recherche libre, non-lus, non-réponses, PJ, libellés, absence               | absent                                                       | —                                                       |
| Agenda : créer, lister à venir                                              | livré                                                        | `createCalendarEvent`, `listUpcomingEvents`             |
| Agenda : passé, créneaux libres, conflits, annulations, rappels             | absent                                                       | —                                                       |
| HubSpot contacts / note / deal                                              | livré                                                        | `hubspot.client.ts`                                     |
| HubSpot tâches, réunions, sociétés, listes, séquences, doublons, scoring    | absent                                                       | —                                                       |
| Boond : entreprises, opportunités, positionnements                          | partiel, env global, lecture seule                           | `zero-layer/boondmanager.client.ts`                     |
| Boond : consultants, besoins, missions, intercontrat, TJM                   | absent                                                       | —                                                       |
| Drive : lister, ingérer en RAG, export Sheet                                | livré                                                        | `google.service.ts`                                     |
| Drive : recherche par CONTENU, dossiers, conversion, PJ réelle              | absent                                                       | —                                                       |
| Génération docx / xlsx / pptx / pdf                                         | absent                                                       | —                                                       |
| Action Router (8 intentions) + Action OS (runs, approbations, réservations) | livré                                                        | `action-router/`, `action-os/`                          |
| Catalogue de 5 workflows                                                    | livré                                                        | `workflow-catalog.ts`                                   |
| Routines configurables par utilisateur (25 déclencheurs)                    | absent — 11 crons en dur, non éditables                      | `@Cron`                                                 |
| Copilote : 7 outils                                                         | livré                                                        | `chat_tools.py`                                         |
| Copilote : outils messagerie / agenda / CRM / Boond / Drive                 | absent                                                       | —                                                       |
| Digest matin, récap hebdo                                                   | partiel — veille + résumé produit, sans agenda ni messagerie | `notifications.scheduler.ts`                            |

## 4. Découpage en lots

### LOT 1 — Socle messagerie et agenda ✅ **livré**

Contrats `mailbox` / `agenda` / `daily-briefing`, modules API `mailbox/`,
`agenda/`, `briefing/`, écrans « Ma journée » et « Messagerie » (FR + EN),
parité démo, entrée changelog.

Ce qui est mis hors de portée d'une erreur silencieuse :

- **La traduction « intention métier → requête fournisseur » est déterministe et
  testée.** Un modèle qui écrirait ces requêtes produirait des recherches
  silencieusement fausses : zéro résultat, ce qui se lit exactement comme « il
  n'y a rien ».
- **« Qui ne m'a pas répondu » se calcule chez nous.** Aucune API de messagerie
  ne sait le dire. Seul le sens du DERNIER message compte, un répondeur
  d'absence n'est pas une réponse, et un fil dont la date est illisible n'est
  jamais relancé d'office.
- **L'organisateur n'est plus jamais invité à sa propre réunion**
  (`common/util/self-invite.ts`), et un lien visio est demandé par défaut avec
  `conferenceDataVersion=1` — sans ce paramètre Google ignore la demande sans
  rien dire.
- **Chaque bloc du brief porte son état** : non connecté, portée à renouveler,
  indisponible. Un bloc vide ne se lit jamais « rien à faire ».

Portées Google ajoutées (additives) : `gmail.settings.basic`, `gmail.labels`.
Portées Microsoft ajoutées : `Mail.ReadWrite`, `MailboxSettings.ReadWrite`.
Un utilisateur connecté avant garde sa concession plus étroite ; les capacités
concernées restent éteintes jusqu'à reconnexion, et l'écran le dit.

Migration : `profiles.email_signature` (additive, sans défaut — une signature
par défaut serait le marque-place que le garde-fou n°2 interdit).

**Ce que le LOT 1 ne fait volontairement pas** : appliquer un libellé à un
message. Cela exige la portée RESTREINTE `gmail.modify`, qui donne aussi le
droit de supprimer du courrier. La capacité est déclarée à `false` et l'écran le
dit, plutôt que d'échouer au clic.

### LOT 2 — Copilote branché sur la messagerie et l'agenda ✅ **livré**

Le blocage était structurel : les jetons OAuth vivent chez NestJS, le service IA
lit Supabase en direct. La réponse est un **pont interne en lecture seule**
(`copilot-bridge/`), gardé par `InternalSecretGuard`, avec `userId` explicite
dans le corps — même contrat que le callback de progression.

Cinq outils : `search_mailbox`, `list_agenda`, `find_free_slots`,
`get_daily_briefing` (lectures) et `prepare_mail_draft` (proposition ; le clic
appelle `POST /mailbox/drafts`, authentifié par JWT). La carte « à valider »
existante sait maintenant déposer un vrai brouillon.

Ce que les tests verrouillent : le contrôleur n'expose aucun verbe d'écriture
(un test énumère ses méthodes), le corps des messages ne quitte jamais la
messagerie, aucune description d'outil ne nomme d'éditeur, et sans
`API_INTERNAL_URL` les outils DISENT qu'ils n'ont pas accès au lieu de rendre
une liste vide.

### LOT 3 — ATS par espace ✅ **livré** · CRM en profondeur ⏳

**Livré.** Les identifiants BoondManager passent de la variable d'environnement
globale à une connexion PAR ESPACE (`ats_connections`, chiffrée), avec l'env en
repli et un statut qui DIT laquelle des deux sert. Lecture des missions, des
consultants et des besoins ouverts ; parsing pur et testé, où **un champ
illisible vaut `null`, jamais une valeur de remplissage**. Deux routines en
découlent : fins de mission à J-30 et intercontrat > 30 jours.

Décision assumée : **lecture seule**. Écrire dans l'ERP d'une ESN engage sa
facturation et sa paie ; Bellum lit, rapproche et alerte.

**Reste.** HubSpot en profondeur : tâches, réunions/engagements, sociétés,
listes, doublons, scoring, exports. Et la synchronisation ATS ↔ CRM.

### LOT 4 — Documents ✅ **livré (XLSX + DOCX)**

Décision Louis : ajouter les bibliothèques de génération plutôt que dépendre
d'un connecteur. `exceljs` et `docx` ajoutés ; classeur de contacts et plan de
compte téléchargeables. Les constructeurs sont purs et testés **en relisant le
fichier produit** — ce qui casse dans un export, c'est la mise en page, et ça ne
se voit qu'à l'ouverture chez le client.

Deux règles qui évitent les dégâts classiques : les valeurs sortent en TEXTE (un
« 01 42 » devenu 142 est irrattrapable) et une valeur absente reste une cellule
vide (écrire « N/A » se lit comme une donnée).

**Non livré, et pourquoi** : PPTX — `pptxgenjs` est approuvé mais aucun écran ne
le demande encore, et une génération sans destinataire ne se teste pas. PDF
natif — le chemin honnête aujourd'hui est l'export Drive quand un compte Google
est connecté ; un PDF fabriqué à part divergerait de la mise en page Word.

**Reste aussi** : recherche Drive par CONTENU (et non par nom) et pièce jointe
RÉELLE sur un brouillon.

### LOT 5 — Moteur de routines ✅ **livré**

Écran Réglages › Routines : « visible, modifiable, désactivable », l'exigence du
rapport prise au mot. Le catalogue vit dans le code, la base ne porte que
l'abonnement (`routine_subscriptions`) et la trace (`routine_runs`).

**Huit routines et non vingt-cinq.** Brief du matin, préparation des rendez-vous,
relances sans réponse, réponses favorables, conflits d'agenda, alerte pipeline
vide, récap et prévision de semaine. Les dix-sept autres supposent des capacités
que les connecteurs n'ont pas encore — les inscrire produirait des cases à cocher
qui ne font rien. Elles arrivent avec leur lot :

| Déclencheur du rapport                                                                                                         | Lot                              |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Suivi budget, contrats en attente, leads à relancer, séquence post-proposition, nettoyage des doublons, hygiène mensuelle, QBR | LOT 3 (CRM)                      |
| Fin de mission à 30 j, intercontrat > 30 j                                                                                     | LOT 3 (Boond)                    |
| CV entrants → indexation, factures impayées                                                                                    | LOT 4 (documents)                |
| Détection d'AO, réponses positives → CRM                                                                                       | LOT 3                            |
| Merci & next steps post-RDV, annulation → replanification, lien visio manquant                                                 | LOT 2 (copilote) + LOT 6 (envoi) |

Ce qui rend le moteur sûr : l'idempotence est une **clé**
(`utilisateur:routine:jour-local`) et non une horloge, la trace est réservée
**avant** l'envoi, les horaires sont en heure **locale** de l'utilisateur, et
une routine ne part jamais avant d'avoir été **vue** (la première consultation
de l'écran matérialise les défauts). Kill-switch `ROUTINES_DISABLED`.

### LOT 6 — Envoi de masse gouverné ✅ **livré**

`POST /mailbox/batch`. Décision Louis : un lot validé peut PARTIR. C'est la
décision la plus risquée du chantier, donc quatre garde-fous dans cet ordre —
idempotence par `batchId` (réservé AVANT le premier envoi), borne dure à 50
destinataires, opt-out vérifié destinataire par destinataire avec sa raison, et
arrêt après trois échecs consécutifs. Le mode `send` dépose le brouillon PUIS
l'envoie : un envoi qui échoue laisse un brouillon récupérable.

**Profondeur CRM livrée au passage** : tâche de relance datée, journal d'une
réunion tenue (avec clé d'idempotence sur l'évènement d'agenda), contacts sans
activité depuis N jours, et la routine `crm_followups` (déclencheur n°15).

**Reste côté CRM** : sociétés, listes, doublons, scoring, exports, et la
synchronisation ATS ↔ CRM.

### LOT 7 — PRIO 2 sans scraping ⏳ **import livré, enrichisseurs restants**

**Livré.** L'import d'un fichier de prospection exporté par l'utilisateur
(`POST /accounts/:id/contacts/import-csv`), en deux temps : on montre ce qu'on a
compris — colonnes reconnues, colonnes IGNORÉES plutôt que devinées, lignes
écartées avec leur raison, doublons repérés — avant d'écrire quoi que ce soit.
Un import qui commence par écrire ne laisse aucune place au « ah non, ce n'est
pas la bonne colonne ».

**Reste.** Les enrichisseurs à API officielle (Kaspr, Lusha, Hunter, FullEnrich)
à greffer sur la cascade existante Apollo → SalesQL → Dropcontact. Le travail
est mécanique mais touche un chemin qui DÉBITE un crédit : il mérite sa propre
session, pas la fin d'une autre.

**Toujours pas au programme** : le scraping LinkedIn / Sales Navigator. Décision
Louis, adossée à l'étude ToS du dépôt.

## 5. Les 30 garde-fous UX — état

| #   | Règle                                                       | État                                                  |
| --- | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Prénom de l'utilisateur dans les réponses                   | livré (brief)                                         |
| 2   | Jamais « signature » comme marque-place                     | livré (`resolveSignature`, jamais de valeur inventée) |
| 3   | Français par défaut                                         | déjà en place (i18n, défaut FR)                       |
| 6   | Dates lisibles                                              | livré (`Intl` dans la langue et le fuseau)            |
| 9   | Vrais brouillons                                            | livré (`/mailbox/drafts`)                             |
| 10  | Brouillon complet (objet, corps, destinataires, CC)         | livré ; pièce jointe → LOT 4                          |
| 12  | To/CC intelligents                                          | partiel — CC transmis, pas encore suggéré             |
| 14  | Détection correcte des non-réponses                         | livré, testé                                          |
| 15  | Ne pas s'ajouter comme participant                          | livré, testé                                          |
| 16  | Lien visio systématique                                     | livré (Google) ; Teams → LOT 3                        |
| 19  | Ne pas inventer d'action : exécuter ou expliquer le blocage | livré (états de bloc + capacités)                     |
| 25  | Drive : chercher dans le CONTENU                            | LOT 4                                                 |
| 26  | Drive + messagerie : pièce jointe réelle                    | LOT 4                                                 |
| 30  | Observabilité (logs, statut, latence, idempotence)          | partiel — journal d'actions existant, à étendre       |

Les règles non listées relèvent des lots suivants ou sont déjà couvertes par les
gardes i18n en place (`lexicon.test.ts`, `no-overpromise.test.ts`).

## 6. Ce qu'on ne promet pas

- **Pas de scraping LinkedIn / Sales Navigator.** Ni maintenant, ni plus tard
  sans changement de décision : c'est une violation des CGU qui expose les
  comptes des utilisateurs à un bannissement.
- **Pas d'application de libellés Gmail** tant que la portée restreinte
  `gmail.modify` n'est pas demandée et validée par Google.
- **Pas de lien visio Teams** créé côté Outlook : Graph l'expose via
  `isOnlineMeeting`, qui exige une licence Teams sur le tenant. Promettre un
  lien puis échouer à l'envoi est pire que ne rien promettre.
- **Pas de signature Outlook lue automatiquement** : Graph ne l'expose pas, elle
  vit côté client. D'où `profiles.email_signature`, saisissable dans Bellum.
