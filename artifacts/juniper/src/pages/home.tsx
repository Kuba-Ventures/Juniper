import { useState } from "react";
import { useLocation } from "wouter";
import { ChatInterface } from "@/components/chat/chat-interface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn } from "lucide-react";

const SESSION_KEY = "juniper_admin_auth";

export default function Home() {
  const [, navigate] = useLocation();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "juniper") {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setPassword("");
    }
  };

  if (!authed) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-foreground font-sans px-6">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mb-6">
          <span className="text-primary-foreground font-serif font-bold text-3xl italic">J</span>
        </div>
        <h1 className="font-serif text-2xl font-medium mb-1 text-primary">Juniper</h1>
        <p className="text-muted-foreground text-sm mb-8">Admin access only</p>

        <form onSubmit={handleUnlock} className="flex flex-col gap-3 w-full max-w-xs">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            className={`h-12 text-base px-4 text-center tracking-widest ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
            autoFocus
          />
          {error && (
            <p className="text-destructive text-xs text-center -mt-1">Incorrect password</p>
          )}
          <Button type="submit" size="lg" className="h-12 font-medium">
            <LogIn className="w-4 h-4 mr-2" />
            Enter
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="w-full py-4 px-6 md:px-12 flex justify-between items-center border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shrink-0">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-lg italic">J</span>
          </div>
          <span className="font-serif text-xl font-medium tracking-tight text-primary">Juniper</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col w-full h-[calc(100dvh-73px)] overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  );
}
