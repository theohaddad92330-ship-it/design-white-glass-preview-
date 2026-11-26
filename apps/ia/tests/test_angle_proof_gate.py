"""Le refus de servir un angle sans preuve mobilisable (T5 §32.2).

Le tome 5 écrit la règle en une phrase : « Si aucune preuve n'est disponible
pour l'univers, le produit ne génère pas de phrase. Il dit : *Aucune preuve
mobilisable dans cet univers. Collecte un REX ou écris ta propre accroche.* »

Ce fichier garde les trois moitiés de cette phrase :

* le **verdict** est à TROIS états, pas deux. « Aucune preuve » et « une preuve
  que rien ne soutient » ne sont pas la même chose et ne se disent pas pareil —
  c'est la cause racine « cassé et non mesurable se ressemblent » appliquée à la
  rédaction commerciale. Un blanc est honnête ; un nom de client inventé est ce
  qui coûte le rendez-vous.
* le **moyen est retiré, pas seulement la permission** : une preuve non
  vérifiable ne voyage PAS jusqu'à l'écran. La consigne de prompt est la
  première barrière, le gate déterministe est celle qui tient quand le modèle
  passe outre — une consigne oubliée une fois sur cent produit exactement la
  phrase qu'on ne veut pas voir dite en clientèle.
* la **source unique** : les références déclarées se lisent à UN endroit
  (``heavy_offer_gate.declared_references``), et le gate d'angle les relit — il
  n'en fabrique pas une seconde définition (GA-26).

Zéro réseau, zéro modèle : tout est déterministe.
"""

from __future__ import annotations

from app.services.angle_proof_gate import (
    PROOF_ABSENT,
    PROOF_MOBILISABLE,
    PROOF_UNVERIFIABLE,
    angle_proof_directive,
    apply_proof_gate,
    proof_verdict,
)
from app.services.heavy_offer_gate import declared_references, has_declared_proof

# ── le corpus de laboratoire ─────────────────────────────────────────────────

PROFILE_WITH_REFS = {"references": ["Decathlon", "Groupe SEB", "La Poste"]}
PROFILE_NO_REFS: dict[str, object] = {"offers": ["data"], "size": "120"}


def _angle(proof: str = "", *, title: str = "Play") -> dict[str, object]:
    return {
        "title": title,
        "strategy": "PROMESSE: réduire le lead time. ACTION: atelier de cadrage 45 min.",
        "specific_offer": "Audit SI — 3 consultants, 4 semaines",
        "proof": proof,
    }


# ── le verdict, à trois états ────────────────────────────────────────────────


def test_une_preuve_qui_cite_une_reference_declaree_est_mobilisable():
    assert proof_verdict("Mission similaire menée chez Decathlon", PROFILE_WITH_REFS) == PROOF_MOBILISABLE


def test_la_citation_survit_a_la_casse_et_aux_accents():
    """« GROUPE SEB » et « Groupe Séb » désignent la même référence.

    Les registres publics stockent en majuscules non accentuées ; un modèle
    recopie tantôt l'un tantôt l'autre. Un verdict qui dépendrait de la casse
    refuserait une preuve VRAIE, ce qui est le pire des deux échecs."""
    assert proof_verdict("Déjà en place chez GROUPE SEB", PROFILE_WITH_REFS) == PROOF_MOBILISABLE
    assert proof_verdict("Déjà en place chez groupe séb", PROFILE_WITH_REFS) == PROOF_MOBILISABLE


def test_un_champ_vide_est_absent_jamais_non_verifiable():
    """Un blanc est honnête. Le confondre avec une preuve inventée punirait le
    modèle qui a obéi à la consigne."""
    for blank in ("", "   ", None, "N/A", "à définir", "non détecté"):
        assert proof_verdict(blank, PROFILE_WITH_REFS) == PROOF_ABSENT


def test_un_nom_de_client_que_le_profil_ne_declare_pas_est_non_verifiable():
    """LE cas qui coûte un compte : le modèle cite Carrefour, l'ESN n'a jamais
    travaillé pour Carrefour, le commercial le dit en rendez-vous."""
    assert proof_verdict("Mission similaire chez Carrefour", PROFILE_WITH_REFS) == PROOF_UNVERIFIABLE


def test_sans_aucune_reference_declaree_toute_preuve_est_non_verifiable():
    assert proof_verdict("Mission similaire chez Decathlon", PROFILE_NO_REFS) == PROOF_UNVERIFIABLE
    assert proof_verdict("", PROFILE_NO_REFS) == PROOF_ABSENT


def test_une_reference_trop_courte_ne_matche_pas_tout():
    """Une référence de deux lettres se retrouverait dans n'importe quelle
    phrase et rendrait TOUT mobilisable — un gate qui dit toujours oui ne garde
    rien."""
    profile = {"references": ["SE", "IT"]}
    assert proof_verdict("Mission menée chez Carrefour", profile) == PROOF_UNVERIFIABLE


# ── le moyen est retiré, pas seulement la permission ─────────────────────────


def test_le_gate_estampille_chaque_angle():
    angles = [
        _angle("Mission chez Decathlon", title="A"),
        _angle("Mission chez Carrefour", title="B"),
        _angle("", title="C"),
    ]
    out = apply_proof_gate(angles, PROFILE_WITH_REFS)
    assert [a["proof_status"] for a in out] == [PROOF_MOBILISABLE, PROOF_UNVERIFIABLE, PROOF_ABSENT]


def test_une_preuve_non_verifiable_ne_voyage_pas_jusqu_a_l_ecran():
    """Retirer le MOYEN, pas la permission : le texte est effacé, pas seulement
    déconseillé. Ce qui reste dans la charge utile finit un jour à l'écran."""
    out = apply_proof_gate([_angle("Mission chez Carrefour")], PROFILE_WITH_REFS)
    assert out[0]["proof"] == ""
    assert "Carrefour" not in str(out[0])


def test_une_preuve_mobilisable_est_conservee_mot_pour_mot():
    out = apply_proof_gate([_angle("Mission chez Decathlon")], PROFILE_WITH_REFS)
    assert out[0]["proof"] == "Mission chez Decathlon"


def test_le_gate_ne_supprime_jamais_un_angle():
    """Un play sans preuve reste un play : on retire la promesse creuse, pas
    l'action. Supprimer l'angle priverait d'une action un utilisateur qui n'a
    pas encore rempli son profil."""
    angles = [_angle("Mission chez Carrefour", title=f"P{i}") for i in range(3)]
    out = apply_proof_gate(angles, PROFILE_NO_REFS)
    assert len(out) == 3
    assert [a["title"] for a in out] == ["P0", "P1", "P2"]


def test_le_gate_ne_touche_a_aucun_autre_champ():
    out = apply_proof_gate([_angle("Mission chez Decathlon")], PROFILE_WITH_REFS)
    assert out[0]["specific_offer"] == "Audit SI — 3 consultants, 4 semaines"
    assert out[0]["strategy"].startswith("PROMESSE")


def test_le_gate_tolere_une_entree_cassee():
    """Une liste qui n'en est pas une, un angle qui n'est pas un dict : le gate
    rend une liste, jamais une exception. Une phase entière est morte en
    production sur une virgule de sérialisation."""
    assert apply_proof_gate(None, PROFILE_WITH_REFS) == []
    assert apply_proof_gate("pas une liste", PROFILE_WITH_REFS) == []
    out = apply_proof_gate(["texte parasite", _angle("Mission chez Decathlon")], PROFILE_WITH_REFS)
    assert len(out) == 1
    assert out[0]["proof_status"] == PROOF_MOBILISABLE


def test_le_gate_lit_la_forme_camelCase_comme_la_forme_snake():
    """Le prompt émet du camelCase, le contrat de fil est en snake_case — la
    même ambiguïté a déjà vidé persona / offre / deal-size en silence."""
    out = apply_proof_gate([{"title": "A", "proof": "chez Decathlon"}], PROFILE_WITH_REFS)
    assert out[0]["proof_status"] == PROOF_MOBILISABLE


# ── la directive de prompt ───────────────────────────────────────────────────


def test_la_directive_cite_les_references_declarees():
    directive = angle_proof_directive(PROFILE_WITH_REFS)
    for ref in ("Decathlon", "Groupe SEB", "La Poste"):
        assert ref in directive


def test_la_directive_sans_reference_interdit_d_inventer_et_dit_pourquoi():
    """Le modèle doit savoir POURQUOI il n'a pas le droit, sinon il régénère
    l'interdit sous un autre nom — la leçon écrite dans ``heavy_offer_gate``."""
    directive = angle_proof_directive(PROFILE_NO_REFS)
    low = directive.lower()
    assert "aucune" in low and "reference" in _no_accent(low)
    assert "invente" in _no_accent(low)


def test_les_deux_directives_different():
    """Si les deux branches rendaient le même texte, le gate ne piloterait rien."""
    assert angle_proof_directive(PROFILE_WITH_REFS) != angle_proof_directive(PROFILE_NO_REFS)


def _no_accent(text: str) -> str:
    table = str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")
    return text.translate(table)


# ── la directive est RÉELLEMENT dans le prompt expédié ───────────────────────


def test_la_directive_est_dans_le_prompt_strategy_expedie():
    """Sans ceci, retirer la consigne du prompt ne ferait rougir qu'un instantané
    « golden » — que le premier développeur venu régénérerait sans y penser, la
    régénération étant précisément le geste normal après un changement voulu.

    Le test lie donc la consigne à SA RAISON : les deux branches du gate doivent
    apparaître dans le prompt système que le service envoie vraiment.
    """
    from app.prompts import bellum_strategy

    avec = bellum_strategy.build_system_prompt({**PROFILE_WITH_REFS, "companyName": "ACME"})
    sans = bellum_strategy.build_system_prompt({**PROFILE_NO_REFS, "companyName": "ACME"})

    assert angle_proof_directive(PROFILE_WITH_REFS) in avec
    assert angle_proof_directive(PROFILE_NO_REFS) in sans
    # …et la consigne PILOTE bien : les deux prompts diffèrent.
    assert avec != sans


def test_le_champ_proof_est_demande_dans_le_schema_de_sortie():
    """La consigne ne sert à rien si le modèle n'a pas de champ où la déposer :
    le schéma JSON du prompt UTILISATEUR doit nommer `proof`."""
    from app.prompts import bellum_strategy

    user = bellum_strategy.build_user_prompt(
        target_company="ACME",
        brave_results="",
        scraped_content="",
        pappers_data="",
    )
    assert '"proof"' in user


# ── la source unique des références déclarées (GA-26) ────────────────────────


def test_les_references_declarees_se_lisent_a_un_seul_endroit():
    """``has_declared_proof`` et le gate d'angle lisent la MÊME fonction.

    Deux lecteurs qui refont la dérivation divergent — c'est pourquoi
    ``has_declared_proof`` est désormais dérivé de ``declared_references`` au
    lieu de relire les clés lui-même."""
    assert declared_references(PROFILE_WITH_REFS) == ("Decathlon", "Groupe SEB", "La Poste")
    assert declared_references(PROFILE_NO_REFS) == ()
    assert has_declared_proof(PROFILE_WITH_REFS) is True
    assert has_declared_proof(PROFILE_NO_REFS) is False


def test_les_trois_orthographes_de_la_cle_de_references_sont_lues():
    """``references`` / ``client_references`` / ``clientReferences`` — les trois
    que ``heavy_offer_gate`` acceptait déjà. En perdre une ici ferait refuser
    une preuve VRAIE."""
    for key in ("references", "client_references", "clientReferences"):
        assert declared_references({key: ["Decathlon"]}) == ("Decathlon",)


def test_une_reference_declaree_en_chaine_unique_est_lue():
    assert declared_references({"references": "Decathlon"}) == ("Decathlon",)


def test_les_references_vides_sont_ecartees():
    assert declared_references({"references": ["", "  ", "Decathlon"]}) == ("Decathlon",)
    assert declared_references(None) == ()
