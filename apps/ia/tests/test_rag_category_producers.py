"""Chaque catégorie RAG déclarée a un PRODUCTEUR, ou une raison écrite.

Le défaut : ``RAG_CATEGORIES`` déclare neuf catégories ; trois seulement étaient
écrites par la distillation. Les six autres n'avaient AUCUN producteur — et
aucun lecteur non plus : la catégorie ne descend même pas dans le prompt. Une
constante qui ne désigne rien finit par désigner ce que quelqu'un devine.

Même discipline que ``demo-coverage.ts`` côté API, et pour la même raison :
« produite, ou vide à dessein AVEC SA RAISON ». Ce qui est interdit, c'est le
troisième état — déclarée, jamais produite, personne ne sait pourquoi.

⚠️ Ne jamais déplacer une catégorie vers ``CATEGORIES_WITHOUT_PRODUCER`` pour
faire passer ce test. La raison doit dire ce que la catégorie tiendrait ET
pourquoi rien ne la produit aujourd'hui.
"""

from __future__ import annotations

from app.services.rag_knowledge import (
    CATEGORIES_WITHOUT_PRODUCER,
    CATEGORY_ACCOUNT,
    CATEGORY_ANGLE,
    CATEGORY_OBJECTION,
    CATEGORY_SECTOR,
    RAG_CATEGORIES,
    _distill_docs,
)

# Une analyse complète, telle qu'elle arrive de la phase 2 / phase 4 — la forme
# réelle (alias camelCase pour les champs aliasés, snake_case pour `Objection`,
# qui n'en porte pas).
RESEARCH = {
    "companyName": "ACME",
    "sector": "Banque",
    "businessDescription": "Banque de détail",
    "employees": "12 000",
    "revenue": "3,2 Md€",
    "headquarters": "Paris",
    "pains": [{"pain": "Dette technique sur le core banking"}],
    "itChallenges": [{"title": "Migration cloud souverain"}],
    "angles": [{"title": "Souveraineté", "rationale": "DORA impose une reprise testée"}],
    # Un cas d'accès RÉEL : sans lui, `CATEGORY_ACCESS` n'est jamais produite par
    # ce corpus, et la garde ne peut pas voir la contradiction — elle vérifierait
    # un cas qu'elle ne contient pas. `access_fact` EST produite (voir
    # `_distill_docs`, bloc 4) ; ce champ le prouve à la garde.
    "commentOuvrirCompte": "Entrer par le référencement achats déjà en cours sur le lot cybersécurité.",
    "objections": [
        {
            "objection": "On a déjà nos ESN partenaires",
            "real_concern": "Changer coûte de l'énergie",
            "response": "On complète, on ne remplace pas",
            "mirror_question": "Quel sujet IT vous manque d'agilité ?",
        },
        {
            "objection": "Pas de budget cette année",
            "real_concern": "Ce n'est pas prioritaire",
            "response": "Le budget se débloque quand le coût de l'inaction est chiffré",
            "mirror_question": "Que coûte un mois de retard sur ce chantier ?",
        },
    ],
}

PLAN = {"actionPlan": {"strategy": "Entrer par la conformité DORA"}}


def _produced_categories() -> set[str]:
    docs = _distill_docs("ACME", RESEARCH, PLAN)
    assert docs, "la distillation ne produit RIEN sur un dossier complet — le corpus du test est vide"
    return {d["category"] for d in docs}


def test_la_garde_lit_quelque_chose():
    # Une garde qui mesure un corpus vide est verte pour toujours.
    assert len(RAG_CATEGORIES) == 9
    produced = _produced_categories()
    assert {CATEGORY_ACCOUNT, CATEGORY_SECTOR, CATEGORY_ANGLE} <= produced


def test_chaque_categorie_declaree_est_produite_ou_porte_sa_raison():
    produced = _produced_categories()
    orphans = [c for c in RAG_CATEGORIES if c not in produced and c not in CATEGORIES_WITHOUT_PRODUCER]
    assert orphans == [], (
        f"catégories déclarées sans producteur ni raison écrite : {orphans}. "
        "Soit tu la produis, soit tu écris ce qu'elle tiendrait et pourquoi rien ne la produit."
    )


def test_aucune_raison_ne_survit_a_son_producteur():
    # Le pendant : une catégorie qu'on s'est mis à produire ne doit pas rester
    # listée « sans producteur » — la justification deviendrait un mensonge.
    produced = _produced_categories()
    stale = sorted(produced & set(CATEGORIES_WITHOUT_PRODUCER))
    assert stale == [], f"ces catégories ont un producteur mais sont encore listées sans : {stale}"


def test_chaque_raison_est_ecrite_pas_un_placeholder():
    for category, reason in CATEGORIES_WITHOUT_PRODUCER.items():
        assert category in RAG_CATEGORIES, f"{category} n'est pas une catégorie déclarée"
        assert len(reason) >= 120, f"la raison de {category} est trop courte pour dire quoi que ce soit"
        assert "TODO" not in reason and "à faire" not in reason.lower()


# ── le producteur qui a été branché ──────────────────────────────────────────


def test_les_objections_du_dossier_deviennent_des_documents_de_connaissance():
    docs = [d for d in _distill_docs("ACME", RESEARCH, PLAN) if d["category"] == CATEGORY_OBJECTION]
    assert len(docs) == 2
    assert "On a déjà nos ESN partenaires" in docs[0]["title"]
    body = docs[0]["content"]
    assert "Changer coûte de l'énergie" in body
    assert "On complète, on ne remplace pas" in body
    assert "Quel sujet IT vous manque d'agilité ?" in body


def test_une_objection_sans_libelle_ne_produit_rien_plutot_quun_document_vide():
    research = {**RESEARCH, "objections": [{"real_concern": "sans intitulé"}, "pas un dict", None]}
    assert [d for d in _distill_docs("ACME", research, PLAN) if d["category"] == CATEGORY_OBJECTION] == []


def test_un_dossier_sans_objection_est_byte_identique_a_avant():
    research = {k: v for k, v in RESEARCH.items() if k != "objections"}
    assert [d for d in _distill_docs("ACME", research, PLAN) if d["category"] == CATEGORY_OBJECTION] == []


def test_le_champ_alias_camelCase_est_lu_aussi():
    # `Objection` ne porte pas d'alias aujourd'hui : ses clés restent en
    # snake_case même sous `model_dump(by_alias=True)`. Le jour où quelqu'un en
    # pose un, le producteur ne doit pas devenir muet en silence.
    research = {
        **RESEARCH,
        "objections": [{"objection": "Trop cher", "realConcern": "Je compare", "mirrorQuestion": "À quoi ?"}],
    }
    doc = next(d for d in _distill_docs("ACME", research, PLAN) if d["category"] == CATEGORY_OBJECTION)
    assert "Je compare" in doc["content"]
    assert "À quoi ?" in doc["content"]
