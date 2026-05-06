import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import FindPartner from "@/pages/find-partner";
import Queue from "@/pages/queue";
import Notebook from "@/pages/notebook";
import SessionRoom from "@/pages/session-room";
import SignIn from "@/pages/sign-in";
import Landing from "@/pages/landing";
import About from "@/pages/about";
import CreateRoom from "@/pages/create-room";
import InvitePage from "@/pages/invite";
import RequestsBoard from "@/pages/requests-board";
import Admin from "@/pages/admin";
import AuthCallback from "@/pages/auth-callback";
import { useAuth } from "@/lib/auth";

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground italic">opening the door…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/about" component={About} />
        <Route path="/sign-in" component={SignIn} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/sign-in" component={Home} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/create" component={CreateRoom} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/requests" component={RequestsBoard} />
      <Route path="/admin" component={Admin} />
      <Route path="/find" component={FindPartner} />
      <Route path="/queue" component={Queue} />
      <Route path="/notebook" component={Notebook} />
      <Route path="/room/:id" component={SessionRoom} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
