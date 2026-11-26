# Rapport — EXPORT-PROSPECTS #4387

- Branche : `claude/export-prospects-20-10` (depuis origin/main c509216d). Pas de PR.
- Logique CSV pure : `apps/dashboard-manager/src/app/prospects/prospects-export.logic.ts` (BOM, `;`, CRLF, RFC 4180, préfixe `'` devant `= + - @`, 16 colonnes, rôle en libellé, dates Paris JJ/MM/AAAA HH:MM, e-mail/téléphone en clair).
- Route : `src/app/api/admin/prospects/export/route.ts` (GET) — `exigerCapacite('leads.read')` comme la liste ; toutes les lignes de `fetchDemoLeads` ; `journaliserAudit` (catégorie `export`, `prospects.export`, nombre de lignes seulement) ; panne API → 502, jamais un fichier vide.
- Page : bouton « Exporter (CSV) — N lignes » (lien vers la route, pas de blob ; DataTable intacte).
- Garde `aucun-export-de-donnees-personnelles.test.ts` : exception NOMMÉE pour ce seul chemin, raison #4387/Louis 20/10/2026 ; tests : exception acceptée, export ailleurs (users, voisin, page) refusé, exception exacte (fichier existe et exporte).
- Tests (rouge → vert) : prospects-export.logic (16), route.test (4), garde (6), + journal-audit-a-des-ecrivains, toute-route-declare-sa-capacite, roles, prospects.logic — 61 verts. `tsc --noEmit -p apps/dashboard-manager` propre, prettier OK.
- Non fait : pas de filtre/tri sur l'écran, donc export = liste complète, plus récent d'abord. Pas de changelog manager (celui du dépôt est le changelog produit client). Premier commit local rejeté par commitlint (scope), refait en `dashboard-manager`.
- Question : la capacité reste `leads.read` (viewer) comme demandé « même autorisation que la liste » ; relever à `operator` si on veut restreindre l'export.
