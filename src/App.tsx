import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthPage } from "@/components/auth/AuthPage";
import { PendingInvitesDialog } from "@/components/auth/PendingInvitesDialog";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleRedirect } from "@/components/auth/RoleRedirect";
import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";

// Public pages (keep eager — entry points)
import PublicScoreboard from "./pages/PublicScoreboard";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";
import RegisterUniversity from "./pages/RegisterUniversity";

// Role-specific dashboards (keep eager — first screen after login)
import AdminDashboard from "./pages/admin/AdminDashboard";
import FacultyDashboard from "./pages/faculty/FacultyDashboard";
import CoordinatorDashboard from "./pages/coordinator/CoordinatorDashboard";
import StudentDashboard from "./pages/student/StudentDashboard";

// Core workflow (keep eager — frequently used)
import Dashboard from "./pages/Dashboard";
import ScoreControlPanel from "./components/coordinator/ScoreControlPanel";

// Lazy-loaded pages
const Events = React.lazy(() => import("./pages/Events"));
const Matches = React.lazy(() => import("./pages/Matches"));
const Teams = React.lazy(() => import("./pages/Teams"));
const Universities = React.lazy(() => import("./pages/Universities"));
const Registrations = React.lazy(() => import("./pages/Registrations"));
const AdminCoordinators = React.lazy(() => import("./pages/admin/AdminCoordinators"));
const Budgets = React.lazy(() => import("./pages/Budgets"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Bracket = React.lazy(() => import("./pages/Bracket"));

const RegistrationFormManager = React.lazy(() => import("./components/coordinator/RegistrationFormManager"));
const RegistrationReview = React.lazy(() => import("./components/faculty/RegistrationReview"));
const ScoreFinalization = React.lazy(() => import("./components/faculty/ScoreFinalization"));
const RegistrationApproval = React.lazy(() => import("./components/admin/RegistrationApproval"));
const RegistrationFormBuilder = React.lazy(() => import("./components/registration/RegistrationFormBuilder"));
const AdminFormApproval = React.lazy(() => import("./components/registration/AdminFormApproval"));
const StudentRegistrationView = React.lazy(() => import("./components/registration/StudentRegistrationView"));
const SubmissionsViewer = React.lazy(() => import("./components/registration/SubmissionsViewer"));
const RuleBookManager = React.lazy(() => import("./components/rulebook/RuleBookManager"));
const RuleBookViewer = React.lazy(() => import("./components/rulebook/RuleBookViewer"));

// Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-8 w-8 animate-spin text-accent" />
  </div>
);

// Wrap lazy component in Suspense
function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — cache static data
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/register-university" element={<RegisterUniversity />} />
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
            <Route path="/super-admin" element={<ProtectedRoute requiredRole="super_admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/universities" element={<ProtectedRoute requiredRole="super_admin"><Lazy><Universities /></Lazy></ProtectedRoute>} />
            <Route path="/admin/events" element={<ProtectedRoute requiredRole="admin"><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/admin/events/*" element={<ProtectedRoute requiredRole="admin"><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/admin/teams" element={<ProtectedRoute requiredRole="admin"><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/admin/teams/*" element={<ProtectedRoute requiredRole="admin"><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/admin/matches" element={<ProtectedRoute requiredRole="admin"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/admin/matches/*" element={<ProtectedRoute requiredRole="admin"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/admin/budgets" element={<ProtectedRoute requiredRole="admin"><Lazy><Budgets /></Lazy></ProtectedRoute>} />
            <Route path="/admin/budgets/*" element={<ProtectedRoute requiredRole="admin"><Lazy><Budgets /></Lazy></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="super_admin"><Lazy><Analytics /></Lazy></ProtectedRoute>} />
            <Route path="/admin/coordinators" element={<ProtectedRoute requiredRole="admin"><Lazy><AdminCoordinators /></Lazy></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute requiredRole="super_admin"><Lazy><Analytics /></Lazy></ProtectedRoute>} />
            <Route path="/admin/registration-approval" element={<ProtectedRoute requiredRole="admin"><Lazy><RegistrationApproval /></Lazy></ProtectedRoute>} />
            <Route path="/admin/form-approval" element={<ProtectedRoute requiredRole="admin"><Lazy><AdminFormApproval /></Lazy></ProtectedRoute>} />
            <Route path="/admin/rule-book" element={<ProtectedRoute requiredRole="admin"><Lazy><RuleBookManager /></Lazy></ProtectedRoute>} />
            <Route path="/admin/submissions" element={<ProtectedRoute requiredRole="admin"><Lazy><SubmissionsViewer /></Lazy></ProtectedRoute>} />
            <Route path="/admin/bracket/:eventId" element={<ProtectedRoute requiredRole="admin"><Lazy><Bracket /></Lazy></ProtectedRoute>} />

            {/* ==================== FACULTY ROUTES ==================== */}
            <Route path="/faculty/bracket/:eventId" element={<ProtectedRoute requiredRole="faculty"><Lazy><Bracket /></Lazy></ProtectedRoute>} />
            <Route path="/faculty" element={<ProtectedRoute requiredRole="faculty"><FacultyDashboard /></ProtectedRoute>} />
            <Route path="/faculty/events" element={<ProtectedRoute requiredRole="faculty"><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/events/*" element={<ProtectedRoute requiredRole="faculty"><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/teams" element={<ProtectedRoute requiredRole="faculty"><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/teams/*" element={<ProtectedRoute requiredRole="faculty"><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/matches" element={<ProtectedRoute requiredRole="faculty"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/matches/*" element={<ProtectedRoute requiredRole="faculty"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/registrations" element={<ProtectedRoute requiredRole="faculty"><Lazy><Registrations /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/registration-review" element={<ProtectedRoute requiredRole="faculty"><Lazy><RegistrationReview /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/score-finalization" element={<ProtectedRoute requiredRole="faculty"><Lazy><ScoreFinalization /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/submissions" element={<ProtectedRoute requiredRole="faculty"><Lazy><SubmissionsViewer /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/rule-book" element={<ProtectedRoute requiredRole="faculty"><Lazy><RuleBookViewer /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/budgets" element={<ProtectedRoute requiredRole="faculty"><Lazy><Budgets /></Lazy></ProtectedRoute>} />
            <Route path="/faculty/budgets/*" element={<ProtectedRoute requiredRole="faculty"><Lazy><Budgets /></Lazy></ProtectedRoute>} />

            {/* ==================== STUDENT COORDINATOR ROUTES ==================== */}
            <Route path="/coordinator/bracket/:eventId" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Bracket /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator" element={<ProtectedRoute requiredRole="student_coordinator"><CoordinatorDashboard /></ProtectedRoute>} />
            <Route path="/coordinator/matches" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/matches/*" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/score-control" element={<ProtectedRoute requiredRole="student_coordinator"><ScoreControlPanel /></ProtectedRoute>} />
            <Route path="/coordinator/form-builder" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><RegistrationFormBuilder /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/submissions" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><SubmissionsViewer /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/rule-book" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><RuleBookViewer /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/registrations" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Registrations /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/registrations/*" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Registrations /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/teams" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/coordinator/teams/*" element={<ProtectedRoute requiredRole="student_coordinator"><Lazy><Teams /></Lazy></ProtectedRoute>} />

            {/* ==================== STUDENT ROUTES ==================== */}
            <Route path="/student/bracket/:eventId" element={<ProtectedRoute><Lazy><Bracket /></Lazy></ProtectedRoute>} />
            <Route path="/student" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
            <Route path="/student/events" element={<ProtectedRoute><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/student/events/*" element={<ProtectedRoute><Lazy><Events /></Lazy></ProtectedRoute>} />
            <Route path="/student/teams" element={<ProtectedRoute><Lazy><Teams /></Lazy></ProtectedRoute>} />
            <Route path="/student/registrations" element={<ProtectedRoute><Lazy><Registrations /></Lazy></ProtectedRoute>} />
            <Route path="/student/matches" element={<ProtectedRoute><Lazy><Matches /></Lazy></ProtectedRoute>} />
            <Route path="/student/rule-book" element={<ProtectedRoute><Lazy><RuleBookViewer /></Lazy></ProtectedRoute>} />
            <Route path="/student/open-registrations" element={<ProtectedRoute><Lazy><StudentRegistrationView /></Lazy></ProtectedRoute>} />

            {/* Legacy routes - redirect to role-based */}
            <Route path="/events" element={<ProtectedRoute><RoleRedirect target="events" /></ProtectedRoute>} />
            <Route path="/matches" element={<ProtectedRoute><RoleRedirect target="matches" /></ProtectedRoute>} />
            <Route path="/teams" element={<ProtectedRoute><RoleRedirect target="teams" /></ProtectedRoute>} />
            <Route path="/registrations" element={<ProtectedRoute requiredRole="student_coordinator"><RoleRedirect target="registrations" /></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute requiredRole="faculty"><RoleRedirect target="budgets" /></ProtectedRoute>} />
            <Route path="/universities" element={<ProtectedRoute requiredRole="super_admin"><Navigate to="/admin/universities" replace /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute requiredRole="super_admin"><Navigate to="/admin/analytics" replace /></ProtectedRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <PendingInvitesDialog />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
