import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { RioCaseProvider } from "./lib/rioContext.jsx";
import PageTransition from "./components/PageTransition.jsx";
import DrRioWidget from "./components/DrRioWidget.jsx";
import Landing from "./pages/Landing.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminLogs from "./pages/AdminLogs.jsx";
import AdminDoctorApprovals from "./pages/AdminDoctorApprovals.jsx";
import AdminDeleteRequests from "./pages/AdminDeleteRequests.jsx";
import AdminPracticeActivity from "./pages/AdminPracticeActivity.jsx";
import AdminReports from "./pages/AdminReports.jsx";
import AdminSupportChats from "./pages/AdminSupportChats.jsx";
import PendingDoctorInbox from "./pages/PendingDoctorInbox.jsx";
import AdminLogNotifier from "./components/AdminLogNotifier.jsx";
import PracticeStart from "./pages/PracticeStart.jsx";
import CasePlay from "./pages/CasePlay.jsx";
import CaseUpload from "./pages/CaseUpload.jsx";
import VerifyQueue from "./pages/VerifyQueue.jsx";
import CaseDiscussion from "./pages/CaseDiscussion.jsx";
import DeleteRequests from "./pages/DeleteRequests.jsx";
import Profile from "./pages/Profile.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import Settings from "./pages/Settings.jsx";
import Notifications from "./pages/Notifications.jsx";
import Progress from "./pages/Progress.jsx";
import DoctorLounge from "./pages/DoctorLounge.jsx";
import Messages from "./pages/Messages.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import NotFound from "./pages/NotFound.jsx";

// True when the user is a doctor whose application has not been approved yet
// (pending or rejected). Such users are restricted to the inbox page.
function isPendingDoctor(user) {
  return !!user && user.role === "doctor" && user.status && user.status !== "approved";
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login"); return; }
    // Pending/rejected doctors are pinned to the inbox; bounce them home so
    // HomeRedirect renders PendingDoctorInbox.
    if (isPendingDoctor(user)) { navigate("/"); return; }
    if (roles && !roles.includes(user.role)) navigate("/");
  }, [user, loading, roles, navigate]);
  if (loading) return <div className="page-center"><div className="spinner-lg" /></div>;
  if (!user) return null;
  if (isPendingDoctor(user)) return null;
  if (roles && !roles.includes(user.role)) return null;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center"><div className="spinner-lg" /></div>;
  if (!user) return <Landing />;
  if (isPendingDoctor(user)) return <PendingDoctorInbox />;
  if (user.role === "doctor") return <DoctorDashboard />;
  if (user.role === "admin") return <AdminDashboard />;
  return <StudentDashboard />;
}

// Standalone /inbox route for pending doctors (and the link admins send when
// notifying them of a reply).
function InboxRoute() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);
  if (loading) return <div className="page-center"><div className="spinner-lg" /></div>;
  if (!user) return null;
  return <PendingDoctorInbox />;
}

function Routes() {
  return (
    <PageTransition>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route path="/forgot" component={ForgotPassword} />
        <Route path="/practice"><ProtectedRoute><PracticeStart /></ProtectedRoute></Route>
        <Route path="/case/:id"><ProtectedRoute><CasePlay /></ProtectedRoute></Route>
        <Route path="/upload"><ProtectedRoute roles={["doctor", "admin"]}><CaseUpload /></ProtectedRoute></Route>
        <Route path="/verify"><ProtectedRoute roles={["doctor", "admin"]}><VerifyQueue /></ProtectedRoute></Route>
        <Route path="/discussion/:caseId"><ProtectedRoute><CaseDiscussion /></ProtectedRoute></Route>
        <Route path="/delete-requests"><ProtectedRoute roles={["doctor", "admin"]}><DeleteRequests /></ProtectedRoute></Route>
        <Route path="/lounge"><ProtectedRoute roles={["doctor", "admin"]}><DoctorLounge /></ProtectedRoute></Route>
        <Route path="/messages"><ProtectedRoute><Messages /></ProtectedRoute></Route>
        <Route path="/messages/u/:username"><ProtectedRoute><Messages /></ProtectedRoute></Route>
        <Route path="/u/:username"><ProtectedRoute><Profile /></ProtectedRoute></Route>
        <Route path="/search"><ProtectedRoute><SearchPage /></ProtectedRoute></Route>
        <Route path="/settings"><ProtectedRoute><Settings /></ProtectedRoute></Route>
        <Route path="/notifications"><ProtectedRoute><Notifications /></ProtectedRoute></Route>
        <Route path="/leaderboard"><ProtectedRoute><Leaderboard /></ProtectedRoute></Route>
        <Route path="/progress"><ProtectedRoute roles={["student"]}><Progress /></ProtectedRoute></Route>
        <Route path="/admin"><ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute></Route>
        <Route path="/admin/logs"><ProtectedRoute roles={["admin"]}><AdminLogs /></ProtectedRoute></Route>
        <Route path="/admin/doctor-approvals"><ProtectedRoute roles={["admin"]}><AdminDoctorApprovals /></ProtectedRoute></Route>
        <Route path="/admin/delete-requests"><ProtectedRoute roles={["admin"]}><AdminDeleteRequests /></ProtectedRoute></Route>
        <Route path="/admin/practice-activity"><ProtectedRoute roles={["admin"]}><AdminPracticeActivity /></ProtectedRoute></Route>
        <Route path="/admin/reports"><ProtectedRoute roles={["admin"]}><AdminReports /></ProtectedRoute></Route>
        <Route path="/admin/support"><ProtectedRoute roles={["admin"]}><AdminSupportChats /></ProtectedRoute></Route>
        <Route path="/admin/support/:threadId"><ProtectedRoute roles={["admin"]}><AdminSupportChats /></ProtectedRoute></Route>
        <Route path="/inbox" component={InboxRoute} />
        <Route component={NotFound} />
      </Switch>
    </PageTransition>
  );
}

function GlobalRio() {
  const { user } = useAuth();
  if (!user) return null;
  return <DrRioWidget />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RioCaseProvider>
          <Routes />
          <GlobalRio />
          <AdminLogNotifier />
        </RioCaseProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
