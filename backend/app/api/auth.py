

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import Cookie
from sqlalchemy import delete
from app.database import SessionLocal
from app.models.core import User
from app.schemas.auth import UserRegister, UserResponse
from app.services.security import hash_password
from datetime import datetime, timedelta, timezone

from uuid import UUID

from app.models.core import OrganizerApplication
from app.schemas.auth import (
    OrganizerRegister,
    OrganizerRegistrationResponse,
)

from fastapi import Response

from app.models.core import UserSession
from app.services.security import hash_session_token
from app.schemas.auth import UserLogin, LoginResponse
from app.services.security import (
    verify_password,
    generate_session_token,
    hash_session_token,
)
router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def get_db():
    with SessionLocal() as db:
        yield db


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)

def register_user(
    payload: UserRegister,
    db: Session = Depends(get_db),
):

    
    email = payload.email.strip().lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role="customer",
    )

    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    db.refresh(user)
    return user

@router.post("/login", response_model=LoginResponse)
def login_user(
    payload: UserLogin,
    response: Response,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if user is None or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = generate_session_token()

    session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )

    db.add(session)
    db.commit()

    response.set_cookie(
        key="eventsphere_session",
        value=token,
        httponly=True,
        secure=False,  # Local HTTP development only
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )

    return {
        "message": "Login successful",
        "user": user,
    }

def get_current_user(
    eventsphere_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not eventsphere_session:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    session = db.scalar(
        select(UserSession).where(
            UserSession.token_hash == hash_session_token(
                eventsphere_session
            ),
            UserSession.expires_at > datetime.now(timezone.utc),
        )
    )

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid",
        )

    user = db.get(User, session.user_id)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    return user

@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    return current_user

@router.post("/logout")
def logout_user(
    response: Response,
    eventsphere_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if eventsphere_session:
        db.execute(
            delete(UserSession).where(
                UserSession.token_hash == hash_session_token(
                    eventsphere_session
                )
            )
        )
        db.commit()

    response.delete_cookie(
        key="eventsphere_session",
        path="/",
        samesite="lax",
    )

    return {"message": "Logged out successfully"}

def require_organizer(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role not in ("organizer", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Organizer access required",
        )

    return current_user

@router.post(
    "/register/organizer",
    response_model=OrganizerRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_organizer(
    payload: OrganizerRegister,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    full_name = payload.full_name.strip()
    organization_name = payload.organization_name.strip()

    if not full_name or not organization_name:
        raise HTTPException(
            status_code=422,
            detail="Name and organization are required",
        )

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(payload.password),
        role="customer",
    )

    try:
        db.add(user)
        db.flush()

        application = OrganizerApplication(
            user_id=user.id,
            organization_name=organization_name,
            status="pending",
        )

        db.add(application)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    return {
        "message": "Organizer application submitted successfully",
        "email": email,
        "status": "pending",
    }


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required",
        )

    return current_user


@router.post("/organizer-applications/{application_id}/approve")
def approve_organizer_application(
    application_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    application = db.scalar(
        select(OrganizerApplication)
        .where(OrganizerApplication.id == application_id)
        .with_for_update()
    )

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Organizer application not found",
        )

    if application.status != "pending":
        raise HTTPException(
            status_code=409,
            detail="Application has already been reviewed",
        )

    user = db.get(User, application.user_id)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Applicant account not found",
        )

    if user.role != "customer":
        raise HTTPException(
            status_code=409,
            detail="Applicant has an incompatible account role",
        )

    user.role = "organizer"
    application.status = "approved"
    application.reviewed_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "message": "Organizer approved successfully",
        "application_id": str(application.id),
        "user_id": str(user.id),
        "role": user.role,
    }

@router.get("/organizer-applications")
def list_organizer_applications(
    application_status: str = "pending",
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if application_status not in ("pending", "approved", "rejected"):
        raise HTTPException(
            status_code=422,
            detail="Invalid application status",
        )

    rows = db.execute(
        select(OrganizerApplication, User)
        .join(User, User.id == OrganizerApplication.user_id)
        .where(OrganizerApplication.status == application_status)
        .order_by(OrganizerApplication.created_at.desc())
    ).all()

    return [
        {
            "application_id": application.id,
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "organization_name": application.organization_name,
            "status": application.status,
            "created_at": application.created_at,
        }
        for application, user in rows
    ]


@router.post("/organizer-applications/{application_id}/reject")
def reject_organizer_application(
    application_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    application = db.scalar(
        select(OrganizerApplication)
        .where(OrganizerApplication.id == application_id)
        .with_for_update()
    )

    if application is None:
        raise HTTPException(
            status_code=404,
            detail="Organizer application not found",
        )

    if application.status != "pending":
        raise HTTPException(
            status_code=409,
            detail="Application has already been reviewed",
        )

    application.status = "rejected"
    application.reviewed_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "message": "Organizer application rejected",
        "application_id": str(application.id),
        "status": "rejected",
    }

