import { ChatInterface } from "@/components/chat/chat-interface";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { toast } = useToast();

  const handleLogin = () => {
    toast({
      title: "Coming soon",
      description: "Account login will be available in a future update.",
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="w-full py-4 px-6 md:px-12 flex justify-between items-center border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-lg italic">J</span>
          </div>
          <span className="font-serif text-xl font-medium tracking-tight text-primary">Juniper</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogin} className="text-muted-foreground hover:text-foreground hidden sm:flex">
          <LogIn className="w-4 h-4 mr-2" />
          Log in
        </Button>
      </header>

      <main className="flex-1 flex flex-col w-full h-[calc(100dvh-73px)] overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  );
}
