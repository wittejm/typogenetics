import { Routes, Route } from 'react-router-dom'
import './App.css'
import Layout from './Layout'
import InteractivePage from './pages/InteractivePage'
import SearchPage from './pages/SearchPage'
import SoupPage from './pages/SoupPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<InteractivePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="soup" element={<SoupPage />} />
      </Route>
    </Routes>
  )
}
