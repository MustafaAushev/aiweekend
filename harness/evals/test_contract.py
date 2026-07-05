"""eval для agents/contracts.md — контракт-тест ловит дрейф схемы (переименование/пропажу поля).
Запуск: uv run --with pytest --with jsonschema pytest evals/test_contract.py
Логика верифицирована вживую: user_id→PASS, userId→REJECT, пусто→REJECT.
"""
import pytest
from jsonschema import validate, ValidationError

# Контракт с клиентом — единый источник правды (жил бы в *.schema.json)
RESPONSE_SCHEMA = {
    "type": "object",
    "required": ["user_id"],
    "properties": {"user_id": {"type": "integer"}},
    "additionalProperties": False,   # прокравшееся поле (userId) = diff пойман
}

def serialize_ok(u_id):        # корректная реализация
    return {"user_id": u_id}

def serialize_renamed(u_id):   # агент «причесал» — сломал контракт
    return {"userId": u_id}

def test_valid_passes():
    validate(serialize_ok(42), RESPONSE_SCHEMA)   # не бросает

def test_renamed_field_rejected():
    with pytest.raises(ValidationError):           # старый unit это пропускал
        validate(serialize_renamed(42), RESPONSE_SCHEMA)

def test_missing_field_rejected():
    with pytest.raises(ValidationError):
        validate({}, RESPONSE_SCHEMA)
