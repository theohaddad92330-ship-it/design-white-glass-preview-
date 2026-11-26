# Archive `08` — code courant, diff et point d'entrée — 25 août 2026

Source : `BELLUMAI_ITERATION_3_08_CODE_CURRENT_REPO_DIFF_AND_CLAUDE_ENTRYPOINT_2026-08-24.zip`
(163 fichiers déclarés, 163 présents). Mode **auditer**.

**Résultat : aucune exigence, aucune perte.** Ce paquet ne demande rien — il
donne un point d'entrée et des miroirs. Sa valeur est une preuve, pas un
livrable, et elle est négative dans les deux sens qui comptent : rien à
implémenter, et rien n'a disparu du dépôt.

C'est le résultat qu'on voulait obtenir AVANT d'ouvrir les huit paquets
thématiques restants — il dit qu'aucune étape de récupération n'est nécessaire.

---

## 1. Ce que le paquet contient, et pourquoi rien n'en sort

| Bloc                                       | Fichiers | Verdict                                                                                                                                                                      |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_ENTRYPOINT.md` + `README.md`  | 2        | Doctrine d'exécution en 8 points. **Identique en substance** au workflow du paquet `00` (§1.6 de `gouvernance-iteration-3-2026-08-25.md`), déjà tenue                        |
| `audit/ORION_AUDIT_BASELINE_2026-08-24.md` | 1        | **Byte-identique** à `CURRENT_IMPLEMENTATION_BASELINE.md` du paquet `00` (sha256 `7cc4833c…`). Croisé affirmation par affirmation au §1.6 — rien à refaire                   |
| `audit/repo_diff_reports/`                 | 18       | **Byte-identiques** aux 18 du paquet `00`. Déjà classés (dont `migrations.txt`, vide, et `missing_relative_imports.json`, faux positifs intégraux)                           |
| `repo_readable/`                           | 140      | Miroirs de nos `CLAUDE.md`, `VISION.md`, `DOMAINS.md`, `TECHNICAL_DOCUMENTATION.md`, `AGENTS.md`, `package.json` et 134 `agent_docs/` — voir §2                              |
| `repo_snapshots/`                          | 2        | Notre propre code au 24/08 et sa version précédente. **Non porteurs** : le dépôt courant prévaut (précédence, niveau 1) et nous avons l'historique git que l'archive n'a pas |

163 = 2 + 1 + 18 + 140 + 2. Aucun fichier hors compte.

---

## 2. La seule question qui valait d'être posée

Un paquet de miroirs sert à une chose : détecter ce qui a **disparu**. Deux
comparaisons, dans cet ordre.

**Les documents.** Les 140 miroirs comparés au dépôt par empreinte :

- **138 byte-identiques** ;
- **2 divergents** — `CLAUDE.md` et `agent_docs/addendum-stelya-industrial-2026-08-24.md`.
  Vérifié dans le bon sens : la divergence est **purement additive**, zéro ligne
  de l'archive n'est absente du dépôt (l'addendum est passé de 381 à 432 lignes) ;
- **0 absent.**

**Le code.** Le snapshot du 24/08 porte **5 247 fichiers** — le chiffre exact
que la baseline annonce, ce qui la confirme au passage. Comparé aux 5 316
fichiers suivis par git aujourd'hui, **trois** ont disparu :

```
.claude/skills/pdf-chantier/SKILL.md
.claude/skills/pdf-chantier/references/conventions.md
.claude/skills/pdf-chantier/references/verification.md
```

Ce sont les trois du skill `pdf-chantier`, **retiré délibérément** et remplacé
par `.claude/skills/chantier/`. Suppression voulue, pas une perte.

---

## 3. Ce qu'on ne promet pas

| Sujet                                          | Raison                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Rejouer le diff `(4)` → `(5)`                  | C'est notre propre historique de commits, et nous l'avons en entier. L'archive en est privée (« aucun `.git` dans le snapshot ») ; nous, non |
| Extraire quoi que ce soit des `repo_snapshots` | Le dépôt courant est la vérité d'implémentation, niveau 1 de la précédence. Un snapshot d'il y a un jour ne peut que dire moins              |
| Reprendre le point d'entrée en 8 points        | Il redit le workflow du paquet `00`, déjà inventorié et tenu                                                                                 |

---

## 4. Certificat d'épuisement

**Passe A — dénombrement depuis la matière brute :** 163 fichiers déclarés au
manifeste, 163 dans l'archive, 163 classés au §1. Aucun blanc.

**Passe B — la question inversée** est ici la seule qui compte, et elle a été
posée mécaniquement plutôt que par relecture : « qu'est-ce que l'archive contient
et que le dépôt n'a plus ? » Deux comparaisons par empreinte, documents puis
code (§2). Réponse : trois fichiers, tous supprimés volontairement.

Aucun lot, donc aucun merge ni recette : **une archive dont l'audit ne trouve
rien ne justifie pas un changement de code**, et en fabriquer un pour « avoir
livré quelque chose » serait le contraire de ce que ce chantier vérifie.

**Décision : l'archive `08_CODE_CURRENT_REPO_DIFF_AND_CLAUDE_ENTRYPOINT` est
ÉPUISÉE.**
