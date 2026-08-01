import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, ChevronLeft, ChevronRight, CloudRain, ChevronDown } from "lucide-react";
import { format, isToday, startOfWeek, endOfWeek, addWeeks, isSameWeek } from "date-fns";
import { todayISODate } from "@/lib/datetime";
import { sk } from "date-fns/locale";


// Jazdec v súpiske konkrétneho tréningu (guest = presunutý sem z inej skupiny)
interface RosterRider {
  id: string;
  name: string;
  absent: boolean;
  guest: boolean;
}

export default function AdminDashboard() {
  const [trainingDates, setTrainingDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [sessions, setSessions] = useState<any[]>([]);
  const [cancelledDates, setCancelledDates] = useState<Set<string>>(new Set());
  const [partiallyCancelledDates, setPartiallyCancelledDates] = useState<Set<string>>(new Set());
  // Súpisky podľa tréningu — rešpektujú jednorazové presuny medzi skupinami
  const [rostersBySession, setRostersBySession] = useState<Record<string, RosterRider[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load upcoming distinct training dates
  useEffect(() => {
    const loadDates = async () => {
      const today = todayISODate();
      const { data } = await supabase
        .from("training_sessions")
        .select("session_date, cancelled")
        .gte("session_date", today)
        .order("session_date")
        .limit(200);
      const unique = Array.from(new Set((data ?? []).map((d: any) => d.session_date)));
      setTrainingDates(unique);
      if (unique.length > 0) setSelectedDate(unique[0]);

      // Track cancelled dates
      const cancelled = new Set<string>();
      const partial = new Set<string>();
      const datesMap: Record<string, any[]> = {};
      for (const s of data ?? []) {
        if (!datesMap[s.session_date]) datesMap[s.session_date] = [];
        datesMap[s.session_date].push(s);
      }
      for (const [dateStr, sess] of Object.entries(datesMap)) {
        if (sess.length > 0 && sess.every((s: any) => s.cancelled)) {
          cancelled.add(dateStr);
        } else if (sess.some((s: any) => s.cancelled)) {
          partial.add(dateStr);
        }
      }
      setCancelledDates(cancelled);
      setPartiallyCancelledDates(partial);
    };
    loadDates();
  }, []);

  // Load sessions for the selected date
  useEffect(() => {
    if (!selectedDate) {
      setSessions([]);
      return;
    }
    const load = async () => {
      const sessRes = await supabase
        .from("training_sessions")
        .select("*, groups(name)")
        .eq("session_date", selectedDate)
        .order("start_time");
      const sessionData = (sessRes.data ?? []).sort((a: any, b: any) =>
        (a.start_time ?? "").localeCompare(b.start_time ?? "")
      );

      // Súpisky vrátane stavu prítomnosti. RPC rieši jednorazové presuny:
      // kto je v ten deň presunutý inam sa odráta, kto je presunutý sem sa pridá.
      const { data: overview } = await (supabase as any).rpc("training_day_overview", {
        _date: selectedDate,
      });
      const rosters: Record<string, RosterRider[]> = {};
      for (const row of (overview ?? []) as any[]) {
        if (!row.rider_id) continue;
        if (!rosters[row.session_id]) rosters[row.session_id] = [];
        rosters[row.session_id].push({
          id: row.rider_id,
          name: row.rider_name,
          absent: row.is_absent,
          guest: row.is_guest,
        });
      }
      setRostersBySession(rosters);
      setSessions(sessionData);
    };
    load();
  }, [selectedDate]);

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekTrainingDates = useMemo(() => {
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");
    return trainingDates.filter((d) => d >= startStr && d <= endStr);
  }, [trainingDates, weekStart]);

  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });
  const weekLabel = isCurrentWeek
    ? "Tento týždeň"
    : `${format(weekStart, "d.M.")} – ${format(weekEnd, "d.M.yyyy")}`;

  return (
    <div className="space-y-6 p-4">

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="text-lg capitalize">
            {selectedDateObj && isToday(selectedDateObj) ? "Dnešné tréningy" : "Tréningy"}
            {selectedDateObj && (
              <> · {format(selectedDateObj, "EEEE d.M.yyyy", { locale: sk })}</>
            )}
          </CardTitle>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center text-xs font-medium capitalize flex-1">
              <span>{weekLabel}</span>
              {!isCurrentWeek && (
                <button
                  className="text-[10px] text-primary underline"
                  onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                >
                  Späť na tento týždeň
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {weekTrainingDates.length > 0 ? (
            <div className="flex gap-1 overflow-x-auto pb-1 scroll-smooth">
              {weekTrainingDates.map((dStr) => {
                const d = new Date(dStr);
                const sel = dStr === selectedDate;
                const fullyCancelled = cancelledDates.has(dStr);
                const partiallyCancelled = partiallyCancelledDates.has(dStr);
                return (
                  <Button
                    key={dStr}
                    size="sm"
                    variant={sel ? "default" : "outline"}
                    onClick={() => setSelectedDate(dStr)}
                    className={`relative flex flex-col h-auto py-1.5 px-3 min-w-[52px] shrink-0
                      ${!sel && fullyCancelled ? "border-destructive text-destructive" : ""}
                      ${!sel && partiallyCancelled && !fullyCancelled ? "border-orange-400 text-orange-600" : ""}
                    `}
                  >
                    <span className="text-[10px] uppercase leading-none">
                      {format(d, "EEE", { locale: sk })}
                    </span>
                    <span className="text-sm font-bold leading-tight">
                      {format(d, "d.M")}
                    </span>
                    {fullyCancelled && (
                      <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">V tomto týždni nie sú naplánované tréningy.</p>
          )}
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žiadne nadchádzajúce tréningy.
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const roster = rostersBySession[s.id] ?? [];
                const presentRiders = roster.filter((r) => !r.absent);
                const absentRiders = roster.filter((r) => r.absent);
                const totalRiders = roster.length;
                const absentCount = absentRiders.length;
                const presentCount = presentRiders.length;

                if (s.cancelled) {
                  return (
                    <div key={s.id} className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{(s.groups as any)?.name}</p>
                          <p className="text-xs text-muted-foreground line-through">{s.location}</p>
                        </div>
                        <p className="text-sm font-medium text-orange-600 line-through">
                          {s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-400">
                        <CloudRain className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">{s.cancel_reason || "Tréning zrušený"}</span>
                      </div>
                    </div>
                  );
                }

                const isOpen = expanded.has(s.id);

                return (
                  <div key={s.id} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                          return next;
                        })
                      }
                      className="w-full p-3 space-y-2 text-left hover:bg-muted/40 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{(s.groups as any)?.name}</p>
                          <p className="text-xs text-muted-foreground">{s.location}</p>
                          {s.coach_name && (
                            <p className="text-xs text-primary mt-0.5">Tréner: {s.coach_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-medium text-primary">
                            {s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}
                          </p>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1 text-primary">
                          <Check className="h-3 w-3" />
                          {presentCount} prítomných
                        </span>
                        <span className="flex items-center gap-1 text-destructive">
                          <X className="h-3 w-3" />
                          {absentCount} neprítomných
                        </span>
                        <span className="text-muted-foreground">
                          z {totalRiders} jazdcov
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Prítomní ({presentRiders.length})
                          </p>
                          {presentRiders.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Žiadni jazdci.</p>
                          ) : (
                            <ul className="space-y-0.5">
                              {presentRiders.map((r) => (
                                <li key={r.id} className="text-sm">
                                  {r.name}
                                  {r.guest && (
                                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                      presun
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1">
                            <X className="h-3 w-3" /> Odhlásení ({absentRiders.length})
                          </p>
                          {absentRiders.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Žiadne odhlášky.</p>
                          ) : (
                            <ul className="space-y-0.5">
                              {absentRiders.map((r) => (
                                <li key={r.id} className="text-sm">
                                  {r.name}
                                  {r.guest && (
                                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                      presun
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
