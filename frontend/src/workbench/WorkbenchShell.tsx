import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export function WorkbenchShell({
  children,
  title,
  viewTo,
  navigation,
  ownerEmail,
  onLogout,
}: {
  children: ReactNode;
  title: string;
  viewTo: string;
  navigation: readonly { id: string; label: string; to: string }[];
  ownerEmail: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, []);

  return (
    <div className="adminBody">
      <div className="adminShell">
        <aside className={`adminSidebar ${open ? "open" : ""}`}>
          <Link className="brand" to="/admin/dashboard">
            <span className="brandMark">林</span>
            <span>编辑部</span>
          </Link>
          <nav className="adminNav">
            {navigation.map(({ id, label, to }) => (
              <Link
                key={id}
                className={location.pathname === to ? "active" : ""}
                to={to}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="sidebarFoot">
            <p>{ownerEmail}</p>
            <button className="ghost" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </aside>
        <main>
          <header className="adminTopbar">
            <button
              className="menuButton"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
            >
              ☰
            </button>
            <p>林间刊物 / {title}</p>
            <Link className="linkButton secondary" to={viewTo}>
              查看公开站
            </Link>
          </header>
          <div className="adminContent">{children}</div>
        </main>
      </div>
    </div>
  );
}
