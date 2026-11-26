"""#3203 (LAU-FINAL-209) — le delivery fit d'un compte, distinct de la
politique de télétravail de ses salariés."""

from __future__ import annotations

from app.services.delivery_fit import (
    DELIVERY_FIT_AXES,
    classify_delivery_fit,
    classify_delivery_fit_axes,
    compose_delivery_fit_axes,
    delivery_fit_response_hint,
)


def test_texte_vide_rend_unknown() -> None:
    assert classify_delivery_fit(None) == "unknown"
    assert classify_delivery_fit("") == "unknown"
    assert classify_delivery_fit(None, None) == "unknown"


def test_remote_salarie_seul_ne_qualifie_jamais_compatible() -> None:
    # NO-GO explicite de la spec : le mot « remote » présent sur une page ne
    # suffit pas à qualifier le compte compatible nearshore. Un texte qui ne
    # parle QUE du télétravail des salariés reste `unknown`.
    assert classify_delivery_fit("Full remote pour nos salaries, 2 jours de teletravail") == "unknown"
    assert classify_delivery_fit("Poste en hybride, teletravail partiel possible") == "unknown"


def test_marqueur_explicite_de_delivery_externe_rend_compatible() -> None:
    assert classify_delivery_fit("Nous sommes ouverts a la sous-traitance pour ce projet") == "compatible"


def test_indice_convergent_sans_preuve_suffisante_rend_potentially_compatible() -> None:
    assert classify_delivery_fit("Recherche prestataires pour renforcer l'equipe") == "potentially_compatible"


def test_contrainte_explicite_rend_incompatible() -> None:
    assert (
        classify_delivery_fit("Intervention uniquement en France, aucune prestation hors de France") == "incompatible"
    )
    assert classify_delivery_fit("Habilitation secret defense obligatoire pour ce poste") == "incompatible"


def test_incompatible_l_emporte_sur_un_marqueur_positif() -> None:
    # Une contrainte explicite prime toujours sur un indice convergent ou
    # même un marqueur positif dans le même texte — jamais moyenné.
    assert classify_delivery_fit("Prestataires bienvenus, mais intervention uniquement en France") == "incompatible"


def test_plusieurs_textes_sont_combines() -> None:
    assert classify_delivery_fit("Poste en full remote", "Ouverts a la sous-traitance") == "compatible"


# ── #3226 (#3203.4) — les treize axes, séparément ──────────────────────────


def test_texte_vide_rend_les_treize_axes_unknown() -> None:
    axes = classify_delivery_fit_axes(None)
    assert set(axes) == set(DELIVERY_FIT_AXES)
    assert all(level == "unknown" for level in axes.values())


def test_site_presence_est_evalue_separement_des_autres_axes() -> None:
    axes = classify_delivery_fit_axes("Presence obligatoire sur site tous les jours")
    assert axes["site_presence"] == "incompatible"
    # Un marqueur de PRÉSENCE ne qualifie rien des pays autorisés — axes
    # scopés séparément (§ ticket : « évaluer séparément »).
    assert axes["authorized_countries"] == "unknown"


def test_authorized_countries_hors_de_france() -> None:
    axes = classify_delivery_fit_axes("Aucune prestation hors de France")
    assert axes["authorized_countries"] == "incompatible"


def test_authorized_countries_nearshore_accepte() -> None:
    axes = classify_delivery_fit_axes("Nearshore accepte pour ce projet")
    assert axes["authorized_countries"] == "compatible"


def test_clearances_habilitation_defense() -> None:
    axes = classify_delivery_fit_axes("Habilitation secret defense obligatoire")
    assert axes["clearances"] == "incompatible"


def test_sensitive_data_est_une_verification_jamais_une_incompatibilite_seule() -> None:
    axes = classify_delivery_fit_axes("Ce poste manipule des donnees sensibles")
    assert axes["sensitive_data"] == "potentially_compatible"


def test_team_model_equipe_distribuee() -> None:
    axes = classify_delivery_fit_axes("Nous fonctionnons en equipe distribuee")
    assert axes["team_model"] == "potentially_compatible"


def test_travel_deplacements_frequents() -> None:
    axes = classify_delivery_fit_axes("Deplacements frequents a prevoir")
    assert axes["travel"] == "potentially_compatible"


def test_les_treize_axes_restent_toujours_nommes_sans_marqueur() -> None:
    # Sans marqueur, les treize sont NOMMÉS et `unknown` — jamais omis, jamais
    # devinés (« un silence n'est jamais un fait »).
    for text in (None, "", "Nous recrutons un developpeur Java, full remote pour nos salaries"):
        axes = classify_delivery_fit_axes(text)
        assert tuple(axes) == DELIVERY_FIT_AXES
        assert set(axes.values()) == {"unknown"}


# ── #3237 (#3203.4, reste) — les six axes branchés sur le texte ────────────
# Même patron que les six premiers : marqueurs EXPLICITES, une table par axe.


def test_presence_frequency_cinq_jours_sur_site_est_incompatible() -> None:
    axes = classify_delivery_fit_axes("Presence 5 jours par semaine sur site exigee")
    assert axes["presence_frequency"] == "incompatible"


def test_presence_frequency_ponctuelle_est_compatible_et_partielle_a_verifier() -> None:
    assert classify_delivery_fit_axes("Presence ponctuelle sur site")["presence_frequency"] == "compatible"
    assert classify_delivery_fit_axes("3 jours sur site par semaine")["presence_frequency"] == "potentially_compatible"


def test_languages_francais_exige_incompatible_anglais_de_travail_compatible() -> None:
    assert classify_delivery_fit_axes("Francais courant exige")["languages"] == "incompatible"
    assert classify_delivery_fit_axes("Langue de travail anglais")["languages"] == "compatible"
    # Une contrainte explicite prime sur un marqueur positif du même texte.
    both = classify_delivery_fit_axes("Francais courant exige, langue de travail anglais")
    assert both["languages"] == "incompatible"


def test_timezones_contrainte_et_flexibilite() -> None:
    assert classify_delivery_fit_axes("Meme fuseau horaire que l'equipe")["timezones"] == "incompatible"
    assert classify_delivery_fit_axes("Horaires flexibles, sans contrainte de fuseau")["timezones"] == "compatible"
    assert classify_delivery_fit_axes("Chevauchement horaire de 4 heures")["timezones"] == "potentially_compatible"


def test_security_acces_distant_interdit_incompatible_iso_a_verifier() -> None:
    assert classify_delivery_fit_axes("Acces distant interdit")["security"] == "incompatible"
    assert classify_delivery_fit_axes("Certification ISO 27001 demandee")["security"] == "potentially_compatible"


def test_mandated_equipment() -> None:
    assert classify_delivery_fit_axes("Materiel du client obligatoire")["mandated_equipment"] == "incompatible"
    assert classify_delivery_fit_axes("BYOD accepte")["mandated_equipment"] == "compatible"
    assert classify_delivery_fit_axes("Poste fourni")["mandated_equipment"] == "potentially_compatible"


def test_contractual_status_ne_se_deduit_jamais_du_contract_type() -> None:
    # Le statut attendu d'un PRESTATAIRE se lit dans une mention explicite, jamais
    # depuis un « CDI » de recrutement direct (E18 : ce serait inventer un signal).
    assert classify_delivery_fit_axes("CDI, poste a Paris")["contractual_status"] == "unknown"
    assert classify_delivery_fit_axes("Pas de freelance")["contractual_status"] == "incompatible"
    assert classify_delivery_fit_axes("Freelances acceptes")["contractual_status"] == "compatible"
    assert classify_delivery_fit_axes("Mission en regie")["contractual_status"] == "potentially_compatible"


def test_un_marqueur_d_un_axe_ne_qualifie_jamais_un_autre_axe() -> None:
    # « évaluer séparément » : la langue ne colore pas les fuseaux, etc.
    axes = classify_delivery_fit_axes("Francais courant exige")
    assert axes["languages"] == "incompatible"
    for other in DELIVERY_FIT_AXES:
        if other != "languages":
            assert axes[other] == "unknown"


def test_la_composition_ne_masque_pas_un_nouvel_axe_incompatible() -> None:
    axes = classify_delivery_fit_axes("Langue de travail anglais, acces distant interdit")
    assert axes["languages"] == "compatible" and axes["security"] == "incompatible"
    assert compose_delivery_fit_axes(axes) == "incompatible"


# ── #3237 (#3203.4, reste) — source_freshness, le treizième axe ────────────
# « source et fraîcheur » : un seul axe du ticket, composé depuis
# `signal_freshness.classify_signal_freshness` déjà calculé par l'appelant
# (GA-26, jamais un second calcul de date ici) — jamais depuis le texte.


def test_source_freshness_sans_argument_reste_unknown() -> None:
    # Additif : un appelant qui ne passe pas `freshness` (tous les appels
    # existants) obtient exactement le même résultat qu'avant ce lot.
    axes = classify_delivery_fit_axes("Nearshore accepte")
    assert axes["source_freshness"] == "unknown"


def test_source_freshness_archive_est_une_verification_jamais_une_incompatibilite() -> None:
    # Un signal périmé n'est pas la PREUVE d'un refus de delivery externe —
    # seulement un doute sur la fiabilité de ce que dit CE signal. Le classer
    # `incompatible` ferait dominer tout le compte via `compose_delivery_fit_axes`
    # (un seul axe incompatible l'emporte) pour une raison qui n'a rien à voir
    # avec le delivery : jamais.
    axes = classify_delivery_fit_axes("Nearshore accepte", freshness="archive")
    assert axes["source_freshness"] == "potentially_compatible"


def test_source_freshness_current_ne_devient_jamais_compatible() -> None:
    # Une source fraîche ne PROUVE rien sur le delivery — silence, pas fait.
    axes = classify_delivery_fit_axes("Nearshore accepte", freshness="current")
    assert axes["source_freshness"] == "unknown"


def test_source_freshness_undated_reste_unknown() -> None:
    axes = classify_delivery_fit_axes("Nearshore accepte", freshness="undated")
    assert axes["source_freshness"] == "unknown"


# ── #3226 (#3203.5) — la composition, sans jamais promouvoir ni masquer ────


def test_compose_sans_axe_evalue_rend_unknown() -> None:
    axes = {axis: "unknown" for axis in DELIVERY_FIT_AXES}
    assert compose_delivery_fit_axes(axes) == "unknown"


def test_compose_un_seul_incompatible_lemporte_sur_tout_le_reste() -> None:
    axes = {axis: "compatible" for axis in DELIVERY_FIT_AXES}
    axes["clearances"] = "incompatible"
    assert compose_delivery_fit_axes(axes) == "incompatible"


def test_compose_potentially_compatible_lemporte_sur_compatible() -> None:
    axes = {axis: "unknown" for axis in DELIVERY_FIT_AXES}
    axes["site_presence"] = "compatible"
    axes["team_model"] = "potentially_compatible"
    assert compose_delivery_fit_axes(axes) == "potentially_compatible"


def test_compose_tout_compatible_rend_compatible() -> None:
    axes = {axis: "unknown" for axis in DELIVERY_FIT_AXES}
    axes["site_presence"] = "compatible"
    axes["authorized_countries"] = "compatible"
    assert compose_delivery_fit_axes(axes) == "compatible"


def test_compose_najoute_jamais_un_axe_unknown_au_compatible() -> None:
    # Onze axes `unknown`, un seul `compatible` : le résultat reste
    # `compatible` — les `unknown` ne PÈSENT PAS contre lui, ils sont
    # simplement exclus du calcul (jamais promus, jamais pénalisants).
    axes = {axis: "unknown" for axis in DELIVERY_FIT_AXES}
    axes["authorized_countries"] = "compatible"
    assert compose_delivery_fit_axes(axes) == "compatible"


# ── #3226 (#3203.7) — la formulation de réponse, pour Laura ────────────────


def test_unknown_ne_produit_aucune_phrase() -> None:
    # Laura n'annonce pas une absence de preuve à chaque signal muet.
    assert delivery_fit_response_hint("unknown") is None


def test_potentially_compatible_contraste_avec_le_remote_work_policy() -> None:
    hint = delivery_fit_response_hint("potentially_compatible", remote_work_policy="hybride")
    assert hint is not None
    assert "hybride" in hint
    assert "je n'ai aucune preuve qu'il accepte des prestataires depuis l'étranger" in hint
    assert "à vérifier" in hint


def test_potentially_compatible_sans_politique_de_teletravail_connue() -> None:
    # remote_work_policy n'est JAMAIS deviné — sans lui, la phrase reste
    # correcte, juste sans la clause de contraste.
    hint = delivery_fit_response_hint("potentially_compatible")
    assert hint is not None
    assert "à vérifier" in hint


def test_incompatible_dit_lexclusion() -> None:
    hint = delivery_fit_response_hint("incompatible")
    assert hint is not None
    assert "exclut explicitement" in hint


def test_compatible_dit_la_confirmation() -> None:
    hint = delivery_fit_response_hint("compatible")
    assert hint is not None
    assert "confirme explicitement" in hint


def test_anglais() -> None:
    hint = delivery_fit_response_hint("potentially_compatible", remote_work_policy="hybride", language="en")
    assert hint is not None
    assert "hybrid" in hint
    assert "to verify" in hint
