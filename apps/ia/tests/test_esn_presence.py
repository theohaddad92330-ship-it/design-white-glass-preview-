"""« Les ESN concurrentes déjà présentes » : vue actionnable (concurrence vs rang-2)
construite déterministe depuis les concurrents détectés + la battlecard ESN."""

from __future__ import annotations

from app.services.esn_presence import (
    _looks_like_a_company_name,
    _strip_certainty_decoration,
    build_esn_presence,
)


def test_empty_when_no_competitors():
    assert build_esn_presence(None) == []
    assert build_esn_presence([]) == []
    assert build_esn_presence(["not-a-dict"]) == []


def test_known_esn_enriched_with_battlecard_and_two_angles():
    comps = [
        {
            "name": "Capgemini",
            "scope": "TMA SAP sur la DSI groupe",
            "contractType": "forfait",
            "differentiationStrategy": "jouer l'expertise senior de niche",
        }
    ]
    out = build_esn_presence(comps)
    assert len(out) == 1
    e = out[0]
    assert e["name"] == "Capgemini"
    assert e["isKnownEsn"] is True  # présent dans competitor_intel.json
    assert e["presence"] == "confirmée"  # a un périmètre → preuve
    assert "TMA SAP" in e["evidence"]
    # deux actions distinctes : concurrencer ET partenariat rang-2
    assert "expertise senior" in e["competeAngle"]
    assert "Rang 2" in e["partnershipAngle"] and "Capgemini" in e["partnershipAngle"]
    # battlecard : faiblesses exploitables + TJM
    assert e["weaknesses"]
    assert e["tjmRange"]


def test_unknown_esn_still_gets_partnership_angle():
    # #1799 (quatrième tour) — était « ESN Régionale XYZ » : depuis
    # `GENERIC_HEAD_NOUN_RE`, un nom qui COMMENCE par « ESN » est justement
    # une description de catégorie, pas une société — cette fixture aurait
    # été rejetée à raison. Renommé en un nom plausible qui ne porte aucun
    # nom de tête générique.
    comps = [{"name": "Nexialis Systèmes", "scope": "infra réseau"}]
    out = build_esn_presence(comps)
    assert len(out) == 1
    e = out[0]
    assert e["isKnownEsn"] is False
    assert "Rang 2" in e["partnershipAngle"]
    assert "infra réseau" in e["partnershipAngle"]  # s'appuie sur le périmètre détecté
    assert e["tjmRange"] is None


def test_no_evidence_is_only_probable():
    out = build_esn_presence([{"name": "Atos"}])  # aucun périmètre/contrat
    assert out[0]["presence"] == "probable"
    assert out[0]["evidence"] == ""


def test_dedup_by_name():
    comps = [{"name": "Sopra Steria", "scope": "core banking"}, {"name": "SOPRA STERIA", "scope": "cloud"}]
    out = build_esn_presence(comps)
    assert len(out) == 1  # même ESN, dédupliquée


# ── Ce que le tome 1 exige : certitude, périmètre, date, source ──────────────
#
# « Aucune ESN n'est affichée sans sa certitude ET sa date » (§21.3), et
# « afficher une ESN sans date de détection » est un interdit explicite (§21.5).
# Une ESN présente sur un compte PRIVÉ est une INFÉRENCE, jamais un fait.


def test_certainty_has_three_levels_like_its_sibling_field():
    """`esnSynergies` porte déjà `certainty: forte|moyenne|faible`. On reprend
    SON vocabulaire plutôt que d'en inventer un troisième — deux échelles pour
    la même idée, sur deux champs voisins, se mettent à diverger."""
    # Connue de la battlecard ET avec un périmètre → deux corroborations.
    forte = build_esn_presence([{"name": "Capgemini", "scope": "TMA SAP"}], detected_at="2026-08-22")
    assert forte[0]["certainty"] == "forte"

    # Connue de la battlecard, sans aucune preuve de périmètre → une seule.
    moyenne = build_esn_presence([{"name": "Capgemini"}], detected_at="2026-08-22")
    assert moyenne[0]["certainty"] == "moyenne"

    # Ni connue, ni prouvée → on le dit.
    faible = build_esn_presence([{"name": "Zzz Conseil"}], detected_at="2026-08-22")
    assert faible[0]["certainty"] == "faible"


def test_every_entry_carries_the_detection_date_it_was_given():
    out = build_esn_presence([{"name": "Atos"}], detected_at="2026-08-22")
    assert out[0]["detectedAt"] == "2026-08-22"


def test_detection_date_is_never_invented():
    """Sans date fournie, le champ vaut None — jamais « aujourd'hui ».

    Fabriquer la date au moment de la LECTURE ferait vieillir une détection de
    zéro jour à chaque affichage : l'information « c'est vieux de six mois »
    disparaîtrait précisément quand elle compte."""
    out = build_esn_presence([{"name": "Atos"}])
    assert out[0]["detectedAt"] is None


def test_scope_is_emitted_and_not_only_read():
    """`scope` était lu par la fonction et jamais rendu : le périmètre estimé
    chez ce client, que le tome demande à l'écran, n'atteignait personne."""
    out = build_esn_presence([{"name": "Atos", "scope": "infogérance du poste de travail"}])
    assert out[0]["scope"] == "infogérance du poste de travail"
    assert build_esn_presence([{"name": "Atos"}])[0]["scope"] is None


def test_source_refs_are_emitted_so_the_vocabulary_stops_reading_a_dead_field():
    """`account_vocabulary.py` lit `sourceRefs` depuis le 06/07 ; la fonction ne
    l'a jamais posé, donc la lecture rendait toujours None."""
    out = build_esn_presence([{"name": "Capgemini", "scope": "TMA SAP"}])
    assert out[0]["sourceRefs"], "une entrée avec preuve doit porter sa référence"
    assert all(isinstance(r, str) and r.strip() for r in out[0]["sourceRefs"])


def test_presence_is_kept_alongside_certainty_for_readers_that_predate_it():
    """`presence` reste rendu : le dashboard-manager le lit, et un déploiement
    qui le retirerait viderait la colonne côté outil interne."""
    out = build_esn_presence([{"name": "Capgemini", "scope": "TMA SAP"}])
    assert out[0]["presence"] == "confirmée"


# ── #1799 — un nom d'ESN est une société, pas une phrase ─────────────────────
#
# Mesuré en production le 09/09/2026 sur `GET /api/partners/on-my-accounts` :
# 50 entrées, dont 34 n'étaient pas des entreprises. Deux causes, TOUTES DEUX
# dans `comp.get("name")` — le champ que cette fonction copie tel quel depuis
# la sortie du LLM (`competitors[].name`, prompt `bellum_signals.py`) :
#
# 1. de la PROSE stockée comme un nom (« Aucun concurrent ESN identifié ») —
#    la phrase de repli d'un modèle qui devait produire un minimum d'entrées ;
# 2. un degré de certitude collé DANS le nom (« Capgemini — probable »),
#    alors que `certainty` (calculé plus bas, déterministe) est SA place.
#
# Les chaînes ci-dessous sont les VALEURS RÉELLES mesurées ce soir-là.


def test_rejects_the_34_non_entities_measured_in_production():
    """Une entrée dont le nom n'est structurellement pas une société est
    ÉCARTÉE avant même d'atteindre `account_partners` — jamais stockée comme
    `null`, puisqu'un tableau n'a pas de case pour une entrée manquante :
    l'absence, ici, c'est ne pas apparaître dans la liste."""
    non_entities = [
        "Aucun concurrent ESN identifié dans les sources",
        "Aucun concurrent ESN identifié",
        "Aucun concurrent ESN identifié dans les sources fournies",
        "ESN non identifiée",
        "ESN probable non identifiée",
        "Non identifié",
        # Plusieurs sociétés écrasées dans un seul champ — on ne les sépare
        # pas (on ne devine pas 3 fiches à partir d'un seul texte), on écarte
        # l'entrée entière : c'est une non-entité, pas trois entités sûres.
        "Capgemini / Accenture / Sopra Steria (ESN généralistes)",
    ]
    out = build_esn_presence([{"name": n} for n in non_entities])
    assert out == []


def test_keeps_real_esn_names_untouched():
    for real_name in ["Capgemini", "Accenture", "Sopra Steria", "Devoteam"]:
        out = build_esn_presence([{"name": real_name}])
        assert len(out) == 1
        assert out[0]["name"] == real_name


def test_witness_an_unusually_named_real_esn_is_not_caught():
    """Le témoin exigé par la doctrine : une société RÉELLE, au nom
    inhabituel (ponctuation, plusieurs mots), ne doit JAMAIS tomber sous la
    garde qui écarte les non-entités. « Business & Decision » est une vraie
    ESN française — son nom porte une esperluette et un espace, exactement le
    genre de forme qu'une garde trop gourmande attraperait par erreur."""
    out = build_esn_presence([{"name": "Business & Decision"}])
    assert len(out) == 1
    assert out[0]["name"] == "Business & Decision"


def test_strips_the_certainty_suffix_or_prefix_from_the_name():
    """« Capgemini — probable » devient le nom « Capgemini » — la certitude
    n'est pas perdue, `certainty` (calculé juste en dessous, déterministe) la
    porte déjà séparément. On ne réinvente pas un second vocabulaire de
    certitude : on retire seulement la décoration du nom."""
    cases = {
        "Capgemini — probable": "Capgemini",
        "Probable : Capgemini": "Capgemini",
        "Accenture — probable": "Accenture",
        "Probable — Accenture": "Accenture",
        "Accenture (probable — cloud, IA, healthcare worldwide)": "Accenture",
        "Sopra Steria — probable": "Sopra Steria",
    }
    for raw, expected in cases.items():
        out = build_esn_presence([{"name": raw}])
        assert len(out) == 1, f"{raw!r} aurait dû rendre une entrée"
        assert out[0]["name"] == expected, f"{raw!r} -> {out[0]['name']!r}, attendu {expected!r}"


def test_probable_and_plain_name_merge_into_one_entry_once_deduped():
    """« Capgemini » et « Capgemini — probable » sont LA MÊME société : une
    fois la décoration retirée, `dedup_by_name` (déjà utilisé par cette
    fonction) les fusionne — comme il fusionnait déjà « Capgemini » et
    « CAPGEMINI »."""
    out = build_esn_presence([{"name": "Capgemini"}, {"name": "Capgemini — probable"}])
    assert len(out) == 1
    assert out[0]["name"] == "Capgemini"


def test_capgemini_and_capgemini_invent_stay_two_distinct_entities():
    """Ce que la garde ne doit JAMAIS faire : rapprocher deux entités
    réellement distinctes. Aucune des règles structurelles (séparateur '/',
    négation, longueur, décoration de certitude) ne touche à « Invent » —
    ce n'est ni un mot de négation ni un marqueur de certitude."""
    out = build_esn_presence([{"name": "Capgemini"}, {"name": "Capgemini Invent"}])
    assert len(out) == 2
    assert {e["name"] for e in out} == {"Capgemini", "Capgemini Invent"}


# ── #1799 / #1818 — second tour : les trois formes relevées À L'ÉCRAN ───────
#
# Le producteur (ce fichier) refuse maintenant à la SOURCE ce que la lecture
# (`apps/api/.../esn-on-accounts-merge.ts`) refuse déjà — les mêmes trois
# formes, RESTÉES après le premier rattrapage en base, mesurées le 09/09/2026
# sur `/accounts/partners` :
#
#   « Capgemini probable »                                  le suffixe exigeait un TIRET
#   « Airbus (client principal, probable partenaire IT) »   la parenthèse devait
#                                                            COMMENCER par « probable »
#   « Inetum | CGI | Devoteam »                              « | » n'était pas un séparateur
#
# Les cas ci-dessous sont la TRANSCRIPTION de
# `esn-on-accounts-merge.spec.ts` (describe « second tour ») — même corpus,
# pour que les deux implémentations soient vérifiées sur les MÊMES entrées.


def test_strips_a_bare_certainty_word_at_the_end_of_the_name():
    assert _strip_certainty_decoration("Capgemini probable") == "Capgemini"
    assert _strip_certainty_decoration("Atos possible") == "Atos"
    assert _strip_certainty_decoration("Inetum à confirmer") == "Inetum"
    # Et le nom nettoyé reste une société : il rejoint le groupe existant.
    assert _looks_like_a_company_name(_strip_certainty_decoration("Capgemini probable")) is True


def test_discards_the_whole_entry_when_the_parenthesis_is_a_sentence():
    """« Airbus (client principal, probable partenaire IT) » raboté donnerait
    « Airbus » — un CLIENT affiché comme une ESN en place chez ce compte.
    Silencieusement faux, donc pire que rien : la ligne entière est écartée."""
    phrase = "Airbus (client principal, probable partenaire IT)"
    assert _looks_like_a_company_name(_strip_certainty_decoration(phrase)) is False
    assert (
        _looks_like_a_company_name(
            _strip_certainty_decoration("Acasi (racheté par Qonto, puis intégré/fermé)")
        )
        is False
    )


def test_rejects_several_names_separated_by_a_pipe():
    """Trois sociétés séparées par « | » ne sont pas une société."""
    assert _looks_like_a_company_name("Inetum | CGI | Devoteam") is False
    assert _looks_like_a_company_name("Sopra|Steria") is False


def test_witness_real_company_names_survive_the_second_tour_rules():
    """LE TÉMOIN — une garde doit prouver qu'elle n'attrape pas ce qu'elle ne
    vise pas. Ces noms sont de vraies ESN et doivent TOUS survivre."""
    for name in [
        "Capgemini",
        "Sopra Steria",
        "Business & Decision",
        "Groupe Onepoint",
        "Open",
        "Devoteam",
        "Accenture Technology Solutions",
    ]:
        assert _strip_certainty_decoration(name) == name, name
        assert _looks_like_a_company_name(name) is True, name


def test_keeps_a_short_parenthesis_as_a_comment_and_returns_the_company():
    """Trois mots de contexte ne font pas une phrase : « Acasi » est une vraie
    ESN, et la ligne doit rejoindre son groupe plutôt que disparaître."""
    assert _strip_certainty_decoration("Acasi (acquis juillet 2026)") == "Acasi"
    assert _looks_like_a_company_name(_strip_certainty_decoration("Acasi (acquis juillet 2026)")) is True


# ── #1818 — un tiret suivi d'une CLAUSE de plusieurs mots n'est pas une
# décoration ──────────────────────────────────────────────────────────────
#
# Relevé à l'écran le 10/09/2026 sur `/accounts/partners` : « EBTrans —
# ressources internes probables ». EBTrans est un COMPTE de l'espace, pas une
# ESN — la phrase entière dit le CONTRAIRE d'une présence d'ESN. L'ancien
# suffixe ne reconnaissait qu'un tiret suivi d'un SEUL mot de certitude,
# jamais une clause de plusieurs mots accordée au pluriel.


def test_discards_a_dash_followed_by_a_multi_word_certainty_clause():
    assert _looks_like_a_company_name("EBTrans — ressources internes probables") is False
    assert _looks_like_a_company_name("Devoteam - moyens humains internes possibles") is False
    assert _looks_like_a_company_name("Atos — équipe interne supposée") is False


def test_witness_a_single_certainty_word_after_the_dash_is_still_only_stripped():
    """« Capgemini — probable » désigne bien Capgemini : un seul mot de
    certitude après le tiret reste une décoration retirée, la ligne rejoint
    son groupe. La règle neuve ne vise que les clauses de PLUSIEURS mots."""
    assert _strip_certainty_decoration("Capgemini — probable") == "Capgemini"
    assert _looks_like_a_company_name(_strip_certainty_decoration("Capgemini — probable")) is True


def test_witness_real_company_names_survive_with_or_without_a_dash():
    for name in ["Business & Decision", "Accenture Technology Solutions", "Groupe Onepoint", "Sopra Steria"]:
        assert _looks_like_a_company_name(name) is True, name


# ── #1799 (troisième tour) — une LISTE séparée par des virgules, ou un « / »
# sans espaces ───────────────────────────────────────────────────────────────
#
# Mesuré en production le 10/09/2026 sur `GET /api/partners/on-my-accounts` :
# 50 lignes, six listes séparées par des virgules et quatre « / » sans espace
# autour. Capgemini a sa PROPRE ligne (détecté seul) ET apparaît dans cinq de
# ces listes : « pourquoi y a deux fois Capgemini », six fois.


def test_discards_the_six_comma_separated_lists_measured_in_production():
    """Jamais rabotées sur leur première entité — garder « Capgemini » depuis
    « Capgemini, Accenture, Sopra Steria » lui attribuerait les comptes des
    deux autres."""
    lists = [
        "Inetum, CGI, Devoteam",
        "Sopra Steria, Capgemini, Accenture",
        "Capgemini, Accenture ou autre ESN généraliste",
        "Capgemini, Accenture, Sopra Steria",
        "Capgemini, Accenture, Sopra Steria, Atos",
        "Capgemini, Sopra Steria, Atos, Accenture",
    ]
    for name in lists:
        assert _looks_like_a_company_name(name) is False, name


def test_a_list_mixed_with_a_real_esn_leaves_only_the_real_esn():
    out = build_esn_presence(
        [
            {"name": "Capgemini"},
            {"name": "Capgemini, Accenture, Sopra Steria"},
            {"name": "Sopra Steria, Capgemini, Accenture"},
        ]
    )
    assert len(out) == 1
    assert out[0]["name"] == "Capgemini"


def test_discards_an_unspaced_slash_the_four_forms_measured_in_production():
    for name in [
        "Agences web/e-commerce généralistes",
        "Agences web/e-commerce locales",
        "Éditeur/intégrateur ERP",
        "ESN généraliste ou spécialisée retail/distribution",
    ]:
        assert _looks_like_a_company_name(name) is False, name


# ── #1799 (quatrième tour) — deux espèces résiduelles, mesurées EN PRODUCTION
# dix minutes après le correctif du troisième tour ─────────────────────────
#
# `GET /api/partners/on-my-accounts`, 50 lignes : virgule et slash ont
# disparu. Deux espèces restent — une PHRASE qui commence par une minuscule,
# et une PHRASE qui commence par un nom de tête générique.


def test_discards_lowercase_start_multiword_descriptions_measured_in_production():
    for name in [
        "cabinet de conseil IT généraliste",
        "équipe ou partenaire interne Fnac Darty",
        "équipes internes et partenaires industriels référencés",
        "freelance ou petite agence web locale",
    ]:
        assert _looks_like_a_company_name(name) is False, name


def test_witness_coconsult_a_real_esn_stylised_in_lowercase_survives():
    """La règle porte sur la PHRASE (plusieurs mots minuscules qui se lisent
    comme une description), jamais sur la casse d'un mot SEUL — sinon cette
    vraie raison sociale du référentiel serait écartée à tort."""
    assert _looks_like_a_company_name("coconsult") is True


def test_discards_generic_head_noun_descriptions_measured_in_production():
    for name in [
        "Agences digitales locales",
        "Éditeur ou intégrateur immobilier",
        "ESN généraliste locale ou régionale",
        "ESN locale Occitanie",
        "Fournisseur IT interne ou groupe E.Leclerc",
    ]:
        assert _looks_like_a_company_name(name) is False, name


def test_witness_groupe_prefixed_real_esn_names_are_not_caught():
    """« Groupe » n'est PAS un nom de tête générique — « Groupe Onepoint »,
    « Groupe Open » et « Groupe Talan » sont de vraies ESN du référentiel."""
    for name in ["Groupe Onepoint", "Groupe Open", "Groupe Talan"]:
        assert _looks_like_a_company_name(name) is True, name


# ── #1799 (cinquième tour, résidu du 10/09/2026) — « Freelances » rejoint la
# liste des noms de tête génériques. MESURÉ EN PRODUCTION sur
# `GET /api/partners/on-my-accounts` après les quatre tours précédents : 50
# entrées réduites à 2 suspects, dont « Freelances et micro-agences » — un
# SEAU DE RÉSIDU (une catégorie de marché), pas une société.


def test_discards_freelances_residual_bucket_measured_in_production():
    assert _looks_like_a_company_name("Freelances et micro-agences") is False


def test_a_freelances_bucket_mixed_with_a_real_esn_leaves_only_the_real_esn():
    out = build_esn_presence([{"name": "Freelances et micro-agences"}, {"name": "Capgemini"}])
    assert [entry["name"] for entry in out] == ["Capgemini"]


# ── #1799 (quatrième tour) — « & » et « et » sont la même conjonction ───────
#
# « Crédit Agricole Technologies & Services » et « … et Services », la MÊME
# entité, mesurées séparément en production le 10/09/2026.


def test_folds_ampersand_and_et_into_the_same_entity():
    out = build_esn_presence(
        [
            {"name": "Crédit Agricole Technologies & Services"},
            {"name": "Crédit Agricole Technologies et Services"},
        ]
    )
    assert len(out) == 1


def test_witness_elsan_and_elsan_services_stay_two_entities_despite_the_ampersand_fold():
    """Rappel du docblock de `mergeEsnByMatchKey` côté TS, rejoué ici : le
    repli « & » → « et » n'a rien à voir avec ce rapprochement, et ne doit
    pas le faire dériver."""
    out = build_esn_presence([{"name": "ELSAN"}, {"name": "ELSAN Services"}])
    assert len(out) == 2


def test_ampersand_fold_never_touches_the_displayed_name():
    """`AMPERSAND_RE` est une règle de NORMALISATION appliquée à la clé de
    rapprochement, jamais au nom stocké/affiché — « Business & Decision »
    reste « Business & Decision », pas « Business et Decision »."""
    out = build_esn_presence([{"name": "Business & Decision"}])
    assert len(out) == 1
    assert out[0]["name"] == "Business & Decision"


# ─────────────────────────────────────────────────────────────────────────
# #1590.7 — CE QUE CE MODULE GARANTIT, PUISQUE LA FUSION RESTE EN AVAL.
# ─────────────────────────────────────────────────────────────────────────
# La décision et ses quatre raisons sont écrites dans `esn_presence.py` et,
# en miroir, sur `mergePartnerEvidence` côté TypeScript. Ce que ces deux
# tests tiennent, c'est l'INVARIANT qui la rend sûre : la sortie de
# `build_esn_presence` ne nomme QUE des sociétés que le modèle a nommées.
#
# Ce n'est pas une redite des tests de filtrage au-dessus : ceux-là mesurent
# ce qui est ÉCARTÉ, celui-ci mesure qu'aucune entrée n'est AJOUTÉE. Le jour
# où quelqu'un injecterait ici les ESN observées par la mémoire marché — ce
# que #1590 (T7) demande — elles deviendraient des lignes `account_partners`
# en `source = 'analysis'`, donc une « source actuelle » en aval : une
# observation de parcours promue en présence d'aujourd'hui. Ce test tombe
# avant.


def test_1590_7_output_names_are_a_subset_of_the_model_output():
    comps = [
        {"name": "Capgemini", "scope": "TMA SI"},
        {"name": "Sopra Steria"},
    ]
    out = build_esn_presence(comps)

    # Il LIT quelque chose : sans cette ligne, une sortie vide passerait au vert.
    assert len(out) == 2
    assert {e["name"] for e in out} <= {c["name"] for c in comps}


def test_1590_7_no_entry_is_invented_when_the_model_found_nothing():
    # Le cas où une fusion en amont se verrait le plus : aucun concurrent
    # détecté, mais une mémoire marché qui en observe. Ce module n'a aucune
    # source d'entrée autre que le modèle — sa signature le dit, et sa sortie
    # le prouve.
    assert build_esn_presence([]) == []
    assert build_esn_presence([{"name": "Aucun concurrent ESN identifié"}]) == []
