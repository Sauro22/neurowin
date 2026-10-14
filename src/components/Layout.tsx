import { NavLink, Outlet } from "react-router-dom";

import {
  BellIcon,
  BrainIcon,
  HomeIcon,
  SearchIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
} from "./Icons";

import { getStoredUser } from "../lib/api";

function bottomNavClass({
  isActive,
}: {
  isActive: boolean;
}) {
  return isActive
    ? "bottom-link active"
    : "bottom-link";
}

function desktopNavClass({
  isActive,
}: {
  isActive: boolean;
}) {
  return isActive
    ? "desktop-nav-link active"
    : "desktop-nav-link";
}

export function Layout() {
  const user = getStoredUser();

  const initials = (user?.name || "NW")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part[0]?.toUpperCase(),
    )
    .join("");

  return (
    <div className="app-shell">
      <header className="app-header app-header-premium">
        <div className="app-header-inner">
          <NavLink
            to="/"
            className="app-brand app-brand-premium"
            aria-label="NeuroWin — início"
          >
            <span className="brand-mark brand-mark-logo brand-mark-premium">
              N
            </span>

            <span className="app-brand-copy">
              <strong>NeuroWin</strong>

              <small>
                DADOS · INTELIGÊNCIA · RESULTADOS
              </small>
            </span>
          </NavLink>

          <nav
            className="desktop-nav"
            aria-label="Navegação principal"
          >
            <NavLink
              to="/"
              end
              className={desktopNavClass}
            >
              <HomeIcon />
              <span>Início</span>
            </NavLink>

            <NavLink
              to="/sinais"
              className={desktopNavClass}
            >
              <SignalIcon />
              <span>Sinais</span>
            </NavLink>

            <NavLink
              to="/ia"
              className={desktopNavClass}
            >
              <BrainIcon />
              <span>IA</span>
            </NavLink>

            <NavLink
              to="/desporto"
              className={desktopNavClass}
            >
              <TrophyIcon />
              <span>Desporto</span>
            </NavLink>

            <NavLink
              to="/perfil"
              className={desktopNavClass}
            >
              <UserIcon />
              <span>Perfil</span>
            </NavLink>
          </nav>

          <div className="topbar-actions">
            <div className="topbar-search">
              <span className="topbar-search-icon">
                <SearchIcon />
              </span>

              <input
                type="text"
                placeholder="Pesquisar..."
                aria-label="Pesquisar"
              />
            </div>

            <button
              type="button"
              className="topbar-icon topbar-bell"
              aria-label="Notificações"
            >
              <BellIcon />
              <i />
            </button>

            <NavLink
              to={user ? "/perfil" : "/login"}
              className="topbar-profile topbar-profile-premium"
              aria-label="Abrir perfil"
            >
              <span>{initials}</span>
            </NavLink>
          </div>
        </div>
      </header>

      <Outlet />

      <nav
        className="bottom-nav"
        aria-label="Navegação principal"
      >
        <NavLink
          to="/"
          end
          className={bottomNavClass}
        >
          <HomeIcon />
          <span>Início</span>
        </NavLink>

        <NavLink
          to="/sinais"
          className={bottomNavClass}
        >
          <SignalIcon />
          <span>Sinais</span>
        </NavLink>

        <NavLink
          to="/ia"
          className={({ isActive }) =>
            isActive
              ? "bottom-link ai-link active"
              : "bottom-link ai-link"
          }
        >
          <span className="ai-bubble">
            <BrainIcon />
          </span>

          <span>IA</span>
        </NavLink>

        <NavLink
          to="/desporto"
          className={bottomNavClass}
        >
          <TrophyIcon />
          <span>Desporto</span>
        </NavLink>

        <NavLink
          to="/perfil"
          className={bottomNavClass}
        >
          <UserIcon />
          <span>Perfil</span>
        </NavLink>
      </nav>
    </div>
  );
}