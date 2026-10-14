import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AgeGate } from "./components/AgeGate";
import { Layout } from "./components/Layout";

import {
  apiFetch,
  clearSession,
  getToken,
  type AuthUser,
} from "./lib/api";

import Home from "./pages/Home";
import Signals from "./pages/Signals";
import AI from "./pages/AI";
import Sports from "./pages/Sports";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResponsibleGaming from "./pages/ResponsibleGaming";
import NotFound from "./pages/NotFound";

type AuthState =
  | "checking"
  | "authenticated"
  | "guest";

/* ==========================================
   01. ROTA PROTEGIDA

   Tudo o que estiver dentro desta rota
   só pode ser visto depois do login.
========================================== */

function ProtectedRoute() {
  const location =
    useLocation();

  const [state, setState] =
    useState<AuthState>(
      "checking",
    );

  useEffect(() => {
    let cancelled = false;

    async function check() {
      /*
       * Sem token:
       * utilizador ainda não fez login.
       */
      if (!getToken()) {
        if (!cancelled) {
          setState("guest");
        }

        return;
      }

      /*
       * Existe token:
       * confirmamos no backend que
       * continua válido.
       */
      try {
        await apiFetch<{
          user: AuthUser;
        }>("/api/auth/me");

        if (!cancelled) {
          setState(
            "authenticated",
          );
        }
      } catch {
        /*
         * Token inválido ou expirado.
         */
        clearSession();

        if (!cancelled) {
          setState("guest");
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === "checking") {
    return (
      <main className="center-screen">
        <div className="loading-card premium-card led-border">
          <span className="brand-mark">
            N
          </span>

          <div>
            <strong>
              NeuroWin
            </strong>

            <small>
              A validar sessão…
            </small>
          </div>
        </div>
      </main>
    );
  }

  if (state === "guest") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  return <Outlet />;
}

/* ==========================================
   02. ROTA ADMIN

   Só utilizadores com:
   role === "admin"

   podem entrar em /admin.
========================================== */

function AdminRoute() {
  const [checking, setChecking] =
    useState(true);

  const [allowed, setAllowed] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const data =
          await apiFetch<{
            user: AuthUser;
          }>("/api/auth/me");

        if (!cancelled) {
          setAllowed(
            data.user.role ===
              "admin",
          );
        }
      } catch {
        clearSession();

        if (!cancelled) {
          setAllowed(false);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <main className="center-screen">
        <div className="loading-card premium-card led-border">
          <span className="brand-mark">
            N
          </span>

          <div>
            <strong>
              NeuroWin Admin
            </strong>

            <small>
              A validar permissões…
            </small>
          </div>
        </div>
      </main>
    );
  }

  return allowed ? (
    <Outlet />
  ) : (
    <Navigate
      to="/perfil"
      replace
    />
  );
}

/* ==========================================
   03. ROTA DE CONVIDADO

   Login e registo só aparecem para
   quem ainda não iniciou sessão.
========================================== */

function GuestRoute() {
  return getToken() ? (
    <Navigate
      to="/"
      replace
    />
  ) : (
    <Outlet />
  );
}

/* ==========================================
   04. APP
========================================== */

export default function App() {
  return (
    <>
      <AgeGate />

      <Routes>
        {/* ==================================
            PÚBLICO
            LOGIN / REGISTO
        ================================== */}

        <Route
          element={
            <GuestRoute />
          }
        >
          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/registar"
            element={<Register />}
          />
        </Route>

        {/* ==================================
            TODA A APP É PROTEGIDA
        ================================== */}

        <Route
          element={
            <ProtectedRoute />
          }
        >
          <Route
            element={<Layout />}
          >
            <Route
              path="/"
              element={<Home />}
            />

            <Route
              path="/sinais"
              element={<Signals />}
            />

            <Route
              path="/ia"
              element={<AI />}
            />

            <Route
              path="/desporto"
              element={<Sports />}
            />

            <Route
              path="/perfil"
              element={<Profile />}
            />

            <Route
              path="/jogo-responsavel"
              element={
                <ResponsibleGaming />
              }
            />

            {/* ============================
                APENAS ADMIN
            ============================ */}

            <Route
              element={
                <AdminRoute />
              }
            >
              <Route
                path="/admin"
                element={<Admin />}
              />
            </Route>

            <Route
              path="*"
              element={<NotFound />}
            />
          </Route>
        </Route>
      </Routes>
    </>
  );
}