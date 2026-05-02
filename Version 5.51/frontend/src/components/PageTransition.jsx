import { useLocation } from "wouter";

export default function PageTransition({ children }) {
  const [location] = useLocation();
  return (
    <div key={location} className="page-transition" style={{ minHeight: "100%" }}>
      {children}
    </div>
  );
}
