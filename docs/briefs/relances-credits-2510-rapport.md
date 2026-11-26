# Rapport — RELANCES-CREDITS (25/10)

Branche `claude/relances-credits-2510` (base origin/main bc41731c). Pas de PR. Code : 6b5e68e1.

| Point | État       | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4418 | fait       | « Marquer envoyé » (brouillon, onglet Mailbox) envoie `sent_on` (jour déclaré, défaut aujourd'hui, jamais futur) ; `declareSent` ancre J+3/J+6/J+9 dessus et le consigne (`declared_sent_on`), futur/illisible ⇒ 400 avant toute écriture. L'écran dit « déclaré par toi, le JJ/MM, relances depuis la date indiquée ». Aucun `email_sent_at`, aucune preuve. Tests rouge → vert : `contacts.service.spec` (2), `DeclareSentAction.test` (3). Démo : déjà seedée (#4418, aucune clé neuve). |
| #4464 | déjà livré | Frein doux sur main (`soft-brake.ts`, `SoftBrake`, `useCreditGate` sans nombre, Laura `test_laura_no_money_4464`, garde `aucun-credit-visible` verte, démo « vide à dessein »). Rien recodé. **#4464.1 et .2 (code à six chiffres du back-office) : NON faits, ils n'appartiennent qu'à Louis.**                                                                                                                                                                                            |
| #4421 | déjà livré | main porte les 13 points (lots LAURA-MISSIONS A et B : zéro question, ~10 comptes, offres CDI/recrutement, CV joint, collecte fraîche, contacts + mail préparé dans le même tour, éval c77, c124). Rien ajouté. Seul écart : `search_job_offers` (LAURA-OFFRES #4563) vit sur `claude/integ-2510-vi`, non fusionnée dans main — c'est de l'intégration, pas de ce lot.                                                                                                                      |
| #4465 | déjà livré | `claude/contact-poste-4465-2510` traite les deux plaintes (poste en cours, départ). Non touché. Limite connue de cette branche : l'organigramme (graphe) n'est pas filtré des partis.                                                                                                                                                                                                                                                                                                       |

## Contrôles

jest `contacts.service.spec -t declareSent` vert ; vitest `mailbox/view/m2` + `EngagementMessage` verts ; `tsc --noEmit` web rc=0 ; prettier vert. pytest non lancé (pas de `.venv` ici) : aucun fichier IA touché.

## Arbitrages (le plus simple)

- Seul le chemin « brouillon » (`declare-sent`) reçoit le sélecteur de date ; « Marquer envoyé » d'une étape de séquence et `declareTouch` gardent le jour du geste.
- Jour fixé en Europe/Paris côté écran ; le serveur compare en UTC (écart d'une heure à minuit toléré).
