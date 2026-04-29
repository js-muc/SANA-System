import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import ScoreInput from './pages/ScoreInput';
import StudentsList from './pages/StudentsList';
import StudentProfile from './pages/StudentProfile';
import Reports from './pages/Reports';
import MeritList from './pages/MeritList';
import StudentProgress from './pages/StudentProgress';
import AdminSubjects from './pages/admin/AdminSubjects';
import AdminLevels from './pages/admin/AdminLevels';
import AdminClasses from './pages/admin/AdminClasses';
import AdminResults from './pages/admin/AdminResults';
import AdminTeachers from './pages/admin/AdminTeachers';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();

  // Step 1: wait ONLY for loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading admin...</p>
      </div>
    );
  }

  // Step 2: if profile still missing, DO NOT BLOCK
  if (!profile) {
    return <div className="p-6 text-gray-400">Preparing profile...</div>;
  }

  // Step 3: role check
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (profile && profile.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, profile, loading } = useAuth();

  // Step 1: wait for auth loading ONLY
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading SANA OS...</p>
        </div>
      </div>
    );
  }

  // Step 2: if no user → login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Step 3: if profile still loading → DON'T BLOCK
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Preparing profile...
      </div>
    );
  }

  // Step 4: approval check
  if (
    profile.role === 'admin' &&
    (profile.approval_status === 'pending' || profile.approval_status === 'rejected')
  ) {
    return <PendingApproval />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scores" element={<ScoreInput />} />
        <Route path="/students" element={<StudentsList />} />
        <Route path="/students/:id" element={<StudentProfile />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/progress" element={<StudentProgress />} />
        <Route path="/merit-list" element={<MeritList />} />

        <Route path="/admin/results" element={<AdminRoute><AdminResults /></AdminRoute>} />
        <Route path="/admin/teachers" element={<AdminRoute><AdminTeachers /></AdminRoute>} />
        <Route path="/admin/subjects" element={<AdminRoute><AdminSubjects /></AdminRoute>} />
        <Route path="/admin/levels" element={<AdminRoute><AdminLevels /></AdminRoute>} />
        <Route path="/admin/classes" element={<AdminRoute><AdminClasses /></AdminRoute>} />

        <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
