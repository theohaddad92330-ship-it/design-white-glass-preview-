# PDF 7/9 — Intégrations et parcours connecteurs

Source : `agent_docs/sources/pdf7-integrations-connecteurs-2026-08-21.pdf` (11 pages, ORION,
19/08/2026). Le dossier `sources/` est gitignoré — le PDF n'est pas committé.

Série : 7/9. Prérequis annoncés : PDF 1 (états par capacité, canaux) et PDF 6 (automatisations
dépendantes). Les six chantiers précédents sont clos, dette comprise
(`agent_docs/dette-pdf1-6-2026-08-21.md`).

---

## 0. Ce que le croisement a trouvé, avant de parler du PDF

Le document tient en une phrase : **« une erreur se remarque, une liste vide se croit »**. Il
demande de rendre visible, capacité par capacité, ce qu'un connecteur peut réellement faire.

Le dépôt a le VOCABULAIRE de cette idée depuis le 21/08 — huit états de capacité, une fonction de
dérivation, des cartes par famille. Le croisement montre qu'il n'en a pas encore la MÉCANIQUE, et
il a sorti **onze défauts que le PDF ne demande pas**. Ils se ressemblent tous : quelque chose est
écrit, testé, affiché — et personne ne l'appelle, ou personne ne le lit.

| #   | Défaut trouvé en croisant                                                                                                                                                 | Preuve                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **Trois des huit états de capacité sont INATTEIGNABLES** — l'unique appelant ne passe jamais `writesPartial`, `degraded`, `actionPending`                                 | `tool-registry.service.ts:410-419`                                             |
| 2   | **`writesGranted` vient du CATALOGUE, pas des portées accordées** — un Google sans `gmail.send` s'affiche « opérationnel »                                                | `tool-registry.service.ts:413`                                                 |
| 3   | **Le `reason` des 503 n'atteint jamais le navigateur** — le web ne lit que `code`. Le correctif du 16/08 (PR #936) est invisible côté client                              | `api-error.ts:41` vs `microsoft.controller.ts:100`, `crm.service.ts:112`       |
| 4   | **`GET /google/drive/search` n'a jamais reçu le correctif du 16/08** — portée absente ⇒ `Error` nue ⇒ **500 générique**                                                   | `google.service.ts:736`, `google.client.ts:499`, `all-exceptions.filter.ts:41` |
| 5   | **La garde Microsoft est sensible à la casse là où `hasScope` ne l'est pas** — un jeton portant `files.read.all` passe la garde ET rend `[]` : la panne du 16/08 revient  | `microsoft.service.ts:383` (`granted.has`) vs `:96` (`hasScope`)               |
| 6   | **`Files.Read.All` n'est PAS dans les portées Microsoft par défaut**, contrairement à ce qu'affirme `CLAUDE.md`                                                           | `microsoft-config.ts:32`                                                       |
| 7   | **Le bouton « Tester » ENVOIE un vrai message** — c'est le « test destructif » que le PDF interdit, et il ne couvre que les webhooks                                      | `integrations.service.ts:249`                                                  |
| 8   | **La routine de santé n'a jamais notifié personne** — elle rend des `items[]` sans `notification`, or seule `runContinuous` lit les `items`, et elle est déclarée `daily` | `routine-executors.ts:266-294` vs `routines.service.ts:243`, `:274`            |
| 9   | **`sync_links` n'est jamais INSÉRÉ** — seulement `.update()`. La table est vide en production, l'anti-doublon par `external_id` ne s'amorce jamais                        | `crm-import.service.ts:236` (aucun `insert` dans le dépôt)                     |
| 10  | **Le second étage de cache navigateur n'a pas de buster de version** — un instantané d'avant un déploiement survit                                                        | `query-snapshots.ts:14` vs `App.tsx:72`                                        |
| 11  | **Des noms de fournisseur d'enrichissement s'affichent en clair** — `hunter`, `lusha`, `demo` sont dans l'enum et absents de la table de traduction, donc rendus bruts    | `contactProvenance.ts:15`, `contacts.json:116-125`, `contact.ts:47-48`         |

Et un douzième, de confidentialité, qui n'est pas une préférence produit :

| #   | Défaut                                                                                                                                                                                                                                        | Preuve                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 12  | **Une boîte mail personnelle est lisible par les collègues.** `google_connections` a un index unique `(user_id, provider)` — donc une ligne par membre — mais toutes les lectures se font par `workspace_id` avec un `findOne` **sans ordre** | `google-connection.entity.ts:18` vs `google.service.ts:230`, `:293`, `:319`, `:809` ; idem `microsoft.service.ts:161…` |

Dans un espace où deux commerciaux ont connecté leur compte, « Ma journée » de l'un peut lire le
Gmail de l'autre, et « Déconnecter » peut supprimer la connexion du collègue. C'est exactement ce
qu'interdit BEL-INT-604.

---

## 1. Les marqueurs « Confirmé — repo » du PDF

Le PDF en pose treize. **Six sont faux**, dans le sens « le document décrit un dépôt qui n'existe
pas encore ».

| Marqueur du PDF                                                                              | Réalité                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p1 « sain n'est jamais déclaré, dérivé des portées **et d'un test réel** »                   | FAUX — `operational` est dérivé de `status` + fraîcheur. Aucun test réel n'existe (`tool-registry.ts:180`)                                                                                                                  |
| p2 Gmail/Outlook « MVP [Confirmé — repo] », 5 actions par connecteur                         | FAUX — 2 boutons sur 5 (Connecter, Déconnecter). Ni Tester, ni Réparer, ni Modifier les accès                                                                                                                               |
| p3 « pagination plafonnée à 100 [Confirmé — repo] »                                          | VRAI — `hubspot.client.ts:41`, `:267`, avec boucle sur curseur `crm-sources.ts:31-48`                                                                                                                                       |
| p3 BoondManager « 3 objets sous validation [Confirmé — repo] »                               | PARTIEL — les 3 TYPES existent (`ats-write-preview.ts:19`) mais `update_tjm`/`update_need_status` sont des POST de création sur une collection : une mise à jour n'a aucune chance d'aboutir (`ats-write.service.ts:41-45`) |
| p3 « le pire piège [Confirmé — repo] : sans Files.Read.All… »                                | VRAI, et **toujours vivant** — cf. défauts 5 et 6                                                                                                                                                                           |
| p3 « cascade multi-fournisseurs [Confirmé — repo] »                                          | VRAI — Apollo → SalesQL → Dropcontact → Hunter → Lusha → Kaspr → FullEnrich                                                                                                                                                 |
| p4 « MCP 12 outils [Confirmé — repo] »                                                       | VRAI — `apps/mcp/src/tools.ts:59-229`                                                                                                                                                                                       |
| p8 « OAuth avec state et **PKCE** [Confirmé — repo] »                                        | FAUX pour les connecteurs sortants — PKCE n'existe que sur **Salesforce** (`salesforce.service.ts:134`) et sur le serveur MCP entrant                                                                                       |
| p8 « **révocation propre** [Confirmé — repo] »                                               | FAUX — aucun connecteur ne révoque côté fournisseur. Le code le dit : « does not revoke server-side » (`google.service.ts:806`, `microsoft.service.ts:414`, `crm.service.ts:440`)                                           |
| p8 « signatures de webhook [Confirmé — repo] »                                               | PARTIEL — entrant : Stripe seul. Sortant : aucune signature, mais host-pinning + SSRF (`ssrf-guard.ts:55`)                                                                                                                  |
| p8 « protection SSRF [Confirmé — repo] »                                                     | VRAI — `ssrf-guard.ts:55`                                                                                                                                                                                                   |
| p8 « isolation par espace [Confirmé — repo] »                                                | FAUX pour la messagerie et l'agenda — cf. défaut 12                                                                                                                                                                         |
| p11 « BEL-INT-602 réutilise sync_links, sync_runs, l'instantané et la simulation existants » | PARTIEL — les 3 tables existent, la simulation aussi ; **l'instantané n'existe pas** (prescrit `crm-ats-plan.md:20`, jamais livré), et `sync_links` n'est jamais rempli (défaut 9)                                          |

---

## 2. Inventaire — 110 exigences, page par page

Statuts : `LIVRÉ` (preuve `fichier:ligne`) · `PARTIEL` (existe, incomplet) · `ABSENT` · `PÉRIMÉ`
(contredit par une décision postérieure) · `REFUS` (contredit une règle permanente) · `DÉCISION`.

### §1 — Le principe (p.1)

| #   | Exigence                                                           | Statut    | Preuve / ce qui manque                                                                                                      |
| --- | ------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Une intégration est un contrat de capacités                        | `PARTIEL` | `capability_state` existe mais est **un scalaire par OUTIL** (`tool-registry.ts:161`), pas par capacité                     |
| 2   | Dix verbes de capacité                                             | `PARTIEL` | 6-7/10 via `allowed_actions` (`tool-capability-digest.ts:48-80`). Absents : résumer, supprimer, planifier                   |
| 3   | État + portée + **dernière preuve** + dernière erreur par capacité | `ABSENT`  | Ni `last_proof_at`, ni `last_proof_sample`, ni `last_error_code`. `last_sync` est un dernier USAGE (`tool-registry.ts:138`) |

### §2 — Les 8 états (p.1)

| #   | Exigence                                        | Statut    | Preuve / ce qui manque                                                                                        |
| --- | ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| 4   | Huit états nommés                               | `PARTIEL` | 7/8 (`tool-registry.ts:96-113`). **`portee_manquante` n'existe pas** ; 3 des 8 sont inatteignables (défaut 1) |
| 5   | Ce que l'écran dit / ce que le produit fait     | `PARTIEL` | Documenté en commentaire, mais l'écran ne branche jamais par état (filtre `=== 'operational'` partout)        |
| 6   | `sain` dérivé des portées **et d'un test réel** | `ABSENT`  | Dérivé de `status` + fraîcheur seulement (`tool-registry.ts:180-200`)                                         |

### §3 — « Rien trouvé » ≠ « pas le droit » (p.1)

| #   | Exigence                               | Statut    | Preuve / ce qui manque                                                                   |
| --- | -------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 7   | 200 + `searched: true` + N parcourus   | `ABSENT`  | Le patron existe sur la prospection (`discover.ts:183-194`), jamais sur un connecteur    |
| 8   | 503 `scope_missing` + NOM de la portée | `PARTIEL` | 3 codes ad hoc, aucun ne nomme la portée, et le `reason` n'atteint pas le web (défaut 3) |
| 9   | 503 `provider_unavailable`             | `PARTIEL` | 5 codes concurrents : `crm_unavailable`, `agenda_unavailable`, `mailbox_unavailable`…    |
| 10  | 429 + file d'attente                   | `ABSENT`  | Throttler ENTRANT seulement (`app.module.ts:129`). Aucune file sur un 429 fournisseur    |
| 11  | Test de garde sur la liste vide        | `ABSENT`  | Aucun test sur `searchFiles`/`searchDriveContent` — pas même un spec de contrôleur       |

### §4 — Les 22 connecteurs (p.2-4)

| #   | Exigence                                                | Statut    | Preuve / ce qui manque                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Gmail lit/écrit                                         | `LIVRÉ`   | `google-config.ts:53-63`, `google-mail.backend.ts`                                                                                                                                                                                             |
| 13  | Outlook Mail lit/écrit                                  | `LIVRÉ`   | `microsoft-config.ts:32`, `microsoft-mail.backend.ts`                                                                                                                                                                                          |
| 14  | Les 5 actions par connecteur                            | `PARTIEL` | 2/5 (`OAuthProviderCard.tsx:124`, `:141`)                                                                                                                                                                                                      |
| 15  | Jamais transfert automatique ni suppression             | `LIVRÉ`   | Aucun `messages.delete` ni transfert dans le code                                                                                                                                                                                              |
| 16  | Portée d'envoi demandée séparément                      | `ABSENT`  | `gmail.send` et `Mail.Send` sont dans les défauts (`google-config.ts:55`, `microsoft-config.ts:32`) — **D63**                                                                                                                                  |
| 17  | Agendas lecture + écriture                              | `LIVRÉ`   | `google-agenda.backend.ts:25-27`, `microsoft-agenda.backend.ts:29`                                                                                                                                                                             |
| 18  | Meet natif, lien Teams non garanti                      | `LIVRÉ`   | `conferenceDataVersion=1` côté Google ; refus documenté côté Microsoft                                                                                                                                                                         |
| 19  | API Calendar éteinte détectée                           | `PARTIEL` | Détectée à la LECTURE (`agenda.service.ts:95`, `:109-120`, test `:381`) mais `/agenda/status` rend toujours `read: true` (`:159-167`)                                                                                                          |
| 20  | Slack/Teams/Discord lisent les canaux                   | `REFUS`   | Ce sont des webhooks SORTANTS (`integration-providers.ts:35-73`, `data_types.reads: []`). Lire un canal exigerait une app OAuth par éditeur                                                                                                    |
| 21  | Les 5 règles Teams                                      | `PARTIEL` | 3/5 : « préparé chez nous » et « irréversible » livrés (`reminder-channel.ts:159-160`, `missions.json:267-284`) ; garde « brouillon Teams » **FR seulement** (`no-overpromise.test.ts:106`) ; PJ→lien absent ; « e-mail par défaut » non gardé |
| 22  | Les 4 CRM                                               | `PARTIEL` | Seul HubSpot lit vraiment (`crm-sources.ts:8-17`) ; les 3 autres n'ont pas de lecture paginée                                                                                                                                                  |
| 23  | Pagination HubSpot 100                                  | `LIVRÉ`   | `hubspot.client.ts:41`, `:267`, boucle curseur `crm-sources.ts:31-48`                                                                                                                                                                          |
| 24  | Écriture CRM gouvernée + prévisualisation               | `ABSENT`  | Existe pour l'ATS seul (`ats-write-preview.ts:58`). Les écritures CRM partent en direct (`crm-sync.service.ts:148`)                                                                                                                            |
| 25  | Portée qui n'arrive pas après coup → 503                | `PARTIEL` | Vrai pour le CRM (`crm.service.ts:106-118`), faux pour Google (défaut 4)                                                                                                                                                                       |
| 26  | BoondManager, 3 objets sous validation                  | `PARTIEL` | Les 3 types existent ; `update_tjm`/`update_need_status` sont des POST de création (défaut du §1)                                                                                                                                              |
| 27  | Verbe/corps d'écriture non publics                      | `LIVRÉ`   | Dit en commentaire (`boondmanager.client.ts:118-120`) et au tracker PDF 5                                                                                                                                                                      |
| 28  | Drive / OneDrive / Notion, portées critiques            | `PARTIEL` | `drive.readonly` par défaut ; **`Files.Read.All` PAS par défaut** (`microsoft-config.ts:32`) — défaut 6                                                                                                                                        |
| 29  | Sans `Files.Read.All`, liste vide indiscernable         | `PARTIEL` | Garde au contrôleur (`microsoft.controller.ts:95-104`), mais `granted.has` sensible à la casse (défaut 5) et repli `[]` toujours dans le service (`:383`)                                                                                      |
| 30  | La recherche porte sur le CONTENU                       | `PARTIEL` | Google `fullText contains` (`google.service.ts:746`) ✅, Microsoft `/search(q=…)` ✅, Notion titre seul, **la couche zéro cherche par NOM** (`google.service.ts:520`)                                                                          |
| 31  | Enrichissement : cascade, aucun nom, 1 crédit si trouvé | `PARTIEL` | Cascade 7 fournisseurs ✅, débit conditionnel ✅ (`contacts.service.ts:1574`). **Les noms fuient** (défaut 11)                                                                                                                                 |
| 32  | Test de garde « aucun nom de fournisseur »              | `PARTIEL` | 3 gardes, toutes sur des chaînes STATIQUES (`lexicon.test.ts:216`, `no-vendor-names.test.ts:83`). Aucune ne balaye un payload ; Hunter/Lusha/Kaspr/FullEnrich dans aucune liste                                                                |
| 33  | Téléphonie lit, n'appelle pas, n'enregistre pas         | `LIVRÉ`   | `telephony.client.ts:18-19`, aucune route de composition, `telephony.ts:55-73` sans `recordingUrl`                                                                                                                                             |
| 34  | Clic-to-call refusé                                     | `LIVRÉ`   | 0 occurrence dans le dépôt — **D61**                                                                                                                                                                                                           |
| 35  | Yousign/DocuSign lecture, Qonto/Tiime                   | `LIVRÉ`   | `admin-docs.client.ts:31-35`, activation Yousign `:97`, refus DocuSign `:107`                                                                                                                                                                  |
| 36  | Facturation lecture seule, jamais d'émission            | `LIVRÉ`   | `invoice-readiness.controller.ts:33-35`                                                                                                                                                                                                        |
| 37  | Échéances 01/09/2026 et 01/09/2027                      | `PÉRIMÉ`  | Tranché **D32** au PDF 5 : Bellum n'émet ni ne reçoit de facture — **D59**                                                                                                                                                                     |
| 38  | LinkedIn : refus, journal déclaré, texte collé          | `LIVRÉ`   | `linkedin.controller.ts:8-12`, 5 types (`linkedin.ts:17-27`), texte collé `accounts.controller.ts:508`                                                                                                                                         |
| 39  | CSV MVP · Airtable V2 · MCP livré · CVthèques V3        | `PARTIEL` | CSV **contacts seulement** (`csv-import.ts:24-32`) ; MCP 12 outils ✅ ; Airtable absent ; CVthèques refusées **D25** — **D60**                                                                                                                 |

### §5 — L'écran (p.4-5)

| #   | Exigence                             | Statut    | Preuve / ce qui manque                                                                                                                                       |
| --- | ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 40  | Par famille, pas par fournisseur     | `LIVRÉ`   | 7 familles (`connectors.ts:27-36`), Google Workspace en une carte (`:76-81`)                                                                                 |
| 41  | La carte de connecteur               | `PARTIEL` | 3 éléments sur 7 : compte ✅, « ce que je peux faire » ✅. Absents : bloc « ne peux pas », appartenance, dernière preuve, dernière erreur, N automatisations |
| 42  | Séparation utilisateur / back-office | `LIVRÉ`   | Décidé le 14/08 et appliqué (`IntegrationCenterPage.tsx:22-28`, back-office `dashboard-manager/src/app/integrations/`)                                       |

### §6 — Les 5 boutons (p.5-6)

| #   | Exigence                                           | Statut    | Preuve / ce qui manque                                                                                                     |
| --- | -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 43  | Pré-consentement AVANT la redirection              | `ABSENT`  | Redirection immédiate (`OAuthProviderCard.tsx:67-73`)                                                                      |
| 44  | Test automatique de chaque capacité au retour      | `ABSENT`  | Aucun test au callback                                                                                                     |
| 45  | Permissions : utilisateur / admin                  | `PARTIEL` | Aucune `@RequirePermission` sur les contrôleurs de connexion                                                               |
| 46  | Portée refusée pendant l'OAuth → message qui nomme | `ABSENT`  | Les capacités se dérivent bien des portées accordées, mais rien ne le DIT au retour                                        |
| 47  | KPI ≥ 1 connecteur à J3 (> 70 %)                   | `ABSENT`  | Aucun indicateur d'adoption connecteur                                                                                     |
| 48  | « Tester » non destructif + échantillon réel       | `ABSENT`  | Le bouton actuel ENVOIE un message (défaut 7) et ne couvre que les webhooks                                                |
| 49  | « Réparer » avec diagnostic                        | `ABSENT`  | Seul geste : re-consentir (`connector-cards.tsx:73`)                                                                       |
| 50  | « Modifier les accès »                             | `ABSENT`  | `include_granted_scopes=true` existe côté Google (`google.service.ts:255`) mais aucun chemin ne demande UNE portée en plus |
| 51  | « Déconnecter » + **jetons révoqués**              | `PARTIEL` | Modal absent, révocation absente (défaut du §1, `google.service.ts:806`)                                                   |

### §7 — Import et migration (p.6-8)

| #   | Exigence                                       | Statut    | Preuve / ce qui manque                                                                                                                                                |
| --- | ---------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 52  | Dry-run obligatoire avant écriture             | `PARTIEL` | Existe (`sync.ts:97` défaut `true`, `import-contacts-csv.dto.ts:15` défaut `false`) mais **rien ne l'IMPOSE**                                                         |
| 53  | Les 12 sources                                 | `PARTIEL` | 2 : contacts CSV et HubSpot (`crm-sources.ts:8-17`)                                                                                                                   |
| 54  | Ordre imposé                                   | `ABSENT`  | `SYNC_ENTITY_TYPES` ne connaît que `account \| contact` (`sync.ts:30`)                                                                                                |
| 55  | Les 7 étapes                                   | `ABSENT`  | Deux boutons (`CrmImportPanel.tsx:44-55`), une modale (`ImportContactsDialog.tsx:77`)                                                                                 |
| 56  | Carte par source + fichier modèle              | `ABSENT`  | —                                                                                                                                                                     |
| 57  | Détection encodage / séparateur / date         | `PARTIEL` | Séparateur ✅, en-têtes accentués ✅, BOM côté web seul. **Windows-1252 absent** (`ImportContactsDialog.tsx:83` décode en UTF-8 en dur) ; aucun parseur de date       |
| 58  | Mapping modifiable et enregistrable            | `ABSENT`  | Alias figés en dur (`csv-import.ts:115-123`)                                                                                                                          |
| 59  | Normalisation visible et désactivable          | `PARTIEL` | e-mail ✅, domaine ✅, nom ✅. Absents : téléphone E.164, date ISO, montant en centimes, forme juridique. Aucune règle désactivable                                   |
| 60  | Dédup AVANT écriture, jamais sans clic         | `PARTIEL` | `crm-duplicates.ts:64` ✅ et `duplicate_pairs` ✅, mais le balayeur passe APRÈS écriture ; `bulkImportManual` ne dédoublonne que par nom (`contacts.service.ts:2340`) |
| 61  | Rapport de simulation téléchargeable           | `ABSENT`  | La prévisualisation CSV n'est jamais persistée (`accounts.controller.ts:485`)                                                                                         |
| 62  | Instantané avant écriture + annulation         | `ABSENT`  | Prescrit `crm-ats-plan.md:20`, jamais livré                                                                                                                           |
| 63  | La maquette du rapport                         | `ABSENT`  | —                                                                                                                                                                     |
| 64  | Les clés de dédup du §7.6                      | `PARTIEL` | Contacts ✅ (`crm-duplicates.ts`), talents ✅ (`talent-duplicates.ts:26`). Comptes / missions / projets absents                                                       |
| 65  | Annulation 24 h / 7 j                          | `ABSENT`  | —                                                                                                                                                                     |
| 66  | Un objet touché à la main n'est jamais annulé  | `PARTIEL` | La provenance existe et arbitre (`provenance.ts:32`, `crm-import.service.ts:227-232`) mais aucun rollback ne la consomme                                              |
| 67  | Pagination · débit · **curseur** · `sync_link` | `PARTIEL` | Pagination ✅ ; retry throttle câblé **sur Google seul** (`concurrency.ts:100`) ; curseur non persisté ; `sync_links` jamais inséré (défaut 9)                        |
| 68  | La sortie progressive en 4 phases              | `ABSENT`  | —                                                                                                                                                                     |
| 69  | Source de vérité champ par champ               | `PÉRIMÉ`  | `field_provenance` arbitre déjà `human > connector > pipeline > model` (`provenance.ts:32`) — **D62**                                                                 |

### §8 — Sécurité (p.8)

| #   | Exigence                                  | Statut    | Preuve / ce qui manque                                                                                                      |
| --- | ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 70  | Le socle « en place »                     | `PARTIEL` | 6/9 vrais. PKCE = Salesforce seul, révocation = aucune, isolation = fausse pour la messagerie                               |
| 71  | Appartenance explicite                    | `PARTIEL` | Déclarée au catalogue (`tool-catalog.ts:96-97`), **jamais appliquée en base** — **D58**                                     |
| 72  | Journal d'accès par connecteur            | `ABSENT`  | `integration_deliveries` journalise des ENVOIS, `last_used_at` est un horodatage écrasé                                     |
| 73  | Alerte de portée retirée, une fois        | `ABSENT`  | La routine existe et ne notifie jamais (défaut 8) ; `scope` n'est pas remis à jour au refresh (`google.service.ts:334-341`) |
| 74  | Expiration des demandes d'écriture (21 j) | `PÉRIMÉ`  | 3 jours partout (`workflow-runner.service.ts:50`, `ats-write.service.ts:38`) — 21 j contredirait le §4.4 du PDF lui-même    |

### §9 — Les 6 pièges (p.8)

| #   | Exigence                                   | Statut    | Preuve / ce qui manque                                                               |
| --- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| 75  | Agenda vide → test réel                    | `PARTIEL` | Détecté à la lecture, pas au statut (item 19)                                        |
| 76  | CRM 500 → 503 qui nomme le geste           | `PARTIEL` | Fait pour le CRM, jamais généralisé à Google (défaut 4)                              |
| 77  | Toute liste vide qualifiée                 | `ABSENT`  | (item 11)                                                                            |
| 78  | Buster de version sur tout cache persisté  | `PARTIEL` | Premier étage ✅ (`App.tsx:72`), **second étage sans buster** (défaut 10)            |
| 79  | Concurrence bornée + retry                 | `PARTIEL` | Outillage bon (`concurrency.ts:20`, `:100`), câblé **sur Google seul**               |
| 80  | Check-list opérateur avant ajout de portée | `ABSENT`  | Action opérateur ouverte depuis le 16/08 (`recette-connecteurs-2026-08-16.md:56-59`) |

### §10 — Le bandeau (p.9)

| #   | Exigence                                                 | Statut    | Preuve / ce qui manque                                                                                                 |
| --- | -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 81  | Un seul bandeau, action nommée, repli, sans rechargement | `PARTIEL` | `CapabilityBanner.tsx:26` monté sur **2 écrans** ; 11 bandeaux faits main subsistent ; « un seul par écran » non gardé |

### §11 — Les tickets (p.9-11)

| #   | Exigence                                | Statut    | Preuve / ce qui manque                                             |
| --- | --------------------------------------- | --------- | ------------------------------------------------------------------ |
| 82  | PR1 601 — la garde d'abord              | `ABSENT`  | Lot A                                                              |
| 83  | PR2 601 — `capabilities[]` au contrat   | `ABSENT`  | Lot D                                                              |
| 84  | PR3 601 — `POST /tools/:id/test`        | `ABSENT`  | Lot E                                                              |
| 85  | PR4 601 — `GET /tools/:id/repair`       | `ABSENT`  | Lot F                                                              |
| 86  | PR5 601 — l'écran                       | `PARTIEL` | Lot H                                                              |
| 87  | PR6 601 — `CapabilityBanner`            | `PARTIEL` | Lot H                                                              |
| 88  | PR7 601 — garde nom de fournisseur      | `PARTIEL` | Lot M                                                              |
| 89  | Buster de cache                         | `PARTIEL` | Lot K                                                              |
| 90  | T1→T5 de 601                            | `ABSENT`  | Lots A, D, E, I                                                    |
| 91  | Les 5 interdits de 601                  | `PARTIEL` | 2 violés aujourd'hui : état global, test destructif                |
| 92  | BEL-INT-602 — l'assistant               | `ABSENT`  | Lot L                                                              |
| 93  | 602 PR1 — refus sans dry-run            | `ABSENT`  | Lot L                                                              |
| 94  | 602 PR2 — contrat `import.ts`           | `ABSENT`  | Lot L                                                              |
| 95  | 602 PR3 — ordre imposé                  | `ABSENT`  | Lot L                                                              |
| 96  | 602 PR4 — dédup avant écriture          | `PARTIEL` | Lot L                                                              |
| 97  | 602 PR5 — rollback qui exclut `human`   | `ABSENT`  | Lot L                                                              |
| 98  | 602 PR6 — l'assistant web               | `ABSENT`  | Lot L                                                              |
| 99  | 602 T1→T6                               | `ABSENT`  | Lot L                                                              |
| 100 | Les 4 interdits de 602                  | —         | Respectés par construction : le lot L n'écrit pas de second moteur |
| 101 | Réutiliser `sync_*` et l'instantané     | `PARTIEL` | Les 3 tables existent, l'instantané n'existe pas                   |
| 102 | BEL-INT-603 — écriture CRM gouvernée    | `ABSENT`  | Lot N                                                              |
| 103 | BEL-INT-604 — appartenance + garde i18n | `PARTIEL` | Lot J ; garde FR seulement (`no-overpromise.test.ts:106`)          |
| 104 | BEL-INT-605 — santé quotidienne         | `PARTIEL` | Lot K — la routine existe et ne notifie jamais                     |

---

## 3. Les lots d'implémentation

Ordonnés par dépendance. Le lot A est rouge d'abord, comme l'exige le ticket.

| Lot | Titre                                         | Ce qu'il ferme                                          |
| --- | --------------------------------------------- | ------------------------------------------------------- |
| A   | **La garde d'abord**                          | 82, 90 (T2) — les 3 cas du 16/08 rouges avant tout code |
| B   | **Le contrat d'erreur de connecteur**         | 8, 9, 25, 76, défauts 3-4-5-6                           |
| C   | **Une liste vide est toujours qualifiée**     | 7, 11, 29, 77                                           |
| D   | **L'état par CAPACITÉ**                       | 1, 3, 4, 5, 6, 83, 91, défauts 1-2                      |
| E   | **La preuve, et un test qui ne casse rien**   | 44, 48, 84, 90 (T3), défaut 7                           |
| F   | **Réparer, et les automatisations bloquées**  | 41 (partie), 49, 85                                     |
| G   | **GA-07 : `resolveBlockers` lit le registre** | −3 imports (233 → 230), rendu sûr par le lot D          |
| H   | **L'écran, et le pré-consentement**           | 14, 41, 43, 46, 50, 86, 87, 81                          |
| I   | **Déconnecter honnête**                       | 51, 90 (T4), défaut du §1                               |
| J   | **L'appartenance des connecteurs**            | 45, 71, 103, **défaut 12**                              |
| K   | **La santé qui notifie, et le cache**         | 73, 78, 89, 104, défauts 8 et 10                        |
| L   | **L'assistant d'import**                      | 52→67, 92→101, défaut 9                                 |
| M   | **Les noms de fournisseur qui fuient**        | 31, 32, 88, défaut 11                                   |
| N   | **L'écriture CRM gouvernée**                  | 24, 102                                                 |

---

## 4. Les décisions de Louis (21/08/2026)

⚠️ **Collision de numérotation.** Le PDF 7 pose ses questions sous D6, D26, D34, D35, D36, D37 —
six numéros **déjà pris** (D6 par le PDF 1, D26 par le PDF 4, D34→D37 par le PDF 5). Renumérotées
**D58 → D63** ici. Le tableau dit à quel numéro du PDF chacune correspond.

| ID  | PDF | Question                              | Décision                                                                                                                                                                                                                                                                                                                                                    |
| --- | --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D58 | D6  | Appartenance des connecteurs          | **Messagerie, agenda et Notion par UTILISATEUR** (repli sur la ligne d'espace tant qu'un membre n'a pas la sienne, pour ne rien casser). CRM, ATS, téléphonie, signature restent d'espace. Ce n'était pas un arbitrage produit mais un **défaut** : `getValidAccessToken` rendait le jeton déchiffré d'un collègue.                                         |
| D59 | D26 | Export Factur-X / UBL / CII           | **Reconduit REFUS** (= D32 du PDF 5). Bellum n'émet aucune facture, donc n'a rien à conformer. L'échéance du 01/09/2026 porte sur la RÉCEPTION par les entreprises.                                                                                                                                                                                         |
| D60 | D36 | Airtable et CVthèques externes        | **Import CSV, pas de connecteur.** Airtable exporte en CSV ; le lot L le couvre par la source « CRM générique ». Les CVthèques restent refusées (= D25 du PDF 4).                                                                                                                                                                                           |
| D61 | D34 | Clic-to-call                          | **Non.** Le dépôt ne l'a jamais eu et ne l'aura pas : il transforme le produit en softphone et déplace l'attente de l'utilisateur.                                                                                                                                                                                                                          |
| D62 | D35 | Source de vérité champ par champ      | **PÉRIMÉ — `field_provenance` arbitre déjà** (`human > connector > pipeline > model`, `provenance.ts:32`). Une table éditable par espace qui contredirait la provenance créerait **deux vérités sur le même champ**, et c'est la provenance qui gagnerait en silence.                                                                                       |
| D63 | D37 | Portée d'envoi d'emblée ou séparément | **Séparément, mais dans cet ordre** : « Modifier les accès » d'abord (lot H), retrait de l'envoi des défauts ensuite. L'ordre inverse laisserait un utilisateur devant « Envoyer » sans aucun chemin pour débloquer.                                                                                                                                        |
| —   | —   | Portée du lot d'import                | **Les 12 sources d'un coup.** Tenu par un moteur DÉCLARATIF : une source est un descripteur (alias de colonnes, champs obligatoires, clés de dédup, objet cible), pas un parseur écrit à la main. Douze parseurs manuels produiraient douze bugs.                                                                                                           |
| —   | —   | Écriture CRM gouvernée                | **Toutes les écritures CRM.** Prévisualisation figée + décision explicite, y compris pour poser une note. Réserve soulevée et tranchée : les écritures déclenchées en FOND (téléphonie → note, réflexion réseau) deviennent des demandes **en attente** au lieu de partir seules. Le demandeur peut décider lui-même — c'est son CRM, pas la paie de l'ESN. |
| —   | —   | Expiration d'une demande d'écriture   | **3 jours, pas 21.** Le PDF demande 21 j au §8 et écrit au §4.4 qu'« approuvée trois semaines plus tard, elle écrirait un état que plus personne n'a en tête ». Il se contredit ; le dépôt a déjà 3 j partout (`workflow-runner.service.ts:50`, `ats-write.service.ts:38`).                                                                                 |
| —   | —   | Le bouton « Tester » actuel           | **Renommé, pas supprimé.** Pour un webhook il n'existe AUCUNE lecture non destructive : la seule preuve est une livraison. Il devient « Envoyer un message de test » et DIT qu'il envoie ; le `POST /tools/:provider/test` non destructif vit à côté, pour les connecteurs qui savent lire.                                                                 |
| —   | —   | Révocation au « Déconnecter »         | **Là où le fournisseur la documente** (Google, HubSpot, Salesforce, Pipedrive), et le modal NOMME ce qui n'est pas révocable (Microsoft n'a pas d'endpoint de révocation par application ; Notion et Attio non plus). Promettre une révocation qu'on ne fait pas serait pire que ne rien promettre.                                                         |

---

## 5. Ce qui est parti en production

Branche `feat/pdf7-integrations-connecteurs`, neuf commits.

| Lot | Livré                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| A   | `connector-error.spec.ts` — les trois messages fournisseur EXACTS du 16/08, relevés dans les logs Railway, rejoués        |
| B   | `connector-error.ts` (contrat) + `common/connector-error.ts` — cinq codes fermés, la portée NOMMÉE, `code` ET `reason`    |
| C   | `connectorSearchResult` sur **neuf** routes qui rendaient un tableau nu ; garde **GA-10**                                 |
| D   | `capabilities[]` par outil, dérivées des portées RÉELLES ; `scope_missing` et `untested` en fin d'énumération             |
| E   | `POST /tools/:provider/test` non destructif + table `connector_capability_probes`                                         |
| F   | `GET /tools/:provider/repair` — portée, pourquoi, geste, automatisations bloquées, ce qu'on ne fera jamais                |
| H   | Panneau de diagnostic sur les cartes + **écran de pré-consentement** avant la redirection OAuth                           |
| I   | Révocation côté fournisseur (Google, HubSpot) ; Microsoft dit pourquoi il ne peut pas                                     |
| J   | `findPersonalConnection` — la boîte mail redevient personnelle ; « Déconnecter » ne touche que la sienne                  |
| K   | `connector_health` en `continuous` (elle n'avait jamais notifié) · portées remises à jour au refresh · buster du 2ᵉ cache |
| L   | `/settings/import` — 12 sources, moteur pur, simulation obligatoire, ordre imposé, dédup avant écriture                   |
| M   | `hunter`/`lusha`/`demo` traduits · `log_to_crm` ne nomme plus l'éditeur · **`@bellum/mcp` branché en CI**                 |
| N   | `outbound_write_requests` — toute écriture CRM passe par une prévisualisation figée                                       |

**Lot G non fait, et pourquoi.** Le refactor de `resolveBlockers` devait rendre
3 places à GA-07. Le blocage n'est pas le registre : c'est que l'entrée
`microsoft` du catalogue conflate TROIS capacités (messagerie, agenda,
documents) sous un seul `provider`, là où Google en a trois. Le registre ne sait
donc pas répondre « l'agenda est-il lisible ? » pour Microsoft. Découper cette
entrée est la bonne chose à faire — le PDF 7 les liste d'ailleurs comme trois
connecteurs distincts — mais elle touche l'écran, le digest du copilote et la
vue opérateur : c'est un chantier à elle, pas un effet de bord d'un refactor de
routine. **GA-07 reste à 233, inchangé.**

### Les défauts corrigés, et leur preuve

| #   | Défaut                                                       | Preuve du correctif                                                     |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | 3 des 8 états inatteignables                                 | `tool-registry.service.spec.ts` — `limited_write` et `read_only` testés |
| 2   | `writesGranted` venait du catalogue                          | `writeCapabilitiesGranted` lit les portées accordées                    |
| 3   | Le `reason` n'atteignait pas le navigateur                   | `code` posé, miroir testé sur les cinq valeurs                          |
| 4   | Google Drive rendait un 500 générique                        | `google.service.spec.ts` — 503 + portée nommée, zéro appel réseau       |
| 5   | Garde Microsoft sensible à la casse                          | `hasScope` au lieu de `granted.has`                                     |
| 6   | `Files.Read.All` absente des défauts, contrairement à la doc | `tool-capabilities.spec.ts` le CONSTATE et le dira le jour où ça change |
| 7   | « Tester » envoyait un vrai message                          | Renommé et déclaré ; le test non destructif vit à côté                  |
| 8   | La routine de santé n'a jamais notifié                       | `routines.service.spec.ts` — la notification part                       |
| 9   | `sync_links` jamais inséré                                   | **NON corrigé** — voir ci-dessous                                       |
| 10  | 2ᵉ cache sans buster                                         | `query-snapshots.ts` porte la version de build                          |
| 11  | Noms de fournisseur en clair                                 | `enum-keys.test.ts` exige la clé pour CHAQUE source                     |
| 12  | Boîte mail lisible par les collègues                         | `personal-connection.spec.ts` — 5 tests                                 |

### Ce qui reste ouvert

- **Défaut n°9 — `sync_links` jamais inséré.** La reprise CRM ne pose aucun lien,
  donc l'anti-doublon par `external_id` ne s'amorce jamais et chaque import
  re-décide par e-mail. Corriger demande de trancher ce qu'on fait des lignes
  `create` (aujourd'hui abandonnées, délibérément), ce qui est une décision
  produit sur la reprise CRM et non sur l'import de fichier.
- **L'écriture d'import est branchée pour les COMPTES et les CONTACTS.** Les dix
  autres objets se simulent et refusent l'écriture PAR LEUR NOM. Ce ne sont pas
  les plus faciles qui ont été faits : ce sont ceux dont la reprise détruit le
  plus.
- **Le découpage de l'entrée `microsoft`** (cf. lot G).
- **Les 21 jours d'expiration** du §8 : le dépôt garde 3 jours, et le §4.4 du PDF
  lui-même donne la raison.

---

## 6. Ce que la recette live a trouvé

Trois défauts, tous invisibles aux **14 038 tests verts** qui ont précédé le
merge. Les trois sont d'une famille que les tests ne peuvent pas atteindre : ils
n'apparaissent qu'entre deux versions déployées, ou dans une base réelle.

### 1. L'écran écrasé pendant la fenêtre de déploiement

`/integrations` rendait « Oups, une erreur inattendue est survenue ». Pas
dégradé — ÉCRASÉ.

Vercel déploie en une minute, Railway en dix. Entre les deux, le navigateur
exécute du code NEUF contre une réponse ANCIENNE. `capabilities` venait d'être
ajouté au contrat comme champ **obligatoire** ; il n'était donc pas dans la
réponse, et `tool.capabilities.length` levait sur `undefined`.

Rien ne pouvait l'attraper : le contrat le déclare obligatoire, mais `apiFetch`
type par **assertion** — il ne valide aucune réponse. Le type ment, et le
compilateur ne voit rien. Même mécanisme que « même nom, forme différente » du
PDF 1.

**Règle** : tout champ AJOUTÉ à une réponse d'API se lit avec un repli côté web.
Le test monte le composant avec la réponse d'AVANT le déploiement, et il tombe
sans le correctif — vérifié en le retirant.

### 2. L'assistant d'import restait muet

`/import/sources` rendait 404 (l'API n'était pas déployée) et l'écran affichait
sa phrase d'introduction et **rien d'autre**. Un écran vide et muet se lit « il
n'y a aucune source », pas « je n'ai pas pu regarder ».

C'est exactement ce que le PDF 7 combat, glissé dans l'écran qui le corrige. Le
cas d'échec ne vient d'ailleurs pas que du déploiement : une API injoignable ou
une permission `data:export` absente produisent le même écran. `isLoading` et
`isError` sont désormais LUS.

### 3. Une migration qui RÉTRÉCIT une contrainte bloque tout le déploiement

**C'est le défaut le plus coûteux du chantier, et il a coûté une heure.**

La migration ajoutant `imported` aux statuts de compte recopiait sa liste depuis
`1779200000000` — périmée : `1783000000000` y avait ajouté `archived` et
`deleted` depuis. Élargir d'un côté, rétrécir de l'autre. Le `ADD CONSTRAINT`
échouait donc sur les lignes portant ces valeurs.

Or `migration:run:prod` est le **`preDeployCommand`** de Railway
(`apps/api/railway.json`). Son échec **ABANDONNE le déploiement** : l'ancienne
version reste en ligne, `/version` continue d'annoncer l'ancien commit, et rien
dans l'application ne le dit. On cherche une panne applicative alors que le
nouveau code n'a jamais démarré.

⚠️ **Le signal à lire** : le service IA se déployait pendant que l'API restait
bloquée. L'IA n'a pas de `preDeployCommand`. Quand `/version` montre `ia` à jour
et `api` en retard, c'est une MIGRATION, pas un build.

**Garde GA-11** (`architecture/check-constraints-additive.spec.ts`) : pour un
même nom de contrainte, chaque liste successive doit être un SUR-ENSEMBLE de la
précédente, et le message nomme la migration dont il faut reprendre la liste.
GA-08 gèle les taxonomies TypeScript ; personne ne lisait les `CHECK` SQL — alors
que c'est la moitié la plus dangereuse : une valeur retirée du TypeScript casse
une compilation, une valeur retirée d'un `CHECK` casse un déploiement.

### 4. La carte Google Workspace n'affichait aucun diagnostic

Un grand vide là où les six autres cartes montrent leurs capacités, leurs preuves
datées et leurs boutons — sur la carte la plus utilisée de l'écran.

Sa structure diffère des autres : elle rend sa propre grille au lieu du composant
partagé, si bien que le remplacement qui a monté les six autres ne l'a jamais
touchée. Et **la garde n'a rien dit** : `wired-write-paths` vérifie qu'un
composant a AU MOINS un appelant, et elle passait au vert avec six montages
pendant que le septième manquait. Une garde qui compte « au moins un » ne dit
rien de ce qui manque.

Nouvelle garde (`diagnostics-mounted.test.ts`) : recevoir `tools` est une
PROMESSE de les afficher. Vérifiée en retirant le montage — elle nomme
`GoogleWorkspaceCard`.

### 5. La simulation promettait des créations que l'écriture ne faisait pas

**Le défaut le plus grave de l'écran d'import, et il touchait sa raison d'être.**

Le rapport annonçait « 2 créations », l'import répondait « 0 créé », et rien ne
disait pourquoi : les sociétés étaient inconnues de l'espace, donc l'écriture
écartait tout en `unknown_company`. La propriété centrale du §7 tombait — une
simulation qui ne rejoue pas exactement ce que fera l'import ne prouve rien, et
c'est pourtant elle qui autorise l'écriture.

Le moteur reçoit désormais les sociétés connues. `undefined` veut toujours dire
« je ne sais pas » : écarter des lignes sur une ignorance produirait un rapport
plus faux que celui qu'on corrige. Et l'écran DIT ce qui a été écarté.

Vérifié en production après correctif : **1 création prédite / 1 créée, 1 écartée
prédite / 1 écartée.**

### Ce que la recette a VÉRIFIÉ

| Écran                                        | Résultat                                                              |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `/integrations`                              | ✅ après correctif — cartes par famille, capacités, comptes connectés |
| `/settings/import`                           | ✅ route servie, entrée de nav présente, états dégradés dits          |
| `/briefing` (Ma journée)                     | ✅ agenda, messagerie, relances                                       |
| `/dashboard`, `/accounts`                    | ✅                                                                    |
| `/consultants`, `/projects`                  | ✅                                                                    |
| `/missions/board`, `/actions`                | ✅                                                                    |
| `/pilotage`, `/chat`                         | ✅                                                                    |
| `/settings/routines`, `/settings/catalogues` | ✅                                                                    |
