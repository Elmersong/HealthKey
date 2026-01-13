import React, { useEffect, useState } from "react";

// ========== 类型定义 ==========

interface CategoryDef {
  id: string;
  label: string;
  colorBg: string;
  colorText: string;
  builtIn?: boolean;
}

interface EventDefinition {
  id: string;
  label: string;
  categoryId: string;
  builtIn?: boolean;
}

interface EventExtra {
  satiety?: number;                 // 饱腹感（0-100 百分比）
  waterMl?: number;                 // 喝水毫升数
  excretionColor?: number | string; // 排泄颜色：旧版数值 or 新版颜色字符串
  abnormal?: boolean;               // 是否异常
}

interface LogEvent {
  id: string;
  eventId: string;
  startIso: string;
  endIso?: string;
  note?: string;
  extra?: EventExtra;
}

interface DayExtra {
  date: string;
  steps?: number;
  cyclePhase?: string;
  weather?: {
    temperature: number;
    humidity?: number;
    pressure?: number;
    description?: string;
  };
}

type ActiveTab = "log" | "daily";

interface RenderListOptions {
  showNotes: boolean;
  showCategory: boolean;
  sliderMode: "none" | "interactive" | "readonly";
}

interface SummaryLine {
  categoryId: string;
  categoryLabel: string;
  text: string;
}

// ========== 常量 ==========

const CATEGORY_STORAGE_KEY = "healthkey_categories_v1";
const EVENT_DEFS_STORAGE_KEY = "healthkey_event_defs_v2";
const EVENTS_STORAGE_KEY = "healthkey_events_v2";
const DAY_EXTRA_STORAGE_KEY = "healthkey_day_extra_v1";

const DEFAULT_LATITUDE = 31.23;
const DEFAULT_LONGITUDE = 121.47;

const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: "diet",
    label: "饮食 & 摄入",
    colorBg: "#fff3e0",
    colorText: "#e65100",
    builtIn: true,
  },
  {
    id: "excretion",
    label: "排泄",
    colorBg: "#e8f5e9",
    colorText: "#1b5e20",
    builtIn: true,
  },
  {
    id: "sleep",
    label: "睡眠",
    colorBg: "#ede7f6",
    colorText: "#4527a0",
    builtIn: true,
  },
  {
    id: "activity",
    label: "活动 & 情绪",
    colorBg: "#e3f2fd",
    colorText: "#1565c0",
    builtIn: true,
  },
];

const DEFAULT_EVENT_DEFS: EventDefinition[] = [
  // 饮食 & 摄入
  { id: "breakfast", label: "早餐", categoryId: "diet", builtIn: true },
  { id: "lunch", label: "午餐", categoryId: "diet", builtIn: true },
  { id: "dinner", label: "晚餐", categoryId: "diet", builtIn: true },
  { id: "snack", label: "零食", categoryId: "diet", builtIn: true },
  { id: "water", label: "喝水", categoryId: "diet", builtIn: true },
  { id: "supplement", label: "营养品", categoryId: "diet", builtIn: true },

  // 排泄
  { id: "poop", label: "排便", categoryId: "excretion", builtIn: true },
  { id: "pee", label: "排尿", categoryId: "excretion", builtIn: true },

  // 睡眠
  { id: "sleepStart", label: "入睡", categoryId: "sleep", builtIn: true },
  { id: "wakeUp", label: "醒来", categoryId: "sleep", builtIn: true },
  { id: "getUp", label: "起床", categoryId: "sleep", builtIn: true },

  // 活动 & 情绪
  { id: "exercise", label: "运动", categoryId: "activity", builtIn: true },
  { id: "laugh", label: "大笑", categoryId: "activity", builtIn: true },
  { id: "sex", label: "性爱", categoryId: "activity", builtIn: true },
];

// ========== 工具函数 ==========

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateStringFromIso(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getLunarAndFestivalInfo(_dateStr: string): {
  lunar: string;
  festival: string;
} {
  return {
    lunar: "农历功能待接入",
    festival: "节气/节假日功能待接入",
  };
}

function getDurationText(startIso: string, endIso?: string): string | null {
  if (!endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return null;
  const diffMs = end - start;
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours === 0 && minutes < 1) return "<1 分钟";
  if (hours === 0) return `${minutes} 分钟`;
  if (remain === 0) return `${hours} 小时`;
  return `${hours} 小时 ${remain} 分钟`;
}

function getTimeHHMM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function setTimeForIso(originalIso: string, timeHHMM: string): string {
  const d = new Date(originalIso);
  const [hh, mm] = timeHHMM.split(":");
  if (hh != null && mm != null) {
    d.setHours(Number(hh));
    d.setMinutes(Number(mm));
    d.setSeconds(0);
    d.setMilliseconds(0);
  }
  return d.toISOString();
}

function autoTextColorForBg(bg: string): string {
  let hex = bg.replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length !== 6) return "#424242";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160 ? "#424242" : "#ffffff";
}

function getNotePlaceholder(eventId: string, def?: EventDefinition): string {
  if (!def) return "记录与你此刻状态相关的关键细节和感受";

  switch (eventId) {
    case "breakfast":
    case "lunch":
    case "dinner":
    case "snack":
      return "记录吃了什么、分量、口味、饱腹感（0%-100%）、是否吃得太快等";
    case "water":
      return "记录这次大概喝了多少水（毫升）、是否口渴、补水是否及时等";
    case "supplement":
      return "记录服用了什么营养品/药物、剂量、原因、是否按计划服用等";
    case "poop":
      return "记录形状（成形/稀/便秘）、颜色、气味、费力程度、是否有不适等";
    case "pee":
      return "记录颜色（清澈/偏黄/深黄）、量、是否有异味或刺痛等";
    case "sleepStart":
      return "记录入睡前的情绪/身体状态、是否难以入睡、上床时间等";
    case "wakeUp":
      return "记录醒来的方式（自然醒/闹钟）、梦境印象、醒来时精神状态等";
    case "getUp":
      return "记录起床时间、起床难度（0-10）、是否赖床、起床后的身体感觉等";
    case "exercise":
      return "记录运动类型（步行/跑步/力量训练等）、时长、强度、心率/出汗情况等";
    case "laugh":
      return "记录因为什么大笑、当时的氛围、笑前后情绪变化等";
    case "sex":
      return "记录安全措施、身心感受、是否有不适、情绪状态等";
    default:
      return `记录与「${def.label}」相关的关键细节，例如发生的场景、强度、感受等`;
  }
}

// 旧版 0-100 数值映射成颜色（浅黄 -> 深棕）
function getExcretionColorFromNumber(value: number | undefined): string {
  if (value == null) return "#c8e6c9";
  const v = Math.max(0, Math.min(100, value)) / 100;
  const start = { r: 255, g: 249, b: 196 }; // 浅黄
  const end = { r: 93, g: 64, b: 55 };      // 深棕
  const r = Math.round(start.r + (end.r - start.r) * v);
  const g = Math.round(start.g + (end.g - start.g) * v);
  const b = Math.round(start.b + (end.b - start.b) * v);
  return `rgb(${r}, ${g}, ${b})`;
}

function getExcretionColorDisplay(extra?: EventExtra): string | null {
  if (!extra) return null;
  const c = extra.excretionColor;
  if (typeof c === "string" && c.trim() !== "") return c;
  if (typeof c === "number") return getExcretionColorFromNumber(c);
  return null;
}

async function fetchWeather(): Promise<{
  temperature: number;
  humidity?: number;
  pressure?: number;
  description: string;
} | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LATITUDE}&longitude=${DEFAULT_LONGITUDE}&current=temperature_2m,relative_humidity_2m,pressure_msl,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const current = data.current;
    if (!current) return null;

    const temperature = current.temperature_2m as number;
    const humidity = current.relative_humidity_2m as number | undefined;
    const pressure = current.pressure_msl as number | undefined;
    const code = current.weather_code as number | undefined;
    const description = code != null ? mapWeatherCodeToText(code) : "未知天气";

    return { temperature, humidity, pressure, description };
  } catch {
    return null;
  }
}

function mapWeatherCodeToText(code: number): string {
  if (code === 0) return "晴";
  if (code === 1 || code === 2 || code === 3) return "多云";
  if (code >= 45 && code <= 48) return "有雾";
  if (code >= 51 && code <= 67) return "细雨";
  if (code >= 71 && code <= 77) return "降雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 95) return "雷雨";
  return "未知天气";
}

// 按分类汇总：每个分类一行
function getSummaryByCategory(
  events: LogEvent[],
  eventDefs: EventDefinition[],
  categories: CategoryDef[]
): SummaryLine[] {
  if (events.length === 0) return [];

  const defMap = new Map<string, EventDefinition>();
  eventDefs.forEach((d) => defMap.set(d.id, d));

  const catMap = new Map<string, CategoryDef>();
  categories.forEach((c) => catMap.set(c.id, c));

  const resultMap = new Map<string, Map<string, number>>();

  for (const e of events) {
    const def = defMap.get(e.eventId);
    const catId = def?.categoryId ?? "other";

    if (!resultMap.has(catId)) {
      resultMap.set(catId, new Map<string, number>());
    }
    const label = def?.label ?? "未知事件";
    const inner = resultMap.get(catId)!;
    inner.set(label, (inner.get(label) ?? 0) + 1);
  }

  const lines: SummaryLine[] = [];
  for (const [catId, inner] of resultMap.entries()) {
    const catLabel = catMap.get(catId)?.label ?? "其他";
    const parts: string[] = [];
    inner.forEach((count, label) => {
      parts.push(`${label} ${count} 次`);
    });
    if (parts.length > 0) {
      lines.push({
        categoryId: catId,
        categoryLabel: catLabel,
        text: parts.join(" · "),
      });
    }
  }
  // 分类顺序按 categories 顺序排
  lines.sort((a, b) => {
    const ai = categories.findIndex((c) => c.id === a.categoryId);
    const bi = categories.findIndex((c) => c.id === b.categoryId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return lines;
}

// ========== 主组件 ==========

const App: React.FC = () => {
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [eventDefs, setEventDefs] = useState<EventDefinition[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [dayExtra, setDayExtra] = useState<DayExtra | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("log");
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>("");
  const [editEndTime, setEditEndTime] = useState<string>("");

  const [editExcretionColor, setEditExcretionColor] = useState<string | null>(
    null
  );
  const [editAbnormal, setEditAbnormal] = useState<boolean>(false);

  const [showManageModal, setShowManageModal] = useState(false);
  const [manageDraftCategories, setManageDraftCategories] =
    useState<CategoryDef[]>([]);
  const [manageDraftDefs, setManageDraftDefs] = useState<EventDefinition[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarYear, setCalendarYear] = useState<number>(
    new Date().getFullYear()
  );
  const [calendarMonth, setCalendarMonth] = useState<number>(
    new Date().getMonth()
  );
  const [showYearMonthSelector, setShowYearMonthSelector] =
    useState<boolean>(false);

  const [lastTap, setLastTap] = useState<{
    eventId: string;
    time: number;
    logEventId: string;
  } | null>(null);

  const [swipedEventId, setSwipedEventId] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  // ========== 初始化 分类 ==========

  useEffect(() => {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CategoryDef[];
        setCategories(parsed);
        return;
      } catch {
        // ignore
      }
    }
    setCategories(DEFAULT_CATEGORIES);
  }, []);

  // ========== 初始化 事件定义 ==========

  useEffect(() => {
    const raw = localStorage.getItem(EVENT_DEFS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as EventDefinition[];
        setEventDefs(parsed);
        return;
      } catch {
        // ignore
      }
    }
    setEventDefs(DEFAULT_EVENT_DEFS);
  }, []);

  // ========== 初始化 打卡记录 ==========

  useEffect(() => {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const migrated: LogEvent[] = parsed.map((e: any) => {
        if (e.startIso) {
          return {
            id: e.id ?? crypto.randomUUID(),
            eventId: e.eventId ?? e.eventType ?? "unknown",
            startIso: e.startIso,
            endIso: e.endIso,
            note: e.note,
            extra: e.extra,
          };
        }
        const startIso: string =
          e.startIso ||
          e.timestamp ||
          e.start ||
          new Date().toISOString();
        return {
          id: e.id ?? crypto.randomUUID(),
          eventId: e.eventId ?? e.type ?? "unknown",
          startIso,
          endIso: e.endIso ?? e.endTimestamp,
          note: e.note,
          extra: e.extra,
        };
      });

      setEvents(migrated);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  // ========== 初始化 每日扩展数据 ==========

  useEffect(() => {
    const today = getTodayDateString();
    const raw = localStorage.getItem(DAY_EXTRA_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DayExtra;
        if (parsed.date === today) {
          setDayExtra(parsed);
          return;
        }
      } catch {
        // ignore
      }
    }
    setDayExtra({ date: today });
  }, []);

  useEffect(() => {
    if (!dayExtra) return;

    const updated: DayExtra = { ...dayExtra };
    let changed = false;

    const stepsParam = getQueryParam("steps");
    if (stepsParam) {
      const steps = Number(stepsParam);
      if (Number.isFinite(steps) && steps > 0) {
        updated.steps = steps;
        changed = true;
      }
    }

    const cycleParam = getQueryParam("cycle");
    if (cycleParam) {
      updated.cyclePhase = decodeURIComponent(cycleParam);
      changed = true;
    }

    if (changed) {
      setDayExtra(updated);
      localStorage.setItem(DAY_EXTRA_STORAGE_KEY, JSON.stringify(updated));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [dayExtra]);

  useEffect(() => {
    if (!dayExtra) return;
    if (dayExtra.weather) return;

    let cancelled = false;

    const load = async () => {
      const result = await fetchWeather();
      if (!result || cancelled) return;

      const updated: DayExtra = {
        ...dayExtra,
        weather: {
          temperature: result.temperature,
          humidity: result.humidity,
          pressure: result.pressure,
          description: result.description,
        },
      };
      setDayExtra(updated);
      localStorage.setItem(DAY_EXTRA_STORAGE_KEY, JSON.stringify(updated));
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [dayExtra]);

  useEffect(() => {
    if (!showDatePicker) return;
    const d = new Date(selectedDate + "T00:00:00");
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
    setShowYearMonthSelector(false);
  }, [showDatePicker, selectedDate]);

  // ========== 查找函数 ==========

  const getCategory = (id: string): CategoryDef | undefined =>
    categories.find((c) => c.id === id);

  const getEventDef = (id: string): EventDefinition | undefined =>
    eventDefs.find((e) => e.id === id);

  const getExtraForDate = (dateStr: string): DayExtra | null => {
    if (dayExtra && dayExtra.date === dateStr) return dayExtra;
    return null;
  };

  // ========== 过滤 & 排序 ==========

  const eventsForDate = (dateStr: string): LogEvent[] =>
    events
      .filter((e) => getDateStringFromIso(e.startIso) === dateStr)
      .sort(
        (a, b) =>
          new Date(b.startIso).getTime() - new Date(a.startIso).getTime()
      );

  const todayEvents = eventsForDate(todayStr);
  const selectedDateEvents = eventsForDate(selectedDate);

  const allDatesWithEvents: string[] = Array.from(
    new Set(events.map((e) => getDateStringFromIso(e.startIso)))
  ).sort((a, b) => (a < b ? 1 : -1));
  const datesWithEventsSet = new Set(allDatesWithEvents);

  // ========== 打卡逻辑：单击 / 双击（含 90 分钟限制） ==========

  const handleEventButtonTap = (eventId: string) => {
    const now = Date.now();

    // 双击判定（时间间隔 < 400ms，且同一事件类型）
    if (lastTap && lastTap.eventId === eventId && now - lastTap.time < 400) {
      const logId = lastTap.logEventId;
      const target = events.find((e) => e.id === logId);
      if (!target || target.endIso) {
        setLastTap(null);
        return;
      }
      const startTime = new Date(target.startIso).getTime();
      const diff = now - startTime;
      const limitMs = 90 * 60 * 1000;

      if (diff > limitMs) {
        window.alert(
          "距离上次开始时间已超过 90 分钟，请在记录详情中手动设置结束时间。"
        );
        setLastTap(null);
        return;
      }

      // 在 90 分钟内：补上结束时间
      const nowIso = new Date().toISOString();
      setEvents((prev) =>
        prev.map((e) =>
          e.id === logId ? { ...e, endIso: nowIso } : e
        )
      );
      setLastTap(null);
      return;
    }

    // 单击：新增开始记录
    const nowIso = new Date().toISOString();
    const newEvent: LogEvent = {
      id: crypto.randomUUID(),
      eventId,
      startIso: nowIso,
    };
    setEvents((prev) => [newEvent, ...prev]);
    setLastTap({ eventId, time: now, logEventId: newEvent.id });
  };

  const setEndTimeNow = (eventId: string) => {
    const nowIso = new Date().toISOString();
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, endIso: nowIso } : e
      )
    );
  };

  const deleteEvent = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (editingEventId === eventId) {
      setEditingEventId(null);
      setEditingNote("");
      setEditStartTime("");
      setEditEndTime("");
      setEditExcretionColor(null);
      setEditAbnormal(false);
    }
    if (swipedEventId === eventId) {
      setSwipedEventId(null);
    }
  };

  // ========== 记录详情编辑 ==========

  const openEditNote = (event: LogEvent) => {
    setEditingEventId(event.id);
    setEditingNote(event.note ?? "");
    setEditStartTime(getTimeHHMM(event.startIso));
    setEditEndTime(event.endIso ? getTimeHHMM(event.endIso) : "");

    if (event.eventId === "poop" || event.eventId === "pee") {
      const extra = event.extra ?? {};
      const colorDisplay = getExcretionColorDisplay(extra);
      let initialColor = colorDisplay;
      if (!initialColor) {
        initialColor =
          event.eventId === "pee" ? "#fff59d" : "#8d6e63";
      }
      setEditExcretionColor(initialColor);
      setEditAbnormal(extra.abnormal ?? false);
    } else {
      setEditExcretionColor(null);
      setEditAbnormal(false);
    }
  };

  const cancelEdit = () => {
    setEditingEventId(null);
    setEditingNote("");
    setEditStartTime("");
    setEditEndTime("");
    setEditExcretionColor(null);
    setEditAbnormal(false);
  };

  const saveNote = () => {
    if (!editingEventId) return;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== editingEventId) return e;

        const startIso = editStartTime
          ? setTimeForIso(e.startIso, editStartTime)
          : e.startIso;
        let endIso: string | undefined = e.endIso;
        if (editEndTime && editEndTime.trim() !== "") {
          endIso = setTimeForIso(e.startIso, editEndTime);
        } else if (!editEndTime) {
          endIso = undefined;
        }

        let newExtra: EventExtra | undefined = e.extra ?? {};
        if (e.eventId === "poop" || e.eventId === "pee") {
          newExtra = {
            ...(e.extra ?? {}),
            excretionColor: editExcretionColor ?? e.extra?.excretionColor,
            abnormal: editAbnormal,
          };
        }

        return {
          ...e,
          startIso,
          endIso,
          note: editingNote.trim(),
          extra: newExtra,
        };
      })
    );
    setEditingEventId(null);
    setEditingNote("");
    setEditStartTime("");
    setEditEndTime("");
    setEditExcretionColor(null);
    setEditAbnormal(false);
  };

  const editingEvent =
    editingEventId != null
      ? events.find((e) => e.id === editingEventId) ?? null
      : null;
  const editingDef = editingEvent ? getEventDef(editingEvent.eventId) : undefined;

  // ========== 打卡项管理 ==========

  const openManageEvents = () => {
    setManageDraftCategories(categories.map((c) => ({ ...c })));
    setManageDraftDefs(eventDefs.map((d) => ({ ...d })));
    setShowManageModal(true);
  };

  const saveManageEvents = () => {
    setCategories(manageDraftCategories);
    localStorage.setItem(
      CATEGORY_STORAGE_KEY,
      JSON.stringify(manageDraftCategories)
    );

    const validCatIds = new Set(manageDraftCategories.map((c) => c.id));
    const fixedDefs = manageDraftDefs.map((d) =>
      validCatIds.has(d.categoryId)
        ? d
        : { ...d, categoryId: manageDraftCategories[0]?.id ?? "activity" }
    );
    setEventDefs(fixedDefs);
    localStorage.setItem(EVENT_DEFS_STORAGE_KEY, JSON.stringify(fixedDefs));
    setShowManageModal(false);
  };

  const addCustomEventDef = () => {
    const fallbackCategoryId =
      manageDraftCategories[0]?.id ?? "activity";
    const newDef: EventDefinition = {
      id: `custom-event-${Date.now()}`,
      label: "新打卡项",
      categoryId: fallbackCategoryId,
      builtIn: false,
    };
    setManageDraftDefs((prev) => [...prev, newDef]);
  };

  const deleteEventDefInManage = (id: string) => {
    setManageDraftDefs((prev) => prev.filter((d) => d.id !== id));
  };

  const addCustomCategory = () => {
    const newCat: CategoryDef = {
      id: `custom-cat-${Date.now()}`,
      label: "新分类",
      colorBg: "#f5f5f5",
      colorText: "#424242",
      builtIn: false,
    };
    setManageDraftCategories((prev) => [...prev, newCat]);
  };

  const deleteCategoryInManage = (id: string) => {
    const cat = manageDraftCategories.find((c) => c.id === id);
    if (!cat || cat.builtIn) return;
    setManageDraftCategories((prev) => prev.filter((c) => c.id !== id));
    setManageDraftDefs((prev) => prev.filter((d) => d.categoryId !== id));
  };

  // ========== 日期切换 ==========

  const shiftSelectedDate = (days: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${dd}`);
  };

  const switchToToday = () => {
    setSelectedDate(todayStr);
  };

  // ========== 头部信息 ==========

  const todayExtra = getExtraForDate(todayStr);
  const todayLunar = getLunarAndFestivalInfo(todayStr);

  const todayHeaderLine = (() => {
    const parts: string[] = [];
    const extra = todayExtra;
    if (extra?.weather) {
      parts.push(`室外 ${extra.weather.temperature.toFixed(1)}℃`);
      if (extra.weather.humidity != null)
        parts.push(`湿度 ${extra.weather.humidity}%`);
      if (extra.weather.pressure != null)
        parts.push(`气压 ${extra.weather.pressure.toFixed(0)} hPa`);
      if (extra.weather.description)
        parts.push(extra.weather.description);
    }
    if (extra?.steps != null) {
      parts.push(`步数 ${extra.steps}`);
    }
    if (extra?.cyclePhase) {
      parts.push(`生理周期：${extra.cyclePhase}`);
    }
    return parts.join(" · ") || "今日健康扩展数据尚未记录";
  })();

  const selectedExtra = getExtraForDate(selectedDate);
  const selectedLunar = getLunarAndFestivalInfo(selectedDate);
  const selectedHeaderLine = (() => {
    const parts: string[] = [];
    const extra = selectedExtra;
    if (extra?.weather) {
      parts.push(`室外 ${extra.weather.temperature.toFixed(1)}℃`);
      if (extra.weather.humidity != null)
        parts.push(`湿度 ${extra.weather.humidity}%`);
      if (extra.weather.pressure != null)
        parts.push(`气压 ${extra.weather.pressure.toFixed(0)} hPa`);
      if (extra.weather.description)
        parts.push(extra.weather.description);
    }
    if (extra?.steps != null) {
      parts.push(`步数 ${extra.steps}`);
    }
    if (extra?.cyclePhase) {
      parts.push(`生理周期：${extra.cyclePhase}`);
    }
    return parts.join(" · ") || "该日健康扩展数据尚未记录";
  })();

  const selectedSummaryLines = getSummaryByCategory(
    selectedDateEvents,
    eventDefs,
    categories
  );

  // ========== 打卡记录渲染 ==========

  const renderEventList = (
    dayEvents: LogEvent[],
    options: RenderListOptions
  ) => {
    if (dayEvents.length === 0) {
      return (
        <div style={{ fontSize: 15, color: "#999", paddingTop: 8 }}>
          这一天还没有任何打卡记录。
        </div>
      );
    }

    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {dayEvents.map((event) => {
          const def = getEventDef(event.eventId);
          const cat = def ? getCategory(def.categoryId) : undefined;
          const colorBg = cat?.colorBg ?? "#e0e0e0";
          const colorText = cat?.colorText ?? "#424242";

          let touchStartX = 0;
          let touchStartY = 0;
          let moved = false;

          const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
            const t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            moved = false;
            setSwipedEventId(null);
          };

          const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
            const t = e.touches[0];
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
              moved = true;
            }
          };

          const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
            if (!moved) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartX;
            if (dx <= -40) {
              setSwipedEventId(event.id); // 左滑显示删除
            } else if (dx >= 40) {
              setEndTimeNow(event.id);    // 右滑标记结束时间
              setSwipedEventId(null);
            }
          };

          const handleClick = () => {
            if (moved) return;
            setSwipedEventId(null);
            openEditNote(event);
          };

          const durationText = getDurationText(event.startIso, event.endIso);
          const startText = formatTime(new Date(event.startIso));
          const endText = event.endIso
            ? formatTime(new Date(event.endIso))
            : "";

          const extra = event.extra ?? {};

          const showSatiety =
            options.sliderMode !== "none" &&
            ["breakfast", "lunch", "dinner", "snack"].includes(event.eventId);
          const showWater =
            options.sliderMode !== "none" && event.eventId === "water";
          const showExcretion =
            options.sliderMode === "readonly" &&
            (event.eventId === "poop" || event.eventId === "pee");

          const sliderInteractive = options.sliderMode === "interactive";
          const sliderReadonly = options.sliderMode === "readonly";

          const rawSatiety = extra.satiety ?? 50;
          const satietyValue =
            rawSatiety <= 10 ? rawSatiety * 10 : rawSatiety;
          const waterValue = extra.waterMl ?? 250;
          const excretionColor = getExcretionColorDisplay(extra);

          return (
            <li
              key={event.id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid #eee",
                fontSize: 15,
                position: "relative",
              }}
            >
              <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleClick}
                style={{ cursor: "pointer" }}
              >
                {/* 第一行：彩色标签 + 时间/时长 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: 999,
                        backgroundColor: colorBg,
                        color: colorText,
                        fontSize: 14,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {def?.label ?? "未知事件"}
                    </span>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      color: "#555",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {endText
                      ? `${startText} ~ ${endText}`
                      : `${startText}`}
                    {durationText && (
                      <span style={{ marginLeft: 4 }}>（{durationText}）</span>
                    )}
                  </div>
                </div>

                {/* 分类行：仅每日记录 Tab 显示 */}
                {options.showCategory && cat && (
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 999,
                        backgroundColor: "#f5f5f5",
                        color: "#555",
                        fontSize: 13,
                      }}
                    >
                      {cat.label}
                    </span>
                  </div>
                )}

                {/* 饱腹感 */}
                {showSatiety && (
                  <div
                    style={{
                      marginTop: 4,
                      marginBottom: 4,
                      fontSize: 13,
                      color: "#555",
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>
                      饱腹感（0%-100%）：
                    </div>
                    {sliderInteractive ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={satietyValue}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setEvents((prev) =>
                              prev.map((ev) =>
                                ev.id === event.id
                                  ? {
                                      ...ev,
                                      extra: {
                                        ...(ev.extra ?? {}),
                                        satiety: value,
                                      },
                                    }
                                  : ev
                              )
                            );
                          }}
                          style={{ flex: 1 }}
                        />
                        <span>{satietyValue}%</span>
                      </div>
                    ) : sliderReadonly ? (
                      <div>{satietyValue}%</div>
                    ) : null}
                  </div>
                )}

                {/* 喝水量 */}
                {showWater && (
                  <div
                    style={{
                      marginTop: 4,
                      marginBottom: 4,
                      fontSize: 13,
                      color: "#555",
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>喝水量（毫升）：</div>
                    {sliderInteractive ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <input
                          type="range"
                          min={50}
                          max={1000}
                          step={50}
                          value={waterValue}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setEvents((prev) =>
                              prev.map((ev) =>
                                ev.id === event.id
                                  ? {
                                      ...ev,
                                      extra: {
                                        ...(ev.extra ?? {}),
                                        waterMl: value,
                                      },
                                    }
                                  : ev
                              )
                            );
                          }}
                          style={{ flex: 1 }}
                        />
                        <span>{waterValue} ml</span>
                      </div>
                    ) : sliderReadonly ? (
                      <div>{waterValue} ml</div>
                    ) : null}
                  </div>
                )}

                {/* 排泄颜色：每日记录只展示颜色（+异常） */}
                {showExcretion && excretionColor && (
                  <div
                    style={{
                      marginTop: 4,
                      marginBottom: 4,
                      fontSize: 13,
                      color: "#555",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>颜色：</span>
                    <span
                      style={{
                        width: 28,
                        height: 18,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        backgroundColor: excretionColor,
                      }}
                    />
                    {extra.abnormal && (
                      <span
                        style={{
                          fontSize: 13,
                          color: "#c62828",
                          padding: "1px 6px",
                          borderRadius: 999,
                          backgroundColor: "#ffebee",
                        }}
                      >
                        异常
                      </span>
                    )}
                  </div>
                )}

                {/* 备注：只在每日记录 Tab 显示 */}
                {options.showNotes && event.note && (
                  <div
                    style={{
                      color: "#555",
                      fontSize: 14,
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {event.note}
                  </div>
                )}
              </div>

              {/* 左滑后的删除按钮 */}
              {swipedEventId === event.id && (
                <button
                  onClick={() => deleteEvent(event.id)}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    borderRadius: 8,
                    backgroundColor: "#d32f2f",
                    color: "#fff",
                    fontSize: 13,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  删除
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  // ========== 打卡区分组 ==========

  const groupedEventDefs: Record<string, EventDefinition[]> = {};
  categories.forEach((cat) => {
    groupedEventDefs[cat.id] = [];
  });
  eventDefs.forEach((def) => {
    if (!groupedEventDefs[def.categoryId]) {
      groupedEventDefs[def.categoryId] = [];
    }
    groupedEventDefs[def.categoryId].push(def);
  });

  // ========== 日历构建 ==========

  const buildCalendarMatrix = (
    year: number,
    month: number
  ): (number | null)[][] => {
    const result: (number | null)[][] = [];
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let currentDay = 1;
    let week: (number | null)[] = [];

    for (let i = 0; i < firstWeekday; i++) {
      week.push(null);
    }
    while (currentDay <= daysInMonth) {
      week.push(currentDay);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
      currentDay++;
    }
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      result.push(week);
    }
    return result;
  };

  const calendarMatrix = buildCalendarMatrix(calendarYear, calendarMonth);

  // ========== 渲染 ==========

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, system-ui",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontSize: 15,
        color: "#222",
      }}
    >
      {/* 顶部 */}
      <header
        style={{
          padding: "10px 16px 8px 16px",
          borderBottom: "1px solid #eee",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <span>HealthKey</span>
          <button
            onClick={openManageEvents}
            style={{
              border: "none",
              backgroundColor: "transparent",
              fontSize: 14,
              color: "#1565c0",
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            管理打卡
          </button>
        </div>

        <div style={{ fontSize: 16, fontWeight: 500 }}>
          {formatDate(new Date())}
        </div>
        {/* 只显示农历 + 节气/节假日 */}
        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
          农历：{todayLunar.lunar} · {todayLunar.festival}
        </div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
          {todayHeaderLine}
        </div>
      </header>

      {/* 主体 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {activeTab === "log" ? (
          // ===== 打卡 Tab =====
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 固定打卡区 */}
            <section
              style={{
                padding: "8px 12px 4px 12px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              {categories.map((cat) => {
                const defs = groupedEventDefs[cat.id] || [];
                if (defs.length === 0) return null;
                return (
                  <div key={cat.id} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#666",
                        marginBottom: 4,
                      }}
                    >
                      {cat.label}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {defs.map((def) => (
                        <button
                          key={def.id}
                          onClick={() => handleEventButtonTap(def.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 999,
                            border: "none",
                            backgroundColor: cat.colorBg,
                            color: cat.colorText,
                            fontSize: 14,
                            cursor: "pointer",
                          }}
                        >
                          {def.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* 今日打卡记录（标题固定，列表滚动） */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "0 16px 16px 16px",
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  paddingTop: 8,
                  paddingBottom: 4,
                  margin: 0,
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#fff",
                  zIndex: 5,
                }}
              >
                今日打卡记录
              </h2>
              {renderEventList(todayEvents, {
                showNotes: false,
                showCategory: false,
                sliderMode: "interactive",
              })}
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#888",
                  lineHeight: 1.4,
                }}
              >
                小提示：单击记录可编辑时间和详情；左滑显示删除，右滑记录结束时间；单击上方打卡按钮记录开始时间，双击记录同类事件的结束时间（仅在开始 90 分钟内有效）。
              </div>
            </div>
          </div>
        ) : (
          // ===== 每日记录 Tab =====
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 日期 & 汇总 */}
            <section
              style={{
                padding: "8px 16px 8px 16px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <button
                    onClick={() => shiftSelectedDate(-1)}
                    style={{
                      border: "1px solid #ccc",
                      backgroundColor: "#fff",
                      borderRadius: 999,
                      fontSize: 13,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    前一天
                  </button>
                  <button
                    onClick={() => shiftSelectedDate(1)}
                    style={{
                      border: "1px solid #ccc",
                      backgroundColor: "#fff",
                      borderRadius: 999,
                      fontSize: 13,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    后一天
                  </button>
                  <button
                    onClick={switchToToday}
                    style={{
                      border: "none",
                      backgroundColor:
                        selectedDate === todayStr ? "#1565c0" : "#eee",
                      color: selectedDate === todayStr ? "#fff" : "#333",
                      borderRadius: 999,
                      fontSize: 13,
                      padding: "3px 10px",
                      cursor: "pointer",
                    }}
                  >
                    今天
                  </button>
                </div>
                <button
                  onClick={() => setShowDatePicker(true)}
                  style={{
                    fontSize: 14,
                    color: "#1565c0",
                    border: "none",
                    backgroundColor: "透明",
                    cursor: "pointer",
                  }}
                >
                  {selectedDate}
                </button>
              </div>

              {/* 只显示农历 + 节气/节假日 */}
              <div
                style={{
                  fontSize: 13,
                  color: "#555",
                  marginBottom: 4,
                }}
              >
                农历：{selectedLunar.lunar} · {selectedLunar.festival}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#555",
                  marginBottom: 6,
                }}
              >
                {selectedHeaderLine}
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: "#555",
                  padding: "6px 8px",
                  borderRadius: 8,
                  backgroundColor: "#f5f5f5",
                }}
              >
                {selectedSummaryLines.length === 0 ? (
                  <div>这一天还没有记录</div>
                ) : (
                  selectedSummaryLines.map((line) => (
                    <div key={line.categoryId} style={{ marginBottom: 2 }}>
                      {line.categoryLabel}：{line.text}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 当日详细记录 */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "8px 16px 16px 16px",
              }}
            >
              <h2 style={{ fontSize: 16, marginBottom: 8 }}>当日详细记录</h2>
              {renderEventList(selectedDateEvents, {
                showNotes: true,
                showCategory: true,
                sliderMode: "readonly",
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部 Tab：高度较低，选中变蓝 */}
      <nav
        style={{
          height: 44,
          borderTop: "1px solid #eee",
          display: "flex",
          backgroundColor: "#fff",
        }}
      >
        <button
          onClick={() => setActiveTab("log")}
          style={{
            flex: 1,
            border: "none",
            backgroundColor: "transparent",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: activeTab === "log" ? "#1565c0" : "#777",
            cursor: "pointer",
          }}
        >
          <span>打卡</span>
        </button>
        <button
          onClick={() => setActiveTab("daily")}
          style={{
            flex: 1,
            border: "none",
            backgroundColor: "transparent",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: activeTab === "daily" ? "#1565c0" : "#777",
            cursor: "pointer",
          }}
        >
          <span>每日记录</span>
        </button>
      </nav>

      {/* 记录详情弹层 */}
      {editingEvent && editingDef && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={cancelEdit}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 16,
              width: "100%",
              maxWidth: 420,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              fontSize: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                marginBottom: 8,
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              编辑记录：{editingDef.label}
            </div>
            <div
              style={{
                marginBottom: 8,
                fontSize: 13,
                color: "#666",
              }}
            >
              日期：{getDateStringFromIso(editingEvent.startIso)}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 2 }}>开始时间</div>
                <input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 2 }}>结束时间（可选）</div>
                <input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            {(editingEvent.eventId === "poop" ||
              editingEvent.eventId === "pee") && (
              <div
                style={{
                  marginBottom: 8,
                  fontSize: 13,
                  color: "#555",
                }}
              >
                <div style={{ marginBottom: 4 }}>记录颜色</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      position: "relative",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #ccc",
                      backgroundColor: "#fafafa",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 16,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        backgroundColor:
                          editExcretionColor ?? "#f5f5f5",
                      }}
                    />
                    <span style={{ fontSize: 13 }}>点击选择</span>
                    <input
                      type="color"
                      value={
                        editExcretionColor ??
                        (editingEvent.eventId === "pee"
                          ? "#fff59d"
                          : "#8d6e63")
                      }
                      onChange={(e) =>
                        setEditExcretionColor(e.target.value)
                      }
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 13,
                      color: "#c62828",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={editAbnormal}
                      onChange={(e) => setEditAbnormal(e.target.checked)}
                    />
                    标记为异常
                  </label>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#888",
                  }}
                >
                  例如明显偏红、黑色、极深黄，或伴随强烈异味/不适等情况可以勾选异常，方便后续回看。
                </div>
              </div>
            )}

            <textarea
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
              placeholder={getNotePlaceholder(
                editingEvent.eventId,
                editingDef
              )}
              rows={5}
              style={{
                width: "100%",
                resize: "vertical",
                fontSize: 14,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #ccc",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={cancelEdit}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  fontSize: 14,
                }}
              >
                取消
              </button>
              <button
                onClick={saveNote}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#1565c0",
                  color: "#fff",
                  fontSize: 14,
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打卡项管理弹层 */}
      {showManageModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1001,
          }}
          onClick={() => setShowManageModal(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 16,
              width: "100%",
              maxWidth: 500,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              管理分类与打卡项
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#666",
                marginBottom: 8,
              }}
            >
              你可以增加/修改打卡分类（点击「示例」选择标签颜色），也可以为每个分类新增或调整打卡事件。内置项不可删除。
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 4,
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              {/* 分类列表 */}
              <div
                style={{
                  marginBottom: 8,
                  borderBottom: "1px solid #eee",
                  paddingBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  分类
                </div>
                {manageDraftCategories.map((cat) => (
                  <div
                    key={cat.id}
                    style={{
                      padding: "4px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      value={cat.label}
                      onChange={(e) =>
                        setManageDraftCategories((prev) =>
                          prev.map((c) =>
                            c.id === cat.id
                              ? { ...c, label: e.target.value }
                              : c
                          )
                        )
                      }
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        padding: "4px 8px",
                        fontSize: 14,
                      }}
                    />
                    <label
                      style={{
                        position: "relative",
                        borderRadius: 999,
                        border: "1px solid #ccc",
                        backgroundColor: cat.colorBg,
                        color: cat.colorText,
                        fontSize: 11,
                        padding: "3px 10px",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      示例
                      <input
                        type="color"
                        value={cat.colorBg}
                        onChange={(e) =>
                          setManageDraftCategories((prev) =>
                            prev.map((c) =>
                              c.id === cat.id
                                ? {
                                    ...c,
                                    colorBg: e.target.value,
                                    colorText: autoTextColorForBg(
                                      e.target.value
                                    ),
                                  }
                                : c
                            )
                          )
                        }
                        style={{
                          position: "absolute",
                          inset: 0,
                          opacity: 0,
                          cursor: "pointer",
                        }}
                      />
                    </label>
                    {!cat.builtIn && (
                      <button
                        onClick={() => deleteCategoryInManage(cat.id)}
                        style={{
                          border: "none",
                          backgroundColor: "透明",
                          color: "#d32f2f",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addCustomCategory}
                  style={{
                    marginTop: 4,
                    border: "1px dashed #1565c0",
                    backgroundColor: "#e3f2fd",
                    color: "#1565c0",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  + 新增分类
                </button>
              </div>

              {/* 打卡事件列表 */}
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  打卡事件
                </div>
                {manageDraftDefs.map((def) => (
                  <div
                    key={def.id}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid #f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      value={def.label}
                      onChange={(e) =>
                        setManageDraftDefs((prev) =>
                          prev.map((d) =>
                            d.id === def.id
                              ? { ...d, label: e.target.value }
                              : d
                          )
                        )
                      }
                      style={{
                        flex: 1.2,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        padding: "4px 8px",
                        fontSize: 14,
                      }}
                    />
                    <select
                      value={def.categoryId}
                      onChange={(e) =>
                        setManageDraftDefs((prev) =>
                          prev.map((d) =>
                            d.id === def.id
                              ? { ...d, categoryId: e.target.value }
                              : d
                          )
                        )
                      }
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        padding: "4px 6px",
                        fontSize: 13,
                      }}
                    >
                      {manageDraftCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    {!def.builtIn && (
                      <button
                        onClick={() => deleteEventDefInManage(def.id)}
                        style={{
                          border: "none",
                          backgroundColor: "transparent",
                          color: "#d32f2f",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addCustomEventDef}
                  style={{
                    marginTop: 4,
                    border: "1px dashed #1565c0",
                    backgroundColor: "#e3f2fd",
                    color: "#1565c0",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  + 新增打卡项
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setShowManageModal(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  fontSize: 14,
                }}
              >
                取消
              </button>
              <button
                onClick={saveManageEvents}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#1565c0",
                  color: "#fff",
                  fontSize: 14,
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 日期选择弹层 */}
      {showDatePicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1002,
          }}
          onClick={() => setShowDatePicker(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 16,
              width: "100%",
              maxWidth: 360,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              fontSize: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              选择日期
            </div>

            {/* 年月切换 + 选择 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <button
                onClick={() => {
                  let y = calendarYear;
                  let m = calendarMonth - 1;
                  if (m < 0) {
                    m = 11;
                    y -= 1;
                  }
                  setCalendarYear(y);
                  setCalendarMonth(m);
                }}
                style={{
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  borderRadius: 999,
                  fontSize: 13,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                上一月
              </button>
              <div
                style={{ cursor: "pointer" }}
                onClick={() =>
                  setShowYearMonthSelector((prev) => !prev)
                }
              >
                {showYearMonthSelector ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <select
                      value={calendarYear}
                      onChange={(e) =>
                        setCalendarYear(Number(e.target.value))
                      }
                      style={{
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        padding: "2px 6px",
                        fontSize: 13,
                      }}
                    >
                      {Array.from({ length: 11 }).map((_, idx) => {
                        const baseYear = new Date().getFullYear();
                        const y = baseYear - 5 + idx;
                        return (
                          <option key={y} value={y}>
                            {y} 年
                          </option>
                        );
                      })}
                    </select>
                    <select
                      value={calendarMonth + 1}
                      onChange={(e) =>
                        setCalendarMonth(Number(e.target.value) - 1)
                      }
                      style={{
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        padding: "2px 6px",
                        fontSize: 13,
                      }}
                    >
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {idx + 1} 月
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {calendarYear} 年 {calendarMonth + 1} 月
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  let y = calendarYear;
                  let m = calendarMonth + 1;
                  if (m > 11) {
                    m = 0;
                    y += 1;
                  }
                  setCalendarYear(y);
                  setCalendarMonth(m);
                }}
                style={{
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  borderRadius: 999,
                  fontSize: 13,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                下一月
              </button>
            </div>

            {/* 星期行 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                fontSize: 12,
                color: "#666",
                marginBottom: 4,
                textAlign: "center",
              }}
            >
              {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            {/* 日期格子 */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {calendarMatrix.map((week, wi) => (
                <div
                  key={wi}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    textAlign: "center",
                    marginBottom: 4,
                  }}
                >
                  {week.map((day, di) => {
                    if (day == null) {
                      return (
                        <div
                          key={di}
                          style={{ padding: "4px 0", fontSize: 12 }}
                        />
                      );
                    }
                    const dateStr = `${calendarYear}-${String(
                      calendarMonth + 1
                    ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const hasEvents = datesWithEventsSet.has(dateStr);
                    const isSelected = dateStr === selectedDate;
                    const isToday = dateStr === todayStr;

                    const baseStyle: React.CSSProperties = {
                      padding: "4px 0",
                      margin: "2px 4px",
                      borderRadius: 8,
                      fontSize: 13,
                    };

                    if (!hasEvents) {
                      return (
                        <div
                          key={di}
                          style={{
                            ...baseStyle,
                            color: "#ccc",
                          }}
                        >
                          {day}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={di}
                        onClick={() => {
                          setSelectedDate(dateStr);
                          setShowDatePicker(false);
                        }}
                        style={{
                          ...baseStyle,
                          border: "none",
                          cursor: "pointer",
                          backgroundColor: isSelected
                            ? "#1565c0"
                            : "#e3f2fd",
                          color: isSelected ? "#fff" : "#1565c0",
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowDatePicker(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  fontSize: 14,
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
