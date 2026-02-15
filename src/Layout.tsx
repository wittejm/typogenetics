import { Link, NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-title">Typogenetics</Link>
        <nav className="app-nav">
          <NavLink to="/interactive" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Interactive
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Search
          </NavLink>
          <NavLink to="/soup" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Soup
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
