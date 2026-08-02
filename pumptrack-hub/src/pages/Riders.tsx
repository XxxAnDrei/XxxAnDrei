import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, User, Users, ChevronDown, ChevronUp, Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import LapTimesDialog from "@/components/LapTimesDialog";
import BulkLapTimesDialog from "@/components/BulkLapTimesDialog";
import { displayName } from "@/lib/displayName";


const DAYS = [
  { key: "Po", label: "Pondelok", dayIndex: 1 },
  { key: "Ut", label: "Utorok", dayIndex: 2 },
  { key: "St", label: "Streda", dayIndex: 3 },
  { key: "Št", label: "Štvrtok", dayIndex: 4 },
  { key: "Pi", label: "Piatok", dayIndex: 5 },
  { key: "So", label: "Sobota", dayIndex: 6 },
  { key: "Ne", label: "Nedeľa", dayIndex: 0 },
];

interface TrainingOption {
  group_id: string;
  group_name: string;
  start_time: string;
  end_time: string;
  location: string;
}

interface Rider {
  id: string;
  name: string;
  parent_user_id: string;
  group_id: string | null;
  training_days: string[];
  training_time: string | null;
  training_schedule: Record<string, string> | null;
  is_active?: boolean;
  groups?: { name: string } | null;
}

interface Group { id: string; name: string; }

interface TrainingSession {
  group_id: string;
  start_time: string;
  end_time: string;
  location: string;
  session_date: string;
  groups?: { name: string } | null;
}

export default function Riders() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allSessions, setAllSessions] = useState<TrainingSession[]>([]);
  const [parentEmails, setParentEmails] = useState<{parent_user_id: string; email: string; riders: {id: string; name: string}[]}[]>([]);
  const [editingParentId, setEditingParentId] = useState<string | null>(null);
  const [editParentEmail, setEditParentEmail] = useState("");
  const [savingParentEmail, setSavingParentEmail] = useState(false);
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rider | null>(null);
  const [name, setName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  // Druhý rodič (voliteľný — len pri novom jazdcovi cez toto pole)
  const [addSecondParent, setAddSecondParent] = useState(false);
  const [secondEmail, setSecondEmail] = useState("");
  const [secondFirstName, setSecondFirstName] = useState("");
  const [secondLastName, setSecondLastName] = useState("");
  // Rodičia napojení na existujúceho jazdca (edit mode)
  const [linkedParents, setLinkedParents] = useState<{ parent_user_id: string; is_primary: boolean; full_name: string | null; email: string | null }[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkFirst, setLinkFirst] = useState("");
  const [linkLast, setLinkLast] = useState("");
  const [linking, setLinking] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [selectedDays, setSelectedDays] = useState<Record<string, string>>({}); // day -> "groupId|startTime|endTime"
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGroupId, setFilterGroupId] = useState<string>("all");
  const [confirmDeleteRider, setConfirmDeleteRider] = useState<Rider | null>(null);
  const [lapTimesRider, setLapTimesRider] = useState<Rider | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Prepínač aktivity jazdca (v edit dialógu)
  const [isActive, setIsActive] = useState(true);
  // Editácia rodiča (meno + email)
  const [editNameParent, setEditNameParent] = useState<
    { parent_user_id: string; full_name: string; email: string; origFullName: string; origEmail: string } | null
  >(null);
  const [savingName, setSavingName] = useState(false);

  const { toast } = useToast();

  const resetSecondParent = () => {
    setAddSecondParent(false);
    setSecondEmail(""); setSecondFirstName(""); setSecondLastName("");
  };

  const loadLinkedParents = async (riderId: string) => {
    const { data: links } = await supabase
      .from("rider_parents")
      .select("parent_user_id, is_primary")
      .eq("rider_id", riderId);
    const ids = (links ?? []).map((l: any) => l.parent_user_id);
    if (ids.length === 0) { setLinkedParents([]); return; }
    const { data: profs } = await supabase
      .from("profiles").select("id, full_name, email").in("id", ids);
    setLinkedParents(
      (links ?? []).map((l: any) => {
        const p = profs?.find((x: any) => x.id === l.parent_user_id);
        return {
          parent_user_id: l.parent_user_id,
          is_primary: !!l.is_primary,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
        };
      }).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    );
  };

  const load = async () => {
    const today = new Date().toISOString().split("T")[0];
    const [ridersRes, groupsRes, sessionsRes] = await Promise.all([
      supabase.from("riders").select("*, groups(name)").order("name"),
      supabase.from("groups").select("*").order("sort_order"),
      supabase.from("training_sessions").select("group_id, start_time, end_time, location, session_date, groups(name)").gte("session_date", today).order("session_date").limit(500),
    ]);
    const ridersData = (ridersRes.data as any[]) ?? [];
    setRiders(ridersData);
    setGroups((groupsRes.data as Group[]) ?? []);
    setAllSessions((sessionsRes.data as any[]) ?? []);

    // Load parent emails grouped by parent_user_id
    const parentIds = [...new Set(ridersData.map(r => r.parent_user_id))];
    if (parentIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", parentIds);
      const grouped = new Map<string, {email: string; riders: {id: string; name: string}[]}>();
      for (const r of ridersData) {
        const profile = profiles?.find(p => p.id === r.parent_user_id);
        const email = profile?.email ?? "—";
        if (!grouped.has(r.parent_user_id)) {
          grouped.set(r.parent_user_id, { email, riders: [] });
        }
        grouped.get(r.parent_user_id)!.riders.push({ id: r.id, name: r.name });
      }
      setParentEmails(
        Array.from(grouped.entries())
          .map(([parent_user_id, v]) => ({ parent_user_id, ...v }))
          .sort((a, b) => a.email.localeCompare(b.email))
      );
    } else {
      setParentEmails([]);
    }
  };

  useEffect(() => { load(); }, []);

  // Get unique training options per day of week, filtered by selected group
  const getTrainingOptionsForDay = (dayKey: string): TrainingOption[] => {
    const dayInfo = DAYS.find(d => d.key === dayKey);
    if (!dayInfo) return [];

    const seen = new Set<string>();
    const options: TrainingOption[] = [];

    for (const s of allSessions) {
      // Filter by selected group
      if (groupId && s.group_id !== groupId) continue;
      const date = new Date(s.session_date);
      if (date.getDay() !== dayInfo.dayIndex) continue;
      const key = `${s.group_id}_${s.start_time}_${s.end_time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        group_id: s.group_id,
        group_name: (s.groups as any)?.name ?? "?",
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location,
      });
    }
    return options;
  };

  const toggleDay = (dayKey: string) => {
    setSelectedDays(prev => {
      const copy = { ...prev };
      if (copy[dayKey] !== undefined) {
        delete copy[dayKey];
      } else {
        // Set to first available option
        const options = getTrainingOptionsForDay(dayKey);
        copy[dayKey] = options.length > 0 ? `${options[0].group_id}|${options[0].start_time}|${options[0].end_time}` : "";
      }
      return copy;
    });
  };

  const openNew = () => {
    setEditing(null); setName(""); setParentEmail("");
    setParentFirstName(""); setParentLastName("");
    resetSecondParent();
    setLinkedParents([]);
    setIsActive(true);
    setGroupId(""); setSelectedDays({}); setDialogOpen(true);
  };

  const openEdit = async (r: Rider) => {
    setEditing(r);
    setName(r.name);
    setGroupId(r.group_id ?? "");
    setIsActive(r.is_active !== false);
    resetSecondParent();

    // Načítaj profil hlavného rodiča (email + meno) a všetkých napojených rodičov
    const [{ data: profile }] = await Promise.all([
      supabase.from("profiles").select("email, full_name").eq("id", r.parent_user_id).maybeSingle(),
      loadLinkedParents(r.id),
    ]);
    setParentEmail(profile?.email ?? "");
    const parts = (profile?.full_name ?? "").trim().split(/\s+/);
    setParentFirstName(parts[0] ?? "");
    setParentLastName(parts.slice(1).join(" "));

    // Build selected days from training_schedule
    const days: Record<string, string> = {};
    if (r.training_schedule && Object.keys(r.training_schedule).length > 0) {
      for (const [dayKey, time] of Object.entries(r.training_schedule)) {
        const options = getTrainingOptionsForDay(dayKey);
        const match = options.find(o => o.start_time.slice(0, 5) === (time as string).slice(0, 5));
        days[dayKey] = match ? `${match.group_id}|${match.start_time}|${match.end_time}` : "";
      }
    } else if (r.training_days?.length > 0) {
      for (const d of r.training_days) {
        const options = getTrainingOptionsForDay(d);
        days[d] = options.length > 0 ? `${options[0].group_id}|${options[0].start_time}|${options[0].end_time}` : "";
      }
    }
    setSelectedDays(days);
    setDialogOpen(true);
  };

  // Prilinkovanie druhého rodiča k existujúcemu jazdcovi
  const linkParent = async () => {
    if (!editing || !linkEmail.trim()) return;
    setLinking(true);
    const res = await supabase.functions.invoke("register-rider", {
      body: {
        action: "link_parent",
        rider_id: editing.id,
        email: linkEmail.trim(),
        first_name: linkFirst.trim() || null,
        last_name: linkLast.trim() || null,
      },
    });
    if (res.error) {
      toast({ title: "Nepodarilo sa prilinkovať", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: "Rodič prilinkovaný" });
      setLinkEmail(""); setLinkFirst(""); setLinkLast(""); setLinkOpen(false);
      await loadLinkedParents(editing.id);
    }
    setLinking(false);
  };

  const unlinkParent = async (parent_user_id: string) => {
    if (!editing) return;
    const res = await supabase.functions.invoke("register-rider", {
      body: { action: "unlink_parent", rider_id: editing.id, parent_user_id },
    });
    if (res.error) {
      toast({ title: "Chyba", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: "Rodič odlinkovaný" });
      await loadLinkedParents(editing.id);
    }
  };

  // Uloženie mena + emailu rodiča cez register-rider
  const saveParentName = async () => {
    if (!editNameParent || !editing) return;
    const name = editNameParent.full_name.trim();
    const email = editNameParent.email.trim();
    if (!name) {
      toast({ title: "Meno nemôže byť prázdne", variant: "destructive" });
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Neplatný email", variant: "destructive" });
      return;
    }
    setSavingName(true);
    // Ulož len to, čo sa zmenilo
    if (name !== editNameParent.origFullName) {
      const res = await supabase.functions.invoke("register-rider", {
        body: { action: "update_parent_name", parent_user_id: editNameParent.parent_user_id, full_name: name },
      });
      if (res.error) {
        setSavingName(false);
        toast({ title: "Chyba pri uložení mena", description: res.error.message, variant: "destructive" });
        return;
      }
    }
    if (email && email !== editNameParent.origEmail) {
      const res = await supabase.functions.invoke("register-rider", {
        body: {
          action: "update_email",
          rider_id: editing.id,
          parent_user_id: editNameParent.parent_user_id,
          email,
        },
      });
      if (res.error) {
        setSavingName(false);
        toast({ title: "Chyba pri uložení emailu", description: res.error.message, variant: "destructive" });
        return;
      }
    }
    setSavingName(false);
    toast({ title: "Uložené" });
    setEditNameParent(null);
    await loadLinkedParents(editing.id);
  };




  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const trainingDays = DAYS.filter(d => selectedDays[d.key] !== undefined).map(d => d.key);
    const schedule: Record<string, string> = {};
    for (const day of trainingDays) {
      const val = selectedDays[day];
      if (val) {
        const parts = val.split("|");
        schedule[day] = parts[1]?.slice(0, 5) ?? "16:00";
      }
    }

    if (editing) {
      // Update rider (vrátane prepínača aktivity)
      const { error } = await supabase.from("riders").update({
        name,
        group_id: groupId || null,
        training_days: trainingDays,
        training_time: trainingDays.length > 0 ? (schedule[trainingDays[0]] + ":00") : null,
        training_schedule: schedule as any,
        is_active: isActive,
      }).eq("id", editing.id);

      if (error) {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      } else {
        // Email a meno rodiča sa upravujú cez sekciu „Napojení rodičia" (ceruzka),
        // preto ich tu už neaktualizujeme.
        toast({ title: "Jazdec aktualizovaný" });
      }
    } else {
      if (!parentEmail.trim()) {
        toast({ title: "Zadajte email rodiča", variant: "destructive" });
        setSaving(false);
        return;
      }
      const res = await supabase.functions.invoke("register-rider", {
        body: {
          email: parentEmail,
          rider_name: name,
          group_id: groupId || null,
          training_days: trainingDays,
          training_time: trainingDays.length > 0 ? (schedule[trainingDays[0]] + ":00") : null,
          training_schedule: schedule,
          parent_first_name: parentFirstName.trim() || null,
          parent_last_name: parentLastName.trim() || null,
          ...(addSecondParent && secondEmail.trim() ? {
            second_email: secondEmail.trim(),
            second_first_name: secondFirstName.trim() || null,
            second_last_name: secondLastName.trim() || null,
          } : {}),
        },
      });
      if (res.error) {
        toast({ title: "Chyba", description: res.error.message, variant: "destructive" });
      } else {
        const data: any = res.data;
        // Rodič sa bez emailu k dočasnému heslu nedostane, takže adminovi
        // povieme, či odišiel — a komu prípadne neodišiel.
        const noEmail: string[] = [];
        const withEmail: string[] = [];
        if (data?.is_new_user) (data?.credentials_email_sent ? withEmail : noEmail).push("rodičovi");
        if (data?.secondary?.is_new_user) {
          (data?.secondary?.credentials_email_sent ? withEmail : noEmail).push("druhému rodičovi");
        }
        const parts: string[] = [];
        if (withEmail.length) parts.push(`Prihlasovacie údaje sme poslali ${withEmail.join(" aj ")}.`);
        if (noEmail.length) {
          parts.push(`Email s údajmi sa nepodarilo odoslať ${noEmail.join(" ani ")} — nech použije „Zabudnuté heslo?“.`);
        }
        toast({
          title: "Jazdec vytvorený",
          description: parts.join(" ") || undefined,
          variant: noEmail.length ? "destructive" : undefined,
        });
      }
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("riders").delete().eq("id", id);
    toast({ title: "Jazdec vymazaný" });
    setConfirmDeleteRider(null);
    setDialogOpen(false);
    load();
  };

  const formatSchedule = (r: Rider) => {
    const sched = r.training_schedule;
    if (sched && typeof sched === "object" && Object.keys(sched).length > 0) {
      return Object.entries(sched)
        .sort((a, b) => DAYS.findIndex(d => d.key === a[0]) - DAYS.findIndex(d => d.key === b[0]))
        .map(([day, time]) => `${day} ${(time as string).slice(0, 5)}`)
        .join(", ");
    }
    if (r.training_days?.length > 0) {
      return r.training_days.join(", ") + (r.training_time ? ` ${r.training_time.slice(0, 5)}` : "");
    }
    return null;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}><Timer className="mr-1 h-4 w-4" /> Zapísať časy</Button>
        <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nový jazdec</Button>
      </div>


      {parentEmails.length > 0 && (
        <Collapsible open={emailsOpen} onOpenChange={setEmailsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Rodičovské emaily ({parentEmails.length})
              </span>
              {emailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="p-3 space-y-1">
                {parentEmails.map(({ parent_user_id, email, riders }) => {
                  const isEditing = editingParentId === parent_user_id;
                  const firstRider = riders[0];
                  const saveEmail = async () => {
                    if (!editParentEmail.trim() || !firstRider) return;
                    setSavingParentEmail(true);
                    const res = await supabase.functions.invoke("register-rider", {
                      body: {
                        action: "update_email",
                        rider_id: firstRider.id,
                        parent_user_id,
                        email: editParentEmail.trim(),
                      },
                    });
                    if (res.error) {
                      toast({ title: "Chyba", description: res.error.message, variant: "destructive" });
                    } else {
                      toast({ title: "Email aktualizovaný" });
                      setEditingParentId(null);
                      load();
                    }
                    setSavingParentEmail(false);
                  };
                  return (
                    <div key={parent_user_id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                      {isEditing ? (
                        <>
                          <Input
                            type="email"
                            value={editParentEmail}
                            onChange={(e) => setEditParentEmail(e.target.value)}
                            className="h-8 text-sm flex-1"
                            placeholder="rodic@email.sk"
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-8" onClick={saveEmail} disabled={savingParentEmail}>
                              {savingParentEmail ? "..." : "Uložiť"}
                            </Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingParentId(null)}>
                              Zrušiť
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{email}</p>
                            <p className="text-xs text-muted-foreground truncate">{riders.map(r => r.name).join(", ")}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => { setEditingParentId(parent_user_id); setEditParentEmail(email === "—" ? "" : email); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Hľadať jazdca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={filterGroupId} onValueChange={setFilterGroupId}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Skupina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všetky skupiny</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(() => {
        const filtered = riders.filter((r) => {
          const matchesSearch = !search.trim() || r.name.toLowerCase().includes(search.toLowerCase().trim());
          const matchesGroup = filterGroupId === "all" || r.group_id === filterGroupId;
          return matchesSearch && matchesGroup;
        });
        if (riders.length === 0) {
          return <p className="text-sm text-muted-foreground">Zatiaľ nemáte žiadnych jazdcov.</p>;
        }
        if (filtered.length === 0) {
          return <p className="text-sm text-muted-foreground">Žiadny jazdec nezodpovedá filtru.</p>;
        }
        return (
          <div className="space-y-2">
            {filtered.map((r) => {
              const inactive = r.is_active === false;
              return (
              <Card key={r.id} className={inactive ? "opacity-60" : ""}>
                <CardContent className="flex items-center justify-between gap-2 p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold flex items-center gap-2">
                        <span className="truncate">{r.name}</span>
                        {inactive && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Deaktivovaný</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(r.groups as any)?.name ?? "Bez skupiny"}
                        {formatSchedule(r) && ` • ${formatSchedule(r)}`}
                      </p>
                    </div>
                  </div>
                  {/* V riadku len 2 ikony — stopky + ceruzka. Aktivácia a mazanie sú v edit dialógu. */}
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" title="Časy na pumptracku" onClick={() => setLapTimesRider(r)}>
                      <Timer className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Upraviť" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        );
      })()}


      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Upraviť jazdca" : "Nový jazdec"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Meno jazdca</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno a priezvisko" />
            </div>

            {/* Hlavný rodič — polia len pri NOVOM jazdcovi (potrebné na vytvorenie konta).
                V edit móde sa rodičia spravujú výhradne v sekcii „Napojení rodičia" nižšie. */}
            {!editing && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-sm font-semibold">Rodič</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Meno</Label>
                    <Input value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} placeholder="Meno" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priezvisko</Label>
                    <Input value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} placeholder="Priezvisko" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email rodiča</Label>
                  <Input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="rodic@email.sk" type="email" />
                  <p className="text-xs text-muted-foreground">Rodičovi sa automaticky vytvorí konto a na tento email dostane prihlasovacie údaje.</p>
                </div>
              </div>
            )}

            {/* Druhý rodič — len pri novom jazdcovi */}
            {!editing && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="add-second" checked={addSecondParent} onCheckedChange={(v) => setAddSecondParent(!!v)} />
                  <label htmlFor="add-second" className="text-sm font-semibold cursor-pointer">Pridať druhého rodiča</label>
                </div>
                {addSecondParent && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Meno</Label>
                        <Input value={secondFirstName} onChange={(e) => setSecondFirstName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Priezvisko</Label>
                        <Input value={secondLastName} onChange={(e) => setSecondLastName(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email druhého rodiča</Label>
                      <Input value={secondEmail} onChange={(e) => setSecondEmail(e.target.value)} placeholder="druhy@email.sk" type="email" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Druhý rodič dostane email s dočasným heslom a pri prvom prihlásení si ho zmení.
                      Faktúry a automatické platby ostávajú viazané na hlavného rodiča.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Napojení rodičia — v edit móde */}
            {editing && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Napojení rodičia ({linkedParents.length})</p>
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Pridať rodiča
                  </Button>
                </div>
                <div className="space-y-1">
                  {linkedParents.map((p) => (
                    <div key={p.parent_user_id} className="flex items-center justify-between rounded border border-border/50 p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {displayName(p.full_name, p.email) || "Rodič"}
                          {p.is_primary && (
                            <span
                              className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                              title="Na tohto rodiča sa viaže fakturácia a automatické platby"
                            >
                              Hlavný
                            </span>
                          )}
                        </p>
                        {p.email && p.full_name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Upraviť rodiča"
                          onClick={() => {
                            const cleanName = displayName(p.full_name, p.email) || "";
                            setEditNameParent({
                              parent_user_id: p.parent_user_id,
                              full_name: cleanName,
                              email: p.email ?? "",
                              origFullName: cleanName,
                              origEmail: p.email ?? "",
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!p.is_primary && (
                          <Button variant="ghost" size="icon" title="Odlinkovať" onClick={() => unlinkParent(p.parent_user_id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Skupina</Label>
              <Select value={groupId} onValueChange={(val) => { setGroupId(val); setSelectedDays({}); }}>
                <SelectTrigger><SelectValue placeholder="Vyberte skupinu" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Tréningové dni</Label>
              <div className="space-y-2">
                {DAYS.map((day) => {
                  const isSelected = selectedDays[day.key] !== undefined;
                  const options = getTrainingOptionsForDay(day.key);
                  return (
                    <div key={day.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`day-${day.key}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleDay(day.key)}
                        />
                        <label htmlFor={`day-${day.key}`} className="text-sm font-medium cursor-pointer">
                          {day.label}
                        </label>
                      </div>
                      {isSelected && (
                        <div className="ml-6">
                          {options.length > 0 ? (
                            <Select
                              value={selectedDays[day.key] || ""}
                              onValueChange={(val) => setSelectedDays(prev => ({ ...prev, [day.key]: val }))}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Vyberte tréning" />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((opt, i) => (
                                  <SelectItem key={i} value={`${opt.group_id}|${opt.start_time}|${opt.end_time}`}>
                                    {opt.start_time.slice(0, 5)} – {opt.end_time.slice(0, 5)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-xs text-muted-foreground">Žiadne tréningy v tento deň</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Prepínač aktivity — len v edit móde */}
            {editing && (
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="active-switch" className="cursor-pointer">Aktívny jazdec</Label>
                  <Switch id="active-switch" checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Neaktívny jazdec sa nezobrazuje v dochádzke a negeneruje sa mu mesačné členské.
                </p>
              </div>
            )}

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "Ukladám..." : editing ? "Uložiť" : "Vytvoriť"}
            </Button>

            {/* Deštruktívne vymazanie — len v edit móde */}
            {editing && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmDeleteRider(editing)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Vymazať jazdca
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Potvrdenie vymazania jazdca */}
      <Dialog open={!!confirmDeleteRider} onOpenChange={(o) => !o && setConfirmDeleteRider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vymazať jazdca?</DialogTitle>
            <DialogDescription>
              {confirmDeleteRider?.name
                ? `Naozaj chcete natrvalo odstrániť jazdca „${confirmDeleteRider.name}"? Túto akciu nie je možné vrátiť.`
                : "Túto akciu nie je možné vrátiť."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmDeleteRider(null)}>Zrušiť</Button>
            <Button variant="destructive" onClick={() => confirmDeleteRider && remove(confirmDeleteRider.id)}>
              <Trash2 className="mr-1 h-4 w-4" /> Vymazať natrvalo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialóg úpravy rodiča — meno + email */}
      <Dialog open={!!editNameParent} onOpenChange={(o) => !o && setEditNameParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upraviť rodiča</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Meno a priezvisko</Label>
              <Input
                value={editNameParent?.full_name ?? ""}
                onChange={(e) => setEditNameParent((s) => s ? { ...s, full_name: e.target.value } : s)}
                maxLength={100}
                placeholder="Meno Priezvisko"
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={editNameParent?.email ?? ""}
                onChange={(e) => setEditNameParent((s) => s ? { ...s, email: e.target.value } : s)}
                placeholder="rodic@email.sk"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNameParent(null)}>Zrušiť</Button>
            <Button onClick={saveParentName} disabled={savingName}>
              {savingName ? "Ukladám..." : "Uložiť"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LapTimesDialog
        rider={lapTimesRider ? { id: lapTimesRider.id, name: lapTimesRider.name, group_id: lapTimesRider.group_id } : null}
        mode="admin"
        onOpenChange={(o) => !o && setLapTimesRider(null)}
      />
      <BulkLapTimesDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pridať ďalšieho rodiča</DialogTitle>
            <DialogDescription>
              Ak rodič ešte nemá konto, vytvorí sa a na jeho email pošleme prihlasovacie údaje.
              Faktúry a automatické strhávanie ostávajú viazané na hlavného rodiča.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Meno</Label>
                <Input value={linkFirst} onChange={(e) => setLinkFirst(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priezvisko</Label>
                <Input value={linkLast} onChange={(e) => setLinkLast(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="rodic@email.sk" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Zrušiť</Button>
            <Button onClick={linkParent} disabled={linking || !linkEmail.trim()}>
              {linking ? "Ukladám..." : "Prilinkovať"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
