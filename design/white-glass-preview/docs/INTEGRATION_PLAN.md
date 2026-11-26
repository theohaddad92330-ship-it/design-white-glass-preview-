# Cockpit commercial — contrat d’intégration au produit BellumAI

État audité le 26 novembre 2026 sur `belllum-monorepo-main (17).zip`. Le Site White Glass est une **prévisualisation statique distincte** du monorepo : `dist/performance-data.js` fournit les chiffres de Groupe Sillage ; `dist/performance.js` conserve profils, objectifs, comptes rendus, coûts et actions dans `localStorage`. Il ne lit ni l’API BellumAI ni un CRM/ATS connecté. Le prochain raccordement doit être développé dans le monorepo, derrière sa session et ses permissions ; ajouter un `fetch` depuis ce Site ne constituerait pas une intégration d’entreprise.

## Les briques existantes à réutiliser

| Domaine | Code vérifié | Ce qu’il fournit déjà |
| --- | --- | --- |
| Identité et cloisonnement | `apps/api/src/modules/workspace/workspace-context.service.ts`, `workspace-permission.guard.ts` | Espace actif par membre, rôles et permissions côté serveur ; une personne peut appartenir à plusieurs espaces. |
| Première synchronisation | `apps/api/src/modules/integration-sync/integration-sync.controller.ts`, `integration-sync.worker.ts` | Run par espace/connecteur, job BullMQ, état et résumé, annulation et échecs explicites. Le run `pending` perdu est refermé ; pas de progression en pourcentage inventée. |
| CRM | `crm-read-sync.service.ts`, `crm-sync.service.ts`, `crm-webhooks/*`, `crm-mirror/crm-mirror.controller.ts` | Relecture incrémentale, rapprochement, miroir compte, webhooks HubSpot/Salesforce signés et dédoublonnés. La boucle ne remplace pas automatiquement un champ CRM non vide. |
| Traçabilité des imports | `sync-link.entity.ts`, `sync-record-event.entity.ts`, `crm-sync-cursor.entity.ts` | Clé externe unique par espace/fournisseur/type, journal de champ, dernier essai et dernière réussite séparés. |
| BoondManager | `ats/ats.controller.ts`, `ats/ats.service.ts` | OAuth, état, snapshot besoins/consultants/missions ; écritures gouvernées par demande puis décision. |
| Messagerie et agenda | `google/google.controller.ts`, `microsoft/microsoft.controller.ts`, `agenda/agenda.controller.ts` | OAuth Google/Outlook, calendrier personnel multi-agendas, événements et conflits ; les sources muettes sont distinguées d’un agenda réellement vide. |
| Activité | `activities/activities.controller.ts`, `activity-capture.service.ts`, `activity-sync-state.entity.ts` | Capture des messages, rendez-vous et téléphonie, journal par source/utilisateur, dédoublonnage et motif des éléments écartés. LinkedIn (`linkedin.controller.ts`) enregistre surtout des interactions déclarées, sans lecture passive de LinkedIn. |
| Cockpits | `dashboard/dashboard.controller.ts`, `manager/manager.controller.ts`, `objectives/objectives.controller.ts` | `/dashboard/me` personnel, `/manager/team-stats`, `/manager/team-business`, `/manager/team-plans`, objectifs et propositions soumis aux droits. Ne pas recréer un second cockpit d’équipe non gardé dans `/dashboard`. |
| Finance | `delivery/invoice-readiness.controller.ts`, `delivery/invoice-payments.controller.ts` | Pièces à facturer, encaissements et droits `finance:read`/`finance:write`. Le calcul de coût CDI et primes de la prévisualisation n’est pas, à ce stade, un module de paie relié. |
| Sorties d’événements | `integrations/integration-providers.ts`, `integrations.controller.ts` | Webhooks sortants et canaux Slack/Teams/Google Chat, événements filtrés ; ce n’est pas un connecteur entrant CRM. |

## Contrat de données du cockpit raccordé

Une seule API de lecture pour un contexte donné, bâtie à partir des agrégats existants et d’un contrat `@bellum/contracts` validé au bord du web. Toute réponse porte `workspaceId` résolu **sur le serveur**, `scope` (membre/agence/BU/ville), `period` (`from`, `to`, fuseau), `asOf`, `sourceCoverage` par domaine et les permissions pertinentes. Ne jamais prendre `workspaceId` fourni par le navigateur comme autorité.

| Vue | Source canonique et geste | Provenance et état à afficher |
| --- | --- | --- |
| Ma journée | `/dashboard/me`, actions/priorités, comptes et activités rattachées ; briefing Laura à partir de ces identifiants. | Action, compte, responsable, échéance, origine CRM/ATS/messagerie/saisie et heure de dernière observation. |
| Agenda | `/agenda/events` et statut des agendas, puis liens explicites vers compte et affaire. | Calendrier source, événement confirmé ou provisoire ; source muette ≠ journée vide. |
| Équipe | `/manager/team-business`, `team-plans`, `team-stats`, `/objectives/team`, membres et leurs BU. | Périmètre et période constants ; résultats de chaque membre, dossiers sans propriétaire, prochaine action. |
| Carte de France | Agences et villes enregistrées dans l’espace, BU liées à ces agences ; agrégats des affaires/missions par BU. | Aucun point géographique sans agence créée ; « ville → BU → affaires, responsables, finance » conserve le même filtre. |
| Pilotage · pipe/staffing | Affaires du miroir CRM et des objets Bellum, besoins/consultants Boond, objectifs acceptés. | Montant ouvert distinct du signé, fait distinct d’un objectif ou d’une projection. Un besoin non rapproché reste « à qualifier ». |
| Pilotage · finance | Facturation/encaissement du module Delivery ; salaire chargé et prime seulement si une source RH ou une saisie autorisée existe. | Agrégat BU ≠ registre de quelques factures. Montrer la couverture réelle des pièces et dates. Le modèle de prime doit être validé par entreprise avant tout calcul d’équipe. |
| Laura et rapports | Les mêmes vues serveur, citations vers dossiers/actions et vérification des permissions à chaque outil. | Réponse liée aux identifiants et à leur fraîcheur. Une proposition d’envoi/délégation requiert le chemin d’écriture existant et un résultat confirmé avant d’être annoncée comme faite. |

Chaque mesure doit définir `numerator/denominator`, unité, source, période et population. Les volumes RDV, besoins, profils, entretiens et signatures ne forment pas automatiquement une cohorte de conversion ; on ne calcule le taux que si les événements sont reliés par affaire et les règles de dénominateur arrêtées. Un chiffre indisponible reste `null` avec sa raison (`not_connected`, `scope_missing`, `sync_failed`, `not_recorded`) et un lien utile vers la connexion, la correction ou la saisie ; aucun zéro de substitution.

## Chaîne d’ingestion et de partage

1. **Connexion.** Réutiliser les OAuth et le catalogue du monorepo. Le contrôle de portée et `integrations:manage` vit sur l’API ; jamais de secret dans le navigateur. L’onboarding fournit identité, entreprise, périmètre et objectifs déjà déclarés avant toute connexion.
2. **Capture.** CRM : webhook signé → file ciblée et relecture périodique ; ATS : snapshot/curseur selon capacité ; mail/agenda/téléphonie : capture par utilisateur autorisé. Conserver `externalId`, `provider`, `workspaceId`, `sourceOccurredAt`, `observedAt`, `lastSuccessAt`, `syncRunId` et la décision de rapprochement. L’index `(workspace, provider, type, externalId)` et les identifiants d’événement interdisent les doublons.
3. **Réconciliation.** Rapprocher compte/contact/besoin/affaire/mission uniquement sur preuves explicites ; ambiguïté en file de revue. Préserver la valeur d’origine et la valeur Bellum avec leur journal. Un enrichissement Bellum ne doit pas écraser en silence une donnée non vide du CRM.
4. **Projection.** Calculer les KPI à partir des entités canoniques, avec une période et un périmètre partagés entre cartes, graphes, tables et Laura. Invalider les vues concernées après un événement, une attribution, un objectif accepté ou une synchronisation aboutie ; ne pas rafraîchir visuellement un chiffre non recalculé.
5. **Écriture.** L’action prise dans le cockpit devient une action du même espace et du même dossier, avec auteur, propriétaire et échéance. Un envoi externe ou une écriture ATS/CRM passe par les portes de validation existantes, puis fournit un accusé réel ; l’événement seul ne vaut pas une livraison.

## Frontière de sécurité et fiabilité

- Les lectures agrégées d’équipe exigent `team:manage` ou une permission équivalente ; le cockpit personnel reste borné à l’appelant. `finance:read` et `finance:read:own` n’exposent pas la même maille. Les filtres de ville/BU ne contournent jamais la visibilité du portefeuille.
- Les caches et clés de requête doivent inclure espace actif, utilisateur/permissions, période et périmètre. Un changement d’espace invalide les données, les suggestions de Laura et les brouillons liés à l’ancien contexte.
- `last_attempt_at` et `last_success_at` sont affichés séparément ; une panne garde la dernière donnée valable avec sa date et un avertissement, sans la présenter comme fraîche. Le connecteur non branché, la portée manquante et le zéro réel sont trois états distincts.
- Les tests à ajouter dans le monorepo doivent exercer deux espaces avec identifiants externes identiques, un webhook répété, une reconnexion, un conflit de champ, une source en panne, le changement de rôle et d’espace, puis l’effet de chaque mise à jour sur carte, KPI, dossier, Laura et rapport. Une recette E2E doit confirmer qu’un clic de relance n’annonce jamais un mail envoyé avant l’accusé du fournisseur.

## Déploiement par incréments, sans casser les fiches existantes

1. Contrat de lecture des mesures + adaptation des écrans du **vrai** `apps/web` aux endpoints existants ; état de couverture et de fraîcheur visible. Garder Comptes, Affaires, Talent et Mission comme fiches canoniques, accessibles par les cartes du cockpit.
2. Raccorder agences/BU/objectifs de l’espace et les dossiers, puis les événements d’activité ; tester la réconciliation et les droits entre membres. Réutiliser l’onboarding, ne pas demander deux fois les mêmes données.
3. Ajouter les agrégats de finance absents et une saisie gouvernée des coûts/conditions de prime, avec historique et contrôle de droits. Le simulateur local ne devient calcul officiel qu’après ce contrat et des données attribuées.
4. Brancher rapports et Laura sur les mêmes lectures et portes d’écriture, avec liens et sources. Mesurer taux de couverture, latence de synchro, erreurs de rapprochement et actions réellement menées.

**Limite de la livraison White Glass actuelle :** elle vérifie le parcours, les composants et la lecture métier, mais ne livre aucun de ces raccordements serveur. Les réaliser exige d’intégrer ce travail dans le monorepo applicatif, de déployer l’API et le web authentifiés, et de tester avec des espaces et connecteurs autorisés.
