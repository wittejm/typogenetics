import { Routes, Route } from 'react-router-dom'
import './App.css'
import Layout from './Layout'
import LandingPage from './pages/LandingPage'
import InteractivePage from './pages/InteractivePage'
import SearchPage from './pages/SearchPage'
import SoupPage from './pages/SoupPage'
import SpatialSoupPage from './pages/SpatialSoupPage'
import BatchDemoPage from './pages/BatchDemoPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="interactive" element={<InteractivePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="soup" element={<SoupPage />} />
        <Route path="soup/spatial" element={<SpatialSoupPage />} />
        <Route path="batch" element={<BatchDemoPage />} />
      </Route>
    </Routes>
  )
}
