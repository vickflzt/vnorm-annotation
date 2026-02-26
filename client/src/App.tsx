import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ExperimentPage from "./pages/ExperimentPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={ExperimentPage} />
      <Route path={"/dashboard"} component={DashboardPage} />
      <Route path={"/admin"} component={AdminPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
