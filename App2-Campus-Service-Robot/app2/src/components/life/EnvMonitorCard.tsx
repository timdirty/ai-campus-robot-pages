import {useCallback, useEffect, useMemo, useState} from 'react';
import { motion } from 'motion/react';
import { Activity, CloudRain, CloudSun, Droplets, Gauge, MapPin, RefreshCw, Thermometer, Umbrella, Wind } from 'lucide-react';
import {fetchLocalWeather, type LocalWeatherSnapshot} from '../../services/localWeather';

const DEMO_SENSORS = {
  temp: 26.8,
  hum: 62,
  aqi: 42,
};

function formatTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function aqiLabel(aqi: number | null) {
  if (aqi == null) return 'AQI --';
  if (aqi <= 50) return `AQI ${aqi}`;
  if (aqi <= 100) return `AQI ${aqi}`;
  return `AQI ${aqi}`;
}

function ventilationLabel(weather: LocalWeatherSnapshot | null) {
  if (!weather) return '良好';
  if (weather.aqi != null && weather.aqi > 100) return '關窗';
  if (weather.windSpeed >= 18 || weather.precipitation > 0) return '留意';
  return '良好';
}

type WeatherScenario = 'live' | 'rain-dismissal' | 'heat';

function buildScenarioWeather(scenario: Exclude<WeatherScenario, 'live'>): LocalWeatherSnapshot {
  const now = new Date();
  if (scenario === 'rain-dismissal') {
    return {
      label: '放學時段 · 校門口',
      latitude: 25.05,
      longitude: 121.51,
      temperature: 25.5,
      apparentTemperature: 27.4,
      humidity: 89,
      windSpeed: 12.8,
      windDirection: 70,
      precipitation: 6.8,
      weatherCode: 61,
      condition: 'rain',
      conditionLabel: '放學前陣雨',
      aqi: 83,
      pm25: 40.4,
      fetchedAt: now.toISOString(),
    };
  }
  return {
    label: '午後時段 · 操場',
    latitude: 25.05,
    longitude: 121.51,
    temperature: 34.2,
    apparentTemperature: 38.1,
    humidity: 72,
    windSpeed: 4.6,
    windDirection: 110,
    precipitation: 0,
    weatherCode: 1,
    condition: 'clear',
    conditionLabel: '午後悶熱',
    aqi: 76,
    pm25: 31.2,
    fetchedAt: now.toISOString(),
  };
}

export function EnvMonitorCard({onRainPlan}: {onRainPlan?: () => void}) {
  const [weather, setWeather] = useState<LocalWeatherSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [errorText, setErrorText] = useState('');
  const [scenario, setScenario] = useState<WeatherScenario>('live');

  const loadWeather = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('fallback');
      setErrorText('定位不可用');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setErrorText('');
    navigator.geolocation.getCurrentPosition(
      position => {
        void fetchLocalWeather(position.coords.latitude, position.coords.longitude, controller.signal)
          .then(snapshot => {
            setWeather(snapshot);
            setStatus('ready');
          })
          .catch(() => {
            setStatus('fallback');
            setErrorText('氣象更新失敗');
          });
      },
      () => {
        setStatus('fallback');
        setErrorText('定位未授權');
      },
      {enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 9000},
    );

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = loadWeather();
    return cleanup;
  }, [loadWeather]);

  const effectiveWeather = scenario === 'live' ? weather : buildScenarioWeather(scenario);
  const activeRainRisk = Boolean(effectiveWeather && effectiveWeather.precipitation >= 2);

  const items = useMemo(() => {
    const temp = effectiveWeather?.temperature ?? DEMO_SENSORS.temp;
    const hum = effectiveWeather?.humidity ?? DEMO_SENSORS.hum;
    const aqi = effectiveWeather?.aqi ?? DEMO_SENSORS.aqi;
    return [
      { icon: Thermometer, val: `${temp}°C`,  label: '溫度', warn: temp > 35 },
      { icon: Droplets,    val: `${hum}%`,    label: '濕度', warn: hum > 85 },
      { icon: Gauge,       val: aqiLabel(effectiveWeather?.aqi ?? DEMO_SENSORS.aqi), label: '空氣', warn: aqi > 100 },
      { icon: Wind,        val: effectiveWeather ? `${effectiveWeather.windSpeed} km/h` : ventilationLabel(null), label: effectiveWeather ? '風速' : '通風', warn: Boolean(effectiveWeather && effectiveWeather.windSpeed >= 25) },
    ];
  }, [effectiveWeather]);

  const lastUpdated = effectiveWeather?.fetchedAt ? formatTime(effectiveWeather.fetchedAt) : formatTime(new Date());
  const sourceLabel = scenario !== 'live'
    ? '情境模擬'
    : status === 'ready' && weather
      ? '現在地真實氣候'
      : status === 'loading'
        ? '定位中'
        : (errorText || '本地備援感測');

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[
          {id: 'live' as const, label: '即時天氣', icon: CloudSun},
          {id: 'rain-dismissal' as const, label: '放學降雨', icon: CloudRain},
          {id: 'heat' as const, label: '午後悶熱', icon: Thermometer},
        ].map((item) => {
          const Icon = item.icon;
          const active = scenario === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setScenario(item.id)}
              className={`flex min-h-9 items-center gap-2 rounded-xl border px-3 text-[11px] font-black transition active:scale-95 ${
                active
                  ? 'border-primary/35 bg-primary/10 text-primary'
                  : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:border-primary/25'
              }`}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-2 text-on-surface ring-1 ring-outline-variant/20">
          {activeRainRisk ? <CloudRain size={16} className="shrink-0 text-primary" /> : <CloudSun size={16} className="shrink-0 text-primary" />}
          <div className="min-w-0">
            <p className="truncate text-xs font-black leading-tight">{effectiveWeather?.conditionLabel ?? sourceLabel}</p>
            <p className="flex items-center gap-1 truncate text-[10px] font-bold text-on-surface-variant">
              <MapPin size={10} className="shrink-0" />
              {effectiveWeather?.label ?? '現在地'}
            </p>
          </div>
        </div>

        {items.map(s => (
          <motion.button
            key={s.label}
            whileTap={{ scale: 0.94 }}
            onClick={() => {}}
            className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-all ${s.warn ? 'bg-error/10 border-error/30 text-error' : 'bg-surface-container-lowest border-outline-variant/25 text-on-surface hover:border-primary/40'}`}
            title={s.label}
          >
            <s.icon size={14} className="shrink-0" />
            <span>{s.val}</span>
          </motion.button>
        ))}

        <motion.button
          whileTap={{scale: 0.94}}
          onClick={loadWeather}
          className="ml-auto flex min-h-10 items-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 py-2 text-[10px] font-black text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary"
        >
          <RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} />
          更新 {lastUpdated}
        </motion.button>
      </div>

      {effectiveWeather && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-on-surface-variant">
          <span className="rounded-lg bg-surface-container-lowest px-2 py-1">體感 {effectiveWeather.apparentTemperature}°C</span>
          <span className="rounded-lg bg-surface-container-lowest px-2 py-1">降雨 {effectiveWeather.precipitation} mm</span>
          <span className="rounded-lg bg-surface-container-lowest px-2 py-1">PM2.5 {effectiveWeather.pm25 ?? '--'}</span>
          <span className="rounded-lg bg-surface-container-lowest px-2 py-1">通風 {ventilationLabel(effectiveWeather)}</span>
        </div>
      )}

      {scenario !== 'live' && (
        <div className={`mt-3 flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
          activeRainRisk ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <div className="flex min-w-0 items-start gap-2">
            {activeRainRisk ? <Umbrella size={16} className="mt-0.5 shrink-0" /> : <Activity size={16} className="mt-0.5 shrink-0" />}
            <p className="text-xs font-bold leading-relaxed">
              {activeRainRisk
                ? '預測放學時段地面濕滑：提前廣播慢行、校門口巡查、提醒學生收好雨具。'
                : '午後體感偏高：建議廣播補水、安排操場入口巡查並提醒教室通風。'}
            </p>
          </div>
          {activeRainRisk && onRainPlan && (
            <button
              type="button"
              onClick={onRainPlan}
              className="min-h-10 shrink-0 rounded-xl bg-cyan-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-cyan-700 active:scale-95"
            >
              啟動放學提醒
            </button>
          )}
        </div>
      )}

      {!weather && status === 'fallback' && scenario === 'live' && (
        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-on-surface-variant">
          <Activity size={12} />
          <span>{sourceLabel} · 更新 {lastUpdated}</span>
        </div>
      )}
    </div>
  );
}
