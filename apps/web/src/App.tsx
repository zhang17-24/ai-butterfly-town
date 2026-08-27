import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { WorldPage } from "./pages/WorldPage";
import { CausalPage } from "./pages/CausalPage";

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<HomePage />} />
    <Route path="/world/:worldId" element={<WorldPage />} />
    <Route path="/world/:worldId/causal" element={<CausalPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

