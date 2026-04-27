import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";

export default function NotFound() {
  return (
    <AppShell>
      <div className="container page-center">
        <div style={{ textAlign: "center" }}>
          <h2>Not found</h2>
          <p className="muted">That page doesn't exist.</p>
          <div style={{ marginTop: 18 }}>
            <Link href="/" className="btn btn-primary">Back home</Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
