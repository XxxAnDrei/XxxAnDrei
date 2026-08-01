import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ctvzLogo from "@/assets/ctvz-logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // MFA state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);

  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const ADMIN_EMAIL = "info@ctvz.sk";

  const handleAfterSignIn = async () => {
    // MFA (if required for the role) is enforced by the global route guard via <MfaGate/>.
    navigate("/");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const targetEmail = isAdminMode ? ADMIN_EMAIL : email;
    const { error } = await signIn(targetEmail, password);
    setIsLoading(false);
    if (error) {
      toast({ title: "Chyba prihlásenia", description: "Nesprávny email alebo heslo.", variant: "destructive" });
      return;
    }
    await handleAfterSignIn();
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || !mfaChallengeId) return;
    setIsLoading(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId, challengeId: mfaChallengeId, code: mfaCode,
    });
    setIsLoading(false);
    if (error) {
      toast({ title: "Neplatný kód", description: error.message, variant: "destructive" });
      return;
    }
    navigate("/");
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({ title: "Zadajte email", description: "Najprv vyplňte pole Email a skúste znova.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    // Vlastný endpoint: email ide cez Brevo z klubovej adresy a cieľ odkazu
    // určuje server (APP_URL), nie prehliadač. Odpoveď je vždy rovnaká —
    // úmyselne neprezrádza, či taký účet existuje.
    const { error } = await supabase.functions.invoke("request-password-reset", {
      body: { email: email.trim().toLowerCase() },
    });
    setIsLoading(false);
    if (error) {
      toast({
        title: "Nepodarilo sa odoslať",
        description: "Skúste to prosím o chvíľu znova.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Skontrolujte email",
      description: "Ak k tejto adrese existuje konto, poslali sme naň odkaz na nastavenie hesla.",
    });
  };

  // MFA UI
  if (mfaChallengeId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <img src={ctvzLogo} alt="CTVZ" className="w-full max-w-[280px] h-auto" />
          </div>
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-center text-lg font-semibold flex items-center justify-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Dvojstupňové overenie
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {enrollQr && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Naskenujte QR kód v aplikácii Google Authenticator / 1Password / Authy a zadajte 6-miestny kód.
                  </p>
                  <div className="flex justify-center rounded-md border border-border bg-white p-3">
                    <img src={enrollQr} alt="TOTP QR" className="h-40 w-40" />
                  </div>
                  {enrollSecret && (
                    <p className="text-center text-[11px] font-mono text-muted-foreground break-all">
                      {enrollSecret}
                    </p>
                  )}
                </div>
              )}
              <form onSubmit={handleMfaVerify} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="code">6-miestny kód</Label>
                  <Input id="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                    value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456" />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || mfaCode.length !== 6}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Overiť
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={ctvzLogo} alt="CTVZ Logo" className="w-full max-w-[280px] h-auto" />
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <h2 className="text-center text-lg font-semibold text-foreground">
              {isAdminMode ? "Prihlásenie trénera" : "Prihláste sa\u00a0"}
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {!isAdminMode && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="rodic@email.sk" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
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
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Prihlásiť sa
              </Button>
              {!isAdminMode && (
                <button type="button" onClick={handleForgotPassword}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Zabudnuté heslo?
                </button>
              )}
            </form>
          </CardContent>
        </Card>

        <button type="button" onClick={() => setIsAdminMode(!isAdminMode)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          {isAdminMode ? "← Späť na prihlásenie rodiča" : "Prihlásenie trénera →"}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Cyklo Team Veľké Zálužie © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default Login;
