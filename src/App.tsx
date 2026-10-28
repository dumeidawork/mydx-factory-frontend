import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import MainLayout from './layout/MainLayout'
import Dashboard from './pages/Dashboard'
import ContractOrdersPage from './pages/ContractOrdersPage'
import CustomerPackingPage from './pages/CustomerPackingPage'
import ProductionPage from './pages/ProductionPage'
import ManufacturingPage from './pages/ManufacturingPage'
import QcWorkbenchPage from './pages/QcWorkbenchPage'
import HeatTreatmentPage from './pages/HeatTreatmentPage'
import LicensePage from './pages/LicensePage'
import ResourceFetchPage from './pages/ResourceFetchPage'
import PackingPage from './pages/PackingPage'
import DalianManualPackingPage from './pages/DalianManualPackingPage'
import AutoPackingPage from './pages/AutoPackingPage'
import ShippingMarksPage from './pages/ShippingMarksPage'
import FinancePage from './pages/FinancePage'
import AuxWarehousePage from './pages/warehouse/AuxWarehousePage'
import FinishedWarehousePage from './pages/warehouse/FinishedWarehousePage'
import UsersPage from './pages/UsersPage'
import PartnerDalianSiemensPage from './pages/PartnerDalianSiemensPage'
import { WorkbenchUnreadProvider } from './layout/WorkbenchUnreadContext'
import { isLoggedIn } from './utils/auth'

function ProtectedLayout() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return (
    <WorkbenchUnreadProvider>
      <MainLayout />
    </WorkbenchUnreadProvider>
  )
}

function App() {
  const Router = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="partners" element={<Navigate to="/partners/dalian-siemens" replace />} />
          <Route path="partners/dalian-siemens" element={<PartnerDalianSiemensPage />} />
          <Route path="contracts" element={<Navigate to="/contracts/manual" replace />} />
          <Route path="contracts/customer-packing" element={<CustomerPackingPage />} />
          <Route path="contracts/:section" element={<ContractOrdersPage />} />
          <Route path="manufacturing" element={<Navigate to="/manufacturing/drawing-download" replace />} />
          <Route path="manufacturing/order-split" element={<Navigate to="/manufacturing/drawing-download" replace />} />
          <Route path="manufacturing/:section" element={<ManufacturingPage />} />
          <Route path="qc/heat-treatment" element={<HeatTreatmentPage />} />
          <Route path="production" element={<Navigate to="/production/experiment" replace />} />
          <Route path="production/:section" element={<ProductionPage />} />
          <Route path="finance" element={<Navigate to="/finance/test-fee" replace />} />
          <Route path="finance/:section" element={<FinancePage />} />
          <Route path="warehouse/aux" element={<AuxWarehousePage />} />
          <Route path="warehouse/finished" element={<FinishedWarehousePage />} />
          <Route path="qc" element={<Navigate to="/qc/france" replace />} />
          <Route path="qc/:section" element={<QcWorkbenchPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="resource-fetch" element={<ResourceFetchPage />} />
          <Route path="packing" element={<Navigate to="/packing/france" replace />} />
          <Route path="packing/france" element={<PackingPage />} />
          <Route path="packing/france-auto" element={<AutoPackingPage />} />
          <Route path="packing/dalian-manual" element={<DalianManualPackingPage />} />
          <Route path="packing/dalian-auto" element={<AutoPackingPage />} />
          <Route path="shipping-marks" element={<Navigate to="/shipping-marks/france" replace />} />
          <Route path="shipping-marks/:section" element={<ShippingMarksPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
