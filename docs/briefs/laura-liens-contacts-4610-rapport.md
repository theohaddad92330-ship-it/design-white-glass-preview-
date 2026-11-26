# Rapport #4610 — liens vers la fiche contact dans la carte `contact_list`

Branche : `claude/laura-liens-contacts-4610`. Aucune PR.

**Fait**

- `apps/ia/app/services/contact_card_fallback.py` : `href = /contacts/<contact_id>` posé par le serveur depuis le `contact_id` rendu par `get_account_contacts` / `search_workspace_contacts`. Seul un UUID valide donne un lien ; sinon le nom reste du texte.
- Carte écrite par le modèle : son `href` est remplacé par celui de l'outil, ou retiré si la personne n'a pas de fiche lue (jamais d'identifiant inventé).
- `prompts/reply_formats.py` : `href` retiré du format `contact_list` côté modèle (« tu ne l'écris JAMAIS »).
- Tests : `tests/test_4610_contact_card_href.py` (4 tests, 3 rouges avant le code puis verts) ; 22 tests voisins verts.
- Démo : `DEMO_CONTACT_LIST_HREF_COVERAGE` (vide à dessein, raison écrite) + `demo-contact-list-href-coverage.spec.ts` ; `demo-coverage.spec.ts` vert.

**Pas fait**

- Carte `contact_list` scriptée dans le chat de démo : le script n'en porte aucune (décision antérieure, « aucune personne nommée »). Il faudrait un jeton de fiche contact résolu comme `accountHref`. Classé vide à dessein, à reprendre.
- Front inchangé : `ItemName`/`CardLink` rendent déjà le lien (`/contacts` est un préfixe lié). GA-32/33/35 non relancées ici ; pas de test web ajouté.
- Signaux : non traités (non vérifiés, issue sœur éventuelle).
- Suite complète, tsc et knip : laissés à la CI.
