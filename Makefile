.PHONY: gate
gate:
	uv run ruff check src tests
	uv run ruff format --check src tests
	uv run basedpyright src
	uv run pytest -q --cov=src --cov-fail-under=80
	uv run mutmut run
