import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  const soupActive = location.pathname.startsWith('/soup')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [dropdownOpen])

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-title">Typogenetics</Link>
        <nav className="app-nav">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Intro
          </NavLink>
          <NavLink to="/interactive" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Interactive
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
            Search
          </NavLink>
          <div className="nav-dropdown" ref={dropdownRef}>
            <NavLink
              to="/soup"
              end
              className={`nav-link${soupActive ? ' nav-link-active' : ''}`}
              onClick={(e) => {
                if (soupActive) {
                  e.preventDefault()
                }
                setDropdownOpen(prev => !prev)
              }}
            >
              Soup
            </NavLink>
            {dropdownOpen && (
              <div className="nav-dropdown-menu">
                <NavLink
                  to="/soup"
                  end
                  className={({ isActive }) => 'nav-dropdown-item' + (isActive ? ' nav-dropdown-item-active' : '')}
                  onClick={() => setDropdownOpen(false)}
                >
                  Basic
                </NavLink>
                <NavLink
                  to="/soup/spatial"
                  className={({ isActive }) => 'nav-dropdown-item' + (isActive ? ' nav-dropdown-item-active' : '')}
                  onClick={() => setDropdownOpen(false)}
                >
                  Spatial
                </NavLink>
              </div>
            )}
          </div>
          <a href="https://github.com/wittejm/typogenetics" className="nav-link nav-link-light" target="_blank" rel="noopener noreferrer">
            Github
          </a>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
