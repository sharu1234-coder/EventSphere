# EventSphere 🎟️

**A full-stack event ticket booking platform with reserved seating, secure payments, and QR-based ticket verification.**

EventSphere allows users to explore events, select their preferred seats, reserve multiple seats, complete payments, and receive digital tickets with QR codes.

## Features

- **User Authentication:** User registration, login, and session-based authentication.
- **Event Discovery:** Browse events and view event details.
- **Interactive Seat Selection:** Choose up to 6 seats in a single booking.
- **Temporary Seat Reservations:** Seats are held for 10 minutes during checkout.
- **Concurrent Booking Protection:** Helps prevent multiple users from booking the same seat.
- **Razorpay Integration:** Complete bookings using Razorpay test-mode payments.
- **Digital QR Tickets:** Generate one QR ticket for all seats in a booking.
- **PDF Ticket Downloads:** Download tickets containing event details, seats, and QR codes.
- **Organizer Dashboard:** Event management and organizer registration.
- **QR Ticket Verification:** Scan tickets for event check-in.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Database Migrations | Alembic |
| Payments | Razorpay |
| Authentication | Session-based authentication |
| Digital Tickets | QR Code, jsPDF |

## Project Structure

```text
EventSphere/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
└── README.md
```

## Local Setup

### Prerequisites

- Python
- Node.js and npm
- PostgreSQL
- Razorpay test credentials

### Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file using `.env.example` as a reference. Configure your local PostgreSQL connection, application secrets, and Razorpay test credentials.

Run database migrations:

```bash
alembic upgrade head
```

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

API documentation: http://localhost:8000/docs

### Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Booking Workflow

1. Browse an event and open its seating layout.
2. Select 1–6 available seats.
3. Reserve the seats for 10 minutes.
4. Create a booking and complete one Razorpay payment.
5. Receive one digital QR ticket containing all booked seats.
6. Download the PDF ticket or present the QR code for check-in.

## Screenshots

Screenshots of the event listing, seat selection, checkout, and digital ticket pages will be added here.

## Testing

The backend includes tests for payment security, seat-hold concurrency, and database configuration.

Run backend tests with:

```bash
cd backend
pytest
```

## Project Status

Developed as a full-stack portfolio project. Razorpay is configured for test-mode payment flows.

## Author

GitHub: [sharu1234-coder](https://github.com/sharu1234-coder)