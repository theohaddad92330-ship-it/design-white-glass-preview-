# Rapport K — #4737 mandat d'envoi LinkedIn (branche `claude/k-linkedin-mandat-4737`)

**Documentation officielle** (recherche, pages non relues en entier) : l'envoi de message est réservé aux partenaires agréés
(« restricted to approved partners ») — https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access (permissions
sauf « Open » = approbation LinkedIn ; SNAP pour les permissions commerciales). Aucun point d'API d'envoi ouvert à une app ordinaire trouvé.
**Conclusion : agrément NON acquis → adaptateur INERTE.** Aucun message réel envoyé.
**Mandat** (`linkedin-mandate.ts`, `decideSend`, 9 tests) : sans mandat, hors période (avant/après), au-delà du volume du jour, après
révocation, après réponse du destinataire, après un `unknown` → refusé. Révocation immédiate, archivée (`revoked_at`). Un seul mandat actif.
**No-op strict** (`linkedin-sender.ts`, 7 tests) : sans jeton (absent/vide/blanc) ou sans transport : `not_open`, zéro appel (transport qui lève).
**Journal** (`linkedin-mandate.service.ts`, 12 tests) : timeout → `unknown` + reprise arrêtée ; preuve (`proof_ref`) seulement pour `sent`, distincte du « fait »
déclaratif ; démo → refus `demo`, zéro appel ; corps absent de toute réponse et de tout log (détecteur prouvé capable de dire NON sur donnée du test).
**Persistance** : migration `1796590123457` (2 tables, CHECK nés avec elles, RLS), entités, `database_schema.md`, `env-reference.md`
(`LINKEDIN_PARTNER_ACCESS_TOKEN`), enum `linkedinSendStatusSchema` + entrée GA-12, démo seedée (mandat + ligne « voie non ouverte »), reset démo.
Routes : `GET/POST linkedin/mandate`, `POST linkedin/mandate/:id/revoke`, `POST linkedin/send`, `GET linkedin/contacts/:id/sends`.
**Pas fait** : (1) l'ÉCRAN (préparation du message / fiche contact, FR/EN) — non livré, je ne promets pas un bouton non gardé ;
(2) aucun transport HTTP (contrat d'envoi non vérifiable sans agrément) ; (3) l'arrêt sur réponse lit `linkedin_interactions.reply_received`
(déclaré), pas de détection automatique ; (4) pas de test d'intégration de la route (cf. env).
**Environnement** : `zod` installé sans `.guid()` → les specs qui importent `@bellum/contracts` via le workspace (`linkedin.service.spec`, `linkedin.controller.spec`,
`table-scope-registry`) échouent AUSSI sur main ; tsc : 4435 erreurs de même nature, aucune propre aux fichiers neufs hors DTO zod. GA-12 : `account_crm_fusions_basis_check` rouge hors périmètre.
Non lancés : demo-coverage.spec (trop lourd), vitest.
**Questions Louis** : (a) l'agrément partenaire est-il demandé ? Qui dépose le dossier ? (b) `outreach_delegations` (#3702.9) existe déjà : fusionner avec ce mandat ou garder deux notions ? (c) borne max 50/jour OK ?
