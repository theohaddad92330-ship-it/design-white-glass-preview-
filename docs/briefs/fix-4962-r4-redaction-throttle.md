# Brief — fix/4962-r4-redaction-throttle (3 points, recette prod 02/11)

Plafond : 300 tours. Un livrable : commits + rapport `docs/briefs/fix-4962-r4-redaction-throttle-rapport.md`, UN push simple, puis STOP. Pas de PR.
Base : `origin/main`. Diagnostic complet (fichier:ligne) : `docs/briefs/fix-4962-r4-diagnostic.md` — le lire d'abord.

## Règles

- TDD : test rouge pour la bonne raison, puis le code. Tests CIBLÉS (≤ 5 specs ; `tsc --noEmit -p apps/api` / `-p apps/web` si besoin). JAMAIS ci:local, suite complète, check-types racine, build.
- Antériorité : `git log --oneline -15 origin/main -- <fichier>` avant de coder ; ne pas recoder ce qui existe.
- Doctrine CLAUDE.md : pas de donnée inventée, une erreur se NOMME clairement ; nos fournisseurs ne se nomment jamais à l'écran ; i18n fr + en.
- Ne pas toucher `.github/workflows`, `.claude/`, ni les migrations.

## Points

1. **Throttler sur /internal/*** — le garde global `UserThrottlerGuard` (app.module.ts ~473, 120/min) compte les appels IA→API sur un seul tracker `ip:<req.ip>` (user-throttler.guard.ts ~43-62) : une rafale Découvrir (`/internal/copilot/base/identity`) a pris 44 × 429 le 02/11 07:11 et peut affamer Laura. Attendu : une requête authentifiée par `InternalSecretGuard` (secret interne valide) n'est PAS limitée par le quota utilisateur/IP — `SkipThrottle` au bon niveau ou tracker dédié `internal:` avec un plafond large et nommé dans une constante. Une requête /internal/* SANS secret valide reste refusée (401/403) et reste throttlée. Tests : spec du garde (interne valide non compté ; sans secret compté ; utilisateur normal inchangé).
2. **« La rédaction a échoué » ne dit pas pourquoi** — `apps/web/.../conversation.ts` ~87-95 ne nomme que 4 refus ; tout autre échec (503 upstream_error, 502, timeout, 429) donne le même texte. Attendu : 429 → « Trop de rédactions en une minute, réessaie dans un instant » ; 503/502/timeout → « Le service de rédaction est momentanément indisponible » ; garder le bouton Réessayer. Test du mapping.
3. **« Planifier cet appel » muet** — `PlanCallDialog` (ApproachDialogs.tsx ~298-390) : « Créer » est désactivé quand `reason`/`objective` sont vides (script non rédigé) sans rien dire. Attendu : texte d'aide visible quand désactivé (« L'ouverture doit être rédigée avant de planifier ») OU champs pré-remplis éditables à la main pour planifier quand même — choisir le plus petit qui laisse planifier sans script (l'utilisateur doit pouvoir saisir raison et objectif lui-même). Test : bouton actif après saisie manuelle ; message quand vide.

## Rapport (≤ 15 lignes)

Par point : fait / déjà livré (commit) / impossible ; fichiers ; tests et résultat.
