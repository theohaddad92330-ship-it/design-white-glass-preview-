# Couverture des rapports du 03/08/2026

**Dernière mise à jour : après le merge des onze lots (#859 → #869).** Les
sections 3, 4, 5, 6, 7 et 9 décrivaient l'état d'AVANT ces lots et listaient en
« refus » six sujets que Louis avait tranchés dans l'autre sens le 03/08 : elles
ont été reprises. Un document de couverture périmé est plus dangereux qu'un
document absent — on s'y fie.

Ce document existe pour une raison : quand on livre 140 fichiers d'un coup, la
question qui reste est « et le point 47, il est où ? ». Chaque liste numérotée
des trois rapports est reprise ici avec son état — **livré**, **partiel** ou
**non livré**, et dans ce dernier cas la raison, jamais « plus tard » tout seul.

## Cinq PDF, quatre rapports

Vérifié page à page le 03/08 : `..._VISION_...` (80 p) **contient**
`RECETTE_FINALE_PRODUIT_CODE` (68 p) au byte près, plus douze pages d'addendum
que l'`ADDENDUM_FINAL` (94 p) déclare lui-même remplacer en sa page 2. Il n'y a
donc rien à y traiter séparément.

| Rapport                                          | Nature                        | État                           |
| ------------------------------------------------ | ----------------------------- | ------------------------------ |
| `RECETTE_FINALE_PRODUIT_CODE` (68 p)             | recette du 02/08              | clos — #856, #857, #858        |
| `..._VISION_...` (80 p)                          | le précédent + addendum court | doublon, périmé par le suivant |
| `ADDENDUM_FINAL_PAGES_69_PLUS` (94 p)            | addendum long                 | clos — #854                    |
| `Meta_Analyse_Besoins_Utilisateurs` (30 p)       | méta-analyse besoins          | #859 puis lots 1-10            |
| `Meta_Analyse_Besoins_Workflows_Requetes` (25 p) | méta-analyse workflows        | #859 puis lots 1-10            |

---

## 1. Les 30 garde-fous UX (§10 du rapport 3)

| #   | Règle                                              | État                                                                                       |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Prénom de l'utilisateur dans les réponses          | **livré** — brief du jour (`firstName`)                                                    |
| 2   | Jamais « signature » comme marque-place            | **livré** — `resolveSignature`, `null` = brouillon non signé                               |
| 3   | Français par défaut                                | **déjà en place** — i18n, défaut FR                                                        |
| 4   | Ton assistant exécutif                             | **déjà en place** — prompts + doctrine lexicale §5                                         |
| 5   | Respecter la capitalisation                        | **livré** — aucune normalisation appliquée aux noms                                        |
| 6   | Dates lisibles                                     | **livré** — `Intl` dans la langue et le fuseau                                             |
| 7   | Ordre logique des emails                           | **déjà en place** — prompt message                                                         |
| 8   | Éviter les répétitions                             | **déjà en place** — résumé de conversation                                                 |
| 9   | Vrais brouillons                                   | **livré** — `POST /mailbox/drafts`                                                         |
| 10  | Brouillon complet (objet, corps, To/CC, PJ)        | **livré** — PJ réelles incluses                                                            |
| 11  | Mise en forme lisible                              | **déjà en place**                                                                          |
| 12  | To/CC intelligents avec confirmation               | **livré** — les autres participants du fil sont proposés en copie, jamais ajoutés d'office |
| 13  | Répondre aux non-lus via brouillons                | **livré** — intention `unread` + brouillon                                                 |
| 14  | Détecter correctement no-reply                     | **livré**, testé (`no-reply.ts`)                                                           |
| 15  | Ne pas s'ajouter comme participant                 | **livré**, testé (`self-invite.ts`)                                                        |
| 16  | Lien visio systématique                            | **livré** côté Google · **non livré** côté Outlook (licence Teams sur le tenant)           |
| 17  | Titres d'évènements « Société + sujet »            | **livré** — préfixe automatique, sauté quand le titre nomme déjà la société                |
| 18  | Limiter les alertes                                | **livré** — « rien à dire ⇒ rien envoyé » dans chaque routine                              |
| 19  | Ne pas inventer d'action : exécuter ou expliquer   | **livré** — états de bloc + capacités                                                      |
| 20  | Router correctement vers le bon outil              | **livré** — 5 outils copilote + capacités déclarées                                        |
| 21  | Proposer une prochaine action                      | **livré** — actions du brief                                                               |
| 22  | Savoir lire un PDF quand un parseur existe         | **déjà en place** — ingestion RAG                                                          |
| 23  | 7 requêtes HubSpot à 100 %                         | **livré** — tâches, réunions, dormants, doublons, hygiène, export contact                  |
| 24  | Agir même si le contact est absent                 | **livré** — upsert par email                                                               |
| 25  | Drive : chercher dans le CONTENU                   | **livré** — `GET /google/drive/search`                                                     |
| 26  | Pièce jointe RÉELLE au brouillon                   | **livré** — multipart MIME, testé                                                          |
| 27  | 2-3 messages utiles par jour                       | **livré** — routines bornées + silence quand rien à dire                                   |
| 28  | Rappeler les tâches inachevées                     | **livré** — routine `crm_followups` + relances                                             |
| 29  | Ne pas mentionner un outil non branché             | **livré** — les outils disent « je n'ai pas accès »                                        |
| 30  | Observabilité (logs, statut, latence, idempotence) | **livré** — traces de routines en clair, lots tracés, journal d'actions existant           |

## 2. Les 25 déclencheurs (§9 du rapport 3)

| #   | Déclencheur                      | État                                                                                              |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Digest matin                     | **livré** — `daily_briefing`                                                                      |
| 2   | Préparation RDV -24 h            | **livré** — `meeting_prep`                                                                        |
| 3   | Checklist RDV -1 h               | **livré** — `meeting_checklist`, routine CONTINUE, une occurrence par rendez-vous                 |
| 4   | Merci & next steps post-RDV      | **livré** — `meeting_followup`, 30 min après la fin                                               |
| 5   | Annulation → replanification     | **livré** — `meeting_cancelled`, créneaux calculés sur l'agenda réel                              |
| 6   | Aucun RDV dans 3 jours           | **livré** — `empty_pipeline_alert`                                                                |
| 7   | Relances no-reply 7 j            | **livré** — `no_reply_follow_up`                                                                  |
| 8   | Digest des réponses positives    | **livré** — `positive_replies`                                                                    |
| 9   | Suivi budget                     | **refus motivé** — exige de classer une intention dans le CORPS des messages, que l'on ne lit pas |
| 10  | Détection d'AO + échéancier      | **livré** — `tender_watch` (les tâches J-5/J-2/H-4 se posent via `POST /crm/tasks`)               |
| 11  | Contrats en attente de signature | **livré** — `contract_watch`                                                                      |
| 12  | Factures impayées                | **livré** — `invoice_watch`                                                                       |
| 13  | Fin de mission à 30 j            | **livré** — `mission_ending`                                                                      |
| 14  | Intercontrat > 30 j              | **livré** — `bench_alert`                                                                         |
| 15  | Leads à relancer                 | **livré** — `crm_followups`                                                                       |
| 16  | Séquence post-proposition        | **livré** — `stalled_proposals`                                                                   |
| 17  | Nettoyage des doublons CRM       | **livré** — `crm_duplicates` (propose, ne fusionne jamais)                                        |
| 18  | CV entrants → indexation         | **livré** — `cv_intake` + ingestion RAG des pièces jointes PDF                                    |
| 19  | Lien visio manquant              | **livré** — posé par défaut à la création                                                         |
| 20  | Conflits d'agenda                | **livré** — `agenda_conflicts`                                                                    |
| 21  | Weekly recap                     | **livré** — `weekly_recap`                                                                        |
| 22  | Weekly forecast                  | **livré** — `weekly_forecast`                                                                     |
| 23  | Monday kickstart                 | **livré** — `monday_kickstart`                                                                    |
| 24  | Hygiène de données mensuelle     | **livré** — `crm_hygiene`, premier jour OUVRÉ du mois                                             |
| 25  | Quarterly business review        | **livré** — `quarterly_review`, premier jour ouvré du trimestre                                   |

**24 livrés, 1 refus motivé.** Le seul écart est le n°9 : il suppose de lire le
corps des messages, ce que le socle refuse par construction.

Trois de ces routines sont **continues** plutôt que journalières (n°3, 4, 5) :
elles sont attachées à un OBJET — un rendez-vous, une annulation — et non à une
heure. Leur idempotence porte sur l'objet, si bien qu'un rendez-vous donné est
annoncé une fois et une seule, et que le deuxième de la journée n'est pas raté.

## 3. Les 100 besoins PRIO 1 (§5 du rapport 3)

État APRÈS les dix lots. La colonne « ce qui reste » ne contient plus que des
refus motivés ou des chantiers nommés au §14 — plus aucun « pas encore fait ».

| Outil        | Besoins | Couverts | Ce qui reste, et pourquoi                                                                                                                                                                        |
| ------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gmail        | 35      | ~31      | Transferts automatiques (portée `gmail.settings.sharing` + adresse vérifiée) ; rapports mensuels d'échanges (agrégation d'une année de métadonnées, §14). Le tagging par type est LIVRÉ (lot 8). |
| Agenda       | 15      | ~13      | Rapports mensuels par client (§14) ; la distinction qualification / suivi de mission demande une donnée que l'agenda ne porte pas.                                                               |
| HubSpot      | 35      | ~32      | La suppression de doublons reste une PROPOSITION — fusionner est irréversible. Listes, vues, séquences, imports en masse et rapports pipeline sont LIVRÉS (lot 1).                               |
| BoondManager | 15      | ~12      | L'écriture est LIVRÉE pour trois objets sous validation (lot 7) ; le reste écrit au-delà, ou calcule une marge que le produit ne connaît pas.                                                    |

## 4. Les 60 requêtes exécutables (§7 du rapport 3)

Servies de bout en bout après les dix lots : **~50**. Le compte a bougé de ~32
parce que le bloc HubSpot (27-45) est passé de « servi à moitié » à presque
complet (lot 1) et que le bloc Boond (46-55) n'est plus en lecture seule (lot 7).

Ce qui n'est PAS servi, par bloc : les transferts automatiques du bloc Gmail, la
suppression de doublons du bloc HubSpot (proposée, jamais exécutée) et les
requêtes Boond qui écrivent au-delà des trois objets gouvernés.

Les 40 requêtes multi-outils (§14 du rapport) suivent la même ligne : celles qui
écrivent dans deux systèmes à la fois passent désormais, chacune avec la
gouvernance de son côté écriture.

⚠️ Ces comptes sont une lecture du code, pas un test rejoué. Le jeu de tests
métier qui les vérifierait un par un est le chantier n°4 du §14.

## 5. Les 30 requêtes conseil (§8 du rapport 3)

**Servies** par le copilote et les écrans existants (plan de compte, Pilotage,
Manager cockpit, Delivery OS livré en #854) : analyse de pipeline, plan de
compte, comptes prioritaires, fins de mission, intercontrat, argumentaires.

**Débloquées par le lot 1** : celles qui exigeaient un calcul sur l'historique
CRM complet — taux de conversion, cycle moyen, gagnés/perdus par trimestre,
répartition par propriétaire. La lecture profonde et son cache les rendent
calculables, et le rapport porte sa couverture (combien de deals lus, lecture
tronquée ou non, synchronisé quand).

**Toujours non servies** : le délai moyen demande→CV et le ROI de prospection.
Le premier suppose d'horodater une demande client, que rien ne capte ; le second
suppose un coût d'acquisition, que Bellum ne connaît pas. Elles ne manquent pas
d'intelligence, elles manquent de la donnée — et un chiffre inventé sur un ROI
est le pire endroit possible pour en inventer un.

## 6. Les 50 besoins PRIO 2 (§6 du rapport 3)

| Famille                                             | État                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enrichissement par API officielle                   | **livré** — Hunter et Lusha branchés en dernier recours                                                                                                                                                                |
| Kaspr, FullEnrich                                   | **livré (lot 6)** — lecture tolérante : on ne devine aucun nom de champ, on lit par la forme. Un contrat inconnu donne « ça ne trouve rien », jamais un débit à tort. Contrat non vérifié sur instance réelle (§9 bis) |
| Import CSV Sales Navigator / Evaboot                | **livré** — avec prévisualisation, colonnes ignorées et déduplication                                                                                                                                                  |
| Scraping LinkedIn, SalesNav, PhantomBuster, TexAu   | **refus assumé** — décision Louis, adossée à l'étude ToS du dépôt : violation des CGU, bannissement du compte de l'utilisateur                                                                                         |
| Détection d'AO publics, job boards, signaux faibles | **déjà en place** — BOAMP, DECP, France Travail, APEC, Brave News                                                                                                                                                      |
| Organigrammes automatiques                          | **déjà en place** — OrgGraph                                                                                                                                                                                           |
| Veille marché, cartographie concurrents             | **déjà en place** — Découvrir, ESN présentes                                                                                                                                                                           |

## 7. L'écosystème d'outils (§6 du rapport 2)

| Priorité         | Outils                                                   | État                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 socle         | Gmail, Outlook, Agenda, HubSpot, Boond, Drive/SharePoint | **livré en entier** — SharePoint inclus depuis #859                                                                                                                                   |
| P1 métier        | Sales Navigator, LinkedIn Recruiter                      | **refus assumé** (CGU) — remplacé par l'import de fichier                                                                                                                             |
| P1 data          | Kaspr, Lusha, Hunter, Apollo, Dropcontact, FullEnrich    | **livré en entier** — Apollo, Dropcontact, SalesQL, Hunter, Lusha sur contrat vérifié ; Kaspr et FullEnrich en lecture tolérante (lot 6)                                              |
| P1 calls         | Aircall, Ringover, Modjo, Teams, Zoom                    | **livré** : Aircall, Ringover (lot 2), transcriptions opt-in · **non livré** : Modjo (contrat non public), Teams/Zoom (pas de journal d'appels exposé)                                |
| P1 ATS           | APEC, HelloWork, WTTJ, Indeed                            | **partiel** — APEC actif, WTTJ documenté no-op, HelloWork/Indeed non                                                                                                                  |
| P2 admin         | DocuSign, Yousign, Tiime, Qonto                          | **livré (lot 9)** — Yousign et Qonto sur contrat public, DocuSign et Tiime en lecture tolérante. Lecture des statuts + envoi à signature ; jamais de signature, de paiement ni d'IBAN |
| P2 automation    | PhantomBuster, Evaboot, Waalaxy, TexAu, Surfe, Zeliq     | **refus assumé** (scraping) sauf import de fichier                                                                                                                                    |
| P2 collaboration | Slack, WhatsApp, Notion, Airtable, Discord               | **livré** : Slack, Teams, Discord, Google Chat, Mattermost, Notion · **non livré** : WhatsApp Business, Airtable                                                                      |

## 8. Les roadmaps longues (addendum p76-79, déjà mergé #854)

| Horizon                                                                  | Contenu                                                                                      | État                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0-6 mois — Sales & Account OS                                            | Action Center, approbations, CRM-lite, timeline, ingestion mail/agenda, gabarits de workflow | **livré** — Action OS #854, ingestion mail/agenda ce chantier                                                                |
| 0-6 mois — Manager cockpit, relationship intelligence, opportunity watch |                                                                                              | **livré** — #857 et veille existante                                                                                         |
| 6-12 mois — Talent OS, CV Studio, Push Profile                           |                                                                                              | **livré** — vivier, matching, réécriture CV gardée, feedback de push                                                         |
| 6-12 mois — RFP / Response Studio                                        |                                                                                              | **livré** — module `rfp/` #854                                                                                               |
| 6-12 mois — Proposal Studio                                              |                                                                                              | **partiel** — contrat `proposal.ts` posé, pas d'écran                                                                        |
| 12-24 mois — Delivery & Finance OS                                       | missions, assignations, CRA, renouvellements, risque, expansion                              | **livré côté delivery** — module `delivery/`, `mission.ts`, timesheets, fenêtres J-60/J-30                                   |
| 12-24 mois — facturation, marge, paie                                    |                                                                                              | **refus assumé pour l'instant** — arbitrage Louis du 02/08 : « Delivery OS = objets + workflows, PAS la facturation légale » |
| 12-24 mois — portails client et consultant                               |                                                                                              | **non livré** — demande un modèle d'authentification externe                                                                 |

## 9. Ce qu'on ne promet pas, et pourquoi

Cette section est la plus importante du document. Chaque ligne est un refus
motivé, pas un oubli.

**Six refus ont été LEVÉS par les décisions de Louis du 03/08** et ne figurent
donc plus ici : l'écriture ERP (lot 7, sous validation), les libellés Gmail
(lot 8, portée opt-in), Kaspr et FullEnrich (lot 6, lecture tolérante), la
téléphonie et ses transcriptions (lot 2, opt-in par espace), la signature et la
facturation (lot 9, lecture + envoi), le PPTX et le PDF natif (lot 3). Les garder
en « refus » ferait mentir le document dans l'autre sens.

| Sujet                                              | Raison                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scraping LinkedIn / Sales Navigator**            | Violation des CGU. Le compte banni serait celui de l'utilisateur, pas le nôtre. Remplacé par l'import de fichier et, depuis le lot 5, par le journal d'interactions déclarées.                                               |
| **Transfert automatique de courrier**              | Exige `gmail.settings.sharing` et une adresse de transfert vérifiée chez Google : une portée restreinte de plus, pour une fonction qui envoie du courrier à un tiers sans relecture.                                         |
| **Suppression de courrier**                        | `users.messages.delete` n'existe nulle part dans le code. Un outil qui range une boîte ne doit pas pouvoir la vider — le lot 8 archive, il ne supprime pas.                                                                  |
| **Lecture du CORPS des messages**                  | Tout le socle lit des métadonnées. Ce qu'on ne lit pas ne peut pas fuiter. Conséquence assumée : le déclencheur n°9 (suivi budget), qui classe une INTENTION dans un message, reste hors périmètre.                          |
| **Enregistrer ou transcrire nous-mêmes un appel**  | Le lot 2 lit ce que l'outil d'appel a DÉJÀ produit, et seulement si l'espace a coché la case. Produire l'enregistrement engagerait le consentement des deux parties d'une façon que Bellum n'a pas les moyens de recueillir. |
| **Lien Teams côté Outlook**                        | Graph l'expose via `isOnlineMeeting`, qui exige une licence Teams sur le tenant. Promettre un lien puis échouer à l'envoi est pire que ne rien promettre.                                                                    |
| **Signature Outlook lue automatiquement**          | Graph ne l'expose pas — elle vit côté client. D'où `profiles.email_signature`.                                                                                                                                               |
| **Signer, payer, composer un document légal**      | Le lot 9 LIT des statuts et ACTIVE une demande déjà préparée. Il ne fabrique aucun document, ne déclenche aucun paiement et ne stocke aucun IBAN.                                                                            |
| **Fusionner des doublons de CRM**                  | Irréversible côté fournisseur, et un faux positif détruit l'historique d'un vrai client. On propose, avec la raison du rapprochement.                                                                                        |
| **Marge, facturation légale, paie**                | Arbitrage Louis du 02/08 : Delivery OS = objets et workflows, pas la facturation légale.                                                                                                                                     |
| **Portails client et consultant**                  | Demandent un modèle d'authentification externe (invités hors espace de travail) qui n'existe pas.                                                                                                                            |
| **WhatsApp Business, Airtable, HelloWork, Indeed** | Aucun besoin exprimé plus d'une fois dans l'audit terrain.                                                                                                                                                                   |
| **Créer une séquence chez le fournisseur de CRM**  | Son API publique est en lecture et en inscription. Bellum a son propre moteur ; enrôler dans celui du CRM sert à rejoindre un enchaînement que l'ESN a construit.                                                            |
| **Les créneaux de publication recommandés**        | Ils supposent l'historique de portée des publications, qu'on ne peut obtenir sans accéder au compte du réseau.                                                                                                               |

## 9 bis. Ce qui est LIVRÉ mais pas encore VALIDÉ en réel

Distinction qui vaut d'être écrite : « le code est là et testé » n'est pas
« ça marche chez un client ». Cinq chemins attendent une instance réelle.

| Sujet                     | Ce qui manque                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Écriture ERP (lot 7)      | Le verbe et le corps attendus par l'éditeur en écriture ne sont pas publics. Les chemins utilisés sont ceux vérifiés en LECTURE. |
| Kaspr, FullEnrich (lot 6) | Contrat non vérifiable : la lecture tolérante garantit qu'un échec est silencieux et gratuit, pas qu'il y ait un succès.         |
| DocuSign, Tiime (lot 9)   | Même situation. Yousign et Qonto, eux, sont sur leur contrat public.                                                             |
| `gmail.modify` (lot 8)    | Demande la validation de sécurité Google avant que la portée puisse être accordée.                                               |
| Transcription (lot 4)     | Aucune clé posée en production : la capacité est déclarée éteinte tant qu'il n'y en a pas.                                       |

## 10. Les dix lots du 03/08 — ce qu'ils ont fermé

Chaque lot a sa PR, et chaque PR porte ses refus motivés.

| Lot                           | Ce qu'il ferme                                                                           | Ce qu'il ne promet pas                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Profondeur CRM            | Pipeline calculé sur l'historique, listes, séquences, scoring, import en masse, sociétés | Créer une séquence chez le fournisseur (l'API publique est en lecture et inscription) ; une liste dynamique (ses filtres sont écrits chez le fournisseur) |
| 2 — Téléphonie                | Journal d'appels → note CRM, transcriptions opt-in                                       | Modjo (contrat non public) ; composer un numéro                                                                                                           |
| 3 — Livrables                 | PDF natif et présentation, trois rendus d'un modèle                                      | La charte du client ; une conversion Word→PDF au pixel                                                                                                    |
| 4 — Compte rendu              | Notes ou enregistrement → résumé, décisions, next steps, mail de suivi                   | Écouter une réunion en direct ; deviner qui fait quoi                                                                                                     |
| 5 — Réseau professionnel      | Journal d'interactions, relances des connexions, sujets de publication                   | Tout accès au réseau ; les créneaux de publication ; le post rédigé                                                                                       |
| 6 — Enrichisseurs             | Kaspr et FullEnrich en lecture tolérante                                                 | Qu'ils trouvent quelque chose — leur contrat n'est pas vérifié                                                                                            |
| 7 — Écriture ERP              | Mission, TJM, statut de besoin, après validation d'un responsable                        | Le verbe d'écriture n'est pas public : à valider sur une instance réelle                                                                                  |
| 8 — Classement des messages   | Étiquette + archivage, derrière `gmail.modify` opt-in                                    | Le transfert automatique ; toute suppression                                                                                                              |
| 9 — Administratif             | Signatures en attente, factures impayées, envoi à signature                              | Signer, payer, fabriquer un document, stocker un IBAN                                                                                                     |
| 10 — Exigences et indicateurs | Classification des interlocuteurs, les 9 indicateurs en back-office                      | Le temps gagné par persona (aucune mesure de l'avant)                                                                                                     |

## 10 bis. Les 14 exigences produit / IA (§10 du rapport 2)

Elles n'étaient triées nulle part non plus. Elles ne décrivent pas des écrans mais
des propriétés que le produit doit tenir partout.

| Exigence                             | État                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexte utilisateur persistant      | **déjà en place** — profil ESN, mémoire longue, préférences                                                                                                                                                                               |
| Classification des interlocuteurs    | **livré (lot 10)** — déterministe, ordonné par risque, avec sa confiance                                                                                                                                                                  |
| Knowledge base ESN                   | **déjà en place** — RAG + `agent_docs/kb/` injectés dans les prompts                                                                                                                                                                      |
| Preuve avant confirmation            | **partiel** — l'Action OS et le journal d'appels vérifient la réponse avant d'annoncer ; le copilote PROPOSE et n'exécute pas. Aucune garde automatique n'interdit encore le mot « envoyé » dans un texte généré                          |
| Priorité aux données connectées      | **déjà en place** — les prompts citent leurs sources, la couche zéro passe avant le froid                                                                                                                                                 |
| Gestion de l'incertitude             | **partiel** — les scores et les classifications rendent leur confiance ; les prompts disent « hypothèse ». Aucune demande de précision proactive                                                                                          |
| Décomposition des requêtes complexes | **partiel** — pagination et bornes partout, résultat partiel utile (`partial`), mais pas de découpe automatique d'une demande multi-outils                                                                                                |
| Guardrails destructifs               | **livré** — approbations Action OS, écriture ERP gouvernée, doublons proposés jamais fusionnés, aucune suppression de courrier                                                                                                            |
| Sorties produit, pas ChatGPT         | **livré** — réponses structurées, cartes d'action, livrables téléchargeables                                                                                                                                                              |
| Qualité rédactionnelle               | **déjà en place** — doctrine par canal, 8 règles d'or, phrases bannies                                                                                                                                                                    |
| Pièces jointes réelles               | **livré (#859)** — multipart MIME testé                                                                                                                                                                                                   |
| Observabilité                        | **partiel** — journal d'actions, traces de routines, lots d'envoi, registre de coûts ; l'issue et la durée ne sont pas encore écrites par TOUS les chemins, ce que les indicateurs du lot 10 rendent visible en comptant leur échantillon |
| Compatibilité multi-tenant           | **déjà en place** — espaces de travail, rôles, scoping systématique                                                                                                                                                                       |
| Gestion des erreurs                  | **partiel** — messages contextualisés et causes lisibles sur les chemins récents ; pas de reprise automatique                                                                                                                             |
| Évaluation continue                  | **déjà en place** — `evals/`, golden sets, gates CI                                                                                                                                                                                       |

Les dix anti-patterns du même paragraphe sont couverts par les mêmes lignes : le
plus important — « promesse d'exécution alors que le brouillon n'existe pas » —
est précisément ce que mesure l'indicateur « actions annoncées mais non
abouties » du lot 10.

## 11. La bibliothèque étendue (§13 du rapport 3, 185 requêtes)

Elle n'était triée nulle part. Les 60 requêtes du §7 l'étaient ; ces 185-ci — 40
Gmail, 25 Agenda, 40 HubSpot, 30 Drive, 50 Boond — sont un backlog de tests et de
démonstration, pas une liste de fonctionnalités distinctes. Presque toutes sont
une reformulation d'une capacité déjà nommée ailleurs.

| Bloc         | Servi | Ce qui manque, et pourquoi                                                                                                                                                                                                                     |
| ------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail (40)   | ~32   | Le transfert automatique (n°15, n°28) demande `gmail.settings.sharing` et une adresse vérifiée. Les rapports mensuels d'échanges (n°21) demandent l'agrégation d'une année de métadonnées — coûteux pour une question posée une fois par mois. |
| Agenda (25)  | ~20   | Les rapports mensuels par client (n°25) et l'activité hebdomadaire (n°18) : même raison. Les créneaux multi-fuseaux (n°23) sont calculés mais pas exposés à l'écran.                                                                           |
| HubSpot (40) | ~34   | La suppression de doublons après validation (n°26) reste une PROPOSITION : fusionner est irréversible. Les vues filtrées enregistrées (n°27) demandent des filtres écrits chez le fournisseur.                                                 |
| Drive (30)   | ~14   | Renommer, fusionner, convertir et archiver écrivent dans l'espace documentaire du client. Ce sont des écritures de fichiers, pas des lectures : elles méritent la même gouvernance que l'écriture ERP, qui n'est pas branchée dessus.          |
| Boond (50)   | ~30   | Les 20 restantes écrivent dans l'ERP au-delà des trois écritures gouvernées du lot 7, ou calculent une marge — que le produit ne connaît pas.                                                                                                  |

## 12. Le mapping des sous-agents (§11 du rapport 3)

Le rapport propose huit « sous-agents ». Le dépôt les a, sous forme de MODULES —
et c'est délibérément la même chose vue autrement : un module NestJS indépendant
est ce qu'un sous-agent devrait être, avec en plus la garantie qu'on peut le
retirer sans casser le reste (règle #7).

| Sous-agent du rapport | Où il vit                                                  |
| --------------------- | ---------------------------------------------------------- |
| Gmail Agent           | `mailbox/` + `google/`                                     |
| Calendar Agent        | `agenda/`                                                  |
| HubSpot Agent         | `crm/` (+ `crm-depth.service.ts`)                          |
| Boond Agent           | `ats/` (+ `ats-write.service.ts`)                          |
| Drive Agent           | `google/` (Drive) + `microsoft/` (SharePoint)              |
| Brain / Conseil       | service IA + `pilotage/`, `action-os/`                     |
| Trigger Orchestrator  | `routines/`                                                |
| PRIO 2 Prospecting    | `contacts/` (cascade d'enrichissement) + import de fichier |

Ce qui n'est PAS repris du rapport : l'idée qu'un agent décide seul de son outil.
Le routage passe par des capacités DÉCLARÉES (`GoogleCapabilities`, statut ATS,
statut CRM) : un outil non branché fait dire « je n'ai pas accès », il ne fait pas
tenter puis échouer.

## 13. Le protocole PASS/FAIL (§12 du rapport 3)

Le rapport demande de qualifier chaque test en PASS / FAIL / PARTIAL / BLOCKED, et
la distinction est la bonne. Elle existe déjà dans le code, sous d'autres noms :

- **PARTIAL** est `partial` dans l'Action OS — « une partie est passée » n'est ni
  un succès ni un échec, et le lot 10 le sort du dénominateur des indicateurs
  plutôt que de le compter des deux côtés.
- **BLOCKED** est la capacité déclarée à `false` : portée absente, outil non
  connecté, identifiants manquants. L'écran le dit AVANT le clic.

Ce qui manque encore : un jeu de tests métier rejouable sur les 60 requêtes. Les
`evals` du dépôt couvrent les prompts d'analyse, pas les parcours multi-outils.

## 14. Ce qui reste, après les dix lots

Court, et chaque ligne porte sa raison.

1. **Écritures dans l'espace documentaire** — renommer, fusionner, convertir,
   archiver des fichiers chez le client. Ce sont des écritures ; elles méritent la
   gouvernance du lot 7, pas un bouton.
2. **Rapports mensuels d'échanges et d'agenda** — techniquement faisables,
   coûteux en lecture pour une question posée une fois par mois. À faire quand
   quelqu'un la posera vraiment.
3. **Marge et facturation** — refus assumé depuis l'addendum du 02/08 : Delivery
   OS = objets et workflows, pas la facturation légale.
4. **Jeu de tests métier des 60 requêtes** — voir §13.
5. **Écran de validation des demandes d'écriture ERP** — l'API est là, la carte
   dans l'interface reste à poser.
