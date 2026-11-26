# Rapport — lot LAURA-RÉVÈLE-E-MAIL (#4421 suite B + réglages), 25/10

Branche : `claude/decisions-2510` (base `origin/claude/laura-missions-b-2410` + merge `origin/claude/decouvrir-recolte-2410`).
Pas de PR (consigne). Pas de migration (aucune table ni contrainte neuve).

## Registre

| Point                        | État | Preuve (tests ciblés, rouge → vert)                                                                                                                                                                                                                                                                    | Recette à faire                                                         |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Merge decouvrir-recolte      | fait | conflit changelog (`entries.ts`, `labels.fr/en.ts`) : les deux entrées gardées — `0d805c6444`                                                                                                                                                                                                          | —                                                                       |
| 1. #4421.14 plafond 60/j     | fait | `apps/ia/tests/test_decisions_2510.py::test_4421_14_…` (30 ≠ 60 → vert) — `2bcec98bab`                                                                                                                                                                                                                 | —                                                                       |
| 2. #4419.30 registre 120/min | fait | `test_4419_30_registre_public_120_par_minute` (50 ≠ 120 → vert) ; commentaire #631 réécrit — `2bcec98bab`                                                                                                                                                                                              | Découvrir sans 429 en prod                                              |
| 3. #4421.15 bouton           | fait | ia : `person_ref` sur la personne et `prepared_message.to` (`f4491b038e`) ; carte : `reveal` sur `account_ranking`, contrat zod + miroir pydantic + fixture partagée (`f1ea4b2420`) ; web : `RevealOutsidePeople.test.tsx` (bouton nommé, `min-h-11`, absent sans l'un des deux droits) — `19c456186b` | ÉCRAN : « Trouve-moi une mission… » → carte → bouton sous la personne   |
| 4. #4421.16 le geste         | fait | `POST /outside-people/reveal` (`outside-person-reveal.controller.spec.ts`, 11 tests) + `ContactsService.ensureOutsidePerson` (`outside-person-reveal.spec.ts`) — `d7c681c5de`, `0483109b54`                                                                                                            | clic réel sur un espace bêta : contact créé, débit seulement si adresse |
| 5. #4421.17 le mail          | fait | adresse révélée → « Destinataire du mail préparé : … C'est toi qui l'envoies » ; contacts du compte invalidés (relus) — test web                                                                                                                                                                       | ÉCRAN                                                                   |
| 6. #4421.18 démo             | fait | SII « Inès G. » → « Inès Garnier / ines.garnier@exemple.fr » sans appel (test web + `demo-missions-follow-ups.test.ts`) ; `DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE` seedé + `demo-outside-person-reveal-coverage.spec.ts` — `70cc224e24`                                                                   | ÉCRAN démo                                                              |
| 7. Changelog                 | fait | entrée `2026-10-25-laura-revele-email` FR/EN (`changelog.test.ts`, `ui-tutoie`) — `46a499188f`                                                                                                                                                                                                         | —                                                                       |

## Droits (testés)

- Garde : `@RequirePermission('contacts:enrich')`. Rôle sans ce droit → 403 (test sur la vraie `WorkspacePermissionGuard`).
- `records:write` re-prouvé dans le handler par `assertPermission` sur l'espace ACTIF : le décorateur lit
  « l'une suffit » quand on nomme deux droits ; ce geste exige les DEUX. Sans lui → 403, rien écrit, rien enrichi.
- `account_id` (2e clic d'une même carte) hors de l'espace actif ou hors périmètre BU → 404. Un compte retrouvé
  par SIREN/nom mais hors périmètre BU → 404 aussi.
- Web : sans les deux droits (ou droits inconnus), bouton ABSENT.
- Démo : le serveur refuse (409 `demo_reveal_blocked`) ; l'écran ne l'appelle jamais.

## Décisions prises sans demander (à relire)

1. **Réponse asynchrone** : l'endpoint rend `{account_id, contact_id, job_id, state}` (202) ; l'écran suit le job par
   `GET contacts/:id/enrichment` (même `pollEnrichment` que partout). Raison : l'enrichissement existant est une
   file (30-85 s), le tenir dans la requête est ce que le contrôleur contacts a explicitement abandonné.
2. **Clé `person_ref`** au lieu de `apollo_id` dans la sortie de l'outil et la carte : le test #4421.10 garde déjà
   « aucun nom de fournisseur dans la sortie » ; la valeur est bien l'identifiant source, posé en
   `contact.raw_data.apolloId` côté API, donc lu par `enrichContact` (révélation par id).
3. **E-mail seul** (`only: 'email'`) : seul l'e-mail est cherché et facturé.
4. **Contrôleur dans le module accounts** (`outside-people/reveal`) : `AccountsModule` importe déjà `ContactsModule`
   ; GA-07 veut que le contrôleur compose les deux domaines. `addToPortfolio` n'impose PAS d'analyse : il crée
   un compte `prospect` / `watching`, rien d'autre.
5. **Nom masqué** : `isIncompleteContactName` (prénom seul, « D. », « Mo\*\*\*y ») ; `foldIdentity` remplace désormais
   un nom masqué par le nom réel trouvé (avant : seulement un prénom seul).
6. **Démo** : les noms SII du cas Camille Roussel passent masqués (« Inès G. », « Julien M. ») pour montrer la
   révélation ; l'assertion « noms complets » de `demo-missions-follow-ups.test.ts` (#4421.13) a été ÉLARGIE au
   nom masqué (un prénom seul reste refusé). Julien M. se lit « adresse introuvable » (cas montré exprès).

## Pas fait / limites

- **Domaine** : l'outil ia ne connaît pas le domaine d'un compte hors espace ; la recherche se fait par SIREN puis
  nom normalisé (`normalizeCompanyNameKey`, sonde ILIKE sur le mot le plus long — un nom en base accentué
  différemment peut manquer la sonde ; repli : `addToPortfolio`, qui retrouve aussi le nom exact).
- Cas limite : une fiche existante de même nom normalisé mais d'un AUTRE identifiant source est fusionnée par
  `bulkInsert` ; l'endpoint répond alors 409 « personne écartée » au lieu de créer — à trancher si ça arrive.
- Format ruff : `chat_tools.py`, `known_shape_gate.py`, `reply_blocks.py` « would reformat » AVANT ce lot aussi
  (écart préexistant, non touché). tsc api : 3 erreurs `@bellum/email` introuvable (paquet non construit dans la
  VM, préexistant) ; aucune autre.
- Recette ÉCRAN non faite (VM sans navigateur branché à un espace) : voir colonne « Recette ».

## Tests lancés (ciblés)

ia (venv Python 3.12) : `test_decisions_2510.py`, `test_4421_10_contacts_meme_tour.py`, `test_reply_blocks.py`,
`test_4397_n1_suites_sans_identifiant.py`, `test_rate_limiter.py`, `test_distributed_rate_limiter.py`.
contracts : `outside-person-reveal.test.ts`, `reply-blocks.test.ts`, `reply-parity`, `reply-substance`, `changelog`.
api : `outside-person-reveal.controller.spec.ts`, `contacts/outside-person-reveal.spec.ts`,
`business-unit-read-coverage.spec.ts`, `accounts.discover-notes-claim.spec.ts`, `demo-coverage.spec.ts`,
`demo-outside-person-reveal-coverage.spec.ts` ; `tsc --noEmit -p apps/api`.
web : `RevealOutsidePeople.test.tsx`, `AccountRankingCard.results.test.tsx`, `demo-missions-follow-ups.test.ts`,
`demo-turn.test.ts`, `KnownShapeGate.test.tsx`, 2 tests `demo-chat-script.*`, gardes `aucun-credit-visible`,
`aucune-source-ne-se-nomme-dans-les-textes`, `GA-411`, `type-scale`, `no-hardcoded-colors`, `ui-tutoie`,
`changelog-entries` ; `tsc --noEmit -p apps/web`.
