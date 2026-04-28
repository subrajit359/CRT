import { Switch, Route, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { RioCaseProvider } from "./lib/rioContext.jsx";
import PageTransition from "./components/PageTransition.jsx";
import DrRioWidget from "./components/DrRioWidget.jsx";
import AdminLogNotifier from "./components/AdminLogNotifier.jsx";
import WarningPopup from "./components/WarningPopup.jsx";

const Landing             = lazy(() => import("./pages/Landing.jsx"));
const Register            = lazy(() => import("./pages/Register.jsx"));
const Login               = lazy(() => import("./pages/Login.jsx"));
const ForgotPassword      = lazy(() => import("./pages/ForgotPassword.jsx"));
const StudentDashboard    = lazy(() => import("./pages/StudentDashboard.jsx"));
const DoctorDashboard     = lazy(() => import("./pages/DoctorDashboard.jsx"));
const AdminDashboard      = lazy(() => import("./pages/AdminDashboard.jsx"));
const AdminLogs           = lazy(() => import("./pages/AdminLogs.jsx"));
const AdminDoctorApprovals   = lazy(() => import("./pages/AdminDoctorApprovals.jsx"));
const AdminDeleteRequests    = lazy(() => import("./pages/AdminDeleteRequests.jsx"));
const AdminPracticeActivity  = lazy(() => import("./pages/AdminPracticeActivity.jsx"));
const AdminReports           = lazy(() => import("./pages/AdminReports.jsx"));
const AdminSupportChats      = lazy(() => import("./pages/AdminSupportChats.jsx"));
const AdminAllUsers          = lazy(() => import("./pages/AdminAllUsers.jsx"));
const AdminAccountDeleteRequests = lazy(() => import("./pages/AdminAccountDeleteRequests.jsx"));
const AdminCases             = lazy(() => import("./pages/AdminCases.jsx"));
const AdminMailSender        = lazy(() => import("./pages/AdminMailSender.jsx"));
const AdminCaseEdit          = lazy(() => import("./pages/AdminCaseEdit.jsx"));
const PendingDoctorInbox  = lazy(() => import("./pages/PendingDoctorInbox.jsx"));
const PracticeStart       = lazy(() => import("./pages/PracticeStart.jsx"));
const CasePlay            = lazy(() => import("./pages/CasePlay.jsx"));
const CaseUpload          = lazy(() => import("./pages/CaseUpload.jsx"));
const VerifyQueue         = lazy(() => import("./pages/VerifyQueue.jsx"));
const CaseDiscussion      = lazy(() => import("./pages/CaseDiscussion.jsx"));
const DeleteRequests      = lazy(() => import("./pages/DeleteRequests.jsx"));
const Profile             = lazy(() => import("./pages/Profile.jsx"));
const SearchPage          = lazy(() => import("./pages/SearchPage.jsx"));
const Settings            = lazy(() => import("./pages/Settings.jsx"));
const Notifications       = lazy(() => import("./pages/Notifications.jsx"));
const Progress            = lazy(() => import("./pages/Progress.jsx"));
const DoctorLounge        = lazy(() => import("./pages/DoctorLounge.jsx"));
const Messages            = lazy(() => import("./pages/Messages.jsx"));
const Leaderboard         = lazy(() => import("./pages/Leaderboard.jsx"));
const NotFound            = lazy(() => import("./pages/NotFound.jsx"));

const PageSpinner = () => (
  <div className="page-center"><div className="spinner-lg" /></div>
);

function isPendingDoctor(user) {
  return !!user && user.role === "doctor" && user.status && user.status !== "approved";
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login"); return; }
    if (isPendingDoctor(user)) { navigate("/"); return; }
    if (roles && !roles.includes(user.role)) navigate("/");
  }, [user, loading, roles, navigate]);
  if (loading) return <PageSpinner />;
  if (!user) return null;
  if (isPendingDoctor(user)) return null;
  if (roles && !roles.includes(user.role)) return null;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Landing />;
  if (isPendingDoctor(user)) return <PendingDoctorInbox />;
  if (user.role === "doctor") return <DoctorDashboard />;
  if (user.role === "admin") return <AdminDashboard />;
  return <StudentDashboard />;
}

function InboxRoute() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);
  if (loading) return <PageSpinner />;
  if (!user) return null;
  return <PendingDoctorInbox />;
}

function Routes() {
  return (
    <Suspense fallback={<PageSpinner />}>
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
          <Route path="/admin/all-users"><ProtectedRoute roles={["admin"]}><AdminAllUsers /></ProtectedRoute></Route>
          <Route path="/admin/account-delete-requests"><ProtectedRoute roles={["admin"]}><AdminAccountDeleteRequests /></ProtectedRoute></Route>
          <Route path="/admin/cases"><ProtectedRoute roles={["admin"]}><AdminCases /></ProtectedRoute></Route>
          <Route path="/admin/cases/:id/edit"><ProtectedRoute roles={["admin"]}><AdminCaseEdit /></ProtectedRoute></Route>
          <Route path="/admin/mail"><ProtectedRoute roles={["admin"]}><AdminMailSender /></ProtectedRoute></Route>
          <Route path="/inbox" component={InboxRoute} />
          <Route component={NotFound} />
        </Switch>
      </PageTransition>
    </Suspense>
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
          <WarningPopup />
        </RioCaseProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
