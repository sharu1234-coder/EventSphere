

from app.config import settings
from sqlalchemy.engine import make_url


def test_uses_isolated_database():
    database_url = make_url(settings.database_url)

    assert database_url.get_backend_name() == "postgresql"
    assert database_url.database == "eventsphere_test_db"
