import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'
import { Providers } from './providers'
import { RedirectIfAuthed, RequireRole } from './RouteGuards'
import { AuthLayout, MarketingLayout } from './layouts'
import { SkipLink } from '@/components/layout/SkipLink'
import { RouteFallback } from '@/components/layout/RouteFallback'
import { LandingPage } from '@/pages/landing/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Signed-in areas and the dev styleguide are code-split so the landing page stays light.
const CustomerLayout = lazy(() => import('./appLayouts').then((m) => ({ default: m.CustomerLayout })))
const RunnerLayout = lazy(() => import('./appLayouts').then((m) => ({ default: m.RunnerLayout })))
const AdminLayout = lazy(() => import('./appLayouts').then((m) => ({ default: m.AdminLayout })))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const CustomerHomePage = lazy(() => import('@/pages/customer/HomePage'))
const CartPage = lazy(() => import('@/pages/customer/CartPage'))
const OrderConfirmationPage = lazy(() => import('@/pages/customer/OrderConfirmationPage'))
const PaymentPage = lazy(() => import('@/pages/customer/PaymentPage'))
const OrdersPage = lazy(() => import('@/pages/customer/OrdersPage'))
const ProfilePage = lazy(() => import('@/pages/customer/ProfilePage'))
const RunnerDashboardPage = lazy(() => import('@/pages/runner/RunnerDashboardPage'))
const AdminConsolePage = lazy(() => import('@/pages/admin/AdminConsolePage'))
const AdminLoginPage = lazy(() => import('@/pages/admin/AdminLoginPage'))
const StyleguidePage = lazy(() => import('@/pages/dev/StyleguidePage'))
const TermsPage = lazy(() => import('@/pages/legal/TermsPage'))
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage'))

function Root() {
  return (
    <Providers>
      <SkipLink />
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </Providers>
  )
}

export const routes = [
  {
    element: <Root />,
    children: [
      {
        element: <MarketingLayout />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: 'terms-and-conditions', element: <TermsPage /> },
          { path: 'privacy-policy', element: <PrivacyPage /> },
          { path: 'terms', element: <TermsPage /> },
          { path: 'privacy', element: <PrivacyPage /> },
          { path: 'styleguide', element: <StyleguidePage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [{ path: 'reset-password', element: <ResetPasswordPage /> }],
      },
      {
        element: <RedirectIfAuthed />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'signup', element: <SignupPage /> },
            ],
          },
        ],
      },
      {
        path: 'app',
        element: <RequireRole role="customer" />,
        children: [
          {
            element: <CustomerLayout />,
            children: [
              { index: true, element: <CustomerHomePage /> },
              { path: 'cart', element: <CartPage /> },
              { path: 'payment', element: <PaymentPage /> },
              { path: 'order-confirmation', element: <OrderConfirmationPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'profile', element: <ProfilePage /> },
            ],
          },
        ],
      },
      {
        path: 'runner',
        element: <RequireRole role="runner" />,
        children: [{ element: <RunnerLayout />, children: [{ index: true, element: <RunnerDashboardPage /> }] }],
      },
      {
        path: 'admin/login',
        element: <AuthLayout />,
        children: [{ index: true, element: <AdminLoginPage /> }],
      },
      {
        path: 'admin',
        element: <RequireRole role="admin" />,
        children: [{ element: <AdminLayout />, children: [{ index: true, element: <AdminConsolePage /> }] }],
      },
      {
        element: <MarketingLayout />,
        children: [{ path: '*', element: <NotFoundPage /> }],
      },
    ],
  },
]
