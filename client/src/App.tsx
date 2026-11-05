import { useSyncExternalStore } from "react";
import { subscribeCatalog, catalogRevision } from "./lib/catalog";
import Home from "./pages/Home";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
export default function App() {
  useSyncExternalStore(subscribeCatalog, catalogRevision);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Home />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
