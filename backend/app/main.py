from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import router as auth_router
from app.api.events import router as events_router
from app.api.venues import router as venues_router
from app.api.seating import router as seating_router
from app.api.event_seating import router as event_seating_router
from app.api.event_inventory import router as event_inventory_router
from app.api.seat_holds import router as seat_holds_router
from app.api.bookings import router as bookings_router
from app.api.payments import router as payments_router
from app.database import check_database_connection
from app.services.cleanup_scheduler import cleanup_loop
from app.api.tickets import router as tickets_router

# Start and stop the automatic seat-hold cleanup task.
@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_loop())

    try:
        yield
    finally:
        cleanup_task.cancel()

        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


# Create the FastAPI application.
app = FastAPI(
    title="EventSphere API",
    description="Reserved-seat event booking platform",
    version="0.1.0",
    lifespan=lifespan,
)



# Allow requests from the configured frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url.rstrip("/")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Register API routers.
app.include_router(auth_router)
app.include_router(events_router)
app.include_router(venues_router)
app.include_router(seating_router)
app.include_router(event_seating_router)
app.include_router(event_inventory_router)
app.include_router(seat_holds_router)
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(tickets_router)

# Application health endpoint.
@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "application": "EventSphere",
        "version": "0.1.0",
    }


# Database health endpoint.
@app.get("/api/v1/health/database")
def database_health_check():
    try:
        check_database_connection()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        )

    return {
        "status": "ok",
        "database": "connected",
    }
