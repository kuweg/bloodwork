from app.services.normalizer import slugify


def test_percentage_and_absolute_do_not_collide() -> None:
    # The core bug: "%" and "#" were both stripped, collapsing percentage and
    # absolute-count tests into one canonical key.
    assert slugify("Lymphocytes %") != slugify("Lymphocytes #")
    assert slugify("Neutrophils %") != slugify("Neutrophils #")


def test_percentage_variants_unify() -> None:
    assert slugify("Lymphocytes %") == slugify("Lymphocytes Percentage")
    assert slugify("Lymphocytes %") == slugify("Lymphocytes percent")


def test_absolute_count_hash_variants_unify() -> None:
    # "#", "Absolute", "Abs", "Count" all mean the same absolute-count test.
    key = slugify("Lymphocytes #")
    assert slugify("Lymphocytes Absolute") == key
    assert slugify("Lymphocytes Abs") == key
    assert slugify("Lymphocytes Count") == key


def test_percent_key_is_readable() -> None:
    assert slugify("Lymphocytes %") == "lymphocytes_percent"
    assert slugify("Lymphocytes #") == "lymphocytes_count"


def test_total_testosterone_aliases_to_testosterone() -> None:
    assert slugify("Total Testosterone") == slugify("Testosterone")
    # Free testosterone stays its own test.
    assert slugify("Free Testosterone") != slugify("Testosterone")


def test_total_qualifier_preserved_where_meaningful() -> None:
    # "Total" is clinically meaningful for these — must NOT be merged away.
    assert slugify("Total Bilirubin") != slugify("Direct Bilirubin")
    assert slugify("Total Cholesterol") != slugify("HDL Cholesterol")


def test_basic_slug_behaviour_unchanged() -> None:
    assert slugify("LDL Cholesterol") == "ldl_cholesterol"
    assert slugify("Hemoglobin") == "hemoglobin"
    assert slugify("  Glucose (Fasting) ") == "glucose_fasting"
    assert slugify("") == "unknown"


def test_case_and_accent_insensitive() -> None:
    assert slugify("HEMOGLOBIN") == slugify("hemoglobin")
