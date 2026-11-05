import { useSyncExternalStore } from "react";
import { subscribeCatalog, catalogRevision } from "./lib/catalog";
import Home from "./pages/Home";
import ErrorBoundary from "./components/ErrorBoundary";
export default function App() {
  useSyncExternalStore(subscribeCatalog, catalogRevision);
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  );
}
