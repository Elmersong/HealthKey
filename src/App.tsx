import React, { useEffect, useMemo, useState } from "react";
// @ts-ignore: solar2lunar 没有类型声明
import calendar from "solar2lunar";

// 分类 ID 放宽为 string，方便以后扩展
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
  satietyPercent?: number;
  waterMl?: number;
  note?: string;
}

interface EventRecord {
  id: string;
  eventDefId: string;
  timestamp: string; // 单一时间点，本地日期用它来换算
  extras?: EventExtra;
}

interface DayMetaWeather {
  temperatureC?: number;
  humidity?: number;
  pressureHpa?: number;
  description?: string;
}

interface DayMeta {
  date: string; // YYYY-MM-DD
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

// 把 ISO 时间串转换为「本地日期」字符串，用来分组
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
    const holiday =
      lunarFestival || solarFest || (lunarRaw.isTerm ? lunarRaw.Term : undefined);

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

// 天气信息文案
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

// 内置事件 ID，用来防止误删
const BUILTIN_EVENT_IDS = new Set(DEFAULT_EVENT_DEFS.map((d) => d.id));

const App: React.FC = () => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [eventDefs, setEventDefs] = useState<EventDefinition[]>(DEFAULT_EVENT_DEFS);
  const [dayMetaMap, setDayMetaMap] = useState<Record<string, DayMeta>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("log");
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));

  // 编辑记录
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState<string>("");
  const [editingExtras, setEditingExtras] = useState<EventExtra>({});

  // 管理打卡项
  const [isManageOpen, setIsManageOpen] = useState(false);

  // 日历选择器
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth() + 1);

  // 初始化：加载本地记录 + 自定义分类/打卡项
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
    } catch {
      // ignore
    }

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
    } catch {
      // ignore
    }

    try {
      const catStr = localStorage.getItem(CATEGORIES_KEY);
      if (catStr) {
        const parsed: Category[] = JSON.parse(catStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed);
        }
      }
    } catch {
      // ignore
    }

    try {
      const defStr = localStorage.getItem(EVENTDEFS_KEY);
      if (defStr) {
        const parsed: EventDefinition[] = JSON.parse(defStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEventDefs(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // 当天元数据 + 天气
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
                localStorage.setItem(DAYMETA_KEY, JSON.stringify(Object.values(updated)));
                return updated;
              });
            })
            .catch(() => {
              // ignore
            });
        },
        () => {
          // ignore
        },
      );
    }
  }, [dayMetaMap]);

  // URL 参数写入步数（未来可和捷径联动）
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

  // 持久化 events
  useEffect(() => {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  }, [events]);

  // 持久化 categories / eventDefs
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

  // 打卡：单击即记录一个时间点
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
  };

  // 编辑记录
  const openEditEvent = (eventId: string) => {
    const evt = events.find((e) => e.id === eventId);
    if (!evt) return;
    const dt = new Date(evt.timestamp);
    setEditingEventId(eventId);
    setEditingTime(formatTime(dt));
    setEditingExtras({ ...(evt.extras || {}) });
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
  };

  // 每日记录：日期选择
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

  // 每日记录分类汇总（动态分类）
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

  // UI 样式
  const rootStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f4f5f7",
    color: "#111",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, -apple-system, 'Segoe UI', sans-serif",
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: "12px 12px 76px 12px", // 底部预留 tab 空间
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
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    color: "#333",
  };

  const tabBarStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    borderTop: "1px solid rgba(0,0,0,0.06)",
    backgroundColor: "#ffffff",
    padding: "8px 0 6px 0",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 10,
  };

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    padding: "4px 0",
    color: active ? "#1677ff" : "#666",
    fontWeight: active ? 600 : 500,
  });

  const pillButtonStyle = (color: string): React.CSSProperties => ({
    borderRadius: 999,
    border: "none",
    padding: "7px 12px",
    fontSize: 14,
    fontWeight: 500,
    color: "#fff",
    background: color,
    margin: "4px 8px 4px 0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
  });

  const renderHeader = () => {
    const todayLocalStr = formatDate(headerDate);

    return (
      <header
        style={{
          padding: "10px 12px 4px 12px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>
              HealthKey
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              {todayLocalStr} · {todayWeekday}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
              {headerLunar.lunarText}
              {headerLunar.term && ` · ${headerLunar.term}`}
              {headerLunar.holiday && ` · ${headerLunar.holiday}`}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#555" }}>
            <div style={{ marginBottom: 2 }}>
              步数：
              {typeof todayMeta?.steps === "number"
                ? `${todayMeta.steps} 步`
                : "未记录"}
            </div>
            <div style={{ maxWidth: 140 }}>
              {getWeatherSummary(todayMeta?.weather)}
            </div>
          </div>
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
          <div style={sectionTitleStyle}>打卡 · 生理输入 & 输出</div>
          <button
            onClick={() => setIsManageOpen(true)}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              padding: "4px 10px",
              backgroundColor: "#fff",
              fontSize: 12,
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
                fontSize: 12,
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
    return (
      <div style={{ ...cardStyle, paddingTop: 8 }}>
        <div
          style={{
            ...sectionTitleStyle,
            marginBottom: 4,
            position: "sticky",
            top: 0,
            backgroundColor: "#ffffff",
            paddingBottom: 4,
            zIndex: 1,
          }}
        >
          今日打卡记录
        </div>
        <div
          style={{
            maxHeight: "42vh",
            overflowY: "auto",
            paddingRight: 4,
            marginRight: -4,
          }}
        >
          {todayEvents.length === 0 && (
            <div style={{ fontSize: 12, color: "#999", padding: "4px 0 4px 2px" }}>
              还没有打卡，先从一个最容易的事件开始吧。
            </div>
          )}
          {todayEvents.map((evt) => {
            const def = getEventDef(evt.eventDefId);
            if (!def) return null;
            const dt = new Date(evt.timestamp);
            const time = formatTime(dt);
            const cat = getCategoryById(def.categoryId);

            return (
              <div
                key={evt.id}
                style={{
                  padding: "6px 4px",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => openEditEvent(evt.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 999,
                        backgroundColor: cat.color,
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {def.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#555" }}>{time}</span>
                  </div>
                  {evt.extras?.note && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#777",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {evt.extras.note}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteEvent(evt.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#d63031",
                    fontSize: 11,
                    padding: 4,
                  }}
                >
                  删除
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDailySummary = () => {
    const d = new Date(selectedDate);
    const weekday = weekdayText[d.getDay()];

    return (
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>当日概览</div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
          日期：{selectedDate} · {weekday}
        </div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
          天气：
          {getWeatherSummary(
            selectedDate === todayStr ? selectedDayMeta?.weather : undefined,
          )}
          {selectedDate !== todayStr &&
            "（当前仅支持显示今日天气，其他日期暂不记录天气历史）"}
        </div>
        {typeof selectedDayMeta?.steps === "number" && selectedDate === todayStr && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
            步数：{selectedDayMeta.steps} 步
          </div>
        )}
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
                padding: "6px 8px",
                backgroundColor: "rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
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
              <div style={{ fontSize: 14, fontWeight: 600, color: "#222" }}>
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
          <div style={{ fontSize: 12, color: "#999" }}>这一天没有任何记录。</div>
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
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
                    {def.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{time}</div>
                </div>
                <div style={{ marginTop: 4 }}>
                  {extras.urineColor && (
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
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
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
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
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
                      饱腹感：{extras.satietyPercent}%
                    </div>
                  )}
                  {typeof extras.waterMl === "number" && (
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
                      喝水：{extras.waterMl} ml
                    </div>
                  )}
                  {extras.isAbnormal && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#d63031",
                        marginBottom: 2,
                        fontWeight: 500,
                      }}
                    >
                      标记为异常
                    </div>
                  )}
                  {extras.note && (
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
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
    const isDiet = getCategoryById(def.categoryId).id === "diet";
    const isExcretion = getCategoryById(def.categoryId).id === "excretion";

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

          {isDiet && (
            <>
              <div style={{ marginBottom: 8, fontSize: 12 }}>
                <div style={{ marginBottom: 4 }}>饱腹感（0% ~ 100%）</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={extras.satietyPercent ?? 50}
                  onChange={(e) =>
                    setEditingExtras((prev) => ({
                      ...prev,
                      satietyPercent: parseInt(e.target.value, 10),
                    }))
                  }
                  style={{ width: "100%" }}
                />
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                  {extras.satietyPercent ?? 50}%
                </div>
              </div>
              {def.id === "water" && (
                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <div style={{ marginBottom: 4 }}>喝水（毫升）</div>
                  <input
                    type="number"
                    min={0}
                    value={extras.waterMl ?? ""}
                    placeholder="例如 250"
                    onChange={(e) =>
                      setEditingExtras((prev) => ({
                        ...prev,
                        waterMl: e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      }))
                    }
                    style={{ width: "100%", padding: 4, fontSize: 13 }}
                  />
                </div>
              )}
            </>
          )}

          {isExcretion && (
            <>
              {def.id === "pee" && (
                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <div style={{ marginBottom: 4 }}>排尿颜色</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      type="color"
                      value={extras.urineColor || "#ffeb3b"}
                      onChange={(e) =>
                        setEditingExtras((prev) => ({
                          ...prev,
                          urineColor: e.target.value,
                        }))
                      }
                      style={{ width: 40, height: 24, padding: 0, border: "none" }}
                    />
                    <div style={{ fontSize: 11, color: "#555" }}>
                      点击色块选择接近尿液的颜色
                    </div>
                  </div>
                </div>
              )}
              {def.id === "poop" && (
                <div style={{ marginBottom: 8, fontSize: 12 }}>
                  <div style={{ marginBottom: 4 }}>排便颜色</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      type="color"
                      value={extras.stoolColor || "#795548"}
                      onChange={(e) =>
                        setEditingExtras((prev) => ({
                          ...prev,
                          stoolColor: e.target.value,
                        }))
                      }
                      style={{ width: 40, height: 24, padding: 0, border: "none" }}
                    />
                    <div style={{ fontSize: 11, color: "#555" }}>
                      点击色块选择接近排便的颜色
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 8, fontSize: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                  <span>标记为异常情况</span>
                </label>
              </div>
            </>
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

  // 管理打卡项面板
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
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                分类
              </div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
                可以调整每个分类的名称和颜色（目前固定四类：饮食 / 排泄 / 睡眠 / 活动）。
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
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                打卡事件
              </div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
                内置事件可改名和变更分类；自定义事件可以删除。
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
                }}
              >
                <div style={sectionTitleStyle}>每日记录</div>
                <button
                  onClick={openDatePicker}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "4px 10px",
                    backgroundColor: "#fff",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#333",
                  }}
                >
                  <span role="img" aria-label="calendar">
                    📅
                  </span>
                  {selectedDate}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#777" }}>
                仅可选择有记录的日期；不同日期会显示对应日期的打卡情况。
              </div>
            </div>
            {renderDailySummary()}
            {renderDailyList()}
          </>
        )}
      </main>

      {/* 底部 TabBar */}
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

      {/* 全局样式，强制浅色 + 弹层/日历样式 */}
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
      `}</style>
    </div>
  );
};

export default App;
