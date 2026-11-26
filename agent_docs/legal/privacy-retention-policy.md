# Politique de confidentialité & rétention des données — BellumAI

> Version 1.0 — 2026-07-16. Encadre la minimisation (art. 5-1-c), la limitation de
> la conservation (art. 5-1-e) et le droit à l'effacement (art. 17) du RGPD.
> Complète le DPA (`agent_docs/legal/dpa.md`) et la checklist sécurité
> (`agent_docs/security.md`).

## 1. Principes

- **Minimisation** : on ne collecte que ce qui sert la prospection B2B ; **aucune
  donnée sensible** (art. 9). Les secrets ne sont jamais journalisés.
- **Limitation de la conservation** : chaque catégorie a une durée et une base ;
  au-delà, la donnée est supprimée ou anonymisée.
- **Effacement par anonymisation** : à la clôture d'un compte, les données
  nominatives sont _scrubées sur place_ ; les écritures que la loi impose de
  conserver sont gardées mais **pseudonymisées** (ne référencent plus qu'un UUID
  opaque).

## 2. Endpoints self-serve

| Droit                              | Endpoint                                                | UI                                             |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Accès + portabilité (art. 15 & 20) | `GET /privacy/export`                                   | Réglages › Sécurité › « Exporter mes données » |
| Effacement (art. 17)               | `POST /privacy/delete-account` (`confirm: "SUPPRIMER"`) | « Supprimer mon compte »                       |
| Politique de rétention (lecture)   | `GET /privacy/retention`                                | —                                              |

L'export agrège, **strictement pour l'utilisateur authentifié** : profil,
questionnaire ESN (toutes versions), abonnement, comptes, contacts, documents,
actions, mouvements de crédits, sessions.

## 3. Suppression vs anonymisation vs conservation

Ce que fait `POST /privacy/delete-account` (module `apps/api/src/modules/privacy`) :

| Donnée                   | Traitement                 | Détail                                                                                                                                        | Pourquoi                                                             |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `profiles` (identité)    | **Anonymisé**              | e-mail → hash `deleted-<sha256>@anonymized.invalid`, prénom/nom → `[supprimé]`, avatar → null, `profile_context` → null, `anonymized_at` posé | PII nominative — supprimée tout en gardant l'intégrité référentielle |
| `contacts` (prospects)   | **Anonymisé**              | nom → `[supprimé]`, e-mail/tél./LinkedIn/messages/notes/`raw_data` → null, `anonymized_at` posé                                               | PII de tiers collectée                                               |
| `rag_documents`          | **Contenu effacé**         | `title`/`content`/`metadata` → null                                                                                                           | Contenu personnel déposé par l'utilisateur                           |
| `user_sessions`          | **Révoqué**                | `revoked_at` posé sur tous les appareils                                                                                                      | Coupe l'accès immédiatement                                          |
| Abonnement Stripe        | **Annulé**                 | `subscriptions.cancel` — sans proratisation ni débit                                                                                          | Arrêt de la facturation                                              |
| `subscriptions` (ligne)  | **Conservé**               | Identifiants Stripe gardés                                                                                                                    | Rapprochement comptable                                              |
| `credit_ledger`          | **Conservé (pseudonyme)**  | Réfère un UUID, plus de PII                                                                                                                   | Audit facturation                                                    |
| `user_actions`           | **Conservé (pseudonyme)**  | Journal append-only                                                                                                                           | Audit / intégrité                                                    |
| `accounts` (entreprises) | **Conservé**               | Données d'entreprise, non nominatives                                                                                                         | Pas de PII de personne physique                                      |
| Factures Stripe          | **Conservé (chez Stripe)** | —                                                                                                                                             | Obligation légale/fiscale (~10 ans)                                  |

> ⚠️ **Jamais de hard-delete** d'une donnée légale/comptable. La suppression ne
> fait que des `UPDATE` (anonymisation) — vérifié par les tests
> (`privacy-deletion.service.spec.ts`).

**Identité de connexion (Supabase Auth)** : par choix de conception, le flux
n'appelle pas `admin.deleteUser` (une cascade FK effacerait les écritures
comptables à conserver). Les sessions sont révoquées et l'identité anonymisée ;
la purge éventuelle de la ligne `auth.users` est un geste d'administration
distinct, hors du chemin d'anonymisation.

## 4. Durées de conservation

Configurables par variables d'environnement (défauts sûrs). Exposées par
`PrivacyRetentionService.getRetentionPolicy()`.

| Catégorie                        | Variable d'env                      | Défaut           | Base / finalité                                                                                      |
| -------------------------------- | ----------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| Sessions révoquées               | `RETENTION_DAYS_REVOKED_SESSIONS`   | 90 j             | Sécurité — trace d'appareils, purgée après la fenêtre de détection d'abus                            |
| Résumés de conversation archivés | `RETENTION_DAYS_ARCHIVED_SUMMARIES` | 90 j             | Art. 5-1-e — extraits retirés de la lecture (`superseded_at`) : plus aucun lecteur, plus de finalité |
| Enregistrements anonymisés       | `RETENTION_DAYS_ANONYMIZED`         | 30 j             | Tombstone technique post-effacement ; purge dure possible ensuite                                    |
| Compte inactif                   | `RETENTION_DAYS_INACTIVE_ACCOUNT`   | 1095 j (3 ans)   | Minimisation — candidat à clôture après 3 ans sans connexion                                         |
| Journal des crédits              | `RETENTION_DAYS_LEDGER`             | 3650 j (~10 ans) | Audit facturation pseudonymisé                                                                       |
| Factures                         | `RETENTION_DAYS_INVOICES`           | 3650 j (~10 ans) | Obligation légale/fiscale (stockées chez Stripe)                                                     |

## 5. Mécanisme de rétention (le cadre, pas une purge agressive)

- **Politique documentée** : la table ci-dessus + `getRetentionPolicy()`. Les
  balayages LISENT leur fenêtre dans cette politique (`windowDays()`), jamais
  dans `process.env` : deux lectures d'un même réglage finiraient par diverger,
  et `GET /privacy/retention` annoncerait un délai que l'effacement
  n'appliquerait pas (GA-26, tenu par GA-68).
- **Balayage actif par défaut** : `PrivacyRetentionService` expose un cron
  quotidien (`04:17`, sous verrou singleton `privacy-retention-sweep`)
  (`sweepEnabled=true` par défaut — politique zéro-flag). Kill-switch
  d'urgence : `RETENTION_SWEEP_DISABLED=true` (break-glass, ex. geler la purge
  pendant une investigation d'abus). Il fait **trois** choses :
  1. purge les lignes `user_sessions` révoquées au-delà de la fenêtre ;
  2. efface les dossiers de candidature échus, **espace par espace et seulement
     pour ceux qui ont armé** `workspaces.talent_retention_enabled` (défaut
     désarmé — un effacement de vivier par surprise est irréversible) ;
  3. efface les `conversation_summaries` **archivés** (`superseded_at IS NOT
NULL`) au-delà de leur fenêtre, par lots bornés de 5 000 lignes.
- **Pourquoi les résumés archivés partent, alors qu'« on archive, on ne supprime
  pas »** : la doctrine protège un FAIT MÉTIER périmé, qui doit redevenir
  inconnu avec sa date plutôt que disparaître. Un résumé archivé n'est pas un
  fait métier — c'est deux extraits de 200 caractères par échange, le texte
  qu'une personne a tapé et la réponse de Laura, que **plus aucun code ne lit**
  (`memory.service.ts` filtre `superseded_at IS NULL` sur ses deux lectures ET
  sur son unique effacement). Conserver une donnée personnelle sans finalité est
  exactement ce que l'art. 5-1-e interdit.
- **Ce qui n'est toujours PAS purgé automatiquement** : aucune donnée métier ou
  comptable. Colonnes `anonymized_at` indexées (migration `1785750000000`) pour
  qu'une purge ultérieure des anonymisés reste simple et ciblée, mais elle reste
  un geste délibéré/administratif, non un défaut.
- **Magasin de connaissance** : purge distincte, mensuelle (le 3 à `04:40`,
  `RagPurgeScheduler` → service IA), sur `rag_documents` seulement, 12 mois, et
  avec trois refus — un document déjà utilisé, un document déposé par un humain
  et un âge illisible ne partent jamais. Kill-switch : `RAG_PURGE_DISABLED`.

## 6. Registre — où vit chaque donnée

Le registre des traitements (art. 30) vit dans
[`registre-des-traitements.md`](registre-des-traitements.md) (11/10/2026, #4016 L14) ;
la liste à jour des sous-traitants et de leurs DPA dans [`dpa-a-signer.md`](dpa-a-signer.md)
(l'Annexe 2 du DPA date du 16/07/2026 et n'est plus complète). Stockage primaire : Supabase (UE, eu-west-1). Facturation : Stripe.
E-mails : Resend. Supervision : Sentry.

## 7. À faire (hors périmètre de ce lot)

- Purge programmée des comptes inactifs > 3 ans (aujourd'hui : politique
  documentée, exécution manuelle).
- Purge dure des tombstones anonymisés après `RETENTION_DAYS_ANONYMIZED`
  (mécanisme prêt via l'index `anonymized_at`, non armé).
- Portail dédié pour les demandes des prospects (aujourd'hui : relais au Client).
- ⚠️ **Effacement d'un membre d'espace à la demande de son employeur — ABSENT,
  et le produit ne le promet pas.** `POST /privacy/delete-account` efface un
  compte à la demande de SON titulaire ; rien ne permet à un administrateur
  d'espace d'exercer l'art. 17 sur un ex-salarié. Ce qui reste attaché à son
  identité après son départ : sa ligne `profiles`, son `user_id` d'AUTEUR
  (`notes`, `attack_angles`, `field_provenance`), son identifiant d'ACTEUR dans
  `product_events` (append-only), et ses connexions de messagerie et d'agenda
  chiffrées (`google_connections`, `microsoft_connections` — une par personne).
  Décision parquée : **D156** au §12.6 du dossier du 26/08, re-vérifiée le
  30/08. Le dire est plus honnête qu'un bouton qui ferait la moitié du travail.
