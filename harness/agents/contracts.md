# ~/workshops/aiweekend/harness/agents/contracts.md — правила контрактов (спека — долгоживущий артефакт)

> Код умирает каждый diff — агент перепишет реализацию со следующего промпта. Контракты, инварианты, SLO живут в СПЕКЕ, а не в комментариях. Спека — executable, агент не может менять контракт без failing test.

## C1. Каждый эндпоинт = контракт
Каждый эндпоинт/внешняя связка обязан иметь: OpenAPI-спеку + JSON Schema запроса/ответа + примеры ошибок. Изменение сигнатуры/формата — только через явный апдейт спеки, не «причесал JSON».
Профиль: OpenAPI + JSON Schema (язык-агностик); consumer-driven contract testing (Pact) для межсервисных связок.

## C2. Инварианты в спеке, не в коде
Idempotency-политика, retry-политика, таймаут-бюджет, latency-SLO — фиксируются в спеке эндпоинта, а не в теле функции (которое агент перепишет).

## C3. Валидация входа/выхода по схеме
Вход парсится в типизированную схему (см. `security.md` S1); выход LLM-агента — structured output под JSON Schema, валидируется до использования (см. `llm-harness.md`).

## Eval
- **Контракт-diff:** изменение схемы ответа агентом → contract-тест краснеет; агент обязан синхронизировать клиента/спеку, а не удалять старый тест.
- **Schema-валидация:** ответ вне схемы → детерминированный reject-путь, не `500`.
- **Против «улучшил стиль»:** переименование поля (`user_id`→`userId`) без апдейта спеки → integration/contract-тест красный.

## Пример: переименование поля ловит contract-тест, не unit (проверено вживую)
БЫЛО (рефактор `user_id`→`userId`; unit зелёный, клиент в проде падает):
```python
def serialize(u):
    return {"userId": u.id}          # «причесал», клиент ждёт user_id
def test_serialize():
    assert serialize(u)["userId"] == 42   # охраняет НЕ тот контракт
```
СТАЛО (contract-тест на JSON Schema):
```python
from jsonschema import validate, ValidationError
RESPONSE_SCHEMA = {
    "type": "object", "required": ["user_id"],
    "properties": {"user_id": {"type": "integer"}},
    "additionalProperties": False,        # userId → «лишнее поле», diff пойман
}
def test_response_contract():
    validate(serialize(u), RESPONSE_SCHEMA)   # красный, пока serialize отдаёт userId; зелёный после фикса на user_id
```
Unit проверяет то, что вернул код — переименуй поле, и он позеленеет вместе с багом. Contract-тест сверяет ответ со схемой, которую клиент считает правдой: `required` ловит пропажу `user_id`, `additionalProperties:false` — прокравшийся `userId`. (Верифицировано: `user_id`→PASS, `userId`→REJECT, пусто→REJECT.) Демо детекции рассинхрона — разовая проверка схемы, не CI-тест: `with pytest.raises(ValidationError): validate({"userId": 42}, RESPONSE_SCHEMA)` — схема действительно отвергает сломанный ответ; в CI живёт прямой ассерт выше, зелёный только на честном `user_id`.

**Что запрещено агенту:** менять формат ответа/сигнатуру без апдейта спеки и contract-теста; удалять/ослаблять contract-тест, чтобы «прошло»; парсить ответ внешнего/LLM «на доверии».
