"""Configuration and deployment-entrypoint regression tests.

Covers three release-blocking deployment defects:

1. ``app.py`` is shadowed by the ``app/`` package, so ``gunicorn app:app``
   silently fails. ``wsgi:app`` must exist and build a working app.
2. Plan limits must come from documented environment configuration, not
   hardcoded constants, so operators can tune quotas without a code change.
3. Production must refuse to boot with placeholder JWT/secret values.
"""

import importlib
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_wsgi_entrypoint_exposes_app():
    """`wsgi:app` is the documented production target and must import cleanly."""
    sys.path.insert(0, str(BACKEND_ROOT))
    wsgi = importlib.import_module("wsgi")
    assert hasattr(wsgi, "app"), "wsgi module must expose `app` for gunicorn"
    # A Flask app offers a callable WSGI interface.
    assert callable(wsgi.app)
    assert wsgi.app.name


def test_wsgi_entrypoint_imports_in_a_fresh_interpreter():
    """Prove it works the way a WSGI server loads it: a clean process."""
    result = subprocess.run(
        [sys.executable, "-c", "import wsgi; print(wsgi.app.name)"],
        cwd=str(BACKEND_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip()


def test_free_plan_limits_come_from_configuration():
    """The documented FREE_* env vars must actually drive the plan limits."""
    from app.config import config
    from app.models import PlanType, get_plan_limits

    free = get_plan_limits(PlanType.FREE)
    assert free.daily_optimizations == config.FREE_DAILY_OPTIMIZATIONS
    assert free.max_input_mb == config.FREE_MAX_INPUT_MB
    assert free.max_output_mb == config.FREE_MAX_OUTPUT_MB

    pro = get_plan_limits(PlanType.PRO)
    assert pro.max_input_mb == config.PRO_MAX_INPUT_MB
    assert pro.max_output_mb == config.PRO_MAX_OUTPUT_MB


def test_plan_limits_are_configurable_via_environment():
    """A fresh process must honour an overridden allowance (operator workflow)."""
    env = dict(os.environ)
    env.update(
        {
            "FREE_DAILY_OPTIMIZATIONS": "42",
            "FREE_MAX_INPUT_MB": "7",
            "FREE_MAX_OUTPUT_MB": "3",
        }
    )
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.models import get_plan_limits, PlanType;"
            "l = get_plan_limits(PlanType.FREE);"
            "print(l.daily_optimizations, l.max_input_mb, l.max_output_mb)",
        ],
        cwd=str(BACKEND_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == ["42", "7", "3"]


def test_production_rejects_placeholder_secrets():
    """Booting production with a known placeholder secret must fail loudly."""
    env = dict(os.environ)
    env.update(
        {
            "ENV": "production",
            "SECRET_KEY": "your-super-secret-key-change-in-production",
            "JWT_SECRET": "your-jwt-secret-change-in-production",
            "DATABASE_URL": "",
        }
    )
    result = subprocess.run(
        [sys.executable, "-c", "from app import create_app; create_app()"],
        cwd=str(BACKEND_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode != 0, "production must not boot with placeholder secrets"
    combined = (result.stdout + result.stderr).lower()
    assert "secret" in combined


@pytest.mark.parametrize("secret_var", ["SECRET_KEY", "JWT_SECRET"])
def test_production_rejects_empty_secret(secret_var):
    env = dict(os.environ)
    env.update({"ENV": "production", "DATABASE_URL": ""})
    env["SECRET_KEY"] = "a" * 48
    env["JWT_SECRET"] = "b" * 48
    env[secret_var] = ""
    result = subprocess.run(
        [sys.executable, "-c", "from app import create_app; create_app()"],
        cwd=str(BACKEND_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode != 0, f"production must refuse an empty {secret_var}"
