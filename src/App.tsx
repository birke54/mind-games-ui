import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionExpiredError } from "./api/client";
import { AuthProvider, RequireAuth } from "./auth/AuthProvider";
import HomePage from "./routes/HomePage";
import LoginPage from "./routes/LoginPage";
import PlayPage from "./routes/PlayPage";
import RegisterPage from "./routes/RegisterPage";
import StatsPage from "./routes/StatsPage";

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
