# Lot 28 — Analyser · signaux du site (#4738)

Périmètre : apps/ia/app/services/firecrawl.py, apps/ia/tests/test_firecrawl.py

## Fait

- #4738 (partiel) : `HIGH_VALUE_KEYWORDS` nomme maintenant les URL de projet, chantier, blog, événement,
  agenda, partenariat, emploi, implantation, ouverture, investissement, acquisition. Avant, ces pages
  tombaient au niveau du bruit et le budget de scrape (12 pages) les laissait de côté.
  Garde #4738 (déjà nommé dans le fichier) ; les mots bas (`LOW_VALUE_KEYWORDS`) ne bougent pas.
- Test rouge puis vert : `test_url_priority_ne_laisse_pas_une_page_de_signal_au_niveau_du_bruit` (11 URL),
  `test_url_priority_garde_les_pages_de_faible_valeur_en_bas`.

## Pas fait, et pourquoi

- #4738 ne se ferme pas : « page non lue » vs « lue sans être exploitée » exige l'exemple de compte/URL
  demandé dans l'issue (À préciser). Les couches `signal_layers.py` / `dated_signals.py` ne sont pas touchées.
- #4743 (mentions légales) : même mécanisme, autre issue, non touchée.
- #4646 (P0, rejeu avec compétences + périmètre) : chantier multi-couches qui recouvre #4432 — « jamais en
  parallèle ». Non commencé : arbitrage Louis.
- #4294.6 (FAIL en recette : doublon d'article entre `OpportunityCards` et `QualificationLeadsQueue`),
  .7, .8, .9, .10 : non commencés, hors du périmètre de ce lot.
