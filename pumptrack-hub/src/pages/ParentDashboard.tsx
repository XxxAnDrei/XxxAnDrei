import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Clock, X, Check, ChevronLeft, ChevronRight, CloudRain, Trophy, UserRound, ExternalLink, Users } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import { todayISODate } from "@/lib/datetime";
import { sk } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// Jeden riadok z RPC training_day_overview — jazdec v konkrétnom tréningu daného dňa.
interface DayOverviewRow {
  session_id: string;
  group_id: string;
  group_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  cancelled: boolean;
  coach_name: string | null;
  rider_id: string | null;
  rider_name: string | null;
  is_absent: boolean;
  is_guest: boolean;
}

interface RosterRider {
  id: string;
  name: string;
  absent: boolean;
  guest: boolean;
}

interface DaySession {
  id: string;
  group_id: string;
  group_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  cancelled: boolean;
  coach_name: string | null;
  riders: RosterRider[];
}

// Súpiska rozdelená na prihlásených / odhlásených.
function RosterSplit({ riders, highlightId }: { riders: RosterRider[]; highlightId?: string }) {
  const present = riders.filter((r) => !r.absent);
  const absent = riders.filter((r) => r.absent);

  const chip = (r: RosterRider, strike: boolean) => (
    <span
      key={r.id}
      title={r.guest ? "Presunutý z inej skupiny" : undefined}
      className={`rounded-full px-2 py-0.5 text-[11px] ${strike ? "line-through" : ""} ${
        r.id === highlightId
          ? strike
            ? "bg-destructive/20 text-destructive font-medium"
            : "bg-primary text-primary-foreground font-medium"
          : "bg-muted text-muted-foreground"
      } ${r.guest ? "ring-1 ring-primary/40" : ""}`}
    >
      {r.name}{r.guest ? " (presun)" : ""}
    </span>
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold text-primary mb-1 flex items-center gap-1">
          <Check className="h-3 w-3" /> Prihlásení ({present.length})
        </p>
        <div className="flex flex-wrap gap-1">
          {present.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Nikto.</span>
          ) : present.map((p) => chip(p, false))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1">
          <X className="h-3 w-3" /> Odhlásení ({absent.length})
        </p>
        <div className="flex flex-wrap gap-1">
          {absent.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Nikto.</span>
          ) : absent.map((p) => chip(p, true))}
        </div>
      </div>
    </div>
  );
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [riders, setRiders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [myRsvps, setMyRsvps] = useState<Record<string, { id: string; rider_ids: string[] }>>({});
  const [rsvpDialogEventId, setRsvpDialogEventId] = useState<string | null>(null);
  const [rsvpSelectedRiders, setRsvpSelectedRiders] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  // Jednorazové presuny do inej skupiny (len na daný deň)
  const [moves, setMoves] = useState<any[]>([]);
  // Súpisky všetkých skupín pre vybraný deň (vrátane presunov)
  const [dayRows, setDayRows] = useState<DayOverviewRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());


  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Zjednotený zdroj detí — hlavný aj druhý rodič cez my_rider_ids RPC.
      const { data: ids } = await supabase.rpc("my_rider_ids", { _user_id: user.id });
      const idList = (ids ?? []).map((r: any) => (typeof r === "string" ? r : r.my_rider_ids));
      const [riderRes, eventsRes] = await Promise.all([
        idList.length
          ? supabase.from("riders").select("*, groups(name)").in("id", idList)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from("events").select("*").order("event_date"),
      ]);
      const riderData = riderRes.data ?? [];
      setRiders(riderData);
      setEvents(eventsRes.data ?? []);

      const { data: rsvpData } = await supabase
        .from("event_rsvps")
        .select("id, event_id, attending, rider_ids")
        .eq("user_id", user.id);
      const rmap: Record<string, { id: string; rider_ids: string[] }> = {};
      (rsvpData ?? []).forEach((r: any) => { if (r.attending) rmap[r.event_id] = { id: r.id, rider_ids: r.rider_ids ?? [] }; });
      setMyRsvps(rmap);


      if (riderData && riderData.length > 0) {
        const groupIds = [...new Set(riderData.map((r: any) => r.group_id).filter(Boolean))] as string[];
        const riderIds = riderData.map((r: any) => r.id);
        const today = todayISODate();
        const emptyRes = Promise.resolve({ data: [] as any[] } as any);

        const [futureRes, pastRes, movesRes] = await Promise.all([
          groupIds.length
            ? supabase.from("training_sessions").select("*, groups(name)")
                .in("group_id", groupIds).gte("session_date", today)
                .order("session_date").limit(200)
            : emptyRes,
          groupIds.length
            ? supabase.from("training_sessions").select("*, groups(name)")
                .in("group_id", groupIds).lt("session_date", today)
                .order("session_date", { ascending: false }).limit(200)
            : emptyRes,
          (supabase as any).from("session_rider_moves")
            .select("id, rider_id, session_date, session_id").in("rider_id", riderIds),
        ]);

        const pastSess = (pastRes.data ?? []) as any[];
        const moveRows = (movesRes.data ?? []) as any[];
        setMoves(moveRows);

        // Tréningy, do ktorých je dieťa presunuté, patria inej skupine — dotiahni ich zvlášť.
        let allSess: any[] = [...((futureRes.data ?? []) as any[]), ...pastSess];
        const known = new Set(allSess.map((s: any) => s.id));
        const missing = [...new Set(moveRows.map((m) => m.session_id).filter((id) => !known.has(id)))];
        if (missing.length > 0) {
          const { data: extra } = await supabase
            .from("training_sessions").select("*, groups(name)").in("id", missing);
          allSess = [...allSess, ...((extra as any[]) ?? [])];
        }
        setSessions(allSess);

        // Neprítomnosti načítaj až nad kompletným zoznamom, aby sedeli aj pri presune.
        const allIds = allSess.map((s: any) => s.id);
        if (allIds.length > 0) {
          const { data: absData } = await supabase
            .from("absences").select("*").in("rider_id", riderIds).in("session_id", allIds);
          setAbsences(absData ?? []);
        }

        // Attendance history (past sessions)
        const pastIds = pastSess.map((s: any) => s.id);
        if (pastIds.length > 0) {
          const { data: attData } = await supabase
            .from("attendance").select("*").in("rider_id", riderIds).in("session_id", pastIds);
          setHistory(attData ?? []);
        }
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Súpisky všetkých skupín pre vybraný deň — rešpektujú jednorazové presuny.
  useEffect(() => {
    if (!user || !selectedDate) { setDayRows([]); return; }
    let stale = false;
    const loadDay = async () => {
      const { data } = await (supabase as any).rpc("training_day_overview", {
        _date: format(selectedDate, "yyyy-MM-dd"),
      });
      if (!stale) setDayRows((data as DayOverviewRow[]) ?? []);
    };
    loadDay();
    return () => { stale = true; };
  }, [user, selectedDate]);

  const daySessions = useMemo<DaySession[]>(() => {
    const map = new Map<string, DaySession>();
    for (const row of dayRows) {
      let entry = map.get(row.session_id);
      if (!entry) {
        entry = {
          id: row.session_id,
          group_id: row.group_id,
          group_name: row.group_name,
          start_time: row.start_time,
          end_time: row.end_time,
          location: row.location,
          cancelled: row.cancelled,
          coach_name: row.coach_name,
          riders: [],
        };
        map.set(row.session_id, entry);
      }
      if (row.rider_id && row.rider_name) {
        entry.riders.push({
          id: row.rider_id,
          name: row.rider_name,
          absent: row.is_absent,
          guest: row.is_guest,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.group_name.localeCompare(b.group_name));
  }, [dayRows]);

  const isAbsent = (riderId: string, sessionId: string) =>
    absences.some((a) => a.rider_id === riderId && a.session_id === sessionId);

  const toggleAbsence = async (riderId: string, sessionId: string) => {
    if (!user) return;
    const existing = absences.find((a) => a.rider_id === riderId && a.session_id === sessionId);

    if (existing) {
      const ok = window.confirm("Naozaj zrušiť nahlásenú neprítomnosť? Jazdec bude označený ako prítomný.");
      if (!ok) return;
      await supabase.from("absences").delete().eq("id", existing.id);
      setAbsences((prev) => prev.filter((a) => a.id !== existing.id));
      setDayRows((prev) => prev.map((r) =>
        r.rider_id === riderId && r.session_id === sessionId ? { ...r, is_absent: false } : r));
      toast({ title: "Neprítomnosť zrušená" });
    } else {
      const { data, error } = await supabase
        .from("absences")
        .insert({ rider_id: riderId, session_id: sessionId, reported_by: user.id })
        .select()
        .single();
      if (!error && data) {
        setAbsences((prev) => [...prev, data]);
        setDayRows((prev) => prev.map((r) =>
          r.rider_id === riderId && r.session_id === sessionId ? { ...r, is_absent: true } : r));
        toast({ title: "Neprítomnosť nahlásená", description: "Záznam je uložený. Zostane viditeľný aj po obnovení." });
      } else if (error) {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      }
    }
  };

  const activeRiders = riders.filter((r) => r.is_active !== false);

  const openRsvp = (eventId: string) => {
    const existing = myRsvps[eventId];
    if (existing) {
      // Cancel attendance
      (async () => {
        await supabase.from("event_rsvps").delete().eq("id", existing.id);
        setMyRsvps((prev) => { const n = { ...prev }; delete n[eventId]; return n; });
        toast({ title: "Účasť zrušená" });
      })();
      return;
    }
    if (activeRiders.length <= 1) {
      submitRsvp(eventId, activeRiders.map((r) => r.id));
    } else {
      setRsvpSelectedRiders(activeRiders.map((r) => r.id));
      setRsvpDialogEventId(eventId);
    }
  };

  const submitRsvp = async (eventId: string, riderIds: string[]) => {
    if (!user) return;
    if (riderIds.length === 0) {
      toast({ title: "Vyberte aspoň 1 dieťa", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("event_rsvps")
      .insert({ event_id: eventId, user_id: user.id, attending: true, rider_ids: riderIds })
      .select()
      .single();
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else if (data) {
      setMyRsvps((prev) => ({ ...prev, [eventId]: { id: (data as any).id, rider_ids: (data as any).rider_ids ?? riderIds } }));
      setRsvpDialogEventId(null);
      toast({ title: "Účasť potvrdená" });
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const sessionDates = new Set(sessions.map((s) => s.session_date));
  const hasSession = (date: Date) => sessionDates.has(format(date, "yyyy-MM-dd"));
  const cancelledDates = new Set(
    sessions
      .filter((s: any) => s.cancelled)
      .map((s) => s.session_date)
  );
  const isFullyCancelled = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    if (!sessionDates.has(dateStr)) return false;
    const day = sessions.filter((s) => s.session_date === dateStr);
    return day.length > 0 && day.every((s: any) => s.cancelled);
  };
  const hasCancelled = (date: Date) => cancelledDates.has(format(date, "yyyy-MM-dd"));
  const hasEvent = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return events.some((e: any) => {
      const end = e.event_date_end || e.event_date;
      return dateStr >= e.event_date && dateStr <= end;
    });
  };

  // Dates where any of parent's riders has an absence reported
  const absenceSessionIds = new Set(absences.map((a: any) => a.session_id));
  const absenceDates = new Set(
    sessions.filter((s: any) => absenceSessionIds.has(s.id)).map((s: any) => s.session_date)
  );
  const hasAbsence = (date: Date) => absenceDates.has(format(date, "yyyy-MM-dd"));

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  const selectedSessions = selectedDate
    ? sessions.filter((s) => s.session_date === selectedDateStr)
    : [];

  const selectedEvents = selectedDate
    ? events.filter((e: any) => {
        const end = e.event_date_end || e.event_date;
        return selectedDateStr >= e.event_date && selectedDateStr <= end;
      })
    : [];

  // Tréning, v ktorom je moje dieťa v tento deň — po presune je to cieľová skupina.
  const sessionForRider = (riderId: string) =>
    daySessions.find((s) => s.riders.some((r) => r.id === riderId));

  const myDaySessionIds = new Set(
    activeRiders.map((r) => sessionForRider(r.id)?.id).filter(Boolean) as string[]
  );
  const otherDaySessions = daySessions.filter((s) => !myDaySessionIds.has(s.id));

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Načítavanie...</div>;
  }

  const dayNames = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  return (
    <div className="space-y-4 p-4">
      {riders.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Žiadny jazdec nie je priradený k vášmu účtu.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Calendar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
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

              <div className="grid grid-cols-7 gap-1 text-center">
                {dayNames.map((d) => (
                  <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
                {calDays.map((day) => {
                  const inMonth = isSameMonth(day, currentMonth);
                  const selected = selectedDate && isSameDay(day, selectedDate);
                  const hasTraining = hasSession(day);
                  const hasEventDay = hasEvent(day);
                  const today = isToday(day);
                  const cancelledDay = isFullyCancelled(day);
                  const partiallyCancelled = !cancelledDay && hasCancelled(day);
                  const absenceDay = hasAbsence(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`relative flex flex-col items-center justify-center rounded-md p-1.5 text-sm transition-colors
                        ${!inMonth ? "text-muted-foreground/30" : ""}
                        ${selected ? "bg-primary text-primary-foreground" : ""}
                        ${!selected && cancelledDay && inMonth ? "bg-destructive/20 text-destructive" : ""}
                        ${!selected && !cancelledDay && absenceDay && inMonth ? "text-destructive font-bold" : ""}
                        ${!selected && !cancelledDay && !absenceDay && today ? "bg-accent text-accent-foreground" : ""}
                        ${!selected && !cancelledDay && !absenceDay && !today && inMonth ? "hover:bg-muted" : ""}
                      `}
                    >
                      {day.getDate()}
                      <span className="absolute bottom-0.5 flex gap-0.5">
                        {hasTraining && (
                          <span className={`h-1 w-1 rounded-full ${selected ? "bg-primary-foreground" : partiallyCancelled ? "bg-destructive" : "bg-primary"}`} />
                        )}
                        {hasEventDay && (
                          <span className={`h-1 w-1 rounded-full ${selected ? "bg-primary-foreground" : "bg-orange-500"}`} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Tréning</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Zrušený</span>
                <span className="flex items-center gap-1"><span className="text-destructive font-bold leading-none">1</span> Odhlásený</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> Udalosť</span>
              </div>
            </CardContent>
          </Card>

          {/* Skupina môjho dieťaťa v tento deň – po presune je to cieľová skupina */}
          {activeRiders.filter((r) => r.group_id).map((rider) => {
            const daySession = sessionForRider(rider.id);
            const moved = moves.some((m: any) => m.rider_id === rider.id && m.session_date === selectedDateStr);
            const groupName = daySession?.group_name ?? (rider.groups as any)?.name;
            return (
              <Card key={`peers-${rider.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserRound className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-sm font-semibold truncate">
                        Skupina {groupName}
                      </p>
                      {moved && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          presun
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground shrink-0">· {rider.name}</span>
                    </div>
                    {daySession && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {daySession.riders.length} jazdcov
                      </span>
                    )}
                  </div>
                  {!daySession ? (
                    <p className="text-[11px] text-muted-foreground">
                      V tento deň nie je tréning tejto skupiny.
                    </p>
                  ) : daySession.cancelled ? (
                    <p className="text-[11px] text-orange-700 dark:text-orange-400">
                      Tréning je v tento deň zrušený.
                    </p>
                  ) : (
                    <RosterSplit riders={daySession.riders} highlightId={rider.id} />
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Sessions for selected date */}
          {selectedDate && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold capitalize text-muted-foreground">
                {format(selectedDate, "EEEE d. MMMM", { locale: sk })}
              </h3>
              {selectedEvents.length > 0 && selectedEvents.map((event) => {
                const attending = !!myRsvps[event.id];
                return (
                <Card key={event.id} className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Trophy className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold break-words">{event.title}</p>
                        {event.description && <p className="text-[11px] text-muted-foreground break-words">{event.description}</p>}
                        {event.registration_url && (
                          <a
                            href={event.registration_url}
                            target="_blank" rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline break-all"
                          >
                            <ExternalLink className="h-3 w-3" /> {(event as any).url_label || "Registrácia"}
                          </a>
                        )}
                      </div>
                    </div>
                    {event.allow_rsvp && (
                      <div className="space-y-1">
                        <Button
                          size="sm"
                          variant={attending ? "outline" : "default"}
                          className="w-full h-8 text-xs"
                          onClick={() => openRsvp(event.id)}
                        >
                          {attending ? (<><Check className="h-3.5 w-3.5 mr-1" /> Zúčastníme sa – zrušiť</>) : (<>Zúčastníme sa</>)}
                        </Button>
                        {attending && myRsvps[event.id]?.rider_ids?.length > 0 && (
                          <p className="text-[11px] text-muted-foreground text-center">
                            {myRsvps[event.id].rider_ids
                              .map((rid) => activeRiders.find((r) => r.id === rid)?.name)
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}

              {selectedSessions.length === 0 && selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žiadne tréningy v tento deň.</p>
              ) : selectedSessions.length === 0 ? null : (
                riders.filter((r) => r.is_active !== false).map((rider) => {
                  // Ak je jazdec v tento deň presunutý do inej skupiny, ukáž ten tréning.
                  const move = moves.find((m: any) => m.rider_id === rider.id && m.session_date === selectedDateStr);
                  const riderSessions = move
                    ? selectedSessions.filter((s) => s.id === move.session_id)
                    : selectedSessions.filter((s) => s.group_id === rider.group_id);
                  if (riderSessions.length === 0) return null;

                  return riderSessions.map((session) => {
                    const absent = isAbsent(rider.id, session.id);
                    const isCancelled = (session as any).cancelled;
                    const cancelReason = (session as any).cancel_reason;
                    // Názov skupiny podľa tréningu (pri presune ukáž cieľovú skupinu)
                    const shownGroup = (session as any).groups?.name ?? (rider.groups as any)?.name;


                    if (isCancelled) {
                      return (
                        <Card key={`${rider.id}-${session.id}`} className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{rider.name}</span>
                              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {shownGroup}{move ? " (presun)" : ""}

                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                              <CloudRain className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs font-medium">{cancelReason || "Tréning zrušený"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-0.5 shrink-0 line-through">
                                <Clock className="h-2.5 w-2.5" />
                                {session.start_time?.slice(0, 5)}–{session.end_time?.slice(0, 5)}
                              </span>
                              <span className="flex items-center gap-0.5 truncate line-through">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{session.location || "—"}</span>
                              </span>
                              {(session as any).coach_name && (
                                <span className="flex items-center gap-0.5 text-primary line-through">
                                  <UserRound className="h-2.5 w-2.5" />
                                  {(session as any).coach_name}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }

                    const todayStr = todayISODate();
                    const isPast = session.session_date < todayStr;
                    const att = isPast ? history.find((a) => a.rider_id === rider.id && a.session_id === session.id) : null;

                    return (
                      <Card key={`${rider.id}-${session.id}`} className={absent ? "border-destructive/30 opacity-70" : ""}>
                        <CardContent className="flex items-center justify-between gap-2 p-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{rider.name}</span>
                              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {shownGroup}{move ? " (presun)" : ""}

                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-0.5 shrink-0">
                                <Clock className="h-2.5 w-2.5" />
                                {session.start_time?.slice(0, 5)}–{session.end_time?.slice(0, 5)}
                              </span>
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{session.location || "—"}</span>
                              </span>
                              {(session as any).coach_name && (
                                <span className="flex items-center gap-0.5 text-primary">
                                  <UserRound className="h-2.5 w-2.5" />
                                  {(session as any).coach_name}
                                </span>
                              )}
                            </div>
                          </div>
                          {isPast ? (
                            att ? (
                              att.present ? (
                                <span className="flex items-center gap-1 shrink-0 text-xs font-medium text-green-600">
                                  <Check className="h-3.5 w-3.5" /> Prítomný
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 shrink-0 text-xs font-medium text-destructive">
                                  <X className="h-3.5 w-3.5" /> Neprítomný
                                </span>
                              )
                            ) : (
                              <span className="shrink-0 text-[11px] text-muted-foreground">Bez záznamu</span>
                            )
                          ) : (
                            <Button
                              variant={absent ? "outline" : "destructive"}
                              size="sm"
                              className="shrink-0 h-8 px-2 text-xs"
                              onClick={() => toggleAbsence(rider.id, session.id)}
                            >
                              {absent ? (
                                <><Check className="h-3 w-3" /> Prídem</>
                              ) : (
                                <><X className="h-3 w-3" /> Neprítomnosť</>
                              )}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  });
                })
              )}
            </div>
          )}

          {/* Ostatné skupiny – náhľad prítomnosti v rámci toho istého tréningového dňa */}
          {selectedDate && otherDaySessions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Ostatné skupiny</h3>
              <Card>
                <CardContent className="p-2">
                  <Accordion type="multiple" className="w-full">
                    {otherDaySessions.map((s) => {
                      const present = s.riders.filter((r) => !r.absent).length;
                      const absentCount = s.riders.length - present;
                      return (
                        <AccordionItem key={s.id} value={s.id} className="border-b last:border-b-0">
                          <AccordionTrigger className="px-2 py-2.5 hover:no-underline">
                            <div className="flex flex-1 items-center justify-between gap-2 pr-2 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Users className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-sm font-semibold truncate">Skupina {s.group_name}</span>
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                  {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                                </span>
                              </div>
                              {s.cancelled ? (
                                <span className="flex items-center gap-1 shrink-0 text-[11px] font-medium text-orange-600">
                                  <CloudRain className="h-3 w-3" /> Zrušený
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5 shrink-0 text-xs">
                                  <span className="flex items-center gap-0.5 text-green-600">
                                    <Check className="h-3 w-3" />{present}
                                  </span>
                                  <span className="flex items-center gap-0.5 text-destructive">
                                    <X className="h-3 w-3" />{absentCount}
                                  </span>
                                </div>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-3">
                            <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-2.5 w-2.5" />{s.location || "—"}
                              </span>
                              {s.coach_name && (
                                <span className="flex items-center gap-0.5 text-primary">
                                  <UserRound className="h-2.5 w-2.5" />{s.coach_name}
                                </span>
                              )}
                            </div>
                            {s.riders.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">Žiadni jazdci v tomto tréningu.</p>
                            ) : (
                              <RosterSplit riders={s.riders} />
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          )}

        </>
      )}

      <Dialog open={!!rsvpDialogEventId} onOpenChange={(o) => !o && setRsvpDialogEventId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ktoré deti sa zúčastnia?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {activeRiders.map((r) => {
              const checked = rsvpSelectedRiders.includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setRsvpSelectedRiders((prev) =>
                        v ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                      );
                    }}
                  />
                  <span className="text-sm">{r.name}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRsvpDialogEventId(null)}>Zrušiť</Button>
            <Button onClick={() => rsvpDialogEventId && submitRsvp(rsvpDialogEventId, rsvpSelectedRiders)}>
              Potvrdiť účasť
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
