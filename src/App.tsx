import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionExpiredError } from "./api/client";
import { AuthProvider, RequireAuth } from "./auth/AuthProvider";
import ForgotPasswordPage from "./routes/ForgotPasswordPage";
import GamesPage from "./routes/GamesPage";
import HomePage from "./routes/HomePage";
import LoginPage from "./routes/LoginPage";
import MultiplayerPage from "./routes/MultiplayerPage";
import PlayPage from "./routes/PlayPage";
import RegisterPage from "./routes/RegisterPage";
import ResetPasswordPage from "./routes/ResetPasswordPage";
import StatsPage from "./routes/StatsPage";
import SudokuModePage from "./routes/SudokuModePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A dead session is not a transient failure — retrying it just burns requests while the
      // auth layer is already routing the user to /login.
      retry: (failureCount, error) =>
        !(error instanceof SessionExpiredError) && failureCount < 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            {/*
              Public by necessity: a user who needs these cannot authenticate by definition. The
              emailed link deep-links straight into /reset-password, which already works — CloudFront
              maps 403/404 to /index.html with a 200 (deployment.md §2), so no infrastructure change.
            */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/games"
              element={
                <RequireAuth>
                  <GamesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/sudoku"
              element={
                <RequireAuth>
                  <SudokuModePage />
                </RequireAuth>
              }
            />
            <Route
              path="/sudoku/multiplayer"
              element={
                <RequireAuth>
                  <MultiplayerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <HomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/play/:boardId"
              element={
                <RequireAuth>
                  <PlayPage />
                </RequireAuth>
              }
            />
            <Route
              path="/stats"
              element={
                <RequireAuth>
                  <StatsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
