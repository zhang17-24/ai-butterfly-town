import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";

// 路由级懒加载:世界页会把两个渲染器(Phaser / three)之一带进来,不该让首屏为它买单。
const WorldPage = lazy(() => import("./pages/WorldPage").then((module) => ({ default: module.WorldPage })));
const CausalPage = lazy(() => import("./pages/CausalPage").then((module) => ({ default: module.CausalPage })));
const NewWorldPage = lazy(() => import("./pages/NewWorldPage").then((module) => ({ default: module.NewWorldPage })));
const AiLabPage = lazy(() => import("./pages/AiLabPage").then((module) => ({ default: module.AiLabPage })));

export function App() {
  return <Suspense fallback={<div className="loading-page">加载中…</div>}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/worlds/new" element={<NewWorldPage />} />
      <Route path="/world/:worldId" element={<WorldPage />} />
      <Route path="/world/:worldId/causal" element={<CausalPage />} />
      <Route path="/dev/ai" element={<AiLabPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>;
}
