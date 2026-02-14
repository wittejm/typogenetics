import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="app">
      <h1>Typogenetics</h1>
      <nav className="app-nav">
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
          Interactive
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
          Search
        </NavLink>
        <NavLink to="/soup" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
          Soup
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
