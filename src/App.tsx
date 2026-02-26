import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthPage } from "@/components/auth/AuthPage";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleRedirect } from "@/components/auth/RoleRedirect";

// Public pages
import PublicScoreboard from "./pages/PublicScoreboard";
import PublicMatchView from "./pages/PublicMatchView";
import PublicBracket from "./pages/PublicBracket";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";

// Role-specific dashboards
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminReports from "./pages/admin/AdminReports";
import AdminCoordinators from "./pages/admin/AdminCoordinators";
import AdminRegistration from "./pages/admin/AdminRegistration";
import FacultyDashboard from "./pages/faculty/FacultyDashboard";
import CoordinatorDashboard from "./pages/coordinator/CoordinatorDashboard";
import StudentDashboard from "./pages/student/StudentDashboard";

// Shared pages (for backwards compatibility)
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import Matches from "./pages/Matches";
import Teams from "./pages/Teams";
import Universities from "./pages/Universities";
import Registrations from "./pages/Registrations";
import Budgets from "./pages/Budgets";
import Analytics from "./pages/Analytics";

// Workflow pages
import RegistrationFormManager from "./components/coordinator/RegistrationFormManager";
import MatchControlPanel from "./components/coordinator/MatchControlPanel";
import RegistrationReview from "./components/faculty/RegistrationReview";
import ScoreFinalization from "./components/faculty/ScoreFinalization";

// New Registration Builder system
import RegistrationFormBuilder from "./components/registration/RegistrationFormBuilder";
import AdminFormApproval from "./components/registration/AdminFormApproval";
import StudentRegistrationView from "./components/registration/StudentRegistrationView";
import SubmissionsViewer from "./components/registration/SubmissionsViewer";

// Rule Book
import RuleBookManager from "./components/rulebook/RuleBookManager";
import RuleBookViewer from "./components/rulebook/RuleBookViewer";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PublicScoreboard />} />
            <Route path="/matches/:id" element={<PublicMatchView />} />
            <Route path="/bracket/:eventId" element={<PublicBracket />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Role-based redirect from /dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <RoleRedirect />
                </ProtectedRoute>
              }
            />

            {/* ==================== ADMIN ROUTES ==================== */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/universities"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Universities />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/events"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/events/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/teams"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/teams/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/matches"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/matches/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/budgets"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Budgets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/budgets/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Budgets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/coordinators"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminCoordinators />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/registration"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminRegistration />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/registration/:sportId"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminRegistration />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/form-approval"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminFormApproval />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/rule-book"
              element={
                <ProtectedRoute requiredRole="admin">
                  <RuleBookManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/submissions"
              element={
                <ProtectedRoute requiredRole="admin">
                  <SubmissionsViewer />
                </ProtectedRoute>
              }
            />

            {/* ==================== FACULTY ROUTES ==================== */}
            <Route
              path="/faculty"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <FacultyDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/events"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/events/*"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/teams"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/teams/*"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/matches"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/matches/*"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/registrations"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Registrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/registration-review"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <RegistrationReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/score-finalization"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <ScoreFinalization />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/submissions"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <SubmissionsViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/rule-book"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <RuleBookViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/budgets"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Budgets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty/budgets/*"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <Budgets />
                </ProtectedRoute>
              }
            />

            {/* ==================== STUDENT COORDINATOR ROUTES ==================== */}
            <Route
              path="/coordinator"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <CoordinatorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/matches"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/matches/*"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/events"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/events/*"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/score-control"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <MatchControlPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/reports"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/registration-forms"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <RegistrationFormManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/form-builder"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <RegistrationFormBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/submissions"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <SubmissionsViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/rule-book"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <RuleBookViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/registrations"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Registrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/registrations/*"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Registrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/teams"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/teams/*"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <Teams />
                </ProtectedRoute>
              }
            />

            {/* ==================== STUDENT ROUTES ==================== */}
            <Route
              path="/student"
              element={
                <ProtectedRoute>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/events"
              element={
                <ProtectedRoute>
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/events/*"
              element={
                <ProtectedRoute>
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/teams"
              element={
                <ProtectedRoute>
                  <Teams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/registrations"
              element={
                <ProtectedRoute>
                  <Registrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/matches"
              element={
                <ProtectedRoute>
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/rule-book"
              element={
                <ProtectedRoute>
                  <RuleBookViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/open-registrations"
              element={
                <ProtectedRoute>
                  <StudentRegistrationView />
                </ProtectedRoute>
              }
            />

            {/* Legacy routes - redirect to role-based */}
            <Route
              path="/events"
              element={
                <ProtectedRoute>
                  <RoleRedirect target="events" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/matches"
              element={
                <ProtectedRoute>
                  <RoleRedirect target="matches" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teams"
              element={
                <ProtectedRoute>
                  <RoleRedirect target="teams" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/registrations"
              element={
                <ProtectedRoute requiredRole="student_coordinator">
                  <RoleRedirect target="registrations" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/budgets"
              element={
                <ProtectedRoute requiredRole="faculty">
                  <RoleRedirect target="budgets" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universities"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Navigate to="/admin/universities" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Navigate to="/admin/analytics" replace />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
