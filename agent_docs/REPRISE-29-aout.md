# Reprise — 29 août 2026

Ce fichier remplace `REPRISE-28-aout-soir.md`, qui est **périmé** (son §4 et son §5 sont faits).
Tout ce qui suit a été vérifié par une commande, à l'heure où il est écrit. **Rien n'y est supposé.**

---

## 0. Où en est le dépôt

Vérifier soi-même, toujours — un fichier de reprise vieillit en heures :

```sh
git fetch origin && git rev-parse origin/main
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"
```

Au moment d'écrire : `origin/main` = **`a53a01185`**, déployé et **recetté en ligne**.
⚠️ `ia.commit` est **imbriqué** : un `grep` sur le SHA matche le champ imbriqué et fait croire que
tout est déployé alors que seule l'IA l'est.

---

## 1. Ce qui a été livré dans la nuit du 28 au 29 — à NE PAS refaire

**PR #1211** (mergée, déployée, **recettée dans Chrome**)

- **L'artefact d'avancement lit le §12.5** : PDF-02 affiche **93 % (119/128)** au lieu de
  « non ventilé ». Jamais « clos », jamais de coche — les 9 exigences dues sont nommées sous la
  jauge. Une colonne « Mesure » dit d'où sort chaque ligne (passe B vs recomptage), parce que les
  deux ne lisent pas au même grain : **129 relevées contre 128**.
- **Le bandeau « Sources & intégrations » du copilote est retiré** (arbitrage de Louis : purement
  informatif). Composant, test, 15 clés i18n FR+EN et 4 `vi.mock` devenus morts. **Vérifié en ligne.**
- **Retour bêta #1180** : le champ « Mots-clés » de `/discover` annonce désormais qu'il ne s'applique
  pas hors mode Signaux. **Vérifié en ligne dans les deux sens** — l'avis s'affiche sans signal coché
  et DISPARAÎT dès qu'on en coche un.

**PR #1212** (mergée) — **PDF-04 et PDF-05 recomptés**, le §12.5 disait lui-même qu'ils n'avaient
jamais été relus. Sections **12.7** et **12.8** du tracker.

**PR #1213** (ouverte) — le job CI `Format` ne se gate plus : il lance `prettier --check .`
(repo-wide) mais était gardé par le scope `node`, donc une PR de markdown sautait la vérification.

**L'artefact publié** est à jour : <https://claude.ai/code/artifact/8635f892-b257-4777-a374-5961c773a5df>

### L'état des trois documents CRM/ATS

| Document               | Clos      | Taux       |
| ---------------------- | --------- | ---------- |
| PDF-02 (back-office)   | 119 / 128 | **93 %**   |
| PDF-04 (interface CRM) | 65 / 151  | **43,0 %** |
| PDF-05 (ATS et vivier) | 40 / 107  | **37,4 %** |

⚠️ **Ces trois totaux ne s'ADDITIONNENT PAS.** Les recouvrements ne sont pas dédupliqués : au moins
8 exigences de PDF-04 et 6 de PDF-05 redisent PDF-02 §3. C'est écrit dans les deux sections.

---

## 2. Ce qui a été MESURÉ et qui change une décision

### L'issue #1189 (Dropcontact) est répondue, avec des chiffres

**Ne pas ajouter Dropcontact pour ce symptôme.** Le connecteur **existe déjà** — un vrai client HTTP
de 246 lignes (`dropcontact.client.ts`). Il lui manque une clé.

En production, la cascade n'a **qu'un** fournisseur : Apollo. SalesQL, Dropcontact, Hunter, Lusha,
Kaspr, FullEnrich sont absents (relevé sur le processus qui tourne, `GET /internal/admin/tool-registry`).
Sur toute la base : **29 190 contacts, 46 avec une trace d'enrichissement (0,16 %)**. Sur le compte de
l'issue : 8 contacts, 1 e-mail, **0 trace**. La cascade n'a jamais tourné dessus.

Le sujet est la **DÉCOUVERTE**, pas l'enrichissement — `phase2_contacts.py:544-549` nomme lui-même
le ciblage comme « the root cause of the 8-10-contacts symptom », puis `CONTACTS_ENRICH_MAX` (50) et
`CONTACTS_ENRICH_TOP_N` (15) bornent la suite. Détail complet en commentaire sur l'issue.

### Deux défauts vivants sortis des recomptages, vérifiés par script

1. **La sélection de `/accounts` n'a AUCUN producteur.** `selectedIds` naît vide et n'est jamais
   alimenté ; `AccountsTable` ne reçoit aucune prop de sélection ; `AccountTableRow` n'a aucune
   `Checkbox`. **`SelectionBar`, `CompareDialog`, `CompareDialogTable`, `CompareAiSection` et
   `CompareBestBanner` sont définis, testés et inatteignables.** Confirmé À L'ÉCRAN.
   ⚠️ Un agent travaillait dessus (branche `feat/accounts-selection`) — **vérifier son état avant de
   recoder** : `git branch -a | grep accounts-selection`.
2. **Un score non mesurable sort à `0`**, dans les DEUX moteurs (`engine.ts:158`,
   `consultant-matching.ts:368`). Interdit « non mesuré n'est jamais 0 ». Parqué **D63**.

---

## 3. Les décisions parquées — appliquer la recommandation si Louis ne tranche pas

Au **§12.6** du tracker. D58 → D61 (du 28/08), plus les deux nouvelles :

- **D62 — la séniorité.** `c28_seniorite` se déclare `codeState: 'implemented'` sur une formulation
  que `cv-parse.service.ts:218-222` n'applique pas. Recommandation : **corriger le REGISTRE**, pas le
  code. Un registre qui se dit implémenté sans l'être est une garde borgne au niveau de la doctrine.
- **D63 — le score à zéro.** Recommandation : rendre le score `nullable` et refuser de classer sous
  un plancher d'axes, en copiant `overflow-score.ts:31,322` (`OVERFLOW_MIN_AXES = 2`).
  ⚠️ **Chantier réel** : le contrat voyage vers Python (`sync_schemas`) et vers l'écran — migration de
  contrat AVANT le code qui l'écrit. À faire en lot dédié.

---

## 4. Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

⚠️ **#1195 reste NON OBSERVABLE.** Le balayeur d'interventions est un `@Cron('10 6 * * *')`
(`interventions.sweeper.ts:96`) et il n'existe **aucun déclencheur manuel**. La session du 28 s'est
terminée à 23 h, sept heures trop tôt.

**À faire le 29 au matin, après 06 h 10** : ouvrir `/briefing` puis `/pilotage` et vérifier que la
file « Ce qui m'attend » porte enfin d'autres natures que `account_untouched` — au minimum
`account_no_next_action` (l'espace a 383 projets détectés) et `project_no_decision`. Si elles
n'apparaissent pas, **c'est un défaut** : lire `intervention-rules.ts:373,437,484,524,577` et
`interventions.sweeper.ts:148-152`.

Par ailleurs, les recomptages de PDF-04 et PDF-05 sont **statiques** : aucune exécution, aucune
vérification par rôle réel ni par palier d'offre, **le mode démo n'a pas été mesuré** sur ces
périmètres, et la parité i18n de PDF-05 n'a pas été contrôlée.

---

## 5. Ce qui reste, dans l'ordre où je le ferais

1. **La recette du matin** (§4) — c'est la preuve qui manque à #1195, et elle a une fenêtre.
2. **Le rail de sélection de `/accounts`** — préalable qui débloque 8 actions de masse de PDF-04, et
   qui rend atteignables cinq composants déjà écrits.
3. **Les 3 lots de code restants de PDF-02** : #88 CA généré par consultant, #85 CA potentiel total
   des besoins, #24 logo client au cockpit.
4. **Les 4 issues encore ouvertes** : #1191 (chat en 502 — chaîne de budgets, le repli in-process du
   rate-limiter n'est pas borné), #1187 (SSE tronqué sur DASSAULT, rien n'est checkpointé avant la
   première phase), #1181 (creuser une filiale : la capacité EXISTE, rien ne la relie depuis la fiche
   compte), #1180 (le fond reste : Laura génère des liens `keywords=` sans `signals=`).
5. **Vérifier Luna en vrai** sur une analyse complète, puis élargir le corpus du banc à 3-4 comptes.
6. **PDF-03 et PDF-06** — les deux autres documents du périmètre CRM, jamais recomptés.

---

## 6. Les règles de session, toujours en vigueur

1. **Ne jamais demander la permission de continuer** entre deux lots. Louis, le 28/08 : « prends de
   l'avance […] je veux te laisser un max en autonomie ».
2. **Une décision nouvelle se PARQUE** au §12.6 avec sa recommandation et ne bloque rien.
3. **Tout agent qui lance `git` tourne en `isolation: "worktree"`**, même en lecture seule.
4. **Un rapport d'agent est une AFFIRMATION.** Recompter par script. Les quatre agents de cette
   session ont eu raison, mais chacune de leurs affirmations à fort enjeu a été re-vérifiée.
5. **PR d'intégration plutôt que PR courtes** tant que la CI est lente.

---

## 7. Les pièges d'outillage — ceux qui ont mordu CETTE nuit

- **`railway variables` sans `--service` rend une liste VIDE** avec un code de sortie 0. Le service
  de l'API est `belllum-backend-service`, celui de l'IA `bellum-ia-service`. Un « 0 clé » y ressemble
  trait pour trait à « aucune clé posée ».
- **`ls` rend « (empty) » sur un dossier plein** (interception `rtk`) — `tools/avancement` contient
  649 lignes de Python et `ls` a dit vide. Seul le code de sortie prouve.
- **PostgREST plafonne à 1000 lignes**, `limit=30000` compris — une distribution calculée dessus est
  un échantillon biaisé, pas la base.
- **Une cassure de test adverse doit être ASSERTÉE.** Mon premier `sed` de cassure visait un
  espacement qui n'existait pas : il n'a rien modifié, le test est resté vert, et j'ai failli
  conclure à une garde borgne. Toujours `assert t.count(cible) == 1` avant de casser.
- **Les fichiers du dépôt contiennent des espaces INSÉCABLES** (`\xa0`) avant les `%` — un
  `str.replace` sur « 93 % » écrit avec une espace normale ne matche pas.
- **`agent_docs/sources/` n'existe QUE dans le checkout principal** : copier la source dans le
  scratchpad avant de lancer un agent en worktree, sinon il lit zéro avec un code de sortie 0.
- **La CI ne se déclenche que sur une `pull_request`** — un merge direct sur `main` ne lance rien.
