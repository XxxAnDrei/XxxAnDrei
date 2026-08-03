import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

export default function ForcePasswordChange() {
  const { user, refreshMustChange } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) {
      toast({ title: "Heslo musí mať aspoň 10 znakov", variant: "destructive" });
      return;
    }
    if (pw !== pw2) {
      toast({ title: "Heslá sa nezhodujú", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setLoading(false);
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    if (user) {
      await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
    }
    await refreshMustChange?.();
    setLoading(false);
    toast({ title: "Heslo nastavené" });
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Nastavte si nové heslo</h1>
        <p className="text-sm text-muted-foreground">
          Prihlásili ste sa dočasným heslom. Kým si nenastavíte vlastné, do aplikácie
          sa nedostanete. Minimálne 10 znakov.
        </p>
        <div className="space-y-2">
          <Label htmlFor="pw">Nové heslo</Label>
          <div className="relative">
            <Input
              id="pw"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={10}
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={show ? "Skryť heslo" : "Zobraziť heslo"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw2">Potvrdenie hesla</Label>
          <Input
            id="pw2"
            type={show ? "text" : "password"}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            minLength={10}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Ukladám..." : "Uložiť heslo"}
        </Button>
      </form>
    </div>
  );
}
