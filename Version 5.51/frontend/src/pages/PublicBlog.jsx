import { useState, useRef, Suspense, lazy } from "react";
import AppShell from "../components/AppShell.jsx";

const NeetBlogPage       = lazy(() => import("../components/NeetBlogPage.jsx"));
const NeetResourceDetails = lazy(() => import("../components/NeetResourceDetails.jsx"));

const PageSpinner = () => (
  <div className="page-center"><div className="spinner-lg" /></div>
);

export default function PublicBlog() {
  const [selectedPostId, setSelectedPostId] = useState(null);
  const lastOpenedPostId = useRef(null);

  return (
    <AppShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 0 80px" }}>
        <Suspense fallback={<PageSpinner />}>
          <div style={{ display: selectedPostId ? "none" : "block" }}>
            <NeetBlogPage
              scrollToPostId={lastOpenedPostId.current}
              onPostSelect={(id) => {
                lastOpenedPostId.current = id;
                setSelectedPostId(id);
              }}
            />
          </div>
          {selectedPostId && (
            <NeetResourceDetails
              postId={selectedPostId}
              onBack={() => setSelectedPostId(null)}
            />
          )}
        </Suspense>
      </div>
    </AppShell>
  );
}
