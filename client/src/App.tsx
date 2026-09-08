import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import PartnerPage from "./pages/PartnerPage";
import { applyTheme } from "./themes";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuth();
  // Si ya está logueado, que tenga entrada directa a la app.
  return <HomePage authed={!!user} />;
}

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeRoute />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}