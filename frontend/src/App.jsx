import { Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AppDashboard from "./pages/AppDashboard";
import ProtectedRoute from "./utils/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings"
        element={
          <ProtectedRoute>
            <AppDashboard initialPanel="settings" />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
