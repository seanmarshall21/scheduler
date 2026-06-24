import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';

import SignIn from './pages/SignIn';
import Welcome from './pages/Welcome';
import Join from './pages/Join';
import Home from './pages/Home';
import Calendar from './pages/Calendar';
import Tasks from './pages/Tasks';
import Notes from './pages/Notes';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/join" element={<Join />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Home />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
