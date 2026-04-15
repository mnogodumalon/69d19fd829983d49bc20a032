import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import KategorienPage from '@/pages/KategorienPage';
import OrtePage from '@/pages/OrtePage';
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <ActionsProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardOverview />} />
              <Route path="kategorien" element={<KategorienPage />} />
              <Route path="orte" element={<OrtePage />} />
              <Route path="admin" element={<AdminPage />} />
              {/* <custom:routes> */}
              {/* </custom:routes> */}
            </Route>
          </Routes>
        </ActionsProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
