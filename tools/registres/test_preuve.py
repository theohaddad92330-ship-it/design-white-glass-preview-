"""Ce que le balayage doit refuser de compter comme une livraison.

Une trace `// #NNNN.M` prouve qu'un point a été livré — SAUF quand elle
documente exactement le contraire. Trois cas réels, rencontrés le 18/09/2026 :

  need-wizard.ts:206            « #2558.1 — RETENU : le projet reste EXIGÉ ici »
  request-intent-contract.ts:73 « #2257.11 — NON PRODUIT comme champ générique »
  discover-contact-rows.ts:125  « La LOCALISATION (#2165.38) n'y est pas »

Et un quatrième, d'une autre nature : un point qui n'existe QUE dans des
tests n'a pas d'appelant — c'est le défaut n°1 de ce dépôt, pas une preuve.
"""
import importlib.util
import pathlib

_spec = importlib.util.spec_from_file_location(
    "preuve", pathlib.Path(__file__).with_name("preuve.py")
)
preuve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(preuve)


def test_une_trace_qui_documente_une_ABSENCE_n_est_jamais_une_livraison():
    assert preuve.dit_un_refus("* #2558.1 — RETENU : le projet reste EXIGÉ ici")
    assert preuve.dit_un_refus("/** #2257.11 — NON PRODUIT comme champ générique. */")
    assert preuve.dit_un_refus(" * La LOCALISATION (#2165.38) n'y est pas : aucune donnée de lieu")
    assert preuve.dit_un_refus("// #1234.5 — bloqué par #1234.2, à reprendre")


def test_une_trace_de_LIVRAISON_ordinaire_passe():
    assert not preuve.dit_un_refus("{/* #2068.32 — une valeur ABSENTE se nomme, jamais un zéro */}")
    assert not preuve.dit_un_refus("// ── Current commercial machine (#2061.10) — la CHAÎNE d'étapes")
    assert not preuve.dit_un_refus(" * « Rejoindre » (#2087.15) — pour SOI, et le jeton dit qui.")


def test_un_fichier_de_test_n_est_pas_un_appelant():
    assert preuve.est_un_test("apps/api/src/modules/consultants/cv-intake.service.spec.ts")
    assert preuve.est_un_test("apps/web/src/features/x/y.test.tsx")
    assert preuve.est_un_test("apps/web/src/architecture/une-garde.test.ts")
    assert preuve.est_un_test("apps/ia/tests/test_quelque_chose.py")
    assert not preuve.est_un_test("apps/web/src/features/discover/lib/discover-error.ts")
    assert not preuve.est_un_test("packages/contracts/src/schemas/discover.ts")


def test_le_remplacement_garde_l_habillage_d_espaces():
    """Un balayage qui reformate fait entrer CHAQUE ligne en conflit avec les
    écrivains — mesuré, deux conflits sur une seule vague d'intégration."""
    assert preuve.remplace_en_place(" retenu ", "déjà là") == " déjà là "
    assert preuve.remplace_en_place("  retenu", "déjà là") == "  déjà là"
    assert preuve.remplace_en_place("", "déjà là") == " déjà là "


def test_une_preuve_qui_demande_un_ECRAN_ne_se_flippe_jamais_au_code():
    """Le garde-fou du mode `--livre`.

    Quand une vague atterrit, un point `livré` est sur `main`, donc sur la
    production. Mais « rien n'est clos sans avoir été vu tourner » : une mise en
    page, une hauteur de carte, un rendu mobile ne se prouvent pas en lisant du
    code. Ces points-là attendent un recetteur, quoi que dise leur trace.
    """
    assert preuve.exige_un_ecran("ÉCRAN : rechargement conserve les filtres")
    assert preuve.exige_un_ecran("RETENU EN RECETTE ÉCRAN — aucun écran ne les appelle encore")
    assert preuve.exige_un_ecran("recette écran du 18/09 sur un compte réel")
    assert not preuve.exige_un_ecran("`invoice-connector-write.test.ts` — 5/5 verts, commit `0cc1148ba`")
    assert not preuve.exige_un_ecran("")
