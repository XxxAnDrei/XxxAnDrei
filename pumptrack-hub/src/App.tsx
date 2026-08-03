import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, type AppRole } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import MfaGate from "@/components/MfaGate";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Index from "@/pages/Index";
import Riders from "@/pages/Riders";
import Trainings from "@/pages/Trainings";
import Attendance from "@/pages/Attendance";
import ParentMeasurement from "@/pages/ParentMeasurement";
import CoachAvailability from "@/pages/CoachAvailability";
import PrivateLessons from "@/pages/PrivateLessons";
import PaymentsAdmin from "@/pages/PaymentsAdmin";
import ParentPayments from "@/pages/ParentPayments";
import EmployerContribution from "@/pages/EmployerContribution";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import ForcePasswordChange from "@/pages/ForcePasswordChange";
import Chat from "@/pages/Chat";

const queryClient = new QueryClient();

function ProtectedRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: AppRole[];
}) {
  const { user, role, loading, mustChangePassword, mfaRequired } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Načítavanie...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/zmena-hesla" replace />;
  if (mfaRequired) return <MfaGate />;
  if (allow) {
    if (role === null) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Načítavanie...</div>;
    if (!allow.includes(role)) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomeByRole() {
  const { role } = useAuth();
  if (role === "payments_admin") return <Navigate to="/platby" replace />;
  return <Index />;
}

function ForceChangeRoute() {
  const { user, loading, mustChangePassword } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Načítavanie...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!mustChangePassword) return <Navigate to="/" replace />;
  return <ForcePasswordChange />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/zmena-hesla" element={<ForceChangeRoute />} />
    <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route index element={<HomeByRole />} />
      <Route path="riders" element={<ProtectedRoute allow={["admin"]}><Riders /></ProtectedRoute>} />
      <Route path="trainings" element={<ProtectedRoute allow={["admin"]}><Trainings /></ProtectedRoute>} />
      <Route path="attendance" element={<ProtectedRoute allow={["admin"]}><Attendance /></ProtectedRoute>} />
      <Route path="measurement" element={<ProtectedRoute allow={["parent"]}><ParentMeasurement /></ProtectedRoute>} />
      <Route path="coach-availability" element={<ProtectedRoute allow={["admin"]}><CoachAvailability /></ProtectedRoute>} />
      <Route path="private-lessons" element={<ProtectedRoute allow={["parent"]}><PrivateLessons /></ProtectedRoute>} />
      <Route path="platby" element={<ProtectedRoute allow={["payments_admin"]}><PaymentsAdmin /></ProtectedRoute>} />
      <Route path="moje-platby" element={<ProtectedRoute allow={["parent"]}><ParentPayments /></ProtectedRoute>} />
      <Route path="prispevok-zamestnavatel" element={<ProtectedRoute allow={["parent"]}><EmployerContribution /></ProtectedRoute>} />
      <Route path="nastavenia" element={<ProtectedRoute allow={["parent"]}><Settings /></ProtectedRoute>} />
      <Route path="chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* Aplikácia používa oba systémy: shadcn useToast (16 súborov) aj sonner.
          Bez tohto <Toaster/> sa žiadny toast z useToast nevykreslil. */}
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
