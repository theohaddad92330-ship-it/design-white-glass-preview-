# Registre des activités de traitement (RGPD art. 30) — BellumAI

> **Rédigé le 11/10/2026, non relu par un juriste — décision de Louis** (épopée #4016, lot L14 : « Claude rédige
> les pièces RGPD, on allume les leviers SANS relecture juridique »). Ce n'est pas un avis juridique : c'est la
> description de ce que le code FAIT (ou de ce que #4016 a décidé qu'il ferait), rangée dans la forme de l'art. 30.
>
> **Reste à compléter par Louis** (balisé ⟦À COMPLÉTER⟧ dans le texte) : désignation formelle d'un DPO auprès de la
> CNIL ou non ; choix du fournisseur sous contrat pour les
> changements de poste (L2) ; localisation de plusieurs sous-traitants (colonne « à confirmer ») ; signature des DPA
> (liste : [`dpa-a-signer.md`](dpa-a-signer.md)) ; qualification responsable / sous-traitant / responsables conjoints
> pour la base de contacts (§ A3) ; analyse d'impact (AIPD) pour les traitements marqués **AIPD probable**.

Pièces sœurs, dans ce même dossier (un seul emplacement juridique, GA-26) :

| Pièce                                                 | Fichier                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Politique de confidentialité publiée (FR, EN, DE, NL) | `apps/website/src/app/[locale]/privacy/page.tsx` → `/privacy` du site        |
| Politique de rétention (détail des balayages)         | [`privacy-retention-policy.md`](privacy-retention-policy.md)                 |
| Modèle de DPA client (Bellum sous-traitant)           | [`dpa.md`](dpa.md) + `/dpa` du site                                          |
| Note salariés / CSE + clause client (adoption)        | [`note-cse-adoption-par-commercial.md`](note-cse-adoption-par-commercial.md) |
| Mentions : enregistrement d'appel, destinataires      | [`mentions-information.md`](mentions-information.md)                         |
| DPA à signer avec nos sous-traitants                  | [`dpa-a-signer.md`](dpa-a-signer.md)                                         |

---

## 0. Identité

| Rubrique                       | Valeur                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Responsable de traitement      | BELLUM, SASU au capital de 1 000 €, 931 750 681 R.C.S. Paris, 90 rue des Archives, 75003 Paris |
| Représentant légal             | ⟦À COMPLÉTER — nom du président de la SASU⟧                                                    |
| Contact protection des données | `dpo@bellum-it.com` (adresse publiée sur `/privacy`)                                           |
| DPO désigné auprès de la CNIL  | ⟦À COMPLÉTER — oui (n° de désignation) / non (alors « référent RGPD », pas « DPO »)⟧           |
| Tenue du registre              | Ce fichier, versionné dans le dépôt ; chaque traitement neuf s'y ajoute avec son lot           |

## 1. Comment lire ce registre

- **Deux rôles.** Bellum est **responsable** des traitements de la partie A (il en fixe la finalité) et
  **sous-traitant** de l'ESN cliente pour ceux de la partie B (art. 30-2 : catégories de traitements effectués pour
  le compte du client, qui reste responsable de leur licéité).
- **Statut.** `EN SERVICE` = le code existe sur `integration/rc-11-10` au 11/10/2026. `#4016 Lx` = levier allumé par
  la décision de Louis du 11/10, livré par un autre lot de l'épopée : la ligne décrit la **règle décidée** ; les
  mesures qu'elle cite sont à vérifier dans le code à la livraison du lot (elles ne sont pas affirmées ici comme
  codées).
- **Durées.** Elles viennent du code, jamais d'une estimation : `PrivacyRetentionService.getRetentionPolicy()`
  (`apps/api/src/modules/privacy/privacy-retention.service.ts`, lue aussi par `GET /privacy/retention`), et les
  constantes de `@bellum/contracts` citées. Une durée marquée **non appliquée** est publiée mais aucune routine ne
  l'exécute encore — c'est un écart, listé au § E.
- **Sous-traitants.** Le registre interne les nomme (art. 30-1-d). Le texte public ne cite que des CATÉGORIES
  (« fournisseur de modèle d'IA », « hébergeur »…) : nos fournisseurs ne se nomment pas à l'écran (c19, c66).
- **Transferts hors UE.** « Oui » = un sous-traitant établi hors UE/EEE reçoit les données ; l'encadrement attendu
  (décision d'adéquation dont le Data Privacy Framework UE-États-Unis, ou clauses contractuelles types) est celui que
  le DPA du fournisseur doit contenir — à vérifier à la signature ([`dpa-a-signer.md`](dpa-a-signer.md)).

---

## Partie A — Bellum responsable de traitement (art. 30-1)

### A1. Comptes utilisateurs, authentification et sessions — `EN SERVICE`

| Rubrique           | Contenu                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Créer et gérer le compte, authentifier, sécuriser l'accès (sessions par appareil, plafond d'appareils, 2FA)                                                                                                                                                           |
| Base légale        | Contrat (6-1-b) ; sécurité de l'accès : intérêt légitime (6-1-f)                                                                                                                                                                                                      |
| Personnes          | Utilisateurs des ESN clientes (commerciaux, managers, administrateurs d'espace)                                                                                                                                                                                       |
| Données            | Nom, prénom, e-mail professionnel, avatar, employeur, rôle dans l'espace, questionnaire ESN ; sessions-appareils (IP, user-agent, dates) ; secret TOTP chiffré                                                                                                        |
| Destinataires      | Personnel habilité de Bellum ; hébergeur de base de données et d'authentification (Supabase) ; hébergeur applicatif (Railway, Vercel)                                                                                                                                 |
| Transferts hors UE | Base : non (Supabase eu-west-1). Hébergement applicatif Railway : non (europe-west4, Pays-Bas) ; Vercel : oui (société US)                                                                                                                                            |
| Durées             | Compte : durée du contrat ; compte sans connexion depuis 3 ans = candidat à la clôture (`inactive_account`, 1 095 j, **exécution manuelle**) ; sessions révoquées : 90 j (`revoked_sessions`, purgées) ; tombstone d'un compte supprimé : 30 j (`anonymized_records`) |
| Mesures            | § D1, D2, D3                                                                                                                                                                                                                                                          |

### A2. Facturation, abonnements, crédits — `EN SERVICE`

| Rubrique           | Contenu                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Facturer l'abonnement, tenir le journal des crédits, rembourser les crédits débités à tort (c78)                                                                     |
| Base légale        | Contrat (6-1-b) ; obligation légale comptable (6-1-c)                                                                                                                |
| Personnes          | Utilisateurs payeurs, administrateurs d'espace                                                                                                                       |
| Données            | Plan, identifiants client/abonnement du prestataire de paiement, factures, mouvements de crédits. **Aucune donnée de carte chez Bellum**                             |
| Destinataires      | Prestataire de paiement (Stripe)                                                                                                                                     |
| Transferts hors UE | Oui (Stripe, groupe US)                                                                                                                                              |
| Durées             | Journal des crédits : 10 ans, pseudonymisé à la suppression du compte (`credit_ledger`, 3 650 j, **non purgé**) ; factures : 10 ans chez le prestataire (`invoices`) |
| Mesures            | § D1 ; journal append-only ; anonymisation à la suppression du compte (`privacy-deletion.service.ts`)                                                                |

### A3. Constitution de la base de contacts professionnels B2B à partir de sources publiques — `EN SERVICE`

| Rubrique           | Contenu                                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Identifier, pour un compte cible, les interlocuteurs pertinents d'une prospection B2B (dossier de conquête, organigramme)                                                                                                                                                                             |
| Base légale        | Intérêt légitime (6-1-f) — prospection B2B, données strictement professionnelles. **Qualification à trancher** : Bellum responsable (base propriétaire, c'est ce que dit `/privacy`) ou sous-traitant de l'ESN (c'est ce que dit `dpa.md`) ou responsables conjoints (art. 26). ⟦À COMPLÉTER — Louis⟧ |
| Personnes          | Décideurs et salariés des entreprises ciblées (contacts professionnels)                                                                                                                                                                                                                               |
| Données            | Nom, prénom, fonction, entreprise, coordonnées professionnelles publiées, profil professionnel public, actualité professionnelle publique. **Jamais** : date de naissance (c37), critère protégé (c58), donnée art. 9                                                                                 |
| Sources            | Registres et autorités (INSEE, INPI, BODACC, BOAMP, DECP, France Travail, registres BE/LU/CH), sites des entreprises, presse, moteurs de recherche, annuaires et offres d'emploi publics                                                                                                              |
| Destinataires      | Utilisateurs de l'espace demandeur ; fournisseur de modèle d'IA (analyse) ; prestataires de collecte web et de recherche (Firecrawl, Brave, Serper, Tavily) ; hébergeurs                                                                                                                              |
| Transferts hors UE | Oui (fournisseur de modèle d'IA, prestataires de recherche/collecte US)                                                                                                                                                                                                                               |
| Durées             | Fiche contact : durée de l'espace client ; coordonnées enrichies : archivées (plus affichées ni exportées) 3 ans après le dernier contact ou la dernière activité (`enriched_contact_details`, `ENRICHED_CONTACT_RETENTION_DAYS` = 1 095, balayage `sweepStaleEnrichedContacts`)                      |
| Droits             | Effacement à la demande de la personne (c67/c69) : suppression réelle + empreinte HMAC qui empêche la recollecte (§ A11)                                                                                                                                                                              |
| Mesures            | § D1, D4, D5 ; collecte « large mais propre » (c79) : aucun contournement d'authentification ni d'anti-robot                                                                                                                                                                                          |

### A4. Enrichissement par des fournisseurs de données B2B sous contrat, dont les changements de poste — `EN SERVICE` (cascade) + `#4016 L2` (changements de poste)

| Rubrique           | Contenu                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité           | Obtenir les coordonnées professionnelles d'un contact choisi ; signaler qu'un contact suivi a changé d'entreprise (« ton champion a changé de boîte »)                                                                                                 |
| Base légale        | Intérêt légitime (6-1-f) de l'ESN cliente pour sa prospection B2B ; le fournisseur doit lui-même justifier sa base (clause à exiger dans son DPA)                                                                                                      |
| Personnes          | Contacts professionnels des comptes ciblés ou suivis                                                                                                                                                                                                   |
| Données            | E-mail et téléphone professionnels, poste, entreprise, historique de poste (date et source du changement : « vu le <date>, source <source> », jamais « vérifié »)                                                                                      |
| Destinataires      | Fournisseurs d'enrichissement (cascade : Apollo → SalesQL → Dropcontact → Hunter / Lusha → Kaspr / FullEnrich) ; fournisseur de données professionnelles sous contrat pour les changements de poste ⟦À COMPLÉTER — fournisseur retenu pour L2⟧         |
| Transferts hors UE | Oui (Apollo US ; Lusha Israël — décision d'adéquation ; autres : à confirmer)                                                                                                                                                                          |
| Durées             | Comme A3 (`enriched_contact_details`, 3 ans puis archive)                                                                                                                                                                                              |
| Mesures            | Garde pays AVANT l'appel payant (`ENRICHMENT_ALLOWED_COUNTRIES`) ; vérification de l'empreinte d'effacement à l'entrée de l'enrichissement (une personne effacée n'est jamais ré-enrichie) ; aucun scraping ni automatisation de session LinkedIn (L2) |

### A5. Données estimées et inférées (dont e-mails déduits et vérifiés) — `#4016 L4`

| Rubrique           | Contenu                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Proposer, badgées « estimé », des valeurs que les sources ne donnent pas : e-mail selon le motif de l'entreprise (vérifié par MX/SMTP), organigramme inféré (pointillés), séniorité déduite des années, angle en hypothèse, valeurs suggérées |
| Base légale        | Intérêt légitime (6-1-f) — exactitude (art. 5-1-d) tenue par le badge et la provenance `inferred`, jamais une preuve                                                                                                                          |
| Personnes          | Contacts professionnels                                                                                                                                                                                                                       |
| Données            | E-mail professionnel déduit, rattachement hiérarchique supposé, séniorité estimée. **Aucune inférence** d'un critère protégé (âge, genre, origine… — c58, non négociable) ni de la date de naissance (c37)                                    |
| Destinataires      | Utilisateurs de l'espace ; serveurs de messagerie de l'entreprise du contact (la vérification SMTP interroge leur MX sans envoyer de message)                                                                                                 |
| Transferts hors UE | Non spécifique (dépend de l'hébergeur du MX interrogé)                                                                                                                                                                                        |
| Durées             | Comme A3 ; une valeur estimée corrigée par un humain est remplacée (« une correction humaine gagne toujours »)                                                                                                                                |
| Mesures            | Provenance `inferred` distincte d'une preuve dans `decideFieldWrite` (à vérifier à la livraison L4) ; badge « estimé » à l'écran                                                                                                              |
| Note               | **AIPD probable** si le volume d'e-mails déduits devient massif (critères CNIL : collecte à large échelle + croisement de sources)                                                                                                            |

### A6. Base anonyme commune entre espaces — `EN SERVICE` (c92, lot P05)

| Rubrique           | Contenu                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Mutualiser des COMPTAGES anonymes (issues par cadence/route/priorité, cas gagnés/perdus, signal suivi d'une affaire sous 90 j) coupés par secteur (NAF) et taille INSEE, pour que chaque espace voie « ce qui marche ailleurs »                    |
| Base légale        | Intérêt légitime de Bellum (6-1-f) à améliorer le service — compatibilité de finalité (art. 6-4) à documenter. ⚠️ **Pas d'opt-out** (décision Louis 09/10) : le droit d'opposition (art. 21) s'exerce alors au cas par cas par `dpo@bellum-it.com` |
| Personnes          | Indirectement : utilisateurs et contacts dont les actions alimentent les comptages par espace. **Rien de nominatif ne sort d'un espace**                                                                                                           |
| Données            | Agrégats : comptes par cellule (dimension, secteur, taille, issue). Aucune ligne brute, aucun nom d'espace, de client ni de personne, aucun texte libre (jetons fermés), aucun coût d'accès                                                        |
| Destinataires      | Tous les espaces clients (lecture des agrégats) ; hébergeur de base de données                                                                                                                                                                     |
| Transferts hors UE | Non (calcul en base, eu-west-1)                                                                                                                                                                                                                    |
| Durées             | Tables `shared_*` réécrites chaque nuit (job idempotent 02:41) : elles ne gardent que l'état du jour                                                                                                                                               |
| Mesures            | CHECK SQL `contributing_workspaces >= 3` (sous le seuil : « pas assez de données communes », jamais 0) ; colonnes jetons ; garde GA-43 ; démo jamais mélangée au réel (`is_demo = false`) — `apps/api/src/modules/shared-base/`                    |

### A7. Mesure d'usage du produit (traceur produit) et ses deux exceptions — `EN SERVICE`, interrupteur `VITE_PRODUCT_TRACKER_ENABLED` allumé par `#4016 L8`

| Rubrique           | Contenu                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Savoir quels écrans et parcours sont abandonnés, pour corriger le produit (c64 : on mesure le PRODUIT, jamais la personne)                                                                                                                                                                          |
| Base légale        | Intérêt légitime (6-1-f) — balance des intérêts : brouillon du 15/09 (`.claude/notes/rgpd-quatre-brouillons-2026-09-15.md`, pièce 1). Traceur interne au produit authentifié, sans cookie tiers ; exemption de consentement (art. 82 LIL, mesure d'audience strictement nécessaire) **à confirmer** |
| Personnes          | Utilisateurs du produit                                                                                                                                                                                                                                                                             |
| Données            | Nom d'événement, motif d'écran (`/accounts/$id`, jamais l'identifiant), horodatage, hash de SESSION tourné à 24 h. Aucun `user_id`, aucun `workspace_id`, aucun contenu de champ                                                                                                                    |
| Destinataires      | Interne uniquement. **Aucun rejeu de session, aucune carte de chaleur, aucun outil tiers** (GA-240)                                                                                                                                                                                                 |
| Transferts hors UE | Non                                                                                                                                                                                                                                                                                                 |
| Durées             | 13 mois (`product_analytics_events`, 400 j) — ⚠️ **non appliquée** : aucune routine ne purge encore `product_events` (§ E)                                                                                                                                                                          |
| Mesures            | Plancher de 5 sessions distinctes à la LECTURE (GA-267), aucun contenu (GA-264), rien par espace nommé (GA-266), les deux nombres en un seul endroit (`product-analytics-privacy.ts`, GA-241)                                                                                                       |
| Exception (a)      | Alerte opérateur `espace_a_risque` : nomme un ESPACE client et son score de santé décomposé, jamais une personne ; une fois par 7 jours au plus ; jamais vers le client. Base : intérêt légitime (fidélisation)                                                                                     |
| Exception (b)      | `laura_unrouted_intents` : demande que Laura n'a pas su router, masquée (e-mails, téléphones, secrets, IBAN) et tronquée à 300 caractères, sans utilisateur ni espace ; **purgée à 90 j** (`laura_unrouted_intents`, balayage actif) ; lecture au-dessus de 5 occurrences                           |

### A8. Mesure d'audience du site public — `EN SERVICE`

| Rubrique           | Contenu                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Finalité           | Mesurer l'audience et la performance de `www.bellum-ai.com`                                                      |
| Base légale        | Consentement (6-1-a, art. 82 LIL) — bandeau du site                                                              |
| Personnes          | Visiteurs du site                                                                                                |
| Données            | Pages vues, provenance, performances de chargement (détail par outil sur `/cookies`)                             |
| Destinataires      | Plausible Analytics, Vercel Web Analytics, Vercel Speed Insights (nommés sur `/cookies` et `/privacy` — art. 82) |
| Transferts hors UE | Vercel : oui ; Plausible : non (société UE)                                                                      |
| Durées             | 13 mois au plus (cookies et traceurs, `/privacy`)                                                                |
| Mesures            | Chargement derrière la porte de consentement (garde `tracker-disclosure.test.ts`)                                |

### A9. Notifications et alertes par e-mail et SMS — `EN SERVICE` (e-mail, SMS France) + `#4016 L12` (alertes Découvrir allumées, SMS BE/CH/LU)

| Rubrique           | Contenu                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité           | Prévenir l'utilisateur : alertes urgentes, alertes des recherches enregistrées de Découvrir, e-mails de service, lettre « Nouveautés »                                                                                                                                                                                                                             |
| Base légale        | E-mails de service (crédits, sécurité) : contrat (6-1-b). Alertes Découvrir et SMS : **consentement** (6-1-a), prouvé par une DATE (`saved_views.alert_consent_at`, prédicat `isQualifiedOutboundConsent` — `null`, illisible ou future = refus). Lettre « Nouveautés » : consentement (case non précochée depuis `1792800260000-NotificationOutboundDefaultsOff`) |
| Personnes          | Utilisateurs                                                                                                                                                                                                                                                                                                                                                       |
| Données            | E-mail, numéro de mobile (vérifié par code), préférences, contenu de l'alerte (titre, jamais de donnée sensible)                                                                                                                                                                                                                                                   |
| Destinataires      | Prestataire d'e-mail transactionnel (Resend) ; prestataire SMS (MessageBird / Bird, société néerlandaise)                                                                                                                                                                                                                                                          |
| Transferts hors UE | E-mail : oui (Resend US) ; SMS : non déclaré (société UE — à confirmer dans le DPA)                                                                                                                                                                                                                                                                                |
| Durées             | Préférences : durée du compte                                                                                                                                                                                                                                                                                                                                      |
| Mesures            | Sans clé = no-op strict (`SMS_PROVIDER_API_KEY`, `RESEND_API_KEY`) ; liste blanche d'indicatifs `SMS_ALLOWED_COUNTRY_CODES` (défaut `33`) ; interrupteur `DISCOVER_ALERT_DISPATCH_ENABLED` ; rien ne part d'une salle de démo ; webhook de rebond signé, refusé sans secret (`RESEND_WEBHOOK_SECRET`, 503)                                                         |
| Écart              | Lignes `weekly_digest = true` héritées d'un ancien défaut SQL, jamais cochées : leur sort (remise à `false`) est à décider (§ E)                                                                                                                                                                                                                                   |

### A10. Sécurité, journaux et supervision — `EN SERVICE`

| Rubrique           | Contenu                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Détecter et diagnostiquer les erreurs et les abus, tracer les accès opérateurs, superviser la qualité des réponses de l'IA                                                                                                                                                                                                                                                                                            |
| Base légale        | Intérêt légitime (6-1-f) ; obligation de sécurité (art. 32)                                                                                                                                                                                                                                                                                                                                                           |
| Personnes          | Utilisateurs ; opérateurs Bellum                                                                                                                                                                                                                                                                                                                                                                                      |
| Données            | Journaux applicatifs caviardés ; traces d'erreur avec identifiant de corrélation ; traces d'appels au modèle (contenu masqué : e-mails, téléphones, secrets ne sortent jamais) ; journal d'accès et d'audit du back-office                                                                                                                                                                                            |
| Destinataires      | Supervision d'erreurs (Sentry) ; observabilité des appels au modèle (Langfuse) ; hébergeur (journaux Railway) ; métriques d'infrastructure CI (Grafana Cloud — aucune donnée client)                                                                                                                                                                                                                                  |
| Transferts hors UE | Sentry : selon le DSN (UE si `*.ingest.de.sentry.io`, sinon États-Unis) ; Langfuse : non par défaut (`cloud.langfuse.com`, région UE — sauf `LANGFUSE_HOST`)                                                                                                                                                                                                                                                          |
| Durées             | Journaux applicatifs 30 j (`application_logs`, appliqué par l'hébergeur) ; traces du modèle 90 j (`observability_traces`, réglé chez le fournisseur) ; accès back-office 365 j (`backoffice_access`, purgé) ; audit back-office 24 à 36 mois selon la catégorie, suppressions permanentes (`BACKOFFICE_AUDIT_RETENTION_MONTHS`) ; fenêtres de capture brute support : 7 j recommandés (`support_raw_capture_windows`) |
| Mesures            | Caviardage dans le puits des journaux (`apps/api/src/common/observability-privacy.ts`) ; masquage AVANT export des traces ; capture brute support seulement sous fenêtre consentie et auditée (`SUPPORT_RAW_CAPTURE_WINDOWS`)                                                                                                                                                                                         |

### A11. Exercice des droits et effacement d'une personne prospectée — `EN SERVICE`

| Rubrique      | Contenu                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité      | Répondre aux demandes d'accès, de portabilité, d'opposition et d'effacement ; empêcher la recollecte et le recontact d'une personne qui s'y est opposée                                                                                                                                                                                                               |
| Base légale   | Obligation légale (6-1-c, art. 12 à 21)                                                                                                                                                                                                                                                                                                                               |
| Personnes     | Utilisateurs ; contacts prospectés                                                                                                                                                                                                                                                                                                                                    |
| Données       | Trace sans donnée personnelle (`person_erasures` : qui a effacé, quand, empreintes HMAC-SHA-256) ; liste d'opposition à l'envoi (`email_suppressions`, adresse remplacée par son empreinte après effacement)                                                                                                                                                          |
| Destinataires | Interne                                                                                                                                                                                                                                                                                                                                                               |
| Durées        | Empreintes et oppositions : conservées tant que le service existe (c'est leur fonction — empêcher le retour)                                                                                                                                                                                                                                                          |
| Mesures       | `PERSON_ERASURE_HMAC_KEY` dédiée, sans repli : absente ⇒ l'effacement répond 503 et n'écrit rien, la collecte d'un espace qui a des effacements s'arrête, l'envoi vers une opposition en empreinte est refusé ; export self-serve `GET /privacy/export` ; suppression `POST /privacy/delete-account` ; effacement d'une personne `contacts.controller.ts#erasePerson` |
| Écart         | Pas d'effacement d'un ex-salarié à la demande de son employeur (D156) ; pas de portail dédié aux prospects (relais par l'ESN ou `dpo@bellum-it.com`)                                                                                                                                                                                                                  |

### A12. Support et signalement de bug — `EN SERVICE`

| Rubrique           | Contenu                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité           | Recevoir et traiter les signalements de bug envoyés depuis le produit                                                                        |
| Base légale        | Contrat (6-1-b)                                                                                                                              |
| Données            | Texte du signalement, capture d'écran éventuelle, auteur                                                                                     |
| Destinataires      | Gestionnaire de tickets de l'équipe (GitHub, si `FEEDBACK_GITHUB_TOKEN` posée — sinon base seule)                                            |
| Transferts hors UE | Oui (GitHub US) si activé                                                                                                                    |
| Durées             | ⟦À COMPLÉTER — aucune durée codée pour les signalements⟧                                                                                     |
| Note               | Une capture d'écran peut contenir des données de contacts du client : à rappeler dans le bouton de signalement, ou masquer avant envoi (§ E) |

---

## Partie B — Bellum sous-traitant de l'ESN cliente (art. 30-2)

Pour chacun : le **client** est responsable (base légale, information des personnes) ; Bellum traite sur ses
instructions (le service, ses réglages et le DPA `dpa.md`). La base légale indiquée est celle que le client
invoquera le plus souvent — à lui de la confirmer.

### B1. Intelligence commerciale : dossiers de conquête, organigramme, plan, messages, copilote Laura — `EN SERVICE`

| Rubrique             | Contenu                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Préparer la prospection B2B de l'ESN : analyse d'un compte, contacts, organigramme, angles, plan d'action, brouillons de messages, conversation avec Laura, mémoire de conversation                                                                                     |
| Base légale (client) | Intérêt légitime (prospection B2B)                                                                                                                                                                                                                                      |
| Personnes            | Contacts professionnels ; utilisateurs                                                                                                                                                                                                                                  |
| Données              | Celles de A3-A5 ; notes et commentaires ; échanges avec Laura (texte, message vocal, image jointe) ; documents déposés                                                                                                                                                  |
| Sous-traitants       | Fournisseur de modèle d'IA (Anthropic ; OpenAI si `LLM_ROUTE_*` le désigne) ; transcription (`TRANSCRIPTION_API_URL`, contrat compatible Whisper) ; OCR ⟦À COMPLÉTER — fournisseur `OCR_API_KEY`⟧ ; hébergeurs                                                          |
| Transferts hors UE   | Oui (fournisseurs de modèle et de transcription US)                                                                                                                                                                                                                     |
| Durées               | Durée du contrat ; message vocal et image jointe à Laura : 30 j (`CHAT_VOICE_MESSAGE_RETENTION_DAYS`) ; résumés de conversation archivés : 90 j (`archived_conversation_summaries`, purgés) ; échanges avec Laura (`chat_messages`) : ⚠️ **aucune durée décidée** (§ E) |
| Mesures              | Isolation par espace (§ D1) ; les données client ne servent pas à entraîner de modèle (engagement du DPA client, à vérifier dans chaque DPA fournisseur)                                                                                                                |

### B2. Lecture du corps des e-mails de SA propre boîte par l'IA — `#4016 L3` (connexion de messagerie : `EN SERVICE`)

| Rubrique             | Contenu                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Résumer un fil, préparer une relance dans le ton, repérer objections et besoins, réconcilier une réponse avec une séquence                                                                                                                                                                                                                                                    |
| Base légale (client) | Intérêt légitime de l'ESN ; pour l'utilisateur lui-même, exécution du contrat sur son geste de connexion (OAuth) — c'est la base que `/privacy` lui annonce. Pour les correspondants : intérêt légitime, information par la mention § 2 de `mentions-information.md`                                                                                                          |
| Personnes            | L'utilisateur titulaire de la boîte ; ses correspondants professionnels                                                                                                                                                                                                                                                                                                       |
| Données              | Corps et métadonnées des fils liés aux contacts de l'espace                                                                                                                                                                                                                                                                                                                   |
| Règle                | **Jamais partagé aux collègues** — secret des correspondances (art. 226-15 C. pén., non négociable) : seul le titulaire voit ce que Laura tire de SA boîte. La mémoire partagée de l'espace ne reçoit pas le corps                                                                                                                                                            |
| Sous-traitants       | Fournisseur de modèle d'IA ; la messagerie elle-même est l'outil du client (Google, Microsoft)                                                                                                                                                                                                                                                                                |
| Transferts hors UE   | Oui (fournisseur de modèle d'IA)                                                                                                                                                                                                                                                                                                                                              |
| Durées               | Corps conservés au journal d'activité : 3 ans puis effacés, la métadonnée non nominative reste (`message_bodies`, 1 095 j, balayage `sweepActivityBodies`)                                                                                                                                                                                                                    |
| Mesures              | Jetons OAuth chiffrés AES-256-GCM (`google-connection.entity.ts`, `microsoft-connection.entity.ts`) ; niveau lecture seule séparé du niveau écriture (`googleScopesForLevel`, `google-config.ts`) ; balayage des réponses limité aux contacts à séquence vivante, par adresse exacte (`MAILBOX_REPLY_SWEEP_DISABLED`) ; cloisonnement collègue : à vérifier à la livraison L3 |
| Note                 | **AIPD probable** (contenu de correspondances, traitement par IA)                                                                                                                                                                                                                                                                                                             |

### B3. Envoi d'e-mails de prospection sous mandat — `EN SERVICE` (c89, délégation du commercial) + `#4016 L5` (Laura sous mandat, délégation d'espace, relance d'impayé)

| Rubrique             | Contenu                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Envoyer les étapes d'une séquence que le commercial (ou l'espace) a déléguées par un mandat explicite                                                                                                                                                                                                                        |
| Base légale (client) | Intérêt légitime — prospection B2B par e-mail sans consentement préalable si le message est en rapport avec la fonction de la personne et offre une opposition simple (CNIL, art. L34-5 CPCE)                                                                                                                                |
| Personnes            | Contacts nommés au mandat                                                                                                                                                                                                                                                                                                    |
| Données              | Adresse, contenu relu (empreinte), dates d'envoi, réponses détectées                                                                                                                                                                                                                                                         |
| Sous-traitants       | Prestataire d'e-mail (Resend) ou la messagerie connectée de l'utilisateur                                                                                                                                                                                                                                                    |
| Transferts hors UE   | Oui (Resend US)                                                                                                                                                                                                                                                                                                              |
| Durées               | Corps des messages : 3 ans (`message_bodies`) ; oppositions : permanentes (A11)                                                                                                                                                                                                                                              |
| Mesures              | Mandat : contacts nommés, e-mail seul, contenus relus, durée ≤ 30 j, volume ≤ 200, validateur nommé, révocable ; une réponse, une opposition ou une exclusion ARRÊTE la suite (`delegationVerdict`, GA-374) ; contrôle d'opposition avant envoi (`suppression.service.ts`) ; lien de désinscription (`unsubscribe-token.ts`) |

### B4. Analyse des appels enregistrés, avec consentement annoncé — `#4016 L12` ; transcriptions de téléphonie et comptes rendus de rendez-vous : `EN SERVICE`

| Rubrique             | Contenu                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Résumer un appel commercial, en tirer besoins, objections et prochaine étape                                                                                                                                                                 |
| Base légale (client) | Consentement de chaque participant à l'enregistrement, annoncé en début d'appel (mention § 1 de `mentions-information.md`). **Jamais d'enregistrement sans consentement** (art. 226-1 C. pén., non négociable)                               |
| Personnes            | Commercial ; interlocuteurs de l'appel                                                                                                                                                                                                       |
| Données              | Transcription produite par l'outil de téléphonie du client, ou fichier déposé par l'organisateur d'un rendez-vous ; synthèse                                                                                                                 |
| Sous-traitants       | Transcription ; fournisseur de modèle d'IA ; l'outil de téléphonie est celui du client (Aircall, Ringover, Allo)                                                                                                                             |
| Transferts hors UE   | Oui (transcription, modèle)                                                                                                                                                                                                                  |
| Durées               | Audio d'un compte rendu de rendez-vous : **jamais conservé** (GA-399, `la-reunion-ne-conserve-aucun-enregistrement.spec.ts`) ; transcriptions de téléphonie : lues seulement si l'espace a coché la case (`transcripts_enabled`, défaut non) |
| Mesures              | Signature des webhooks de téléphonie (`telephony-webhook-signature.ts`) ; identifiants chiffrés (`telephony-connection.entity.ts`) ; preuve du consentement annoncé : à vérifier à la livraison L12                                          |

### B5. Adoption du produit par commercial, visible du manager — `#4016 L8`

| Rubrique             | Contenu                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Permettre au manager de l'ESN de voir, par commercial, l'usage des fonctions de BellumAI, pour accompagner et former                                                                                                                                                  |
| Base légale (client) | Intérêt légitime de l'employeur, **sous condition** : information individuelle préalable des salariés (C. trav. L1222-4) et information-consultation du CSE (L2312-38) — modèles dans `note-cse-adoption-par-commercial.md`                                           |
| Personnes            | Commerciaux de l'ESN                                                                                                                                                                                                                                                  |
| Données              | Compteurs d'usage par fonction et par période (analyses lancées, messages préparés, actions menées). **Pas** de temps passé à l'écran, **pas** de rejeu, **pas** de contenu, **pas** de flux comportemental (c64 tient : le traceur produit ne porte aucune identité) |
| Destinataires        | Managers et administrateurs de l'espace                                                                                                                                                                                                                               |
| Durées               | ⟦À COMPLÉTER — fenêtre glissante recommandée : 12 mois⟧                                                                                                                                                                                                               |
| Mesures              | À vérifier à la livraison L8 : l'écran lit des actions validées, jamais `product_events` comportemental (GA-266) ; activation par l'espace après information du CSE (clause client)                                                                                   |

### B6. CRM interne, vivier de talents (ATS), consultants — `EN SERVICE`

| Rubrique             | Contenu                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Gérer les consultants et candidats de l'ESN, les positionner sur des besoins, envoyer des CV                                                                                      |
| Base légale (client) | Mesures précontractuelles / contrat (candidats, salariés) ; consentement au positionnement chez un client (un consentement expiré REFUSE le positionnement — c45, non négociable) |
| Personnes            | Consultants, candidats                                                                                                                                                            |
| Données              | CV, compétences, disponibilités, TJM, consentements datés, comptes rendus                                                                                                         |
| Sous-traitants       | Fournisseur de modèle d'IA (lecture de CV) ; OCR ; hébergeurs                                                                                                                     |
| Durées               | Dossiers de candidature : 24 mois au plus (`TALENT_RETENTION_MAX_MONTHS`), purge **seulement si l'espace l'a armée** (`talent_retention_enabled`, défaut désarmé — § E)           |
| Mesures              | Aucun critère protégé dans le rang (c58) ; effacement d'un talent (`TalentEraseDialog`)                                                                                           |

### B7. Missions, CRA, frais et suivi financier — `EN SERVICE`

| Rubrique             | Contenu                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Suivre missions, temps, frais, encaissements et marge (BellumAI SUIT le financier, il ne comptabilise pas)                                                                            |
| Base légale (client) | Contrat ; obligation légale pour les justificatifs                                                                                                                                    |
| Personnes            | Consultants, contacts clients                                                                                                                                                         |
| Données              | Temps, notes de frais et justificatifs, factures préparées                                                                                                                            |
| Durées               | Justificatifs de frais et pièces de facture : 10 ans (`RECEIPT_RETENTION_YEARS_FR`) ; pièces commerciales (besoin, AO, contrat externe) : 5 ans (`STORAGE_RETENTION_YEARS_BY_DOMAIN`) |
| Mesures              | Purge des fichiers échus (`STORAGE_RETENTION_PURGE_DISABLED` = kill-switch) ; montants sous droit financier                                                                           |

### B8. Connecteurs : CRM, ERP, bureautique, documents — `EN SERVICE`

| Rubrique             | Contenu                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité             | Lire et écrire dans les outils que l'espace a branchés (CRM, ATS, ERP, agenda, Drive, Notion) ; RAG sur les documents déposés                                                                                    |
| Base légale (client) | Contrat / intérêt légitime ; **toute écriture CRM garde un go de l'utilisateur** (inchangé par #4016)                                                                                                            |
| Données              | Contacts, comptes, activités synchronisés ; contenu des documents                                                                                                                                                |
| Sous-traitants       | Ces outils sont ceux du client (relation responsable↔outil du client) ; embeddings (`EMBEDDING_API_URL`) si la clé est posée                                                                                     |
| Durées               | Documents RAG non utilisés : 12 mois (`RagPurgeScheduler`, trois refus : document utilisé, déposé par un humain, âge illisible)                                                                                  |
| Mesures              | Jetons chiffrés AES-256-GCM (`crm-connection`, `ats-connection`, `notion-connection`, `admin-docs-connection`, `integration`) ; sorties de données gouvernées par `@DataExit` (garde `data-exit-routes.spec.ts`) |

---

## Partie D — Mesures de sécurité réellement codées (transversal)

Seules figurent ici des mesures dont le code est dans le dépôt au 11/10/2026. **Aucune certification, aucune norme,
aucune promesse de résidence n'est revendiquée** (GA-388) : la seule résidence établie est la base de données
Supabase Plan Pro, région eu-west-1.

| #   | Mesure                                                                                                                                                  | Où                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D1  | Cloisonnement : RLS Postgres `auth.uid() = user_id` sur les tables ; filtrage par espace côté API ; données nominatives jamais lues entre espaces       | CLAUDE.md § Supabase ; `apps/api/src/architecture/workspace-isolation.spec.ts`   |
| D2  | Authentification JWT + cookies HttpOnly ; sessions par appareil, plafond d'appareils avec éviction ; 2FA TOTP                                           | `apps/api/src/modules/auth/` ; `user-mfa.entity.ts`                              |
| D3  | Chiffrement AES-256-GCM des jetons et secrets d'intégration (messagerie, agenda, CRM, ATS, téléphonie, Notion, documents, MFA)                          | `apps/api/src/database/entities/*-connection.entity.ts`, `integration.entity.ts` |
| D4  | Fail-closed des secrets : `INTERNAL_API_SECRET` absent en production ⇒ 503 ; `PERSON_ERASURE_HMAC_KEY` absente ⇒ 503 ; webhook e-mail sans secret ⇒ 503 | `agent_docs/env-reference.md` ; `apps/api/src/common/person-erasure-hmac.ts`     |
| D5  | Empreintes HMAC-SHA-256 des personnes effacées, vérifiées à l'entrée de la collecte et de l'enrichissement                                              | `apps/api/src/modules/contacts/person-erasure.service.ts`                        |
| D6  | Caviardage des journaux et masquage avant export des traces (e-mails, téléphones, secrets)                                                              | `apps/api/src/common/observability-privacy.ts`                                   |
| D7  | Sorties de données (exports) déclarées et gardées                                                                                                       | `@DataExit`, `apps/api/src/architecture/data-exit-routes.spec.ts`                |
| D8  | Journal d'accès et d'audit du back-office, avec rétention                                                                                               | `backoffice-access-journal.service.ts`, `audit-journal-retention.service.ts`     |
| D9  | Signature des webhooks entrants (téléphonie, e-mail)                                                                                                    | `telephony-webhook-signature.ts` ; `RESEND_WEBHOOK_SECRET`                       |
| D10 | Balayage de rétention quotidien sous verrou (04:17), kill-switch `RETENTION_SWEEP_DISABLED`                                                             | `privacy-retention.service.ts`                                                   |
| D11 | Aucun rejeu de session ni carte de chaleur, sur tous les `package.json`                                                                                 | GA-240 `no-session-replay.spec.ts`                                               |
| D12 | Sans clé = no-op strict pour les intégrations optionnelles : aucun appel réseau, aucune donnée envoyée                                                  | `agent_docs/env-reference.md`                                                    |

Ce que ce registre **n'affirme pas** faute de preuve dans le dépôt : sauvegardes testées par restauration, version
minimale de TLS, test d'intrusion réalisé (plan seulement : `agent_docs/security/pentest-plan.md`), chiffrement au
repos au-delà de ce que fournit l'hébergeur de base.

---

## Partie E — Écarts connus et ce qui reste à compléter

1. **`product_events` sans purge** : 13 mois publiés (`product_analytics_events`), aucune routine. À coder avant
   d'invoquer la durée.
2. **`chat_messages` sans durée** : les échanges avec Laura n'ont aucune règle de rétention (constat #1939, question
   reportée par Louis).
3. **Signalements de bug** : aucune durée.
4. **Compte inactif 3 ans** : politique publiée, exécution manuelle.
5. **Vivier de talents** : purge désarmée par défaut — un espace qui ne l'arme pas garde ses candidats sans limite.
6. **`weekly_digest = true` hérités** : un `true` hérité d'un défaut SQL n'est pas un consentement ; décider la remise
   à `false`.
7. **Base commune sans opt-out** (c92) : à défendre par la balance des intérêts, ou à ouvrir.
8. **Qualification A3** (responsable, sous-traitant ou conjoints) : `/privacy` et `dpa.md` ne disent pas la même chose.
9. **AIPD** à mener pour B2 (corps des mails par l'IA), A5 (e-mails déduits à grande échelle), B4 (appels), B5
   (suivi de salariés).
10. **Leviers #4016** (L2, L3, L4, L5, L8, L12) : relire chaque ligne marquée `#4016 Lx` à la livraison du lot et
    remplacer « à vérifier » par le chemin du code qui tient la mesure.
11. **Identité** : représentant légal, statut du DPO, fournisseurs OCR et changements de poste.
