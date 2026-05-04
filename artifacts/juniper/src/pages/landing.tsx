import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    toast({
      title: "You're on the list!",
      description: "We'll be in touch when Juniper is ready for you.",
    });
    setName("");
    setEmail("");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="w-full py-4 px-6 md:px-12 flex justify-between items-center border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-serif font-bold text-lg italic">J</span>
          </div>
          <span className="font-serif text-xl font-medium tracking-tight text-primary">Juniper</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/app")}
          className="text-muted-foreground hover:text-foreground"
        >
          Admin
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mb-8">
          <span className="text-primary-foreground font-serif font-bold text-3xl italic">J</span>
        </div>

        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium leading-tight tracking-tight mb-6 max-w-2xl">
          Helping you reach life's milestones, at your own pace
        </h1>

        <p className="text-muted-foreground text-lg md:text-xl max-w-xl mb-12 leading-relaxed">
          An intelligent guide that walks you through the financial decisions of early marriage — from student debt to home buying — one question at a time.
        </p>

        {submitted ? (
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-8 py-6 max-w-sm w-full">
            <p className="font-serif text-xl text-primary font-medium mb-1">You're on the list!</p>
            <p className="text-muted-foreground text-sm">We'll reach out when Juniper is ready for you.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-sm">
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-base px-4"
            />
            <Input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 text-base px-4"
            />
            <Button type="submit" size="lg" className="h-12 font-medium">
              Get early access
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              No spam. We'll only reach out when we're ready for you.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
