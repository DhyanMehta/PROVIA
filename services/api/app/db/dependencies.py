from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.exceptions import AppError


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.database.session()
    try:
        yield session
        session.commit()
    except IntegrityError:
        session.rollback()
        raise AppError(
            "CONFLICT", "Operation conflicts with existing data or constraints", 409
        ) from None
    except SQLAlchemyError:
        session.rollback()
        raise AppError("DATABASE_UNAVAILABLE", "Database operation failed", 503) from None
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# Finish the transaction before FastAPI sends a success response.
DbSession = Annotated[Session, Depends(get_db, scope="function")]
