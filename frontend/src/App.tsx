import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from './components/ProtectedRoute'
import { getDefaultRouteByRole, getPendingPasswordChange, getStoredSession } from './auth/session'
import { AdjustRoutePage } from './pages/dispatch/AdjustRoutePage'
import { CustomersPage } from './pages/dispatch/CustomersPage'
import { DispatcherDriversPage } from './pages/dispatch/DispatcherDriversPage'
import { OverviewPage } from './pages/dispatch/OverviewPage'
import { PlanRoutePage } from './pages/dispatch/PlanRoutePage'
import { ReportsPage } from './pages/dispatch/ReportsPage'
import { TrackStatusPage } from './pages/dispatch/TrackStatusPage'
import { VehiclesPage } from './pages/dispatch/VehiclesPage'
import { DriverTripCustomersPage } from './pages/driver/DriverTripCustomersPage'
import { DriverTripDetailPage } from './pages/driver/DriverTripDetailPage'
import { DriverTripsPage } from './pages/driver/DriverTripsPage'
import { FirstLoginPasswordChangePage } from './pages/FirstLoginPasswordChangePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

const DRIVER_ROLE = 'Tài xế'
const DISPATCHER_ROLE = 'Nhân viên điều phối'

function RootRedirect() {
  const pendingPasswordChange = getPendingPasswordChange()
  const session = getStoredSession()
  if (pendingPasswordChange) {
    return <Navigate to="/change-password-first-login" replace />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getDefaultRouteByRole(session.user.VaiTro)} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password-first-login" element={<FirstLoginPasswordChangePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE, DISPATCHER_ROLE]}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/driver/trips/assigned"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE]}>
              <DriverTripsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/trips/completed"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE]}>
              <DriverTripsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/trips/cancelled"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE]}>
              <DriverTripsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/trips/:id"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE]}>
              <DriverTripDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/trips/:id/customers"
          element={
            <ProtectedRoute allowedRoles={[DRIVER_ROLE]}>
              <DriverTripCustomersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dispatch/overview"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <OverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/plan"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <PlanRoutePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/adjust"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <AdjustRoutePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/track"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <TrackStatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/drivers"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <DispatcherDriversPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/vehicles"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <VehiclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/customers"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch/reports"
          element={
            <ProtectedRoute allowedRoles={[DISPATCHER_ROLE]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
