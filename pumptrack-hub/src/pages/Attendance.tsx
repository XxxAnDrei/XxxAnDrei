import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check, X, Users, Trophy, CloudRain, UserRound, AlertTriangle } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, isBefore } from "date-fns";
import { sk } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface SessionWithAttendance {
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

interface AttendanceRecord {
  id: string;
  rider_id: string;
  session_id: string;
  present: boolean;
}

interface AbsenceRecord {
  id: string;
  rider_id: string;
  session_id: string;
}

interface RiderInfo {
  id: string;
  name: string;
  group_id: string | null;
}

// Jednorazový presun jazdca do inej skupiny v rámci jedného tréningového dňa
interface MoveRecord {
  id: string;
  rider_id: string;
  session_date: string;
  session_id: string;
}

export default function Attendance() {
  const [sessions, setSessions] = useState<SessionWithAttendance[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  // Jednorazové presuny jazdcov medzi skupinami v konkrétny deň
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [unavailability, setUnavailability] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const { toast } = useToast();

  const coachUnavailableFor = (coachName: string | null | undefined, date: string, startTime: string, endTime: string) => {
    if (!coachName) return null;
    const lc = coachName.trim().toLowerCase();
    return unavailability.find((u: any) => {
      if (u.unavailable_date !== date) return false;
      if (u.coach_name?.trim().toLowerCase() !== lc) return false;
      if (!u.start_time || !u.end_time) return true;
      return !(endTime <= u.start_time || startTime >= u.end_time);
    }) ?? null;
  };

  const setRiderAttendance = async (riderId: string, present: boolean) => {
    const sessionId = dialogGroupSessions[0]?.id;
    if (!sessionId) return;
    const existing = attendance.find((a) => a.rider_id === riderId && a.session_id === sessionId);

    if (present) {
      // Mark present = restore default (auto-enrolled). Clear absence + any present:false record.
      const abs = absences.find((a) => a.rider_id === riderId && a.session_id === sessionId);
      if (abs) {
        await supabase.from("absences").delete().eq("id", abs.id);
        setAbsences((prev) => prev.filter((a) => a.id !== abs.id));
      }
      if (existing) {
        const { error } = await supabase.from("attendance").update({ present: true }).eq("id", existing.id);
        if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
        setAttendance((prev) => prev.map((a) => a.id === existing.id ? { ...a, present: true } : a));
      }
      toast({ title: "Označený ako prítomný" });
      return;
    }

    // Mark absent
    if (existing) {
      const { error } = await supabase.from("attendance").update({ present: false }).eq("id", existing.id);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      setAttendance((prev) => prev.map((a) => a.id === existing.id ? { ...a, present: false } : a));
    } else {
      const { data, error } = await supabase.from("attendance").insert({ rider_id: riderId, session_id: sessionId, present: false }).select().single();
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      if (data) setAttendance((prev) => [...prev, data as AttendanceRecord]);
    }
    toast({ title: "Označený ako neprítomný" });
  };

  useEffect(() => {
    const load = async () => {
      const [sessRes, ridersRes, eventsRes, unavailRes, groupsRes, movesRes] = await Promise.all([
        supabase
          .from("training_sessions")
          .select("id, group_id, session_date, start_time, end_time, location, cancelled, cancel_reason, coach_name, groups(name)")
          .order("session_date")
          .limit(1000),
        supabase.from("riders").select("id, name, group_id").eq("is_active", true).order("name"),
        supabase.from("events").select("*").order("event_date"),
        supabase.from("coach_unavailability").select("*"),
        supabase.from("groups").select("id, name"),
        (supabase as any).from("session_rider_moves").select("id, rider_id, session_date, session_id"),
      ]);
      setEvents(eventsRes.data ?? []);
      setUnavailability(unavailRes.data ?? []);
      setGroups((groupsRes.data as { id: string; name: string }[]) ?? []);
      setMoves((movesRes.data as MoveRecord[]) ?? []);

      const sessData = (sessRes.data ?? []).map((s: any) => ({
        ...s,
        group_name: s.groups?.name ?? "?",
      }));
      setSessions(sessData);
      setRiders((ridersRes.data as RiderInfo[]) ?? []);

      const sessionIds = sessData.map((s: any) => s.id);
      if (sessionIds.length > 0) {
        const [attRes, absRes] = await Promise.all([
          supabase.from("attendance").select("id, rider_id, session_id, present").in("session_id", sessionIds),
          supabase.from("absences").select("id, rider_id, session_id").in("session_id", sessionIds),
        ]);
        setAttendance((attRes.data as AttendanceRecord[]) ?? []);
        setAbsences((absRes.data as AbsenceRecord[]) ?? []);
      }
    };
    load();
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const sessionDates = new Set(sessions.map((s) => s.session_date));
  const hasSession = (date: Date) => sessionDates.has(format(date, "yyyy-MM-dd"));
  const isFullyCancelled = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    if (!sessionDates.has(dateStr)) return false;
    const day = sessions.filter((s) => s.session_date === dateStr);
    return day.length > 0 && day.every((s: any) => s.cancelled);
  };
  const hasCancelled = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return sessions.some((s: any) => s.session_date === dateStr && s.cancelled);
  };
  const hasEvent = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return events.some((e) => {
      const end = (e as any).event_date_end || e.event_date;
      return dateStr >= e.event_date && dateStr <= end;
    });
  };

  const selectedEvents = selectedDate
    ? events.filter((e) => {
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        const end = (e as any).event_date_end || e.event_date;
        return dateStr >= e.event_date && dateStr <= end;
      })
    : [];

  const selectedSessions = selectedDate
    ? sessions.filter((s) => s.session_date === format(selectedDate, "yyyy-MM-dd"))
    : [];

  const groupedSessions = selectedSessions.reduce<Record<string, SessionWithAttendance[]>>((acc, s) => {
    const key = s.group_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const isPast = (session: SessionWithAttendance) => {
    const sessionEnd = new Date(`${session.session_date}T${session.end_time}`);
    return isBefore(sessionEnd, new Date());
  };

  const getRidersForGroup = (groupId: string) => riders.filter((r) => r.group_id === groupId);

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

  const hasAttendanceData = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dateSessions = sessions.filter((s) => s.session_date === dateStr);
    return dateSessions.some((s) => attendance.some((a) => a.session_id === s.id));
  };

  const getCancelTooltip = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const cancelledSessions = sessions.filter((s: any) => s.session_date === dateStr && s.cancelled);
    if (cancelledSessions.length === 0) return undefined;
    const reasons = cancelledSessions.map((s: any) => s.cancel_reason).filter(Boolean);
    if (reasons.length > 0) return `Zrušený tréning: ${reasons.join(", ")}`;
    return "Zrušený tréning";
  };

  // Dialog data
  const dialogGroupSessions = selectedGroupId ? (groupedSessions[selectedGroupId] ?? []) : [];
  const dialogGroupName = dialogGroupSessions[0]?.group_name ?? "";
  const dialogSessionIds = dialogGroupSessions.map((s) => s.id);
  const dialogAttendance = attendance.filter((a) => dialogSessionIds.includes(a.session_id));
  const dialogAbsences = absences.filter((a) => dialogSessionIds.includes(a.session_id));
  const dialogRiders = dialogGroupSessions[0] ? getRidersForSession(dialogGroupSessions[0]) : [];
  const dialogSessionPast = dialogGroupSessions.some(isPast);
  const dialogIsCancelled = dialogGroupSessions.some((s: any) => s.cancelled);
  const dialogCancelReason = dialogGroupSessions.map((s: any) => s.cancel_reason).filter(Boolean).join(", ");

  const dayNames = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  return (
    <div className="space-y-4 p-4">

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
              const todayFlag = isToday(day);
              const hasAtt = hasAttendanceData(day);
              const cancelledDay = isFullyCancelled(day);
              const partiallyCancelled = !cancelledDay && hasCancelled(day);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  title={getCancelTooltip(day)}
                  className={`relative flex flex-col items-center justify-center rounded-md p-1.5 text-sm transition-colors
                    ${!inMonth ? "text-muted-foreground/30" : ""}
                    ${selected && cancelledDay ? "bg-destructive text-destructive-foreground" : ""}
                    ${selected && !cancelledDay ? "bg-primary text-primary-foreground" : ""}
                    ${!selected && cancelledDay && inMonth ? "bg-destructive/30 text-destructive font-semibold" : ""}
                    ${!selected && !cancelledDay && partiallyCancelled && inMonth ? "bg-destructive/15 text-destructive" : ""}
                    ${!selected && !cancelledDay && !partiallyCancelled && todayFlag ? "bg-accent text-accent-foreground" : ""}
                    ${!selected && !cancelledDay && !partiallyCancelled && !todayFlag && inMonth ? "hover:bg-muted" : ""}
                  `}
                >
                  {day.getDate()}
                  <span className="absolute bottom-0.5 flex gap-0.5">
                    {hasTraining && (
                      <span className={`h-1 w-1 rounded-full ${
                        selected ? "bg-primary-foreground" : partiallyCancelled ? "bg-destructive" : hasAtt ? "bg-green-500" : "bg-primary"
                      }`} />
                    )}
                    {hasEventDay && (
                      <span className={`h-1 w-1 rounded-full ${
                        selected ? "bg-primary-foreground" : "bg-orange-500"
                      }`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sessions for selected date */}
      {selectedDate && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold capitalize text-muted-foreground">
            {format(selectedDate, "EEEE d. MMMM", { locale: sk })}
          </h3>

          {selectedEvents.length > 0 && selectedEvents.map((event) => (
            <Card key={event.id} className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
              <CardContent className="flex items-center gap-2 p-3">
                <Trophy className="h-4 w-4 text-orange-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{event.title}</p>
                  {event.description && <p className="text-[11px] text-muted-foreground">{event.description}</p>}
                </div>
              </CardContent>
            </Card>
          ))}

          {selectedSessions.length === 0 && selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žiadne tréningy v tento deň.</p>
          ) : selectedSessions.length === 0 ? null : (
            Object.entries(groupedSessions).map(([groupId, groupSessions]) => {
              const groupName = groupSessions[0]?.group_name ?? "?";
              const sessionIds = groupSessions.map((s) => s.id);
              const groupAttendance = attendance.filter((a) => sessionIds.includes(a.session_id));
              const groupAbsences = absences.filter((a) => sessionIds.includes(a.session_id));
              // Súpiska po presunoch — počty musia ignorovať jazdcov, ktorí v tento
              // deň v tomto tréningu nie sú (napr. odhlásili sa a až potom boli presunutí).
              const sessionRiders = groupSessions[0] ? getRidersForSession(groupSessions[0]) : [];
              const sessionRiderIds = new Set(sessionRiders.map((r) => r.id));
              const totalRiders = sessionRiders.length;
              const sessionPast = groupSessions.some(isPast);
              const hasAttData = groupAttendance.length > 0;
              // Auto-enrollment: every rider is implicitly present unless absent
              const absentRiderIds = new Set<string>();
              groupAttendance.filter((a) => !a.present && sessionRiderIds.has(a.rider_id)).forEach((a) => absentRiderIds.add(a.rider_id));
              groupAbsences.filter((a) => sessionRiderIds.has(a.rider_id)).forEach((a) => absentRiderIds.add(a.rider_id));
              const absentCount = absentRiderIds.size;
              const presentCount = sessionPast && hasAttData
                ? groupAttendance.filter((a) => a.present && sessionRiderIds.has(a.rider_id)).length
                : Math.max(0, totalRiders - absentCount);
              const isCancelled = groupSessions.some((s: any) => s.cancelled);
              const cancelReasons = groupSessions.map((s: any) => s.cancel_reason).filter(Boolean);

              return (
                <Card
                  key={groupId}
                  className={`transition-colors ${
                    isCancelled
                      ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800"
                      : "cursor-pointer hover:bg-muted/50"
                  }`}
                  onClick={() => !isCancelled && setSelectedGroupId(groupId)}
                >
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      {isCancelled ? (
                        <CloudRain className="h-4 w-4 text-orange-600 shrink-0" />
                      ) : (
                        <Users className="h-4 w-4 text-primary" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${isCancelled ? "text-orange-700" : ""}`}>{groupName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          <span className={isCancelled ? "line-through" : ""}>
                            {groupSessions[0]?.start_time?.slice(0, 5)}–{groupSessions[0]?.end_time?.slice(0, 5)}
                            {groupSessions[0]?.location ? ` • ${groupSessions[0].location}` : ""}
                          </span>
                          {isCancelled && cancelReasons.length > 0 && (
                            <span className="ml-1 text-orange-600 font-medium">{cancelReasons.join(", ")}</span>
                          )}
                        </p>
                        {groupSessions[0]?.coach_name && (() => {
                          const s0 = groupSessions[0];
                          const u = coachUnavailableFor(s0.coach_name, s0.session_date, s0.start_time, s0.end_time);
                          return (
                            <p className={`text-[11px] flex items-center gap-1 ${isCancelled ? "text-muted-foreground line-through" : u ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                              {u ? <AlertTriangle className="h-2.5 w-2.5" /> : <UserRound className="h-2.5 w-2.5" />}
                              {s0.coach_name}{u ? ` · nedostupný${u.reason ? ` (${u.reason})` : ""}` : ""}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isCancelled && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="flex items-center gap-0.5 text-green-600">
                            <Check className="h-3 w-3" />{presentCount}
                          </span>
                          <span className="flex items-center gap-0.5 text-destructive">
                            <X className="h-3 w-3" />{absentCount}
                          </span>
                        </div>
                      )}
                      {!isCancelled && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Group detail dialog */}
      <Dialog open={!!selectedGroupId} onOpenChange={(open) => !open && setSelectedGroupId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogIsCancelled ? (
                <CloudRain className="h-5 w-5 text-orange-600" />
              ) : (
                <Users className="h-5 w-5 text-primary" />
              )}
              {dialogGroupName}
            </DialogTitle>
            {dialogGroupSessions[0] && selectedDate && (
              <p className="text-sm text-muted-foreground">
                {format(selectedDate, "d. MMMM yyyy", { locale: sk })} • {dialogGroupSessions[0].start_time?.slice(0, 5)}–{dialogGroupSessions[0].end_time?.slice(0, 5)}
                {dialogGroupSessions[0].location ? ` • ${dialogGroupSessions[0].location}` : ""}
              </p>
            )}
            {dialogGroupSessions[0]?.coach_name && (
              <p className="text-xs flex items-center gap-1 text-primary">
                <UserRound className="h-3 w-3" /> {dialogGroupSessions[0].coach_name}
              </p>
            )}
          </DialogHeader>

          {dialogIsCancelled && (
            <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
              Tento tréning bol zrušený
              {dialogCancelReason ? `: ${dialogCancelReason}` : "."}
            </div>
          )}

          <div className="space-y-1 mt-2">
            {dialogRiders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Žiadni jazdci v tejto skupine.</p>
            ) : (
              dialogRiders.map((rider) => {
                const riderAtt = dialogAttendance.find((a) => a.rider_id === rider.id);
                const riderAbs = dialogAbsences.find((a) => a.rider_id === rider.id);
                const isAbsent = riderAtt?.present === false || (!riderAtt && !!riderAbs);
                // Auto-enrollment: present by default unless explicitly absent
                const isPresent = !isAbsent;

                return (
                  <div
                    key={rider.id}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm gap-2
                      ${isPresent ? "bg-green-500/10" : ""}
                      ${isAbsent ? "bg-destructive/10" : ""}
                    `}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {rider.name}
                      {rider.group_id !== dialogGroupSessions[0]?.group_id && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">
                          z {groups.find((g) => g.id === rider.group_id)?.name ?? "?"}
                        </Badge>
                      )}
                    </span>
                    {!dialogIsCancelled && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant={isPresent ? "default" : "outline"}
                          className={`h-7 px-2 text-xs ${isPresent ? "bg-green-600 hover:bg-green-700" : ""}`}
                          onClick={() => setRiderAttendance(rider.id, true)}
                        >
                          <Check className="h-3 w-3" /> Prítomný
                        </Button>
                        <Button
                          size="sm"
                          variant={isAbsent ? "destructive" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setRiderAttendance(rider.id, false)}
                        >
                          <X className="h-3 w-3" /> Neprítomný
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}