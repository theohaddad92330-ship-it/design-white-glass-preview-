# Prompt de reprise — retours bêta BellumAI (après la nuit du 09→10/09/2026)

> À COLLER TEL QUEL dans une session neuve, après `/clear`.

Tu reprends le traitement des retours bêta de BellumAI. Lance `/livraison:issues`.

## 1. Ce qui est TRANCHÉ — ne le repose pas

| Décision | Ce qui a été retenu |
| -------- | ------------------- |
| `#1786` — écran d'arrivée | **Laura par défaut**, mais **une correction humaine gagne** : qui a déjà choisi son écran en Réglages le garde. Seul le défaut change. |
| `#1616.2` — renommer les 7 tables du pack | **ÉCARTÉ** — 60 067 lignes en production, c'est ce que « ajout seulement » interdit. |
| `#1603.2` / `#1603.6` | Refus **PRAGMATIQUES** (données réellement disponibles), **pas** doctrinaux. Le dire ainsi. |
| `#1417.1` / `#1417.2` | Refus D79/D80 — sous **§ Design rules** de `CLAUDE.md`, **absents de `doctrine-registry.ts`**. |
| `#1472` densité | Les maquettes du 27/08 servent de référence. Non rouvert. |
| `#1639` crédits · `#1655` facture en retard | Arrêts obligatoires / condition de données absente. Non codés. |
| Cadence | Trois lots ont été mergés sans recette intermédiaire, **sur demande explicite de Louis**. Le risque a été nommé. |

## 2. MERGÉ et déployé (production sur `5e443a8ed` au moment d'écrire)

| PR | Merge | Contenu |
| -- | ----- | ------- |
| #1806 | `be21ef60d` | adressabilité au contrat + démo · `api_indisponible` timeout≠échec · GA-274 |
| #1811 | `f4ab8f55f` | import mémoire marché versionné+transactionnel · `/produit` back-office |
| #1815 | `fc32ce7d3` | 15 libellés FR hors charge utile IA · normaliseur qui les recopie |
| #1821 | `5e443a8ed` | `search_market_memory` · doublon Capgemini · `onDone` no-op |
| **#1833** | *en CI* | dossier de compte (6 points) · route d'arrivée dérivée partout + garde |

## 3. RECETTÉ en production — et ce qui ne l'est PAS

**Vu tourner** : `ADRESSABILITÉ 8/9` (jamais 20) · « ces axes sortent du dénominateur, ils ne valent pas zéro » · LVMH rend `score: null` · 8 routes balayées, zéro cassée, zéro débordement.

**JAMAIS vérifié, et nommé comme tel :**
- **« J'y arrive en cliquant »** — les clics du navigateur piloté sont **morts** (`CDP Input.dispatchMouseEvent` expire à 30 s). Le balayage s'est fait par navigation directe : ça prouve que la route répond, **pas** qu'on la trouve.
- `/projects`, `/settings`, `/team`, `/chat` — session Chrome perdue avant.
- **Les deux thèmes** · **le mobile** (non vérifiable depuis un navigateur piloté).
- **`#1815` de bout en bout** : le repli est prouvé, la clé sur une analyse NEUVE **non observée** (coûterait des crédits).

## 4. LE POINT LE PLUS IMPORTANT — `#1799` / `#1818` n'est pas réglé

Mesuré en production **après** le correctif : `GET /api/partners/on-my-accounts` rend **50 entrées dont 34 ne sont pas des entreprises**.
```
Capgemini · Capgemini — probable · Probable : Capgemini
Capgemini / Accenture / Sopra Steria (ESN généralistes)
Aucun concurrent ESN identifié dans les sources · ESN non identifiée · Non identifié
```
**L'analyse écrit de la PROSE dans un champ lu comme un nom d'entreprise**, et colle la certitude dans le nom. La normalisation de casse ne pouvait pas l'attraper. Un agent traite la source (branche `fix/un-nom-desn-est-une-societe-pas-une-phrase`).
⚠️ **Filtrer à l'écriture ne répare pas les 34 lignes déjà en base** — un rattrapage en simulation reste à décider.

## 5. Ce qui RESTE, avec son découpage

**Branches d'agents à intégrer** (vérifier `git log --oneline <branche> -1` avant de croire quoi que ce soit) :
`fix/replie-par-defaut-partout` (#1795/#1808/#1809/#1813) · `fix/pilotage-et-missions-tiennent-dans-leur-largeur` (#1804/#1805/#1807) · `chore/retirer-la-notion-de-favori` (#1800) · `fix/un-nom-desn-est-une-societe-pas-une-phrase` (#1799/#1818)

**Non dispatché, avec son plan** (les deux éclaireurs ont rendu un plan de lots complet) :
- **`#1796` fusion Territoire → Découvrir** — **11 capacités** seraient perdues, listées ; 4 pointeurs à repointer. Option A (déplacer les composants, garder les deux endpoints) recommandée avant l'option B (réécriture). **À trancher par Louis.**
- **`#1797`** `/watchlist` en modale à flèches — aucun patron précédent/suivant n'existe, à écrire. ⚠️ `Dialog` pose un `z-50` brut au lieu de l'échelle nommée : à corriger avant réutilisation.
- **Onboarding rejouable** (`#1787`/`#1794`) — aucun état « rejouable » n'existe ; le questionnaire est un ACQUIS de compte, pas un tutoriel. **Ne pas rejouer le questionnaire** (une correction humaine gagne) : un tour de produit séparé.
- **`#1793` Laura enrichit le profil** — chemin identifié : `_proposal()` + `PendingActions` + le `PUT /esn-profile` existant. Le clic reste la seule porte d'écriture.
- **`#1792` pièce jointe au signalement** — le pipeline fichier→issue **existe déjà** (`uploadScreenshot`) : c'est un raccord, pas une construction.
- **`#1791` menu « + »** — refactor UI pur. La lecture CRM est un lot à part.
- **`#1634`** — bloqué sur une requête SQL de production, écrite dans l'issue.
- **`#1636`** — bloqué sur `#1622` + `#1640.2`, **pas** sur `#1756.2` comme annoncé.
- **Le semis démo de `#1607.5`** — `demo-contact-density.ts` (contacts SIMULÉS), `apollo_enrichment.employment_history = [{ current: true, title, start_date: null }]`. Jamais sur les personnes réelles du registre.
- **`freetext`** (`discover-filters.ts:58`) — compté, envoyé, sauvegardé, et **absent de tout le rendu**. À exposer ou retirer.

## 6. ⚠️ Les pièges payés dans CE lot — ne les repaie pas

1. **`echo "rc=$?"` derrière un `tail` rend le code de `tail`.** Il a annoncé `rc=0` sur un `tsc` **rouge**. Mesurer le binaire, pas le tuyau.
2. **Le `dist/` de `@bellum/contracts` périme** : un champ présent dans la source manquait au type. `pnpm --filter @bellum/contracts build` avant de croire un rouge de `tsc` web.
3. **`git checkout` échoue si un worktree tient la branche** — et le `exit 0` venait du `checkout main` final : la suite n'avait **jamais tourné**. Vérifier un lot d'agent **dans son worktree**.
4. **`history.pushState` + `PopStateEvent` ne re-rend PAS** : douze routes ont rendu **exactement 8 499 caractères**. Une vraie navigation par route, ou rien.
5. **Les clics du navigateur piloté sont morts** (`CDP` 30 s) alors que `navigate` et `javascript_tool` répondent. Ce n'est pas l'application.
6. **Une garde neuve est trop gourmande au premier jet** : la mienne attrapait douze fichiers sains. Toujours écrire le **témoin** avant de la déclarer.
7. **PATH perdu dans une boucle `while`** du bac à sable (`tr`, `head`, `basename` introuvables) → chemins absolus.
8. **GA-252 attrape « Laura » écrit en toutes lettres** dans une traduction — le copilote est renommable, `{{copilot}}` est résolu globalement par `defaultVariables`.

## 7. La méthode qui a marché

Éclaireurs en lecture seule d'abord (7), écrivains en worktrees isolés ensuite (jusqu'à 7 en parallèle, 72-88 % de mémoire libre), intégrateur qui **reposa les câbles coupés par les périmètres stricts** — c'est là qu'était la valeur : le normaliseur de Découvrir, les trois chemins d'arrivée, deux docblocks périmés.
**Chaque rapport d'agent a été vérifié** (commit réel, `diff --stat`, tests relancés). Trois de mes propres briefs étaient faux et la mesure les a corrigés.
