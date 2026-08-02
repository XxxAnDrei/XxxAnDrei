import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMyRiders } from "@/hooks/useMyRiders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, Lock, Users, Loader2, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { enablePushNotifications, disablePushNotifications, isPushSupported } from "@/lib/push-client";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Profil: meno + email v jednej karte, samostatné Uložiť tlačidlá ──
  const [fullName, setFullName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameLoaded, setNameLoaded] = useState(false);

  const [email, setEmail] = useState(user?.email ?? "");
  const [initialEmail, setInitialEmail] = useState(user?.email ?? "");
  const [emailBusy, setEmailBusy] = useState(false);

  // ── Push notifikácie (jeden iOS Switch) ──
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // ── Zmena hesla ──
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // ── Priradené deti (cez zjednotený zdroj my_rider_ids) ──
  const ridersQ = useMyRiders();
  const [children, setChildren] = useState<{ id: string; name: string; group?: string }[]>([]);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setInitialEmail(user?.email ?? "");
  }, [user?.email]);

  // Aktuálny stav push subscriptionu
  useEffect(() => {
    if (!isPushSupported()) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setPushOn(!!sub && Notification.permission === "granted");
    });
  }, []);

  // Načítaj mená detí + skupinu
  useEffect(() => {
    (async () => {
      const ids = (ridersQ.data ?? []).map((r) => r.id);
      if (!ids.length) { setChildren([]); return; }
      const { data } = await supabase
        .from("riders").select("id, name, groups(name)").in("id", ids);
      setChildren((data ?? []).map((r: any) => ({ id: r.id, name: r.name, group: r.groups?.name })));
    })();
  }, [ridersQ.data]);

  // Načítanie mena z profilu
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const n = (data as any)?.full_name ?? "";
        setFullName(n);
        setInitialName(n);
        setNameLoaded(true);
      });
  }, [user?.id]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setNameBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);
    setNameBusy(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      setInitialName(fullName.trim());
      toast({ title: "Meno uložené" });
      qc.invalidateQueries({ queryKey: ["chat-profiles"] });
      qc.invalidateQueries({ queryKey: ["parents"] });
    }
  };

  const togglePush = async (v: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!v) { await disablePushNotifications(); setPushOn(false); toast({ title: "Notifikácie vypnuté" }); }
      else { await enablePushNotifications(); setPushOn(true); toast({ title: "Notifikácie zapnuté" }); }
    } catch (e) { toast({ title: "Chyba", description: (e as Error).message, variant: "destructive" }); }
    finally { setPushBusy(false); }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email === initialEmail) return;
    setEmailBusy(true);
    const { data, error } = await supabase.functions.invoke("parent-account", {
      body: { action: "update_email", email },
    });
    setEmailBusy(false);
    if (error || data?.error) {
      toast({ title: "Chyba", description: data?.error ?? error?.message, variant: "destructive" });
    } else {
      setInitialEmail(email);
      toast({ title: "Email zmenený", description: "Odteraz sa prihlasuj novým emailom." });
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 10) { toast({ title: "Slabé heslo", description: "Min. 10 znakov.", variant: "destructive" }); return; }
    if (newPw !== newPw2) { toast({ title: "Heslá sa nezhodujú", variant: "destructive" }); return; }
    setPwBusy(true);
    const { data, error } = await supabase.functions.invoke("parent-account", {
      body: { action: "update_password", current_password: currentPw, new_password: newPw },
    });
    setPwBusy(false);
    if (error || data?.error) {
      const msg = data?.error === "current_password_wrong" ? "Nesprávne aktuálne heslo." : (data?.error ?? error?.message);
      toast({ title: "Chyba", description: msg, variant: "destructive" });
    } else {
      setCurrentPw(""); setNewPw(""); setNewPw2("");
      toast({ title: "Heslo zmenené" });
    }
  };

  const nameChanged = fullName.trim() !== initialName.trim();
  const emailChanged = email.trim().toLowerCase() !== (initialEmail ?? "").toLowerCase();
  const pwReady = newPw.length >= 10 && newPw === newPw2 && currentPw.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold font-display">Nastavenia</h1>

      {/* 1. Môj profil — meno + email v jednej karte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4" /> Môj profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={saveName} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Meno a priezvisko</Label>
              <Input
                id="settings-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Napr. Ján Novák"
                disabled={!nameLoaded}
              />
              <p className="text-xs text-muted-foreground">Toto meno sa zobrazuje v chate a v komunikácii s klubom.</p>
            </div>
            <Button type="submit" disabled={nameBusy || !nameLoaded || !nameChanged}>
              {nameBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Uložiť meno
            </Button>
          </form>

          <div className="border-t pt-4">
            <form onSubmit={saveEmail} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="settings-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Prihlasovací email
                </Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Tento email zároveň slúži na prihlásenie do aplikácie.</p>
              </div>
              <Button type="submit" disabled={emailBusy || !emailChanged}>
                {emailBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Uložiť email
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* 2. Notifikácie — jeden iOS Switch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Notifikácie
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPushSupported() ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">Push notifikácie na tomto zariadení</div>
                <p className="text-xs text-muted-foreground">
                  Prijímaj upozornenia o tréningoch, platbách a nových správach v chate.
                </p>
              </div>
              <Switch
                checked={pushOn}
                disabled={pushBusy}
                onCheckedChange={togglePush}
                aria-label="Push notifikácie"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tento prehliadač nepodporuje push notifikácie.</p>
          )}
        </CardContent>
      </Card>

      {/* 3. Priradené deti */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Priradené deti
          </CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground">K vášmu emailu nie sú priradené žiadne deti.</p>
          ) : (
            <ul className="divide-y divide-border">
              {children.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.group && <span className="text-xs text-muted-foreground">{c.group}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4. Zmena hesla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Zmena hesla
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cur">Aktuálne heslo</Label>
              <Input id="cur" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np">Nové heslo</Label>
              <Input id="np" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={10} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Min. 10 znakov. Uniknuté heslá sú blokované.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="np2">Zopakovať nové heslo</Label>
              <Input id="np2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required minLength={10} autoComplete="new-password" />
            </div>
            {/* Tlačidlo nechávame klikateľné — zablokované sa len tvárilo, že
                appka nereaguje. Dôvod povie hláška z savePassword(). */}
            {!pwReady && (newPw.length > 0 || newPw2.length > 0 || currentPw.length > 0) && (
              <p className="text-xs text-destructive">
                {currentPw.length === 0
                  ? "Zadajte aktuálne heslo."
                  : newPw.length < 10
                    ? "Nové heslo musí mať aspoň 10 znakov."
                    : "Heslá sa nezhodujú."}
              </p>
            )}
            <Button type="submit" disabled={pwBusy}>
              {pwBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zmeniť heslo
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
