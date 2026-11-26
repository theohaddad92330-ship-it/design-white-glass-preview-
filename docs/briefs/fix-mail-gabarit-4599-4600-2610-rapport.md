# Rapport — e-mail gabarit (#4599) et doublons (#4600)

Branche `claude/fix-mail-gabarit-4599-4600-2610`, base `d7e6ab01`. Aucune PR.

## Fait

- **A. Garde d'écriture** — `contacts/placeholder-email.ts` : refuse `prenom`, `nom`, `prenom.nom`, `nom.prenom`, `firstname.lastname`, `first.last`, `name.surname`, `votre.nom`, variantes `_` / `-`, FR+EN, casse et `+tag` neutralisés. Posée sur `applyEnrichment` (sortie du modèle), l'enrichissement fournisseur, l'import CSV et la création CRM. Refus = `null` + raison, jamais d'adresse devinée. Test « dit NON » : réponse modèle `prenom.nom@…` → contact SANS e-mail.
- **B. Prompt** — `cold_email:<adresse trouvee>` aux deux endroits de `bellum_contacts.py` ; jumeau trouvé : `adresse@domaine.com` (ligne 150). Garde pytest : aucune adresse-exemple dans `app/prompts/` (seule `support@bellum-it.com`, réelle, permise). Golden régénérés.
- **C. Rattrapage** — `PlaceholderEmailCatchupService.run({ workspaceId, dryRun = true })` : un espace obligatoire, simulation par défaut, compteurs `examined / cleared / skipped`, ancienne valeur archivée dans `enrichment_archive` avec sa date (`email_placeholder_cleared_at`), champ vidé, fiche gardée. Adresse de provenance `human` ignorée ; écriture conditionnelle `email = <valeur lue>` + `workspace_id`. Aucun boot, aucun cron.
- **D. Doublons** — `contact-duplicate-proposals.ts` : l'adresse ne pèse (+8) que si VÉRIFIÉE sur les fiches, portée par < 3 fiches du compte, non générique (`generic-mailbox.ts`, liste unique). Sinon `findSharedEmailGroups` rend UN groupe (raison : `unverified` / `shared_by_many` / `generic_mailbox`) ; l'API rend `shared_email_groups`, le web un seul bloc, compteur en situations. `identity-duplicates.ts` : même règle (≥ 3 porteurs, boîte générique) ; « vérifiée » n'y a pas de sens, ces adresses sont celles de la connexion.

## Compteurs de simulation

**Aucun** : je n'ai accès à aucune base de production. Les compteurs sont ceux des tests (3 examinées / 2 vidées / 0 ignorées sur le jeu du test). À lancer par l'opérateur espace par espace, en simulation d'abord.

## NON fait

- **Pas de route d'opérateur** pour le rattrapage (le contrôleur admin est hors périmètre) ni d'interrupteur dans `kill-switches.ts` : le service est fourni et enregistré dans `ContactsModule`, il n'est appelé par rien.
- Le bloc « Doublon probable » de la **fiche contact** (`team-guardrails/DuplicateCandidatesCard`, raison « même adresse e-mail ») et le tally SQL `rejectionReasonsTally` (`lower(c2.email) = lower(contact.email)`) : hors périmètre, **encore à corriger** — ils peuvent encore lister les fiches d'une adresse partagée.
- Aucune migration de la donnée existante exécutée ; aucune fusion, aucune suppression de fiche.
- Tests non lancés : suite complète (travail de la CI). Pas de seed démo ajouté.
