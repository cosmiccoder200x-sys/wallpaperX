import os
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def app():
    os.environ.setdefault("ENV", "development")
    from app import create_app
    from app.services import quota

    quota._daily_counts.clear()
    quota._minute_windows.clear()

    application = create_app(testing=True)
    application.config.update(TESTING=True)
    return application


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def _reset_quota():
    from app.services import quota

    quota._daily_counts.clear()
    quota._minute_windows.clear()
    yield
    quota._daily_counts.clear()
    quota._minute_windows.clear()
