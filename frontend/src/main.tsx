
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "./index.css";

import App from "./App";
import EventDetails from "./pages/EventDetails";
import Checkout from "./pages/Checkout";
import MyTickets from "./pages/MyTickets";
import OrganizerScanner from "./pages/OrganizerScanner";
import OrganizerRegister from "./pages/OrganizerRegister";
import AdminDashboard from "./pages/AdminDashboard";
const SeatSelection = lazy(
  () => import("./pages/SeatSelection")
);

const Login = lazy(
  () => import("./pages/Login")
);

const Register = lazy(
  () => import("./pages/Register")
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#080A12] p-12 text-center text-white">
            Loading EventSphere...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<App />} />

          <Route
            path="/events/:eventId"
            element={<EventDetails />}
          />

          <Route
            path="/events/:eventId/seats"
            element={<SeatSelection />}
          />

          <Route path="/login" element={<Login />} />
           <Route path="/register/organizer" element={<OrganizerRegister />} />
          <Route path="/register" element={<Register />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/my-tickets" element={<MyTickets />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/organizer/scanner"
 element={<OrganizerScanner />}
           

/>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
);
