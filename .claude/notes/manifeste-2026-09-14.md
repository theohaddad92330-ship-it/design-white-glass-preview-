# Manifeste de dispatch — 14/09/2026

Base : `origin/main` = `e1c714c69` (merge #1997), servi par api ET ia.
Registre : `.claude/notes/registre-2026-09-12.md` — 1166 points.
Artefact de suivi : https://claude.ai/code/artifact/4a5220b7-2c64-4645-835c-30c389b32e9e
⚠️ L'URL du 13/09 (`4aef274b-…`) est MORTE — republier crée une URL neuve.

## Comptes du registre (mesurés, pas relus)

| État | 13/09 soir | 14/09 |
| --- | --- | --- |
| retenu | 758 | **740** |
| écarté | 285 | 285 |
| recetté | 70 | **73** |
| livré | 40 | **55** |
| reformulé | 13 | 13 |
| **somme** | 1166 | **1166** ✓ |

Restants par sujet : G 144 · B 135 · C 126 · E 125 · A 89 · D 73 · F 48.

## En vol

| # | Lot | Type | Périmètre | Interdits | État |
| --- | --- | --- | --- | --- | --- |
| 1 | Refusion PR #1999 (intégration A) | intégrateur, opus | les 31 fichiers en conflit des deux côtés | merge, push sur main, suites complètes | en cours |
| 2 | `portee.py` — 3 faux positifs de FONDATION | écrivain, sonnet | `tools/recette/{portee,test_portee}.py` | tout `apps/`, `packages/`, `.claude/` | en cours |
| 3 | Garde « champ de réponse d'API que personne ne lit » | écrivain, opus | `apps/api/src/architecture/api-response-fields-are-read.spec.ts` (neuf) | corriger #1998, tout `apps/web`, `packages/contracts` | en cours |
| 4 | Cadrage sujet G (144 pts) | éclaireur | lecture seule | écriture hors `scratchpad/lots-sujet-G.md` | en cours |
| 5 | Cadrage sujet B (135 pts) | éclaireur | lecture seule | idem, `lots-sujet-B.md` | en cours |
| 6 | Cadrage sujet C (126 pts) | éclaireur | lecture seule | idem, `lots-sujet-C.md` | en cours |
| 7 | Cadrage sujet E (125 pts) | éclaireur | lecture seule | idem, `lots-sujet-E.md` | en cours |

⚠️ **#1999 verrouille 359 fichiers** — liste dans le scratchpad,
`1999-fichiers-verrouilles.txt`. Tout lot neuf doit être disjoint.
160 sont dans `apps/web/src`, 94 dans `apps/api/src`, 38 dans `packages/contracts/src`.

## Bloqués sur l'atterrissage de #1999

- **#1998** — cartes Action OS jamais lues à l'écran. Vérifié 2× par chemins
  indépendants. `ia-proxy.controller.ts:333-334` produit `cards` ; zéro lecteur
  dans `apps/web/src` ; `ChatResponseContext` (`ContextDisclosure.tsx:19-49`)
  n'a pas le champ. Motif à copier : `Chat.tsx:1661-1668` (`pending_actions`),
  voisin `PendingActions.tsx`. **8ᵉ occurrence du défaut n°1 du dépôt.**
- **#1995** — Laura nomme un contact qu'elle ne peut pas identifier.
  `chat-context.service.ts:250-253` envoie les noms sans `id` ; 4 outils
  exigent un UUID ; **54 outils** (pas 57), aucun ne résout un nom.
  Précédent à copier : `resolveAccountByName` (`chat-context.service.ts:381-393`).

## Recette du 14/09 — prod `e1c714c69`

| | Verdict |
| --- | --- |
| `/dashboard` | PASS — rend, 0 erreur console |
| `/settings/notifications` | **PASS** — section SMS « Bientôt disponible », dit que rien n'est branché, aucun numéro enregistré. No-op strict prouvé à l'écran. |
| `/discover` | PASS — 0 erreur, aucun nom de fournisseur dans l'état vide. ⚠️ Les libellés de #1912.11 vivent sur les CARTES : non prouvés tant qu'une recherche n'est pas lancée. |
| `/chat` | PASS — 6 suggestions (plafond #1909 tenu), 8 outils branchés nommés, 0 erreur |
| #1939.1 micro visible | **PASS** — mesuré, `aria-label="Dicter un message vocal"`, 32×32 |
| #1939.2 permission | **PASS** — micro refusé au navigateur → « Accès au micro refusé. Autorise le micro pour ce site… ou tape ta question. » |
| #1939.3 notice avant activation | **PASS** — drapeau `bellum:chat-voice-notice:<uuid>=1` en stockage local |
| #1939.4 → .14 | **NON VÉRIFIABLE** — exige d'accorder le micro au Chrome piloté + un appel de transcription facturé |

## ⚠️ Trois faits à remonter à Louis

1. **Le vocal est VIVANT en production.** `GET /ia/chat/voice/status` rend
   `{"available": true}` → `TRANSCRIPTION_API_KEY` EST posée. La note de reprise
   du 13/09 disait « merger sans la clé, vocal NON VÉRIFIÉ ». Conséquence :
   de l'audio d'utilisateur est enregistré et conservé **30 jours**, pendant que
   la **pièce RGPD** (registre des traitements + politique de confidentialité)
   reste due. Ce n'est pas un détail de recette.
2. **`portee.py` sur-déclenche.** Il rend FONDATION (59 routes) sur un diff qui
   ne peut casser aucun écran : un fichier AJOUTÉ compté comme fondation,
   `common.json` purement additif (20/0), trois contrats dont **zéro symbole
   exporté n'a disparu**. La règle d'hier retombait déjà sur « on balaie tout ».
3. **`build.py` de l'artefact jetait un point en silence** (`len(cells) != 6`),
   affichant 1 165 pour 1 166. Corrigé.

## Piège payé aujourd'hui

- ⚠️ **Une URL d'artefact notée en mémoire peut être MORTE.** `4aef274b-…`
  rendait « artifact not found ». Vérifier (`action: "read"`) avant de compter
  dessus — republier sans URL valide crée un doublon, republier avec une URL
  morte échoue.
- ⚠️ `ls -la .claude/notes/` a rendu **vide** dans le bac à sable alors que le
  dossier porte 38 fichiers. `/usr/bin/find` dit vrai. (Déjà au §11 du profil.)

- ⚠️⚠️ **J'ai grepé ma COPIE DE TRAVAIL pendant que tout le reste était mesuré
  contre `origin/main`.** Elle avait **34 commits de retard** (`42e747fed` contre
  `e1c714c69`) : `git fetch` met à jour `origin/main`, pas l'arbre. Un
  `grep -c "deleteAccountVoice"` a rendu **0** là où
  `git show origin/main:<fichier> | grep -c` rend **4** — j'ai failli déclarer
  une amputation de fusion sur une fonctionnalité parfaitement livrée.
  Le zéro ne ressemblait pas à une panne : il ressemblait à une réponse.
  **Le réflexe** : `git rev-list --count HEAD..origin/main` avant tout `grep`
  dont un statut dépend, ou grep sur `git show origin/main:<chemin>`.

## Cadrages rendus — ce que les éclaireurs ont trouvé

| Sujet | Points | Lots réels | Bloqués par #1999 |
| --- | --- | --- | --- |
| B — capacités, contexte, routage | 135 | **1** (cascade CRM `crm_stage`, 2 pts) | 6 (133 pts) |
| C — vérité & forme de la réponse | 126 | **0** | 6 (126 pts) |
| E — actions, jobs, quotas, résilience | 125 | **1** retenu (auteur du dispatch) | 4 (120 pts, dont **44 dépendent de #1998**) |

**Le corpus est un goulot, pas une file.** ~380 points cadrés, **2 lots seulement** sont
écrivables sans toucher #1999. Tout le reste attend son atterrissage. Élargir le fan-out
n'y changerait rien : c'est le VERROU qui borne, pas la machine (load 2,1 sur 12).

### Vérifications qui ont invalidé un rapport d'agent

- ⚠️ **LOT 1 du sujet E — « le crédit réservé n'est jamais consommé ni remboursé » : FAUX.**
  L'agent a lu le docblock « cette classe ne touche pas le ledger » et conclu à un trou.
  Mesuré : `credits.service.ts` **importe** `CreditReservationService`, donc le solde
  ANNONCÉ retranche les réservations en vol — et `settle(…, 'released')` EST le
  remboursement. Deux registres distincts, par conception, décrite dans le docblock même
  qu'il citait. Une alerte « argent » de plus serait partie chez Louis pour rien.
- ⚠️ Son `grep -c` « zéro appel à CreditsService » rendait **2** : les littéraux
  `'consumed'` des appels à `settle`. Un compte juste sur un motif trop large.

### Constats du registre trouvés PÉRIMÉS par les éclaireurs

- **1959.11** (course sur double validation) est **déjà corrigé** (`93bcbbf7c`, `a3face386`,
  13/09, testé) — le « CONSTAT FAUX » que portait le registre est lui-même périmé.
- **1903.7, 1949.6, 1950.22** : leurs citations `PendingActions.tsx` sont fausses depuis
  le merge R9 (`2f1e5cf1e`).
- Sujet C : les numéros de ligne de `bellum_advisor.py` sont caducs (fichier à 1 114 lignes).
- ⚠️ La famille 1914 (13 pts) n'est pas « ABSENTE-libre » : #1999 est **en train de créer**
  les 8 fichiers `reply-blocks/*.tsx`. Les écrire ailleurs serait un conflit direct.

## CI de #1999 — rouge, une seule cause

`Test (IA / Python)` : `scope/une-demande-hors-perimetre` a `meta = None`, et les ~8
`AttributeError` qui suivent sont sa cascade. Le scénario vient de #1949.23 (arrivé par
#1997), la garde de corpus vient de l'autre branche : **ni l'un ni l'autre n'était rouge
seul**. `ToolScenario.meta` est `Meta | None = None`, donc rien n'a jeté à l'écriture.
Défaut d'INTÉGRATION, pas défaut d'un lot.
