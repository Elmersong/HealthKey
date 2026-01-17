import React, { useEffect, useMemo, useState } from "react";
// @ts-ignore: solar2lunar 没有类型声明
import calendar from "solar2lunar";

// 分类 ID 放宽为 string，方便新增
type EventCategoryId = string;

interface Category {
  id: EventCategoryId;
  label: string;
  color: string;
}

interface EventDefinition {
  id: string;
  label: string;
  categoryId: EventCategoryId;
}

interface EventExtra {
  urineColor?: string;
  stoolColor?: string;
  isAbnormal?: boolean;

  satietyPercent?: number;      // 饱腹感（早餐/午餐/晚餐/零食/水果）
  waterMl?: number;             // 喝水 ml（0–1000）
  activityIntensity?: number;   // 运动强度（0–100）
  sleepDepth?: number;          // 睡眠深度（0–100）

  note?: string;
}

interface EventRecord {
  id: string;
  eventDefId: string;
  timestamp: string;
  extras?: EventExtra;
}

interface DayMetaWeather {
  temperatureC?: number;
  humidity?: number;
  pressureHpa?: number;
  description?: string;
}

interface DayMeta {
  date: string;
  weather?: DayMetaWeather;
  steps?: number;
}

type ActiveTab = "log" | "daily";

const EVENTS_KEY = "healthkey_events_v2";
const DAYMETA_KEY = "healthkey_daymeta_v1";
const CATEGORIES_KEY = "healthkey_categories_v1";
const EVENTDEFS_KEY = "healthkey_eventdefs_v1";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "diet", label: "饮食", color: "#ff9f43" },
  { id: "excretion", label: "排泄", color: "#f368e0" },
  { id: "sleep", label: "睡眠", color: "#54a0ff" },
  { id: "activity", label: "活动", color: "#1dd1a1" },
];

const DEFAULT_EVENT_DEFS: EventDefinition[] = [
  // 饮食
  { id: "breakfast", label: "早餐", categoryId: "diet" },
  { id: "lunch", label: "午餐", categoryId: "diet" },
  { id: "dinner", label: "晚餐", categoryId: "diet" },
  { id: "snack", label: "零食", categoryId: "diet" },
  { id: "fruit", label: "水果", categoryId: "diet" },
  { id: "supplement", label: "营养品", categoryId: "diet" },
  { id: "water", label: "喝水", categoryId: "diet" },
  // 排泄
  { id: "pee", label: "排尿", categoryId: "excretion" },
  { id: "poop", label: "排便", categoryId: "excretion" },
  // 睡眠
  { id: "sleep_start", label: "入睡", categoryId: "sleep" },
  { id: "wake", label: "醒来", categoryId: "sleep" },
  { id: "getup", label: "起床", categoryId: "sleep" },
  // 活动
  { id: "exercise", label: "运动", categoryId: "activity" },
  { id: "laugh", label: "大笑", categoryId: "activity" },
  { id: "sex", label: "性爱", categoryId: "activity" },
];

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(date: Date): string {
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

function getLocalDateFromISO(iso: string): string {
  return formatDate(new Date(iso));
}

function groupEventsByDate(events: EventRecord[]): Record<string, EventRecord[]> {
  return events.reduce<Record<string, EventRecord[]>>((acc, e) => {
    const d = getLocalDateFromISO(e.timestamp);
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});
}

// 农历 + 节气 + 常见节日
function getLunarInfoForDate(date: Date) {
  try {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const lunarRaw = calendar.solar2lunar(y, m, d) as any;

    const lunarText = `农历 ${lunarRaw.IMonthCn}${lunarRaw.IDayCn}`;
    const term: string | undefined =
      typeof lunarRaw.Term === "string" ? lunarRaw.Term : undefined;

    const solarKey = `${m}-${d}`;
    const lunarFestival: string | undefined =
      typeof lunarRaw.lunarFestival === "string"
        ? lunarRaw.lunarFestival
        : undefined;

    const solarFestivalMap: Record<string, string> = {
      "1-1": "元旦",
      "2-14": "情人节",
      "3-8": "妇女节",
      "5-1": "劳动节",
      "6-1": "儿童节",
      "10-1": "国庆节",
    };

    const solarFest = solarFestivalMap[solarKey];
    const holiday = lunarFestival || solarFest;

    return {
      lunarText,
      term,
      holiday,
    };
  } catch {
    return {
      lunarText: "农历数据暂不可用",
      term: undefined,
      holiday: undefined,
    };
  }
}

function getWeatherSummary(weather?: DayMetaWeather): string {
  if (!weather) return "天气数据暂无";
  const parts: string[] = [];
  if (typeof weather.temperatureC === "number")
    parts.push(`${weather.temperatureC.toFixed(1)}°C`);
  if (typeof weather.humidity === "number") parts.push(`湿度 ${weather.humidity}%`);
  if (typeof weather.pressureHpa === "number")
    parts.push(`气压 ${Math.round(weather.pressureHpa)} hPa`);
  if (weather.description) parts.push(weather.description);
  return parts.join(" · ") || "天气数据暂无";
}

const weekdayText = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 内置事件 ID，用来限制删除
const BUILTIN_EVENT_IDS = new Set(DEFAULT_EVENT_DEFS.map((d) => d.id));

// ICS 导出相关工具
function formatICSDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const HH = `${d.getHours()}`.padStart(2, "0");
  const MM = `${d.getMinutes()}`.padStart(2, "0");
  const SS = `${d.getSeconds()}`.padStart(2, "0");
  // 作为本地时间（不加 Z）
  return `${yyyy}${mm}${dd}T${HH}${MM}${SS}`;
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

const App: React.FC = () => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [eventDefs, setEventDefs] = useState<EventDefinition[]>(DEFAULT_EVENT_DEFS);
  const [dayMetaMap, setDayMetaMap] = useState<Record<string, DayMeta>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("log");
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState<string>("");
  const [editingExtras, setEditingExtras] = useState<EventExtra>({});

  const [isManageOpen, setIsManageOpen] = useState(false);

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth() + 1);

  // 今日记录行的“滑动删除”状态
  const [swipedEventId, setSwipedEventId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // 初始化数据
  useEffect(() => {
    try {
      const storedEvents = localStorage.getItem(EVENTS_KEY);
      if (storedEvents) {
        const parsed: EventRecord[] = JSON.parse(storedEvents);
        parsed.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setEvents(parsed);
      }
    } catch {}

    try {
      const metaStr = localStorage.getItem(DAYMETA_KEY);
      if (metaStr) {
        const parsedArr: DayMeta[] = JSON.parse(metaStr);
        const map: Record<string, DayMeta> = {};
        parsedArr.forEach((m) => {
          map[m.date] = m;
        });
        setDayMetaMap(map);
      }
    } catch {}

    try {
      const catStr = localStorage.getItem(CATEGORIES_KEY);
      if (catStr) {
        const parsed: Category[] = JSON.parse(catStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed);
        }
      }
    } catch {}

    try {
      const defStr = localStorage.getItem(EVENTDEFS_KEY);
      if (defStr) {
        const parsed: EventDefinition[] = JSON.parse(defStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEventDefs(parsed);
        }
      }
    } catch {}
  }, []);

  // 初始化 & 今日天气
  useEffect(() => {
    const today = formatDate(new Date());

    setDayMetaMap((prev) => {
      if (prev[today]) return prev;
      const next = { ...prev, [today]: { date: today } };
      localStorage.setItem(DAYMETA_KEY, JSON.stringify(Object.values(next)));
      return next;
    });

    const meta = dayMetaMap[today];
    if (meta?.weather) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,pressure_msl&timezone=auto`,
          )
            .then((res) => res.json())
            .then((data) => {
              const w: DayMetaWeather = {
                temperatureC: data.current?.temperature_2m,
                humidity: data.current?.relative_humidity_2m,
                pressureHpa: data.current?.pressure_msl,
                description: "实时天气",
              };
              setDayMetaMap((prev) => {
                const updated: Record<string, DayMeta> = {
                  ...prev,
                  [today]: { ...(prev[today] || { date: today }), weather: w },
                };
                localStorage.setItem(
                  DAYMETA_KEY,
                  JSON.stringify(Object.values(updated)),
                );
                return updated;
              });
            })
            .catch(() => {});
        },
        () => {},
      );
    }
  }, [dayMetaMap]);

  // 支持通过 URL 传 steps（未来可以用捷径传健康 App 步数）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepsParam = params.get("steps");
    if (!stepsParam) return;
    const steps = parseInt(stepsParam, 10);
    if (Number.isNaN(steps)) return;
    const today = formatDate(new Date());

    setDayMetaMap((prev) => {
      const updated: Record<string, DayMeta> = {
        ...prev,
        [today]: { ...(prev[today] || { date: today }), steps },
      };
      localStorage.setItem(DAYMETA_KEY, JSON.stringify(Object.values(updated)));
      return updated;
    });
  }, []);

  // 持久化
  useEffect(() => {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(EVENTDEFS_KEY, JSON.stringify(eventDefs));
  }, [eventDefs]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  const todayStr = formatDate(new Date());
  const todayEvents = eventsByDate[todayStr] || [];
  const selectedDayEvents = eventsByDate[selectedDate] || [];
  const selectedDayMeta = dayMetaMap[selectedDate];

  const allDatesWithEvents = useMemo(
    () => new Set(Object.keys(eventsByDate)),
    [eventsByDate],
  );

  const headerDate = new Date();
  const headerLunar = getLunarInfoForDate(headerDate);
  const todayWeekday = weekdayText[headerDate.getDay()];
  const todayMeta = dayMetaMap[todayStr];

  const getEventDef = (id: string) => eventDefs.find((d) => d.id === id);

  const getCategoryById = (id: EventCategoryId): Category => {
    const found = categories.find((c) => c.id === id);
    if (found) return found;
    return { id, label: "其他", color: "#8395a7" };
  };

  // 打卡：单击记录时间点
  const handleLogEvent = (eventDefId: string) => {
    const now = new Date();
    const record: EventRecord = {
      id: `e_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      eventDefId,
      timestamp: now.toISOString(),
    };
    setEvents((prev) => {
      const next = [...prev, record].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return next;
    });
    setSwipedEventId(null);
  };

  // 修改某条记录的 extras（给今日打卡记录里的控件使用）
  const updateEventExtras = (eventId: string, patch: Partial<EventExtra>) => {
    setEvents((prev) => {
      const list = prev.map((e) => {
        if (e.id !== eventId) return e;
        const mergedExtras = { ...(e.extras || {}), ...patch };
        return { ...e, extras: mergedExtras };
      });
      return list.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    });
  };

  // 编辑弹窗
  const openEditEvent = (eventId: string) => {
    const evt = events.find((e) => e.id === eventId);
    if (!evt) return;
    const dt = new Date(evt.timestamp);
    setEditingEventId(eventId);
    setEditingTime(formatTime(dt));
    setEditingExtras({ ...(evt.extras || {}) });
    setSwipedEventId(null);
  };

  const closeEdit = () => {
    setEditingEventId(null);
    setEditingExtras({});
    setEditingTime("");
  };

  const saveEdit = () => {
    if (!editingEventId) return;
    const evt = events.find((e) => e.id === editingEventId);
    if (!evt) return;

    const datePart = getLocalDateFromISO(evt.timestamp);
    const [hh, mm] = editingTime.split(":").map((s) => parseInt(s, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) {
      alert("请填写正确的时间（HH:MM）");
      return;
    }
    const updatedTimestamp = new Date(
      `${datePart}T${`${hh}`.padStart(2, "0")}:${`${mm}`.padStart(2, "0")}:00`,
    ).toISOString();

    const updated: EventRecord = {
      ...evt,
      timestamp: updatedTimestamp,
      extras: { ...(evt.extras || {}), ...editingExtras },
    };

    setEvents((prev) => {
      const list = prev.map((e) => (e.id === updated.id ? updated : e));
      return list.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    });
    closeEdit();
  };

  const deleteEvent = (eventId: string) => {
    if (!window.confirm("确定删除这条记录吗？")) return;
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (editingEventId === eventId) closeEdit();
    if (swipedEventId === eventId) setSwipedEventId(null);
  };

  // 手动记录今日步数（网页无法直接读取健康 App）
  const handleSetTodaySteps = () => {
    const current = dayMetaMap[todayStr]?.steps;
    const input = window.prompt(
      "请输入今日步数",
      typeof current === "number" ? String(current) : "",
    );
    if (!input) return;
    const val = parseInt(input, 10);
    if (Number.isNaN(val) || val < 0) {
      alert("请输入正确的数字");
      return;
    }
    setDayMetaMap((prev) => {
      const updated: Record<string, DayMeta> = {
        ...prev,
        [todayStr]: { ...(prev[todayStr] || { date: todayStr }), steps: val },
      };
      localStorage.setItem(DAYMETA_KEY, JSON.stringify(Object.values(updated)));
      return updated;
    });
  };

  // 每日记录：选日期
  const openDatePicker = () => {
    const d = new Date(selectedDate);
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth() + 1);
    setIsDatePickerOpen(true);
  };
  const closeDatePicker = () => setIsDatePickerOpen(false);
  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsDatePickerOpen(false);
  };

  const renderMonthGrid = () => {
    const firstDay = new Date(pickerYear, pickerMonth - 1, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(pickerYear, pickerMonth, 0).getDate();
    const todayLocalStr = formatDate(new Date());

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push(<div key={`empty-${i}`} className="hk-calendar-cell empty" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(pickerYear, pickerMonth - 1, d);
      const dateStr = formatDate(date);
      const hasEvents = allDatesWithEvents.has(dateStr);
      const isSelected = selectedDate === dateStr;
      const isToday = todayLocalStr === dateStr;
      const disabled = !hasEvents;

      cells.push(
        <button
          key={dateStr}
          className={[
            "hk-calendar-cell",
            disabled ? "disabled" : "",
            isSelected ? "selected" : "",
            isToday ? "today" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={disabled}
          onClick={() => handleSelectDate(dateStr)}
        >
          {d}
        </button>,
      );
    }

    return cells;
  };

  // 每日分类汇总
  const dailySummaryByCategory = useMemo(() => {
    const summary = new Map<EventCategoryId, number>();
    selectedDayEvents.forEach((evt) => {
      const def = getEventDef(evt.eventDefId);
      if (!def) return;
      const catId = def.categoryId;
      summary.set(catId, (summary.get(catId) || 0) + 1);
    });
    return summary;
  }, [selectedDayEvents, eventDefs]);

  // ICS 导出
  const exportSelectedDayAsICS = () => {
    if (selectedDayEvents.length === 0) {
      alert("该日没有打卡记录，无法导出。");
      return;
    }

    const sorted = [...selectedDayEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//HealthKey//BodyLog//CN");

    const nowStamp = formatICSDateTimeLocal(new Date().toISOString());

    sorted.forEach((evt) => {
      const def = getEventDef(evt.eventDefId);
      if (!def) return;
      const cat = getCategoryById(def.categoryId);
      const start = new Date(evt.timestamp);
      const end = new Date(start.getTime() + 15 * 60 * 1000);

      const dtStart = formatICSDateTimeLocal(start.toISOString());
      const dtEnd = formatICSDateTimeLocal(end.toISOString());

      const extras = evt.extras || {};
      const parts: string[] = [];
      parts.push(`时间: ${formatTime(start)}`);
      parts.push(`分类: ${cat.label}`);

      if (typeof extras.satietyPercent === "number") {
        parts.push(`饱腹感: ${extras.satietyPercent}%`);
      }
      if (typeof extras.waterMl === "number") {
        parts.push(`喝水: ${extras.waterMl} ml`);
      }
      if (typeof extras.activityIntensity === "number") {
        parts.push(`运动强度: ${extras.activityIntensity}%`);
      }
      if (typeof extras.sleepDepth === "number") {
        parts.push(`睡眠深度: ${extras.sleepDepth}%`);
      }
      if (extras.urineColor) {
        parts.push(`排尿颜色: ${extras.urineColor}`);
      }
      if (extras.stoolColor) {
        parts.push(`排便颜色: ${extras.stoolColor}`);
      }
      if (extras.isAbnormal) {
        parts.push(`标记异常: 是`);
      }
      if (extras.note) {
        parts.push(`备注: ${extras.note}`);
      }

      const description = escapeICSText(parts.join("\n"));

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${evt.id}@healthkey`);
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      lines.push(`SUMMARY:${escapeICSText(def.label)}`);
      lines.push(`DESCRIPTION:${description}`);
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n");
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HealthKey_${selectedDate}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // UI 样式
  const rootStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f4f5f7",
    color: "#111",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 15,
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "4px 12px 96px 12px",
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    marginBottom: 12,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 8,
    color: "#222",
  };

  const tabBarStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    borderTop: "1px solid rgba(0,0,0,0.06)",
    backgroundColor: "#ffffff",
    padding: "12px 0 10px 0",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 10,
  };

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    padding: "10px 0",
    color: active ? "#1677ff" : "#666",
    fontWeight: active ? 700 : 500,
  });

  const pillButtonStyle = (color: string): React.CSSProperties => ({
    borderRadius: 999,
    border: `1px solid ${color}`,
    padding: "9px 14px",
    fontSize: 15,
    fontWeight: 500,
    color,
    background: "#ffffff",
    margin: "5px 8px 5px 0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  });

  const renderHeader = () => {
    return (
      <header
        style={{
          padding: "10px 12px 2px 12px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>
          HealthKey
        </div>
      </header>
    );
  };

  const renderEventButtons = () => {
    const grouped: Record<string, EventDefinition[]> = {};
    eventDefs.forEach((d) => {
      if (!grouped[d.categoryId]) grouped[d.categoryId] = [];
      grouped[d.categoryId].push(d);
    });

    return (
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={sectionTitleStyle}>打卡事件</div>
          <button
            onClick={() => setIsManageOpen(true)}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              padding: "6px 12px",
              backgroundColor: "#fff",
              fontSize: 13,
              color: "#555",
            }}
          >
            管理打卡项
          </button>
        </div>
        {categories.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 6 }}>
            <div
              style={{
                fontSize: 13,
                color: "#888",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: cat.color,
                  display: "inline-block",
                  marginRight: 6,
                }}
              />
              {cat.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {(grouped[cat.id] || []).map((d) => (
                <button
                  key={d.id}
                  style={pillButtonStyle(cat.color)}
                  onClick={() => handleLogEvent(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTodayList = () => {
    const holidayOrTerm = headerLunar.holiday || headerLunar.term;
    const dateLine =
      todayStr +
      " · " +
      todayWeekday +
      (holidayOrTerm ? ` · ${holidayOrTerm}` : "");

    return (
      <div style={{ ...cardStyle, paddingTop: 10 }}>
        {/* 今日概览（日期 + 农历 + 天气 + 步数） */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 8,
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#222" }}>
              {dateLine}
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              {headerLunar.lunarText}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#555" }}>
            <div>{getWeatherSummary(todayMeta?.weather)}</div>
            <div style={{ marginTop: 4 }}>
              步数：
              {typeof todayMeta?.steps === "number"
                ? `${todayMeta.steps} 步`
                : "未记录"}
              <button
                onClick={handleSetTodaySteps}
                style={{
                  marginLeft: 6,
                  border: "none",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 11,
                  backgroundColor: "#eef3ff",
                  color: "#1677ff",
                }}
              >
                记录步数
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            ...sectionTitleStyle,
            marginBottom: 4,
          }}
        >
          今日打卡记录
        </div>

        {todayEvents.length === 0 && (
          <div style={{ fontSize: 13, color: "#999", padding: "4px 0 4px 2px" }}>
            还没有打卡，先从一个最容易的事件开始吧。
          </div>
        )}

        {todayEvents.map((evt) => {
          const def = getEventDef(evt.eventDefId);
          if (!def) return null;
          const dt = new Date(evt.timestamp);
          const time = formatTime(dt);
          const cat = getCategoryById(def.categoryId);
          const extras = evt.extras || {};
          const catId = cat.id;
          const isDiet = catId === "diet";
          const isExcretion = catId === "excretion";

          const needsSatiety =
            isDiet &&
            ["breakfast", "lunch", "dinner", "snack", "fruit"].includes(def.id);
          const isWater = def.id === "water";
          const isExercise = def.id === "exercise";
          const isWake = def.id === "wake";

          const satiety = extras.satietyPercent ?? 50;
          const water = extras.waterMl ?? 500;
          const intensity = extras.activityIntensity ?? 50;
          const depth = extras.sleepDepth ?? 50;

          const isSwiped = swipedEventId === evt.id;

          const isPee = isExcretion && def.id === "pee";
          const isPoop = isExcretion && def.id === "poop";
          const excretionColor = isPee
            ? extras.urineColor || "#fff176"
            : isPoop
            ? extras.stoolColor || "#795548"
            : "#ffffff";

          return (
            <div
              key={evt.id}
              className="hk-today-row"
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  setTouchStartX(e.touches[0].clientX);
                }
              }}
              onTouchMove={(e) => {
                if (touchStartX == null || e.touches.length === 0) return;
                const deltaX = e.touches[0].clientX - touchStartX;
                if (deltaX < -40) {
                  setSwipedEventId(evt.id);
                } else if (deltaX > 40) {
                  setSwipedEventId(null);
                }
              }}
              onTouchEnd={() => {
                setTouchStartX(null);
              }}
            >
              <div
                className="hk-today-row-delete"
                onClick={() => deleteEvent(evt.id)}
              >
                删除
              </div>
              <div
                className="hk-today-row-content"
                style={{
                  padding: "8px 4px",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                  transform: isSwiped ? "translateX(-64px)" : "translateX(0)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                  onClick={() => openEditEvent(evt.id)}
                >
                  <span
                    style={{
                      fontSize: 13,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${cat.color}`,
                      backgroundColor: "#fff",
                      color: cat.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {def.label}
                  </span>

                  <div style={{ flex: 1 }} />

                  <span
                    style={{
                      fontSize: 13,
                      color: "#555",
                      minWidth: 52,
                      textAlign: "right",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwipedEventId(isSwiped ? null : evt.id);
                    }}
                  >
                    {time}
                  </span>
                </div>

                {extras.note && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#777",
                      marginLeft: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginBottom: 4,
                    }}
                  >
                    {extras.note}
                  </div>
                )}

                {(needsSatiety ||
                  isWater ||
                  isExercise ||
                  isWake ||
                  isExcretion) && (
                  <div
                    style={{
                      marginLeft: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {needsSatiety && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#555",
                            minWidth: 54,
                          }}
                        >
                          饱腹感
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#333",
                            width: 46,
                            textAlign: "right",
                          }}
                        >
                          {satiety}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={satiety}
                          onChange={(e) =>
                            updateEventExtras(evt.id, {
                              satietyPercent: parseInt(e.target.value, 10),
                            })
                          }
                          style={{ flex: 1 }}
                        />
                      </div>
                    )}

                    {isWater && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#555",
                            minWidth: 54,
                          }}
                        >
                          喝水量
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#333",
                            width: 64,
                            textAlign: "right",
                          }}
                        >
                          {water} ml
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={1000}
                          step={50}
                          value={water}
                          onChange={(e) =>
                            updateEventExtras(evt.id, {
                              waterMl: parseInt(e.target.value, 10),
                            })
                          }
                          style={{ flex: 1 }}
                        />
                      </div>
                    )}

                    {isExercise && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#555",
                            minWidth: 54,
                          }}
                        >
                          运动强度
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#333",
                            width: 46,
                            textAlign: "right",
                          }}
                        >
                          {intensity}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={intensity}
                          onChange={(e) =>
                            updateEventExtras(evt.id, {
                              activityIntensity: parseInt(e.target.value, 10),
                            })
                          }
                          style={{ flex: 1 }}
                        />
                      </div>
                    )}

                    {isWake && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#555",
                            minWidth: 54,
                          }}
                        >
                          睡眠深度
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#333",
                            width: 46,
                            textAlign: "right",
                          }}
                        >
                          {depth}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={depth}
                          onChange={(e) =>
                            updateEventExtras(evt.id, {
                              sleepDepth: parseInt(e.target.value, 10),
                            })
                          }
                          style={{ flex: 1 }}
                        />
                      </div>
                    )}

                    {isExcretion && (isPee || isPoop) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        <span style={{ minWidth: 54 }}>
                          {isPee ? "排尿" : "排便"}
                        </span>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: "1px solid rgba(0,0,0,0.1)",
                            backgroundColor: excretionColor,
                          }}
                        />
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={extras.isAbnormal ?? false}
                            onChange={(e) =>
                              updateEventExtras(evt.id, {
                                isAbnormal: e.target.checked,
                              })
                            }
                          />
                          <span>异常</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDailySummary = () => {
    const d = new Date(selectedDate);
    const weekday = weekdayText[d.getDay()];

    const isToday = selectedDate === todayStr;
    const meta = isToday ? selectedDayMeta || todayMeta : selectedDayMeta;

    return (
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>当日概览</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
          日期：{selectedDate} · {weekday}
        </div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
          步数：
          {typeof meta?.steps === "number" ? `${meta.steps} 步` : "未记录"}
        </div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          天气：
          {isToday
            ? getWeatherSummary(meta?.weather)
            : "当前仅支持显示今日天气，其他日期暂不记录天气历史"}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
            marginTop: 4,
          }}
        >
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                borderRadius: 12,
                padding: "8px 10px",
                backgroundColor: "rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: cat.color,
                    display: "inline-block",
                  }}
                />
                {cat.label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#222" }}>
                {dailySummaryByCategory.get(cat.id) || 0} 次
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDailyList = () => {
    return (
      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, marginBottom: 6 }}>当日详细记录</div>
        {selectedDayEvents.length === 0 && (
          <div style={{ fontSize: 13, color: "#999" }}>这一天没有任何记录。</div>
        )}
        {selectedDayEvents
          .slice()
          .sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          )
          .map((evt) => {
            const def = getEventDef(evt.eventDefId);
            if (!def) return null;
            const dt = new Date(evt.timestamp);
            const time = formatTime(dt);
            const extras = evt.extras || {};

            return (
              <div
                key={evt.id}
                style={{
                  padding: "8px 6px",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                  cursor: "pointer",
                }}
                onClick={() => openEditEvent(evt.id)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#222" }}>
                    {def.label}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>{time}</div>
                </div>
                <div style={{ marginTop: 4 }}>
                  {extras.urineColor && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      排尿颜色：{" "}
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          border: "1px solid rgba(0,0,0,0.1)",
                          backgroundColor: extras.urineColor,
                          marginRight: 4,
                          verticalAlign: "middle",
                        }}
                      />
                    </div>
                  )}
                  {extras.stoolColor && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      排便颜色：{" "}
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          border: "1px solid rgba(0,0,0,0.1)",
                          backgroundColor: extras.stoolColor,
                          marginRight: 4,
                          verticalAlign: "middle",
                        }}
                      />
                    </div>
                  )}
                  {typeof extras.satietyPercent === "number" && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      饱腹感：{extras.satietyPercent}%
                    </div>
                  )}
                  {typeof extras.waterMl === "number" && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      喝水：{extras.waterMl} ml
                    </div>
                  )}
                  {typeof extras.activityIntensity === "number" && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      运动强度：{extras.activityIntensity}%
                    </div>
                  )}
                  {typeof extras.sleepDepth === "number" && (
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>
                      睡眠深度：{extras.sleepDepth}%
                    </div>
                  )}
                  {extras.isAbnormal && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#d63031",
                        marginBottom: 2,
                        fontWeight: 500,
                      }}
                    >
                      标记为异常
                    </div>
                  )}
                  {extras.note && (
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      备注：{extras.note}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  const renderDatePickerOverlay = () => {
    if (!isDatePickerOpen) return null;

    const yearOptions = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      yearOptions.push(
        <option key={y} value={y}>
          {y} 年
        </option>,
      );
    }

    return (
      <div className="hk-overlay">
        <div className="hk-overlay-backdrop" onClick={closeDatePicker} />
        <div className="hk-overlay-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>选择日期</div>
            <button
              onClick={closeDatePicker}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "#666",
              }}
            >
              关闭
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <select
              value={pickerYear}
              onChange={(e) => setPickerYear(parseInt(e.target.value, 10))}
              style={{ flex: 1, padding: 4, fontSize: 12 }}
            >
              {yearOptions}
            </select>
            <select
              value={pickerMonth}
              onChange={(e) => setPickerMonth(parseInt(e.target.value, 10))}
              style={{ flex: 1, padding: 4, fontSize: 12 }}
            >
              {Array.from({ length: 12 }).map((_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {idx + 1} 月
                </option>
              ))}
            </select>
          </div>
          <div className="hk-calendar-week">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <div key={w} className="hk-calendar-week-cell">
                {w}
              </div>
            ))}
          </div>
          <div className="hk-calendar-grid">{renderMonthGrid()}</div>
        </div>
      </div>
    );
  };

  const renderEditPanel = () => {
    if (!editingEventId) return null;
    const evt = events.find((e) => e.id === editingEventId);
    if (!evt) return null;
    const def = getEventDef(evt.eventDefId);
    if (!def) return null;

    const extras = editingExtras;
    const cat = getCategoryById(def.categoryId);
    const isExcretion = cat.id === "excretion";

    const isPee = isExcretion && def.id === "pee";
    const isPoop = isExcretion && def.id === "poop";

    return (
      <div className="hk-overlay">
        <div className="hk-overlay-backdrop" onClick={closeEdit} />
        <div className="hk-overlay-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              编辑 · {def.label}
            </div>
            <button
              onClick={closeEdit}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "#666",
              }}
            >
              关闭
            </button>
          </div>

          <div style={{ marginBottom: 8, fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}>时间</div>
            <input
              type="time"
              value={editingTime}
              onChange={(e) => setEditingTime(e.target.value)}
              style={{ width: "100%", padding: 4, fontSize: 13 }}
            />
          </div>

          {isExcretion && (
            <div style={{ marginBottom: 10, fontSize: 12 }}>
              {isPee && (
                <>
                  <div style={{ marginBottom: 4 }}>排尿颜色</div>
                  <input
                    type="color"
                    value={extras.urineColor || "#fff176"}
                    onChange={(e) =>
                      setEditingExtras((prev) => ({
                        ...prev,
                        urineColor: e.target.value,
                      }))
                    }
                    style={{
                      width: 48,
                      height: 28,
                      padding: 0,
                      border: "none",
                    }}
                  />
                </>
              )}
              {isPoop && (
                <>
                  <div style={{ marginBottom: 4 }}>排便颜色</div>
                  <input
                    type="color"
                    value={extras.stoolColor || "#795548"}
                    onChange={(e) =>
                      setEditingExtras((prev) => ({
                        ...prev,
                        stoolColor: e.target.value,
                      }))
                    }
                    style={{
                      width: 48,
                      height: 28,
                      padding: 0,
                      border: "none",
                    }}
                  />
                </>
              )}
              <div style={{ marginTop: 6 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#555",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={extras.isAbnormal ?? false}
                    onChange={(e) =>
                      setEditingExtras((prev) => ({
                        ...prev,
                        isAbnormal: e.target.checked,
                      }))
                    }
                  />
                  <span>标记异常</span>
                </label>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12, fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}>备注</div>
            <textarea
              rows={3}
              value={extras.note ?? ""}
              onChange={(e) =>
                setEditingExtras((prev) => ({
                  ...prev,
                  note: e.target.value || undefined,
                }))
              }
              placeholder="可以记录更详细的感受和情况"
              style={{
                width: "100%",
                padding: 4,
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              onClick={() => deleteEvent(editingEventId)}
              style={{
                border: "none",
                backgroundColor: "#ffe5e5",
                color: "#c0392b",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12,
              }}
            >
              删除记录
            </button>
            <button
              onClick={saveEdit}
              style={{
                border: "none",
                backgroundColor: "#1677ff",
                color: "#fff",
                borderRadius: 999,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 管理打卡项
  const renderManagePanel = () => {
    if (!isManageOpen) return null;

    const updateCategory = (id: string, patch: Partial<Category>) => {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    };

    const updateEventDef = (id: string, patch: Partial<EventDefinition>) => {
      setEventDefs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      );
    };

    const addEventDef = () => {
      const baseCat = categories[0]?.id || "diet";
      const newDef: EventDefinition = {
        id: `custom_${Date.now()}`,
        label: "新打卡项",
        categoryId: baseCat,
      };
      setEventDefs((prev) => [...prev, newDef]);
    };

    const removeEventDef = (id: string) => {
      if (BUILTIN_EVENT_IDS.has(id)) {
        alert("内置打卡项暂不支持删除，可以修改名称和分类。");
        return;
      }
      setEventDefs((prev) => prev.filter((d) => d.id !== id));
    };

    const addCategory = () => {
      const newCat: Category = {
        id: `cat_${Date.now()}`,
        label: "新分类",
        color: "#10ac84",
      };
      setCategories((prev) => [...prev, newCat]);
    };

    return (
      <div className="hk-overlay">
        <div
          className="hk-overlay-backdrop"
          onClick={() => setIsManageOpen(false)}
        />
        <div className="hk-overlay-panel" style={{ maxHeight: "85vh" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>管理打卡项</div>
            <button
              onClick={() => setIsManageOpen(false)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "#666",
              }}
            >
              关闭
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 4,
              marginRight: -4,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                分类
              </div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
                可以新增和调整每个分类的名称与颜色。
              </div>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) =>
                      updateCategory(cat.id, { label: e.target.value })
                    }
                    style={{
                      flex: 1,
                      padding: 4,
                      fontSize: 12,
                    }}
                  />
                  <input
                    type="color"
                    value={cat.color}
                    onChange={(e) =>
                      updateCategory(cat.id, { color: e.target.value })
                    }
                    style={{
                      width: 36,
                      height: 24,
                      border: "none",
                      padding: 0,
                    }}
                  />
                </div>
              ))}
              <button
                onClick={addCategory}
                style={{
                  marginTop: 4,
                  borderRadius: 999,
                  border: "1px dashed rgba(0,0,0,0.2)",
                  padding: "4px 10px",
                  backgroundColor: "#fff",
                  fontSize: 12,
                  color: "#1677ff",
                }}
              >
                + 新增分类
              </button>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                打卡事件
              </div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
                内置事件可改名和分类；自定义事件可以删除。
              </div>
              {eventDefs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <input
                    type="text"
                    value={d.label}
                    onChange={(e) =>
                      updateEventDef(d.id, { label: e.target.value })
                    }
                    style={{ flex: 1.4, padding: 4, fontSize: 12 }}
                  />
                  <select
                    value={d.categoryId}
                    onChange={(e) =>
                      updateEventDef(d.id, { categoryId: e.target.value })
                    }
                    style={{ flex: 1, padding: 4, fontSize: 12 }}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  {!BUILTIN_EVENT_IDS.has(d.id) && (
                    <button
                      onClick={() => removeEventDef(d.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#d63031",
                        fontSize: 11,
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addEventDef}
                style={{
                  marginTop: 4,
                  borderRadius: 999,
                  border: "1px dashed rgba(0,0,0,0.2)",
                  padding: "4px 10px",
                  backgroundColor: "#fff",
                  fontSize: 12,
                  color: "#1677ff",
                }}
              >
                + 新增打卡项
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={rootStyle}>
      {renderHeader()}
      <main style={mainStyle}>
        {activeTab === "log" && (
          <>
            {renderEventButtons()}
            {renderTodayList()}
          </>
        )}
        {activeTab === "daily" && (
          <>
            <div style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <div style={sectionTitleStyle}>每日记录</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <button
                    onClick={exportSelectedDayAsICS}
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.12)",
                      padding: "6px 10px",
                      backgroundColor: "#fff",
                      fontSize: 12,
                      color: "#1677ff",
                      whiteSpace: "nowrap",
                    }}
                  >
                    导出到日历
                  </button>
                  <button
                    onClick={openDatePicker}
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.12)",
                      padding: "6px 10px",
                      backgroundColor: "#fff",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "#333",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span role="img" aria-label="calendar">
                      📅
                    </span>
                    {selectedDate}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#777" }}>
                仅可选择有记录的日期；导出为日历后，可在系统日历中查看当日打卡。
              </div>
            </div>
            {renderDailySummary()}
            {renderDailyList()}
          </>
        )}
      </main>

      <footer style={tabBarStyle}>
        <button
          style={tabButtonStyle(activeTab === "log")}
          onClick={() => setActiveTab("log")}
        >
          打卡
        </button>
        <button
          style={tabButtonStyle(activeTab === "daily")}
          onClick={() => setActiveTab("daily")}
        >
          每日记录
        </button>
      </footer>

      {renderDatePickerOverlay()}
      {renderEditPanel()}
      {renderManagePanel()}

      <style>{`
        body {
          background-color: #f4f5f7 !important;
          color: #111 !important;
        }
        .hk-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .hk-overlay-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.35);
        }
        .hk-overlay-panel {
          position: relative;
          width: min(420px, 92vw);
          max-height: 80vh;
          background: #ffffff;
          border-radius: 16px;
          padding: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .hk-calendar-week {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          margin-bottom: 4px;
        }
        .hk-calendar-week-cell {
          text-align: center;
          font-size: 11px;
          color: #888;
          padding: 2px 0;
        }
        .hk-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 2px;
        }
        .hk-calendar-cell {
          border: none;
          background: #f1f2f6;
          border-radius: 999px;
          font-size: 12px;
          padding: 4px 0;
          text-align: center;
          color: #333;
        }
        .hk-calendar-cell.disabled {
          opacity: 0.3;
          background: #f5f6fa;
          color: #bbb;
        }
        .hk-calendar-cell.selected {
          background: #1677ff;
          color: #fff;
          font-weight: 600;
        }
        .hk-calendar-cell.today:not(.selected) {
          border: 1px solid #1677ff;
        }
        .hk-calendar-cell.empty {
          background: transparent;
        }

        .hk-today-row {
          position: relative;
          overflow: hidden;
        }
        .hk-today-row-delete {
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          width: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #ffe5e5;
          color: #c0392b;
          font-size: 12px;
        }
        .hk-today-row-content {
          position: relative;
          background-color: #ffffff;
          transition: transform 0.18s ease-out;
        }
      `}</style>
    </div>
  );
};

export default App;
