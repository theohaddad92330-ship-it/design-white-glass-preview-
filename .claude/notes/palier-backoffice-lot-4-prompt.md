# Prompt de reprise — palier back-office, lot 4 (06/09/2026)

Colle ce bloc après un `/clear`.

---

`/livraison:issues`

Reprends le **palier back-office** de belllum-monorepo. Trois lots sont livrés,
vérifiés en production et clos ou commentés. Il reste **41 issues** du palier,
plus ~54 issues « MARKET MEMORY » qui sont un AUTRE chantier (ne les mélange pas).

## Ce qui est déjà fait — ne le recode pas

Lis d'abord `agent_docs/chantiers-livres.md`, section « Le palier back-office
commence — chrome, changelog, vie privée (PR #1705, #1706, #1707) ».

- **#1704** (changelog dans le manager) — CLOS, en prod.
- **#1675** (logo, badge PROD, SHA, titre d'onglet) — CLOS, en prod.
- **#1644** (rail à 6 sections) — PARTIEL. Livré avec les routes EXISTANTES.
  Chaque nouvelle route du palier prend sa place dans
  `apps/dashboard-manager/src/app/_components/nav-sections.ts` ; la garde
  `rail-et-environnement.test.ts` refuse un `href` sans page.
- **#1678** (phrase d'écran) — PARTIEL. Le reste dépend de #1677 et #1669.
- **#1670** (impersonation/RGPD) — 4 points sur 5 livrés ; le 5e (masquage) et le
  bandeau client sont en prod ou en vol. Il reste UNE question à trancher :
  les contacts prospects de `analysis/[id]` portent leur adresse dans un
  `mailto:` — la masquer proprement veut dire retirer le mailto.
- **#1671** (sécurité) — seul le point 1 (balayage) est livré.

## Décisions déjà prises par Louis, à ne pas re-poser

1. **Ordre du palier** : le chrome d'abord (fait), puis **#1668 + #1669 + #1670 +
   #1671 en priorité sur tout le reste**.
2. **#1654 (facture PDF légale)** : écarté — contredit « aucune facture légale
   n'est émise », et l'issue exige elle-même une validation comptable.

## Le lot 4 : #1668 puis #1669

**#1668 — identité + TOTP à la place du Basic Auth.** Le chemin sûr est celui que
l'issue décrit : la nouvelle couche PAR-DESSUS le Basic Auth, **inerte tant que
`DM_ALLOWED_EMAILS` est absente** (chemin byte-identique à aujourd'hui). Zéro
risque de verrouillage, et Louis allume quand il veut.

⚠️ **Deux gestes que seul Louis peut faire, à lui demander AVANT de coder** :
poser `DM_ALLOWED_EMAILS` dans le projet Vercel du manager, et enrôler un TOTP
(scanner un QR code). Sans eux, le lot se livre mais ne s'allume pas.

**#1669 — rôles owner / operator / viewer.** Dépend de #1668 : sans identité, il
n'y a rien à quoi accrocher un rôle. La matrice est dans l'issue. Le rôle se
vérifie **côté API**, pas seulement à l'écran (un viewer qui appelle
`/api/admin/users/x/delete` reçoit 403 même sans bouton).

## Ce que ce dépôt t'apprendra à tes dépens

- `#1644` est un **hexadécimal valide** : toute garde qui cherche des couleurs
  rougit sur les citations d'issue. Retire les commentaires avant de mesurer.
- **La marque ne s'écrit jamais en toutes lettres dans une traduction** (GA-252,
  marque blanche) et **le produit tutoie**. Deux gardes, deux rouges gratuits.
- Le manager a désormais **8 fichiers de test** dans `src/architecture/` et un
  job CI `Test (back-office)`. Lance-les : `pnpm --filter @bellum/dashboard-manager exec vitest run`.
- `git status | wc -l` peut rendre 0 à tort (enrobage) — écris dans un fichier et
  relis-le. Idem `git diff --name-only … | head`.
- Sous zsh, **une variable non quotée n'est pas découpée en mots** :
  `prettier --write $FILES` envoie les 18 chemins comme UN argument.

## À faire avant de merger, à chaque fois

`.claude/projet.md` §4 (les portes) et §7 (la recette live). Il n'y a **pas de
préproduction** : ne jamais avoir deux lots non recettés en prod en même temps.
