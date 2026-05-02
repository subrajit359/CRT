import { useState, Suspense, lazy } from "react";
import AppShell from "../components/AppShell.jsx";

const NeetBlogPage       = lazy(() => import("../components/NeetBlogPage.jsx"));
const NeetResourceDetails = lazy(() => import("../components/NeetResourceDetails.jsx"));

const PageSpinner = () => (
  <div className="page-center"><div className="spinner-lg" /></div>
);

export default function PublicBlog() {
  const [selectedPostId, setSelectedPostId] = useState(null);

  return (
    <AppShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 0 80px" }}>
        <Suspense fallback={<PageSpinner />}>
          {selectedPostId ? (
            <NeetResourceDetails
              postId={selectedPostId}
              onBack={() => setSelectedPostId(null)}
            />
          ) : (
            <NeetBlogPage onPostSelect={(id) => setSelectedPostId(id)} />
          )}
        </Suspense>
      </div>
    </AppShell>
  );
}
