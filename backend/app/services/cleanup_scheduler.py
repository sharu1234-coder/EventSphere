

import asyncio
import logging

from app.database import SessionLocal
from app.services.hold_cleanup import cleanup_expired_holds

logger = logging.getLogger(__name__)


async def cleanup_loop():
    while True:
        try:
            await asyncio.to_thread(run_cleanup)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Expired hold cleanup failed")

        await asyncio.sleep(60)


def run_cleanup():
    db = SessionLocal()

    try:
        count = cleanup_expired_holds(db)
        db.commit()

        if count:
            logger.info("Expired holds cleaned: %s", count)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()
