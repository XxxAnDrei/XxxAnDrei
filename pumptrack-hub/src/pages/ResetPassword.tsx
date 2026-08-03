import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ctvzLogo from "@/assets/ctvz-logo.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Expirovaný alebo už použitý odkaz vracia GoTrue s chybou v hashi. Bez tohto
    // by stránka len mlčky ponúkla "otvorte odkaz z emailu" a nikto by nevedel prečo.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = hash.get("error_description") || hash.get("error");
    if (err) {
      const decoded = decodeURIComponent(err.replace(/\+/g, " "));
      setLinkError(
        /expired|invalid/i.test(decoded)
          ? "Odkaz je neplatný alebo mu vypršala platnosť. Vyžiadajte si nový."
          : decoded,
      );
      return;
    }

    // Náš odkaz z emailu nesie token_hash a overujeme ho sami. Nezávisíme tak na
    // allow-liste presmerovaní v Auth nastaveniach, ktorý inak používateľa vyhodí
    // na prihlasovaciu obrazovku namiesto tohto formulára.
    const q = new URLSearchParams(window.location.search);
    const tokenHash = q.get("token_hash");
    if (tokenHash && q.get("type") === "recovery") {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error }) => {
          if (error) {
            setLinkError("Odkaz je neplatný alebo mu vypršala platnosť. Vyžiadajte si nový.");
            return;
          }
          setReady(true);
          // Token preč z adresného riadka — nech neostane v histórii ani v referrer.
          window.history.replaceState({}, "", "/reset-password");
        });
      return;
    }

    // Supabase auto-detects recovery hash and creates a temporary session.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast({ title: "Slabé heslo", description: "Minimálne 10 znakov.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Heslá sa nezhodujú", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Hotovo", description: "Heslo bolo nastavené." });
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={ctvzLogo} alt="CTVZ" className="w-full max-w-[280px] h-auto" />
        </div>
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-center text-lg font-semibold">Nastavenie hesla</h2>
          </CardHeader>
          <CardContent>
            {linkError ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-destructive">{linkError}</p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                  Späť na prihlásenie
                </Button>
              </div>
            ) : !ready ? (
              <p className="text-center text-sm text-muted-foreground">
                Otvorte odkaz z emailu na tomto zariadení.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Náhľad hesla — jeden prepínač ovláda obe polia, nech si používateľ
                    vie skontrolovať, čo naozaj napísal. */}
                <div className="space-y-2">
                  <Label htmlFor="pwd">Nové heslo</Label>
                  <div className="relative">
                    <Input id="pwd" type={showPassword ? "text" : "password"} value={password} minLength={10}
                      onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                      className="pr-10" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Skryť heslo" : "Zobraziť heslo"}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Min. 10 znakov.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pwd2">Zopakovať heslo</Label>
                  <div className="relative">
                    <Input id="pwd2" type={showPassword ? "text" : "password"} value={confirm} minLength={10}
                      onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
                      className="pr-10" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Skryť heslo" : "Zobraziť heslo"}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Nastaviť heslo
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
