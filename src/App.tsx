import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import MainLayout from './layout/MainLayout'
import Dashboard from './pages/Dashboard'
import ContractOrdersPage from './pages/ContractOrdersPage'
import ProductionPage from './pages/ProductionPage'
import ManufacturingPage from './pages/ManufacturingPage'
import QcWorkbenchPage from './pages/QcWorkbenchPage'
import HeatTreatmentPage from './pages/HeatTreatmentPage'
import PackingPage from './pages/PackingPage'
import ShippingMarksPage from './pages/ShippingMarksPage'
import FinancePage from './pages/FinancePage'
import UsersPage from './pages/UsersPage'
import { isLoggedIn } from './utils/auth'

function App() {
  const loggedIn = isLoggedIn()
  const Router = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            loggedIn ? (
              <MainLayout />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="contracts" element={<ContractOrdersPage />} />
          <Route path="manufacturing" element={<ManufacturingPage />} />
          <Route path="qc/heat-treatment" element={<HeatTreatmentPage />} />
          <Route path="production" element={<ProductionPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="qc" element={<QcWorkbenchPage />} />
          <Route path="packing" element={<PackingPage />} />
          <Route path="shipping-marks" element={<ShippingMarksPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
