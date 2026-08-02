import { useEffect, useRef, useState } from "react";
import { displayName } from "@/lib/displayName";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput24 } from "@/components/TimeInput24";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Check, X, Users, Trophy, CloudRain, UserRound, AlertTriangle,
  Settings, Plus, Trash2, Pencil, Repeat, ExternalLink, Undo2, CalendarClock, ArrowRightLeft,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, isToday, isBefore, addWeeks, nextDay,
} from "date-fns";
import { todayISODate } from "@/lib/datetime";
import { sk } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const COACH_OPTIONS = ["Andrej Miček", "Adam Haviar", "Kristína Madarasová", "Kika Nováková"];
const DAYS_OF_WEEK = [
  { key: "Po", label: "Pondelok", dayIndex: 1 },
  { key: "Ut", label: "Utorok", dayIndex: 2 },
  { key: "St", label: "Streda", dayIndex: 3 },
  { key: "Št", label: "Štvrtok", dayIndex: 4 },
  { key: "Pi", label: "Piatok", dayIndex: 5 },
  { key: "So", label: "Sobota", dayIndex: 6 },
  { key: "Ne", label: "Nedeľa", dayIndex: 0 },
];
const EVENT_TYPES = [
  { value: "race", label: "Preteky" },
  { value: "camp", label: "Kemp" },
  { value: "event", label: "Iná akcia" },
];

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface SessionRow {
  id: string;
  group_id: string;
  group_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string;
  cancelled: boolean;
  cancel_reason: string | null;
  coach_name: string | null;
}
interface Group { id: string; name: string; description: string | null; sort_order: number; }
interface TimeSlot { id: string; group_id: string; start_time: string; end_time: string; location: string; }
interface EventRow {
  id: string; title: string; description: string | null;
  event_date: string; event_date_end: string | null; event_type: string;
  registration_url?: string | null;
  url_label?: string | null;
  allow_rsvp?: boolean | null;
}
interface RsvpRow { id: string; event_id: string; user_id: string; attending: boolean; response?: "yes" | "maybe" | "no"; rider_ids: string[]; }
interface RiderInfo { id: string; name: string; group_id: string | null; }
interface AttendanceRecord { id: string; rider_id: string; session_id: string; present: boolean; }
interface AbsenceRecord { id: string; rider_id: string; session_id: string; }
// Jednorazový presun jazdca do inej skupiny v rámci jedného tréningového dňa
interface MoveRecord { id: string; rider_id: string; session_date: string; session_id: string; }


export default function Trainings() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [unavailability, setUnavailability] = useState<any[]>([]);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  // Jednorazové presuny jazdcov medzi skupinami v konkrétny deň
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [moveRiderId, setMoveRiderId] = useState<string | null>(null);


  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Settings popover dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventsListOpen, setEventsListOpen] = useState(false);
  const [eventsMonthFilter, setEventsMonthFilter] = useState<string>("all");

  // Edit session dialog (open by clicking a session card)
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCoach, setEditCoach] = useState("");
  const [editCancelReason, setEditCancelReason] = useState("");
  const [editDate, setEditDate] = useState("");
  // Zapamätaj si čas výberu dňa — bráni ghost-clicku na kartu tréningu v PWA.
  const lastDaySelectAtRef = useRef<number>(0);

  // New training dialog
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  // Viacnásobný výber skupín — tréning sa dá vytvoriť naraz pre viac skupín
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("");
  // Režim: opakovaný podľa dňa v týždni, alebo konkrétne dátumy
  const [dateMode, setDateMode] = useState<"weekly" | "dates">("weekly");
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [tLocation, setTLocation] = useState("");
  const [tCoach, setTCoach] = useState("");
  // Výber trénera z rozbaľovacieho zoznamu (+ možnosť „Iný…“)
  const [coachChoice, setCoachChoice] = useState("");
  const [repeat, setRepeat] = useState(true);
  const [saving, setSaving] = useState(false);

  // Cancel-day dialog
  const [cancelDayOpen, setCancelDayOpen] = useState(false);
  const [cancelDayDate, setCancelDayDate] = useState("");
  const [cancelDayReason, setCancelDayReason] = useState("");
  const [cancelDaySaving, setCancelDaySaving] = useState(false);

  // Cancel-session reason dialog
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
  const [cancelReasonOther, setCancelReasonOther] = useState("");

  // Event dialog
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventDateEnd, setEventDateEnd] = useState("");
  const [eventType, setEventType] = useState("race");
  const [eventUrl, setEventUrl] = useState("");
  const [eventUrlLabel, setEventUrlLabel] = useState<"registration" | "info" | "other">("registration");
  const [eventUrlLabelOther, setEventUrlLabelOther] = useState("");
  const [eventAllowRsvp, setEventAllowRsvp] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [rsvpNames, setRsvpNames] = useState<Record<string, string>>({});
  const [rsvpRiderNames, setRsvpRiderNames] = useState<Record<string, string>>({});
  const [expandedRsvpEventId, setExpandedRsvpEventId] = useState<string | null>(null);

  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupTimeSlots, setGroupTimeSlots] = useState<{ start_time: string; end_time: string }[]>([]);

  // Unavailability dialog + substitute picker state
  const [unavailDialogOpen, setUnavailDialogOpen] = useState(false);
  const [uCoachName, setUCoachName] = useState("");
  const [uRangeMode, setURangeMode] = useState(false);
  const [uDate, setUDate] = useState("");
  const [uDateEnd, setUDateEnd] = useState("");
  const [uStart, setUStart] = useState("");
  const [uEnd, setUEnd] = useState("");
  const [uReason, setUReason] = useState("");
  const [uSaving, setUSaving] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [subChoice, setSubChoice] = useState<Record<string, string>>({});
  const [subCustom, setSubCustom] = useState<Record<string, string>>({});
  const [openUnavailId, setOpenUnavailId] = useState<string | null>(null);

  const { user } = useAuth();
  const { toast } = useToast();

  const load = async () => {
    const [sessRes, ridersRes, eventsRes, unavailRes, groupsRes, slotsRes] = await Promise.all([
      supabase.from("training_sessions").select("id, group_id, session_date, start_time, end_time, location, cancelled, cancel_reason, coach_name, groups(name)").order("session_date").limit(1500),
      supabase.from("riders").select("id, name, group_id").eq("is_active", true).order("name"),
      supabase.from("events").select("*").order("event_date"),
      supabase.from("coach_unavailability").select("*"),
      supabase.from("groups").select("*").order("sort_order"),
      supabase.from("group_time_slots").select("*"),
    ]);
    const sessData: SessionRow[] = (sessRes.data ?? []).map((s: any) => ({ ...s, group_name: s.groups?.name ?? "?" }));
    setSessions(sessData);
    setRiders((ridersRes.data as RiderInfo[]) ?? []);
    setEvents((eventsRes.data as EventRow[]) ?? []);
    setUnavailability(unavailRes.data ?? []);
    setGroups((groupsRes.data as Group[]) ?? []);
    setTimeSlots((slotsRes.data as TimeSlot[]) ?? []);

    // Presuny jazdcov (jednorazové, pre konkrétny deň)
    const { data: movesData } = await (supabase as any)
      .from("session_rider_moves").select("id, rider_id, session_date, session_id");
    setMoves((movesData as MoveRecord[]) ?? []);


    const ids = sessData.map((s) => s.id);
    if (ids.length > 0) {
      const [attRes, absRes] = await Promise.all([
        supabase.from("attendance").select("id, rider_id, session_id, present").in("session_id", ids),
        supabase.from("absences").select("id, rider_id, session_id").in("session_id", ids),
      ]);
      setAttendance((attRes.data as AttendanceRecord[]) ?? []);
      setAbsences((absRes.data as AbsenceRecord[]) ?? []);
    }

    // `response` pribudol migráciou, vygenerované typy ho ešte nemajú.
    const { data: rsvpData } = await (supabase as any)
      .from("event_rsvps").select("id, event_id, user_id, attending, response, rider_ids");
    const rsvpRows = (rsvpData as RsvpRow[]) ?? [];
    setRsvps(rsvpRows);
    const uids = Array.from(new Set(rsvpRows.map((r) => r.user_id)));
    const map: Record<string, string> = {};
    if (uids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", uids);
      (profs ?? []).forEach((p: any) => { map[p.id] = displayName(p.full_name, p.email); });
    }
    setRsvpNames(map);
    const ridsAll = Array.from(new Set(rsvpRows.flatMap((r) => r.rider_ids ?? [])));
    if (ridsAll.length > 0) {
      const { data: rds } = await supabase.from("riders").select("id, name").in("id", ridsAll);
      const rmap: Record<string, string> = {};
      (rds ?? []).forEach((r: any) => { rmap[r.id] = r.name; });
      setRsvpRiderNames(rmap);
    } else {
      setRsvpRiderNames({});
    }
  };

  useEffect(() => {
    load();
    if (user) {
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name);
      });
    }
  }, [user]);

  const coachUnavailableFor = (coachName: string | null | undefined, date: string, st: string, et: string) => {
    if (!coachName) return null;
    const lc = coachName.trim().toLowerCase();
    return unavailability.find((u: any) => {
      if (u.unavailable_date !== date) return false;
      if (u.coach_name?.trim().toLowerCase() !== lc) return false;
      if (!u.start_time || !u.end_time) return true;
      return !(et <= u.start_time || st >= u.end_time);
    }) ?? null;
  };

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const COACH_OPTIONS_FULL = ["Andrej Miček", "Adam Haviar", "Kristína Madarasová", "Kika Nováková", "Rado Zužčák", "Dušan Belan", "Natália Bírová"];
  const impactedForUnavail = (it: any) => sessions.filter((s) => {
    if (s.session_date !== it.unavailable_date) return false;
    if (s.cancelled) return false;
    if (it.start_time && it.end_time) {
      if (s.end_time <= it.start_time || s.start_time >= it.end_time) return false;
    }
    return true;
  }).map((s) => ({ session: s, stillUnavailable: norm(s.coach_name) === norm(it.coach_name) }));
  const unavailStatus = (it: any): "needs" | "substituted" => {
    const impacted = impactedForUnavail(it);
    if (impacted.length === 0) return it.substitute_name ? "substituted" : "needs";
    const allCovered = impacted.every((i) => !i.stillUnavailable);
    if (allCovered) return "substituted";
    if (it.substitute_name) return "substituted";
    return "needs";
  };
  const dayUnavailStatus = (d: Date): "none" | "needs" | "substituted" => {
    const ds = format(d, "yyyy-MM-dd");
    const list = unavailability.filter((u: any) => u.unavailable_date === ds);
    if (list.length === 0) return "none";
    const statuses = list.map((u) => unavailStatus(u));
    if (statuses.includes("needs")) return "needs";
    return "substituted";
  };

  // ===== Calendar helpers =====
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const sessionDates = new Set(sessions.map((s) => s.session_date));
  const hasSession = (d: Date) => sessionDates.has(format(d, "yyyy-MM-dd"));
  const isFullyCancelled = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    if (!sessionDates.has(ds)) return false;
    const day = sessions.filter((s) => s.session_date === ds);
    return day.length > 0 && day.every((s) => s.cancelled);
  };
  const hasCancelled = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    return sessions.some((s) => s.session_date === ds && s.cancelled);
  };
  const hasEvent = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    return events.some((e) => {
      const end = e.event_date_end || e.event_date;
      return ds >= e.event_date && ds <= end;
    });
  };
  const hasAttendanceData = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    const ids = sessions.filter((s) => s.session_date === ds).map((s) => s.id);
    return ids.some((id) => attendance.some((a) => a.session_id === id));
  };

  const selectedEvents = selectedDate ? events.filter((e) => {
    const ds = format(selectedDate, "yyyy-MM-dd");
    const end = e.event_date_end || e.event_date;
    return ds >= e.event_date && ds <= end;
  }) : [];
  const GROUP_SORT_ORDER = ["A", "B3", "B2", "B1", "C1"];
  const groupSortIndex = (name?: string) => {
    const n = (name ?? "").trim().toUpperCase();
    const i = GROUP_SORT_ORDER.indexOf(n);
    return i === -1 ? GROUP_SORT_ORDER.length : i;
  };
  const selectedSessions = selectedDate
    ? sessions
        .filter((s) => s.session_date === format(selectedDate, "yyyy-MM-dd"))
        .slice()
        .sort((a, b) => {
          const ai = groupSortIndex(a.group_name);
          const bi = groupSortIndex(b.group_name);
          if (ai !== bi) return ai - bi;
          return (a.group_name ?? "").localeCompare(b.group_name ?? "");
        })
    : [];

  const isPast = (s: SessionRow) => isBefore(new Date(`${s.session_date}T${s.end_time}`), new Date());
  const getRidersForGroup = (gid: string) => riders.filter((r) => r.group_id === gid);

  // Jazdci pre konkrétny tréning s ohľadom na jednorazové presuny v daný deň:
  // – odrátaj tých, čo sú presunutí inam, – pridaj tých, čo sú presunutí sem.
  const getRidersForSession = (s: { id: string; group_id: string; session_date: string }) => {
    const dayMoves = moves.filter((m) => m.session_date === s.session_date);
    const base = getRidersForGroup(s.group_id)
      .filter((r) => !dayMoves.some((m) => m.rider_id === r.id && m.session_id !== s.id));
    const movedIn = dayMoves
      .filter((m) => m.session_id === s.id)
      .map((m) => riders.find((r) => r.id === m.rider_id))
      .filter((r): r is RiderInfo => !!r && r.group_id !== s.group_id);
    return [...base, ...movedIn].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Presun jazdca do iného tréningu v ten istý deň
  const moveRiderToSession = async (riderId: string, targetSessionId: string, sessionDate: string) => {
    if (!user) return;
    const existing = moves.find((m) => m.rider_id === riderId && m.session_date === sessionDate);
    const homeGroupId = riders.find((r) => r.id === riderId)?.group_id ?? null;
    const target = sessions.find((s) => s.id === targetSessionId);
    // Presun späť do vlastnej skupiny = zrušenie presunu
    if (target && homeGroupId === target.group_id) {
      if (existing) {
        await (supabase as any).from("session_rider_moves").delete().eq("id", existing.id);
        setMoves((p) => p.filter((m) => m.id !== existing.id));
      }
      setMoveRiderId(null);
      return;
    }
    if (existing) {
      await (supabase as any).from("session_rider_moves").update({ session_id: targetSessionId }).eq("id", existing.id);
      setMoves((p) => p.map((m) => m.id === existing.id ? { ...m, session_id: targetSessionId } : m));
    } else {
      const { data, error } = await (supabase as any).from("session_rider_moves")
        .insert({ rider_id: riderId, session_date: sessionDate, session_id: targetSessionId, created_by: user.id })
        .select().single();
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      if (data) setMoves((p) => [...p, data as MoveRecord]);
    }
    setMoveRiderId(null);
    toast({ title: `Jazdec presunutý do ${target?.group_name ?? "inej skupiny"}` });
  };

  const undoMove = async (riderId: string, sessionDate: string) => {
    const existing = moves.find((m) => m.rider_id === riderId && m.session_date === sessionDate);
    if (!existing) return;
    await (supabase as any).from("session_rider_moves").delete().eq("id", existing.id);
    setMoves((p) => p.filter((m) => m.id !== existing.id));
    toast({ title: "Presun zrušený" });
  };


  // ===== Session edit =====
  const openSession = (s: SessionRow) => {
    // Chráň sa proti ghost-clicku hneď po výbere dňa v kalendári (PWA/mobile).
    if (Date.now() - lastDaySelectAtRef.current < 400) return;
    setEditingSession(s);
    setEditStartTime(s.start_time?.slice(0, 5) ?? "");
    setEditEndTime(s.end_time?.slice(0, 5) ?? "");
    setEditLocation(s.location ?? "");
    setEditCoach(s.coach_name ?? "");
    setEditCancelReason(s.cancel_reason ?? "");
    setEditDate(s.session_date);
  };

  const notifyTrainingChange = async (trainingId: string, changes: { kind: string }[]) => {
    if (changes.length === 0) return;
    try {
      await supabase.functions.invoke("notify-training-change", {
        body: { training_id: trainingId, changes },
      });
    } catch (e) {
      console.warn("notify-training-change failed", e);
    }
  };

  const saveSessionEdit = async () => {
    if (!editingSession) return;
    const oldStart = editingSession.start_time?.slice(0, 5) ?? "";
    const oldEnd = editingSession.end_time?.slice(0, 5) ?? "";
    const oldCoach = (editingSession.coach_name ?? "").trim();
    const oldDate = editingSession.session_date;
    const oldLocation = (editingSession.location ?? "").trim();
    const newCoach = editCoach.trim();
    const newLocation = editLocation.trim();
    const { error } = await supabase.from("training_sessions").update({
      session_date: editDate,
      start_time: editStartTime,
      end_time: editEndTime,
      location: newLocation,
      coach_name: newCoach || null,
    }).eq("id", editingSession.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    const changes: { kind: string }[] = [];
    if (editDate !== oldDate) changes.push({ kind: "date" });
    if (editStartTime !== oldStart || editEndTime !== oldEnd) changes.push({ kind: "time" });
    if (newLocation !== oldLocation) changes.push({ kind: "location" });
    if (newCoach !== oldCoach) changes.push({ kind: "coach" });
    await notifyTrainingChange(editingSession.id, changes);
    toast({ title: "Tréning aktualizovaný" });
    setEditingSession(null);
    load();
  };

  const cancelSession = async (reason?: string) => {
    if (!editingSession) return;
    const finalReason = (reason ?? editCancelReason) || "Tréning zrušený";
    await supabase.from("training_sessions").update({
      cancelled: true,
      cancel_reason: finalReason,
    }).eq("id", editingSession.id);
    await notifyTrainingChange(editingSession.id, [{ kind: "cancelled" }]);
    toast({ title: "Tréning zrušený" });
    setEditingSession(null);
    setCancelReasonOpen(false);
    setCancelReasonOther("");
    load();
  };


  const CANCEL_REASONS = ["Dážď", "Obsadení tréneri", "Preteky"];
  const pickCancelReason = (r: string) => {
    setEditCancelReason(r);
    cancelSession(r);
  };

  const restoreSession = async () => {
    if (!editingSession) return;
    await supabase.from("training_sessions").update({ cancelled: false, cancel_reason: null }).eq("id", editingSession.id);
    // Rodičia dostali správu o zrušení — musia sa dozvedieť aj to, že tréning platí.
    await notifyTrainingChange(editingSession.id, [{ kind: "restored" }]);
    toast({ title: "Tréning obnovený" });
    setEditingSession(null);
    load();
  };

  const deleteSession = async () => {
    if (!editingSession) return;
    if (!window.confirm("Naozaj vymazať tento tréning z kalendára?")) return;
    // Notifikuj ešte pred zmazaním — funkcia si tréning dohľadáva podľa id.
    await notifyTrainingChange(editingSession.id, [{ kind: "deleted" }]);
    await supabase.from("training_sessions").delete().eq("id", editingSession.id);
    toast({ title: "Tréning vymazaný" });
    setEditingSession(null);
    load();
  };

  // ===== Attendance =====
  const setRiderAttendance = async (riderId: string, present: boolean) => {
    if (!editingSession) return;
    const sessionId = editingSession.id;
    const existing = attendance.find((a) => a.rider_id === riderId && a.session_id === sessionId);
    if (present) {
      const abs = absences.find((a) => a.rider_id === riderId && a.session_id === sessionId);
      if (abs) {
        await supabase.from("absences").delete().eq("id", abs.id);
        setAbsences((p) => p.filter((a) => a.id !== abs.id));
      }
      if (existing) {
        await supabase.from("attendance").update({ present: true }).eq("id", existing.id);
        setAttendance((p) => p.map((a) => a.id === existing.id ? { ...a, present: true } : a));
      }
      return;
    }
    if (existing) {
      await supabase.from("attendance").update({ present: false }).eq("id", existing.id);
      setAttendance((p) => p.map((a) => a.id === existing.id ? { ...a, present: false } : a));
    } else {
      const { data } = await supabase.from("attendance").insert({ rider_id: riderId, session_id: sessionId, present: false }).select().single();
      if (data) setAttendance((p) => [...p, data as AttendanceRecord]);
    }
  };

  // ===== Training creation =====
  const openNewTraining = () => {
    setGroupIds([]); setSelectedSlotId(""); setDayOfWeek(""); setStartTime(""); setEndTime("");
    setTLocation(""); setTCoach(""); setCoachChoice(""); setRepeat(true);
    setDateMode("weekly"); setSpecificDates([]); setNewDate("");
    setTrainingDialogOpen(true); setSettingsOpen(false);
  };
  // Časové sloty ukazujeme len keď je vybraná práve jedna skupina
  const singleGroupId = groupIds.length === 1 ? groupIds[0] : "";
  const groupSlotsForSelected = timeSlots.filter((s) => s.group_id === singleGroupId);
  const toggleGroupId = (id: string) => {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSelectedSlotId("");
  };
  const addSpecificDate = () => {
    if (!newDate) return;
    setSpecificDates((prev) => (prev.includes(newDate) ? prev : [...prev, newDate].sort()));
    setNewDate("");
  };
  const onSlotSelected = (id: string) => {
    setSelectedSlotId(id);
    const slot = timeSlots.find((s) => s.id === id);
    if (slot) { setStartTime(slot.start_time.slice(0, 5)); setEndTime(slot.end_time.slice(0, 5)); }
  };
  const getDefaultCoach = (dk: string, gn: string | undefined, st: string): string => {
    if (dk === "Ut") return "Kika Nováková";
    if (dk === "St") return "Adam Haviar";
    if (dk === "Ne") {
      const u = (gn ?? "").trim().toUpperCase();
      const isA = u === "A" || u.startsWith("A "); const isB3 = u === "B3" || u.startsWith("B3 ");
      const isB2 = u === "B2" || u.startsWith("B2 "); const isB1 = u === "B1" || u.startsWith("B1 ");
      const isC1 = u === "C1" || u.startsWith("C1 ");
      const hh = (st || "").slice(0, 5);
      if (hh === "08:00" && (isA || isB3)) return "Andrej Miček";
      if (hh === "09:00" && isB2) return "Andrej Miček";
      if (hh === "10:00" && isB1) return "Kristína Madarasová";
      if (hh === "11:00" && isC1) return "Kristína Madarasová";
    }
    return "";
  };
  const saveTraining = async () => {
    if (groupIds.length === 0 || !startTime || !endTime) {
      toast({ title: "Vyplňte všetky povinné polia", variant: "destructive" }); return;
    }
    if (dateMode === "weekly" && !dayOfWeek) {
      toast({ title: "Vyberte deň tréningu", variant: "destructive" }); return;
    }
    if (dateMode === "dates" && specificDates.length === 0) {
      toast({ title: "Pridajte aspoň jeden dátum", variant: "destructive" }); return;
    }
    setSaving(true);

    // Zoznam dátumov podľa zvoleného režimu
    let dates: string[] = [];
    if (dateMode === "dates") {
      dates = specificDates;
    } else {
      const di = DAYS_OF_WEEK.find((d) => d.key === dayOfWeek)!;
      const today = new Date();
      const first = today.getDay() === di.dayIndex ? today : nextDay(today, di.dayIndex as Day);
      const count = repeat ? 52 : 1;
      for (let i = 0; i < count; i++) dates.push(format(addWeeks(first, i), "yyyy-MM-dd"));
    }

    const rows: any[] = [];
    for (const gid of groupIds) {
      const gn = groups.find((g) => g.id === gid)?.name;
      const finalCoach = tCoach.trim() || getDefaultCoach(dayOfWeek, gn, startTime);
      for (const d of dates) {
        rows.push({
          group_id: gid,
          session_date: d,
          start_time: startTime, end_time: endTime,
          location: tLocation, coach_name: finalCoach || null,
        });
      }
    }
    const { error } = await supabase.from("training_sessions").insert(rows);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Vytvorených ${rows.length} tréningov` }); setTrainingDialogOpen(false); }
    setSaving(false);
    load();
  };

  // ===== Cancel day =====
  const openCancelDay = () => { setCancelDayDate(""); setCancelDayReason(""); setCancelDayOpen(true); setSettingsOpen(false); };
  const handleCancelDay = async () => {
    if (!cancelDayDate) { toast({ title: "Vyberte dátum", variant: "destructive" }); return; }
    setCancelDaySaving(true);
    const { data } = await supabase.from("training_sessions").select("id").eq("session_date", cancelDayDate).eq("cancelled", false);
    const ids = (data ?? []).map((s: any) => s.id);
    if (ids.length === 0) {
      toast({ title: "V tento deň nie sú aktívne tréningy", variant: "destructive" });
      setCancelDaySaving(false); return;
    }
    await supabase.from("training_sessions").update({ cancelled: true, cancel_reason: cancelDayReason || "Tréning zrušený" }).in("id", ids);
    for (const id of ids) await notifyTrainingChange(id, [{ kind: "cancelled" }]);
    toast({ title: `Zrušených ${ids.length} tréningov` });

    setCancelDayOpen(false);
    setCancelDaySaving(false);
    load();
  };

  // ===== Event =====
  const openNewEvent = () => {
    setEditingEvent(null);
    setEventTitle(""); setEventDesc(""); setEventDate(""); setEventDateEnd(""); setEventType("race"); setEventUrl("");
    setEventUrlLabel("registration"); setEventUrlLabelOther(""); setEventAllowRsvp(false);
    setEventDialogOpen(true); setSettingsOpen(false); setEventsListOpen(false);
  };
  const openEditEvent = (e: EventRow) => {
    setEditingEvent(e);
    setEventTitle(e.title); setEventDesc(e.description ?? "");
    setEventDate(e.event_date); setEventDateEnd(e.event_date_end ?? "");
    setEventType(e.event_type); setEventUrl(e.registration_url ?? "");
    setEventAllowRsvp(!!e.allow_rsvp);
    const lbl = e.url_label ?? "";
    if (lbl === "" || lbl.toLowerCase() === "registrácia") { setEventUrlLabel("registration"); setEventUrlLabelOther(""); }
    else if (lbl.toLowerCase() === "informácie") { setEventUrlLabel("info"); setEventUrlLabelOther(""); }
    else { setEventUrlLabel("other"); setEventUrlLabelOther(lbl); }
    setEventDialogOpen(true); setEventsListOpen(false);
  };
  const saveEvent = async () => {
    if (!eventTitle.trim() || !eventDate) { toast({ title: "Vyplňte názov a dátum", variant: "destructive" }); return; }
    setEventSaving(true);
    const labelValue = eventUrl.trim()
      ? (eventUrlLabel === "registration" ? "Registrácia"
        : eventUrlLabel === "info" ? "Informácie"
        : (eventUrlLabelOther.trim() || "Odkaz"))
      : null;
    const payload: any = {
      title: eventTitle, description: eventDesc || null,
      event_date: eventDate, event_date_end: eventDateEnd || null,
      event_type: eventType, registration_url: eventUrl.trim() || null,
      url_label: labelValue,
      allow_rsvp: eventAllowRsvp,
    };
    const { error } = editingEvent
      ? await supabase.from("events").update(payload).eq("id", editingEvent.id)
      : await supabase.from("events").insert(payload);

    if (error) toast({ title: "Chyba", description: error.message, variant: "destructive" });
    else { toast({ title: editingEvent ? "Udalosť aktualizovaná" : "Udalosť vytvorená" }); setEventDialogOpen(false); }
    setEventSaving(false);
    load();
  };
  const removeEvent = async (id: string) => {
    if (!window.confirm("Vymazať túto udalosť?")) return;
    await supabase.from("events").delete().eq("id", id);
    toast({ title: "Udalosť vymazaná" });
    load();
  };

  // ===== Groups =====
  const openNewGroup = () => {
    setEditingGroup(null); setGroupName(""); setGroupDesc("");
    setGroupTimeSlots([{ start_time: "", end_time: "" }]);
    setGroupDialogOpen(true); setSettingsOpen(false);
  };
  const openEditGroup = (g: Group) => {
    setEditingGroup(g); setGroupName(g.name); setGroupDesc(g.description ?? "");
    const slots = timeSlots.filter((s) => s.group_id === g.id);
    setGroupTimeSlots(slots.length > 0
      ? slots.map((s) => ({ start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) }))
      : [{ start_time: "", end_time: "" }]);
    setGroupDialogOpen(true); setSettingsOpen(false);
  };
  const saveGroup = async () => {
    if (!groupName.trim()) return;
    let gId: string;
    if (editingGroup) {
      await supabase.from("groups").update({ name: groupName, description: groupDesc }).eq("id", editingGroup.id);
      gId = editingGroup.id;
      await supabase.from("group_time_slots").delete().eq("group_id", gId);
    } else {
      const { data } = await supabase.from("groups").insert({ name: groupName, description: groupDesc, sort_order: groups.length }).select().single();
      if (!data) return;
      gId = data.id;
    }
    const valid = groupTimeSlots.filter((s) => s.start_time && s.end_time);
    if (valid.length > 0) {
      await supabase.from("group_time_slots").insert(valid.map((s) => ({
        group_id: gId, start_time: s.start_time, end_time: s.end_time, location: '',
      })));
    }
    toast({ title: editingGroup ? "Skupina aktualizovaná" : "Skupina vytvorená" });
    setGroupDialogOpen(false);
    load();
  };

  const dayNames = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  // Editing session: rider list calculations
  const editSessionRiders = editingSession ? getRidersForSession(editingSession) : [];
  // Ostatné tréningy v ten istý deň — ciele presunu
  const sameDaySessions = editingSession
    ? sessions.filter((s) => s.session_date === editingSession.session_date && s.id !== editingSession.id && !s.cancelled)
    : [];

  const editAtt = editingSession ? attendance.filter((a) => a.session_id === editingSession.id) : [];
  const editAbs = editingSession ? absences.filter((a) => a.session_id === editingSession.id) : [];

  const openNewUnavail = () => {
    setUCoachName(profileName || "");
    setURangeMode(false);
    setUDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : todayISODate());
    setUDateEnd(""); setUStart(""); setUEnd(""); setUReason("");
    setUnavailDialogOpen(true); setSettingsOpen(false);
  };
  const saveUnavail = async () => {
    if (!user || !uCoachName.trim() || !uDate) { toast({ title: "Vyplňte meno a dátum", variant: "destructive" }); return; }
    if (uRangeMode && uDateEnd && uDateEnd < uDate) { toast({ title: "Koncový dátum musí byť po začiatku", variant: "destructive" }); return; }
    setUSaving(true);
    const dates: string[] = [];
    if (uRangeMode && uDateEnd) {
      const days = eachDayOfInterval({ start: new Date(uDate), end: new Date(uDateEnd) });
      for (const d of days) dates.push(format(d, "yyyy-MM-dd"));
    } else { dates.push(uDate); }
    const rows = dates.map((d) => ({
      coach_user_id: user.id, coach_name: uCoachName.trim(),
      unavailable_date: d, start_time: uStart || null, end_time: uEnd || null,
      reason: uReason.trim() || null,
    }));
    const { error } = await supabase.from("coach_unavailability").insert(rows as any);
    setUSaving(false);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: dates.length > 1 ? `Pridané (${dates.length} dní)` : "Nedostupnosť pridaná" });
    setUnavailDialogOpen(false);
    load();
  };
  const removeUnavail = async (id: string) => {
    const { error } = await supabase.from("coach_unavailability").delete().eq("id", id);
    if (error) { toast({ title: "Nemôžete vymazať cudzí záznam", variant: "destructive" }); return; }
    toast({ title: "Vymazané" });
    load();
  };
  const selectedUnavail = selectedDate
    ? unavailability.filter((u: any) => u.unavailable_date === format(selectedDate, "yyyy-MM-dd"))
    : [];

  return (
    <div className="space-y-4 p-3 sm:p-4">
      {/* Top action bar */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-10" onClick={() => setEventsListOpen(true)}>
          <Trophy className="h-4 w-4 mr-1" /> Udalosť
        </Button>
        <Button variant="outline" size="sm" className="h-10" onClick={openNewUnavail}>
          <CalendarClock className="h-4 w-4 mr-1" /> Nedostupnosť
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setSettingsOpen(true)} title="Nastavenia" aria-label="Nastavenia">
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold capitalize">
              {format(currentMonth, "LLLL yyyy", { locale: sk })}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center">
            {dayNames.map((d) => (
              <div key={d} className="text-[10px] sm:text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
            {calDays.map((day) => {
              const inMonth = isSameMonth(day, currentMonth);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const hasTraining = hasSession(day);
              const hasEv = hasEvent(day);
              const todayFlag = isToday(day);
              const hasAtt = hasAttendanceData(day);
              const fullyCancelled = isFullyCancelled(day);
              const partial = !fullyCancelled && hasCancelled(day);
              const uStatus = dayUnavailStatus(day);
              const numCls = !selected && inMonth
                ? uStatus === "needs" ? "text-red-600 dark:text-red-400 font-bold"
                : uStatus === "substituted" ? "text-emerald-600 dark:text-emerald-400 font-bold"
                : ""
                : "";
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => { lastDaySelectAtRef.current = Date.now(); setSelectedDate(day); }}
                  className={`relative flex flex-col items-center justify-center rounded-md p-1 sm:p-1.5 text-xs sm:text-sm transition-colors min-h-[34px]
                    ${!inMonth ? "text-muted-foreground/30" : ""}
                    ${selected && fullyCancelled ? "bg-destructive text-destructive-foreground" : ""}
                    ${selected && !fullyCancelled ? "bg-primary text-primary-foreground" : ""}
                    ${!selected && fullyCancelled && inMonth ? "bg-destructive/30 text-destructive font-semibold" : ""}
                    ${!selected && !fullyCancelled && partial && inMonth ? "bg-destructive/15 text-destructive" : ""}
                    ${!selected && !fullyCancelled && !partial && todayFlag ? "bg-accent text-accent-foreground" : ""}
                    ${!selected && !fullyCancelled && !partial && !todayFlag && inMonth ? "hover:bg-muted" : ""}
                  `}
                >
                  <span className={numCls}>{day.getDate()}</span>
                  <span className="absolute bottom-0.5 flex gap-0.5">
                    {hasTraining && (
                      <span className={`h-1 w-1 rounded-full ${selected ? "bg-primary-foreground" : partial ? "bg-destructive" : hasAtt ? "bg-green-500" : "bg-primary"}`} />
                    )}
                    {hasEv && (
                      <span className={`h-1 w-1 rounded-full ${selected ? "bg-primary-foreground" : "bg-orange-500"}`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day */}
      {selectedDate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold capitalize text-muted-foreground">
              {format(selectedDate, "EEEE d. MMMM", { locale: sk })}
            </h3>
            {selectedSessions.some((s) => !s.cancelled) && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setCancelDayDate(format(selectedDate, "yyyy-MM-dd"));
                  setCancelDayReason("");
                  setCancelDayOpen(true);
                }}
              >
                Zrušiť tréningy
              </Button>
            )}
          </div>


          {selectedEvents.map((ev) => {
            const evRsvps = rsvps.filter((r) => r.event_id === ev.id && r.attending);
            const isExpanded = expandedRsvpEventId === ev.id;
            return (
            <Card key={ev.id} className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Trophy className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words">{ev.title}</p>
                    {ev.description && <p className="text-[11px] text-muted-foreground break-words">{ev.description}</p>}
                    {ev.registration_url && (
                      <a
                        href={ev.registration_url}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline break-all"
                      >
                        <ExternalLink className="h-3 w-3" /> {ev.url_label || "Registrácia"}
                      </a>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEditEvent(ev)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {ev.allow_rsvp && (
                  <div className="border-t border-orange-200 dark:border-orange-800/60 pt-2">
                    <button
                      type="button"
                      onClick={() => setExpandedRsvpEventId(isExpanded ? null : ev.id)}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-orange-800 dark:text-orange-300"
                    >
                      <Users className="h-3 w-3" /> Zúčastní sa: {evRsvps.reduce((n, r) => n + Math.max(1, (r.rider_ids ?? []).length), 0)} ({evRsvps.length} rodičov)
                      {evRsvps.length > 0 && <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />}
                    </button>
                    {isExpanded && evRsvps.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {evRsvps.map((r) => {
                          const kids = (r.rider_ids ?? []).map((rid) => rsvpRiderNames[rid]).filter(Boolean).join(", ");
                          return (
                            <li key={r.id} className="text-[11px] text-foreground pl-4">
                              • {rsvpNames[r.user_id] || "Rodič"}{kids ? ` – ${kids}` : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}

          {selectedUnavail.map((it: any) => {
            const status = unavailStatus(it);
            const impacted = impactedForUnavail(it);
            const isOpen = openUnavailId === it.id;
            const borderCls = status === "needs" ? "border-amber-300 dark:border-amber-800" : "border-emerald-300 dark:border-emerald-800";
            const statusLabel = status === "needs"
              ? { text: "Potrebná náhrada", cls: "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40" }
              : { text: "Nahradené", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40" };
            return (
              <Card key={it.id} className={borderCls}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-2 p-3">
                    <button type="button" onClick={() => setOpenUnavailId(isOpen ? null : it.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{it.coach_name} · nedostupný</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {it.start_time && it.end_time ? `${it.start_time.slice(0,5)} – ${it.end_time.slice(0,5)}` : "Celý deň"}
                          {it.reason && ` · ${it.reason}`}
                          {it.substitute_name && ` · náhrada: ${it.substitute_name}`}
                        </p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${statusLabel.cls}`}>{statusLabel.text}</span>
                    </button>
                    {user?.id === it.coach_user_id && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeUnavail(it.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="border-t border-border p-3 space-y-3 bg-muted/30">
                      {impacted.length === 0 ? (() => {
                        const key = `unavail:${it.id}`;
                        const choice = subChoice[key] ?? "";
                        const custom = subCustom[key] ?? "";
                        const finalName = choice === "__other__" ? custom.trim() : choice;
                        return (
                          <div className="space-y-2">
                            <p className="text-[12px] text-muted-foreground">Pre tento deň zatiaľ nie sú vygenerované tréningy. Môžeš vopred poznačiť náhradníka.</p>
                            {it.substitute_name && <p className="text-[12px] text-emerald-700 dark:text-emerald-300">Aktuálna náhrada: {it.substitute_name}</p>}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Select value={choice} onValueChange={(v) => setSubChoice((p) => ({ ...p, [key]: v }))}>
                                <SelectTrigger className="flex-1 h-8"><SelectValue placeholder={it.substitute_name ? "Zmeniť náhradníka" : "Náhradný tréner"} /></SelectTrigger>
                                <SelectContent>
                                  {COACH_OPTIONS_FULL.filter((c) => norm(c) !== norm(it.coach_name)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                  <SelectItem value="__other__">Iný…</SelectItem>
                                </SelectContent>
                              </Select>
                              {choice === "__other__" && <Input placeholder="Meno náhradníka" value={custom} onChange={(e) => setSubCustom((p) => ({ ...p, [key]: e.target.value }))} className="flex-1 h-8" />}
                              <Button size="sm" disabled={!finalName} onClick={async () => {
                                const { error } = await supabase.from("coach_unavailability").update({ substitute_name: finalName }).eq("id", it.id);
                                if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); }
                                else { toast({ title: `Náhradník uložený: ${finalName}` }); setSubChoice((p) => ({ ...p, [key]: "" })); setSubCustom((p) => ({ ...p, [key]: "" })); load(); }
                              }}>Uložiť</Button>
                            </div>
                          </div>
                        );
                      })() : impacted.map(({ session: s, stillUnavailable }) => {
                        const choice = subChoice[s.id] ?? "";
                        const custom = subCustom[s.id] ?? "";
                        const finalName = choice === "__other__" ? custom.trim() : choice;
                        return (
                          <div key={s.id} className="space-y-2">
                            <div className="text-[12px]">
                              <p className="font-medium">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {s.group_name}{s.location ? ` · ${s.location}` : ""}</p>
                              {stillUnavailable
                                ? <p className="text-amber-700 dark:text-amber-300">Pôvodný tréner: {s.coach_name}</p>
                                : <p className="text-emerald-700 dark:text-emerald-300">Aktuálny tréner: {s.coach_name}</p>}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Select value={choice} onValueChange={(v) => setSubChoice((p) => ({ ...p, [s.id]: v }))}>
                                <SelectTrigger className="flex-1 h-8"><SelectValue placeholder={stillUnavailable ? "Náhradný tréner" : "Zmeniť náhradníka"} /></SelectTrigger>
                                <SelectContent>
                                  {COACH_OPTIONS_FULL.filter((c) => norm(c) !== norm(it.coach_name)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                  <SelectItem value="__other__">Iný…</SelectItem>
                                </SelectContent>
                              </Select>
                              {choice === "__other__" && <Input placeholder="Meno náhradníka" value={custom} onChange={(e) => setSubCustom((p) => ({ ...p, [s.id]: e.target.value }))} className="flex-1 h-8" />}
                              <Button size="sm" disabled={!finalName} onClick={async () => {
                                const { error } = await supabase.from("training_sessions").update({ coach_name: finalName }).eq("id", s.id);
                                if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
                                await supabase.from("coach_unavailability").update({ substitute_name: finalName }).eq("id", it.id);
                                await notifyTrainingChange(s.id, [{ kind: "coach" }]);
                                toast({ title: `Tréner nahradený: ${finalName}` });
                                setSubChoice((p) => ({ ...p, [s.id]: "" })); setSubCustom((p) => ({ ...p, [s.id]: "" }));
                                load();

                              }}>Uložiť</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {selectedSessions.length === 0 && selectedEvents.length === 0 && selectedUnavail.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žiadne tréningy v tento deň.</p>
          ) : selectedSessions.map((s) => {
            const u = coachUnavailableFor(s.coach_name, s.session_date, s.start_time, s.end_time);
            const totalRiders = getRidersForSession(s).length;
            const groupAtt = attendance.filter((a) => a.session_id === s.id);
            const groupAbs = absences.filter((a) => a.session_id === s.id);
            const absentSet = new Set<string>();
            groupAtt.filter((a) => !a.present).forEach((a) => absentSet.add(a.rider_id));
            groupAbs.forEach((a) => absentSet.add(a.rider_id));
            const past = isPast(s);
            const hasAttData = groupAtt.length > 0;
            const presentCount = past && hasAttData
              ? groupAtt.filter((a) => a.present).length
              : Math.max(0, totalRiders - absentSet.size);
            return (
              <Card
                key={s.id}
                className={`transition-colors cursor-pointer ${s.cancelled
                  ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800"
                  : "hover:bg-muted/50"}`}
                onClick={() => openSession(s)}
              >
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {s.cancelled ? <CloudRain className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" /> : <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold truncate ${s.cancelled ? "text-orange-700" : ""}`}>{s.group_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className={s.cancelled ? "line-through" : ""}>
                          {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                          {s.location ? ` • ${s.location}` : ""}
                        </span>
                        {s.cancelled && s.cancel_reason && (
                          <span className="ml-1 text-orange-600 font-medium">{s.cancel_reason}</span>
                        )}
                      </p>
                      {s.coach_name && (
                        <p className={`text-[11px] flex items-center gap-1 truncate ${s.cancelled ? "text-muted-foreground line-through" : u ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                          {u ? <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> : <UserRound className="h-2.5 w-2.5 shrink-0" />}
                          <span className="truncate">{s.coach_name}{u ? ` · nedostupný` : ""}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {!s.cancelled && (
                    <div className="flex items-center gap-1 text-xs shrink-0">
                      <span className="flex items-center gap-0.5 text-green-600"><Check className="h-3 w-3" />{presentCount}</span>
                      <span className="flex items-center gap-0.5 text-destructive"><X className="h-3 w-3" />{absentSet.size}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== Settings dialog (groups + add training + cancel day) ===== */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nastavenia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <Button onClick={openNewTraining}><Plus className="mr-1 h-4 w-4" /> Pridať tréning</Button>
              <Button variant="outline" onClick={() => { setSettingsOpen(false); setEventsListOpen(true); }}>
                <Trophy className="mr-1 h-4 w-4" /> Udalosť
              </Button>
              <Button variant="outline" onClick={openNewUnavail}>
                <CalendarClock className="mr-1 h-4 w-4" /> Nedostupnosť
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Skupiny ({groups.length})</p>
                <Button variant="ghost" size="sm" onClick={openNewGroup}>
                  <Plus className="mr-1 h-3 w-3" /> Nová
                </Button>
              </div>
              <div className="space-y-1.5">
                {groups.map((g) => {
                  const slots = timeSlots.filter((s) => s.group_id === g.id);
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{g.name}</p>
                        {slots.length > 0 && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {slots.map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`).join(" · ")}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEditGroup(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Events list dialog ===== */}
      <Dialog open={eventsListOpen} onOpenChange={setEventsListOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Blížiace sa udalosti</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Button className="w-full" onClick={openNewEvent}><Plus className="mr-1 h-4 w-4" /> Pridať udalosť</Button>
            {(() => {
              const monthsMap = new Map<string, string>();
              events.forEach((e) => {
                const d = new Date(e.event_date);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const label = format(d, "LLLL yyyy");
                if (!monthsMap.has(key)) monthsMap.set(key, label.charAt(0).toUpperCase() + label.slice(1));
              });
              const months = Array.from(monthsMap.entries()).sort(([a], [b]) => a.localeCompare(b));
              const filtered = eventsMonthFilter === "all"
                ? events
                : events.filter((e) => {
                    const d = new Date(e.event_date);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === eventsMonthFilter;
                  });
              return (
                <>
                  <Select value={eventsMonthFilter} onValueChange={setEventsMonthFilter}>
                    <SelectTrigger><SelectValue placeholder="Filter podľa mesiaca" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Všetky mesiace</SelectItem>
                      {months.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">Žiadne udalosti.</p>
                  ) : filtered.map((ev) => (
                    <div key={ev.id} className="rounded-md border border-border p-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">
                              {EVENT_TYPES.find((t) => t.value === ev.event_type)?.label ?? ev.event_type}
                            </Badge>
                            <p className="text-sm font-semibold break-words">{ev.title}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(ev.event_date), "d.M.yyyy")}
                            {ev.event_date_end && ` – ${format(new Date(ev.event_date_end), "d.M.yyyy")}`}
                          </p>
                          {ev.description && <p className="text-[11px] text-muted-foreground break-words">{ev.description}</p>}
                          {ev.registration_url && (
                            <a href={ev.registration_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary underline break-all">
                              <ExternalLink className="h-3 w-3" /> {ev.url_label || ev.registration_url}
                            </a>
                          )}
                          {ev.allow_rsvp && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-orange-800 dark:text-orange-300 font-medium">
                              <Users className="h-3 w-3" />
                              {(() => {
                                const forEv = rsvps.filter((r) => r.event_id === ev.id);
                                const n = (resp: string) => forEv.filter((r) => (r.response ?? (r.attending ? "yes" : "no")) === resp).length;
                                return <>Zúčastní sa: {n("yes")} · možno: {n("maybe")} · nie: {n("no")}</>;
                              })()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEvent(ev)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeEvent(ev.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>

        </DialogContent>
      </Dialog>

      {/* ===== Session edit dialog ===== */}
      <Dialog open={!!editingSession} onOpenChange={(o) => !o && setEditingSession(null)}>
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="break-words" tabIndex={-1}>
              {editingSession?.group_name} {editingSession && `– ${format(new Date(editingSession.session_date), "d.M.yyyy")}`}
            </DialogTitle>
          </DialogHeader>
          {editingSession && (
            <div className="space-y-4">
              {/* Dátum tréningu — možno presunúť na iný deň. */}
              <div className="space-y-1.5">
                <Label className="text-xs">Dátum</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} autoFocus={false} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Od</Label>
                  <TimeInput24  value={editStartTime} onChange={(v) => setEditStartTime(v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Do</Label>
                  <TimeInput24  value={editEndTime} onChange={(v) => setEditEndTime(v)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Miesto</Label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="napr. Pumptrack Veľké Zálužie" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tréner</Label>
                <Select value={editCoach || "__none__"} onValueChange={(v) => setEditCoach(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {COACH_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="flex-1 min-w-[120px]" onClick={saveSessionEdit}>Uložiť</Button>
                {editingSession.cancelled ? (
                  <Button variant="outline" className="flex-1 min-w-[120px]" onClick={restoreSession}>
                    <Undo2 className="mr-1 h-4 w-4" /> Obnoviť
                  </Button>
                ) : (
                  <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => setCancelReasonOpen(true)}>
                    <CloudRain className="mr-1 h-4 w-4" /> Zrušiť
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="text-destructive" onClick={deleteSession}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {!editingSession.cancelled && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Dôvod zrušenia (voliteľné)</Label>
                  <Textarea rows={2} value={editCancelReason} onChange={(e) => setEditCancelReason(e.target.value)} placeholder="napr. počasie, kemp..." />
                </div>
              )}

              {/* Attendance */}
              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-semibold">Dochádzka jazdcov</p>
                {editSessionRiders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">Žiadni jazdci v tejto skupine.</p>
                ) : editSessionRiders.map((rider) => {
                  const ra = editAtt.find((a) => a.rider_id === rider.id);
                  const rb = editAbs.find((a) => a.rider_id === rider.id);
                  const absent = ra?.present === false || (!ra && !!rb);
                  const present = !absent;
                  // Je jazdec dnes presunutý sem z inej skupiny?
                  const isGuest = rider.group_id !== editingSession.group_id;
                  const homeGroupName = groups.find((g) => g.id === rider.group_id)?.name;
                  return (
                    <div key={rider.id} className="space-y-1">
                      <div
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm
                          ${present ? "bg-green-500/10" : ""} ${absent ? "bg-destructive/10" : ""}`}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {rider.name}
                          {isGuest && (
                            <Badge variant="secondary" className="ml-1.5 text-[10px]">z {homeGroupName ?? "?"}</Badge>
                          )}
                        </span>
                        {!editingSession.cancelled && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant={present ? "default" : "outline"}
                              className={`h-7 px-2 text-xs ${present ? "bg-green-600 hover:bg-green-700" : ""}`}
                              onClick={() => setRiderAttendance(rider.id, true)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant={absent ? "destructive" : "outline"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setRiderAttendance(rider.id, false)}>
                              <X className="h-3 w-3" />
                            </Button>
                            {/* Presun do inej skupiny — len pre tento deň */}
                            {(sameDaySessions.length > 0 || isGuest) && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                onClick={() => setMoveRiderId(moveRiderId === rider.id ? null : rider.id)}>
                                <ArrowRightLeft className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {moveRiderId === rider.id && !editingSession.cancelled && (
                        <div className="rounded-md border border-border p-2 space-y-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            Presunúť len na tento deň ({format(new Date(editingSession.session_date), "d.M.yyyy")}):
                          </p>
                          <Select value="" onValueChange={(v) => moveRiderToSession(rider.id, v, editingSession.session_date)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte skupinu / tréning" /></SelectTrigger>
                            <SelectContent>
                              {sameDaySessions.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.group_name} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isGuest && (
                            <Button variant="ghost" size="sm" className="h-7 w-full text-xs"
                              onClick={() => { undoMove(rider.id, editingSession.session_date); setMoveRiderId(null); }}>
                              <Undo2 className="mr-1 h-3 w-3" /> Vrátiť do {homeGroupName ?? "vlastnej skupiny"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== New training dialog ===== */}
      <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nový tréning</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Skupiny — viacnásobný výber */}
            <div className="space-y-1.5">
              <Label className="text-xs">Skupiny</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border p-2">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={groupIds.includes(g.id)} onCheckedChange={() => toggleGroupId(g.id)} />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
            {singleGroupId && groupSlotsForSelected.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Čas tréningu</Label>
                <Select value={selectedSlotId} onValueChange={onSlotSelected}>
                  <SelectTrigger><SelectValue placeholder="Vyberte čas" /></SelectTrigger>
                  <SelectContent>
                    {groupSlotsForSelected.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Režim termínu: opakovane podľa dňa v týždni / konkrétne dátumy */}
            <div className="grid grid-cols-2 gap-1.5">
              <Button type="button" variant={dateMode === "weekly" ? "default" : "outline"} size="sm"
                onClick={() => setDateMode("weekly")}>Deň v týždni</Button>
              <Button type="button" variant={dateMode === "dates" ? "default" : "outline"} size="sm"
                onClick={() => setDateMode("dates")}>Konkrétne dni</Button>
            </div>

            {dateMode === "weekly" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Deň tréningu</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger><SelectValue placeholder="Vyberte deň" /></SelectTrigger>
                  <SelectContent>{DAYS_OF_WEEK.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Dátumy tréningov</Label>
                <div className="flex gap-1.5">
                  <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  <Button type="button" variant="outline" size="icon" onClick={addSpecificDate}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {specificDates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {specificDates.map((d) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        {format(new Date(d + "T00:00:00"), "d.M.yyyy")}
                        <button type="button" onClick={() => setSpecificDates((p) => p.filter((x) => x !== d))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {groupSlotsForSelected.length === 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label className="text-xs">Od</Label>
                  <TimeInput24  value={startTime} onChange={(v) => setStartTime(v)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Do</Label>
                  <TimeInput24  value={endTime} onChange={(v) => setEndTime(v)} /></div>
              </div>
            )}
            <div className="space-y-1.5"><Label className="text-xs">Miesto</Label>
              <Input value={tLocation} onChange={(e) => setTLocation(e.target.value)} /></div>

            {/* Tréner — výber zo zoznamu, prípadne „Iný…“ s ručným zadaním */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tréner</Label>
              <Select
                value={coachChoice}
                onValueChange={(v) => {
                  setCoachChoice(v);
                  if (v === "__auto") setTCoach("");
                  else if (v === "__other") setTCoach("");
                  else setTCoach(v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Vyberte trénera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Automaticky podľa rozpisu</SelectItem>
                  {COACH_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__other">Iný…</SelectItem>
                </SelectContent>
              </Select>
              {coachChoice === "__other" && (
                <Input value={tCoach} onChange={(e) => setTCoach(e.target.value)} placeholder="Meno trénera" />
              )}
            </div>

            {dateMode === "weekly" && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <Checkbox id="repeat-w" checked={repeat} onCheckedChange={(c) => setRepeat(c === true)} />
                <label htmlFor="repeat-w" className="flex items-center gap-2 text-sm cursor-pointer">
                  <Repeat className="h-4 w-4 text-muted-foreground" /> Opakovať každý týždeň
                </label>
              </div>
            )}
            <Button className="w-full" onClick={saveTraining} disabled={saving}>
              {saving ? "Vytváram..." : "Vytvoriť tréning"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Cancel-day dialog ===== */}
      <Dialog open={cancelDayOpen} onOpenChange={setCancelDayOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Zrušiť tréningový deň</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Všetky tréningy v zvolený deň budú označené ako zrušené.</p>
            <div className="space-y-1.5"><Label className="text-xs">Dátum</Label>
              <Input type="date" value={cancelDayDate} min={todayISODate()} onChange={(e) => setCancelDayDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Dôvod (voliteľný)</Label>
              <Textarea rows={2} value={cancelDayReason} onChange={(e) => setCancelDayReason(e.target.value)} placeholder="počasie, sviatok, kemp..." /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelDayOpen(false)}>Zrušiť</Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancelDay} disabled={cancelDaySaving}>
                {cancelDaySaving ? "..." : "Zrušiť tréningy"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Event dialog ===== */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEvent ? "Upraviť udalosť" : "Nová udalosť"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Typ</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Názov</Label>
              <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="napr. Majstrovstvá SR" /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">{eventDateEnd ? "Dátum od" : "Dátum"}</Label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={!!eventDateEnd}
                    onCheckedChange={(c) => {
                      if (c === true) setEventDateEnd(eventDate || "");
                      else setEventDateEnd("");
                    }}
                  />
                  Rozsah dátumov
                </label>
              </div>
              <div className={eventDateEnd ? "grid grid-cols-2 gap-2" : ""}>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                {eventDateEnd !== "" && (
                  <Input type="date" value={eventDateEnd} onChange={(e) => setEventDateEnd(e.target.value)} />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Odkaz (URL)</Label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "registration", l: "Registrácia" },
                  { v: "info", l: "Informácie" },
                  { v: "other", l: "Iné" },
                ] as const).map((o) => (
                  <Button
                    key={o.v}
                    type="button"
                    size="sm"
                    variant={eventUrlLabel === o.v ? "default" : "outline"}
                    onClick={() => setEventUrlLabel(o.v)}
                    className="h-8 text-xs"
                  >
                    {o.l}
                  </Button>
                ))}
              </div>
              {eventUrlLabel === "other" && (
                <Input
                  value={eventUrlLabelOther}
                  onChange={(e) => setEventUrlLabelOther(e.target.value)}
                  placeholder="Vlastný popis odkazu"
                />
              )}
              <Input type="url" inputMode="url" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Popis (voliteľný)</Label>
              <Textarea rows={2} value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} /></div>
            <label className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer">
              <Checkbox
                checked={eventAllowRsvp}
                onCheckedChange={(c) => setEventAllowRsvp(c === true)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium">Prihlasovanie sa na udalosť </p>
                <p className="text-[11px] text-muted-foreground">V konte rodičov sa zobrazí tlačidlo na potvrdenie účasti. </p>
              </div>
            </label>
            <Button className="w-full" onClick={saveEvent} disabled={eventSaving}>
              {eventSaving ? "Ukladám..." : editingEvent ? "Uložiť zmeny" : "Vytvoriť udalosť"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Group dialog ===== */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingGroup ? "Upraviť skupinu" : "Nová skupina"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Názov</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="napr. C1" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Popis</Label>
              <Input value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} placeholder="Voliteľný popis" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Časy tréningov</Label>
              <div className="space-y-2">
                {groupTimeSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                      <TimeInput24  value={slot.start_time} onChange={(v) => setGroupTimeSlots((p) => p.map((s, i) => i === idx ? { ...s, start_time: v } : s))} />
                      <TimeInput24  value={slot.end_time} onChange={(v) => setGroupTimeSlots((p) => p.map((s, i) => i === idx ? { ...s, end_time: v } : s))} />
                    </div>
                    {groupTimeSlots.length > 1 && (
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setGroupTimeSlots((p) => p.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setGroupTimeSlots((p) => [...p, { start_time: "", end_time: "" }])}>
                  <Plus className="mr-1 h-3 w-3" /> Pridať čas
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={saveGroup}>{editingGroup ? "Uložiť" : "Vytvoriť"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Cancel-session reason dialog ===== */}
      <Dialog open={cancelReasonOpen} onOpenChange={(o) => { setCancelReasonOpen(o); if (!o) setCancelReasonOther(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dôvod zrušenia</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {CANCEL_REASONS.map((r) => (
              <Button key={r} variant="outline" className="w-full justify-start" onClick={() => pickCancelReason(r)}>
                {r === "Dážď" && <CloudRain className="mr-2 h-4 w-4" />}
                {r}
              </Button>
            ))}
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs">Iné</Label>
              <Textarea rows={2} value={cancelReasonOther} onChange={(e) => setCancelReasonOther(e.target.value)} placeholder="Vlastný dôvod..." />
              <Button
                className="w-full"
                disabled={!cancelReasonOther.trim()}
                onClick={() => pickCancelReason(cancelReasonOther.trim())}
              >
                Zrušiť tréning
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Nedostupnosť dialog ===== */}
      <Dialog open={unavailDialogOpen} onOpenChange={setUnavailDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nedostupnosť</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Meno trénera</Label>
              <Select value={uCoachName} onValueChange={setUCoachName}>
                <SelectTrigger><SelectValue placeholder="Vyber trénera" /></SelectTrigger>
                <SelectContent>
                  {COACH_OPTIONS_FULL.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Rozsah dní</Label>
              <button
                type="button"
                onClick={() => { setURangeMode(!uRangeMode); if (uRangeMode) setUDateEnd(""); }}
                className={`text-xs px-2 py-1 rounded border ${uRangeMode ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
              >
                {uRangeMode ? "Zapnuté" : "Vypnuté"}
              </button>
            </div>
            {uRangeMode ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label className="text-xs">Od</Label>
                  <Input type="date" value={uDate} onChange={(e) => setUDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Do</Label>
                  <Input type="date" value={uDateEnd} min={uDate} onChange={(e) => setUDateEnd(e.target.value)} /></div>
              </div>
            ) : (
              <div className="space-y-1.5"><Label className="text-xs">Dátum</Label>
                <Input type="date" value={uDate} onChange={(e) => setUDate(e.target.value)} /></div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label className="text-xs">Od (voliteľné)</Label>
                <TimeInput24  value={uStart} onChange={(v) => setUStart(v)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Do (voliteľné)</Label>
                <TimeInput24  value={uEnd} onChange={(v) => setUEnd(v)} /></div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              {uRangeMode
                ? "Časy sa aplikujú na každý deň v rozsahu. Bez času = celodenné."
                : "Ak nezadáte čas, bude vyhodnotené ako celodenná nedostupnosť."}
            </p>
            <div className="space-y-1.5"><Label className="text-xs">Dôvod (voliteľné)</Label>
              <Textarea rows={2} value={uReason} onChange={(e) => setUReason(e.target.value)} placeholder="napr. dovolenka, choroba..." /></div>
            <Button className="w-full" onClick={saveUnavail} disabled={uSaving}>
              {uSaving ? "Ukladám..." : "Uložiť"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
