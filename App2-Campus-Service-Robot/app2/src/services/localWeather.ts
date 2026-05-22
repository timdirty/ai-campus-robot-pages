export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'unknown';

export interface LocalWeatherSnapshot {
  latitude: number;
  longitude: number;
  label: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  weatherCode: number;
  condition: WeatherCondition;
  conditionLabel: string;
  aqi: number | null;
  pm25: number | null;
  fetchedAt: string;
}

type OpenMeteoWeatherResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    precipitation?: number;
    weather_code?: number;
  };
};

type OpenMeteoAirResponse = {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
  };
};

function round(value: unknown, fallback = 0, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

export function describeWeatherCode(code: number): {condition: WeatherCondition; label: string} {
  if (code === 0) return {condition: 'clear', label: '晴朗'};
  if (code === 1 || code === 2) return {condition: 'clear', label: '晴時多雲'};
  if (code === 3) return {condition: 'cloudy', label: '多雲'};
  if (code === 45 || code === 48) return {condition: 'fog', label: '霧'};
  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return {condition: 'drizzle', label: '陣雨'};
  if ((code >= 61 && code <= 67) || (code >= 95 && code <= 99)) return code >= 95 ? {condition: 'storm', label: '雷雨'} : {condition: 'rain', label: '降雨'};
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return {condition: 'snow', label: '降雪'};
  return {condition: 'unknown', label: '天氣更新'};
}

function formatCoordinate(value: number, axis: 'lat' | 'lon') {
  const direction = axis === 'lat'
    ? value >= 0 ? 'N' : 'S'
    : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(2)}°${direction}`;
}

export function formatLocationLabel(latitude: number, longitude: number) {
  return `${formatCoordinate(latitude, 'lat')} ${formatCoordinate(longitude, 'lon')}`;
}

export async function fetchLocalWeather(latitude: number, longitude: number, signal?: AbortSignal): Promise<LocalWeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    timezone: 'auto',
  });
  const airParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: ['us_aqi', 'pm2_5'].join(','),
    timezone: 'auto',
  });

  const [weatherRes, airRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {signal}),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams.toString()}`, {signal}).catch(() => null),
  ]);

  if (!weatherRes.ok) throw new Error(`weather ${weatherRes.status}`);
  const weather = await weatherRes.json() as OpenMeteoWeatherResponse;
  const air = airRes?.ok ? await airRes.json() as OpenMeteoAirResponse : null;
  const current = weather.current ?? {};
  const code = round(current.weather_code);
  const description = describeWeatherCode(code);

  return {
    latitude,
    longitude,
    label: formatLocationLabel(latitude, longitude),
    temperature: round(current.temperature_2m, 0, 1),
    apparentTemperature: round(current.apparent_temperature, 0, 1),
    humidity: round(current.relative_humidity_2m),
    windSpeed: round(current.wind_speed_10m, 0, 1),
    windDirection: round(current.wind_direction_10m),
    precipitation: round(current.precipitation, 0, 1),
    weatherCode: code,
    condition: description.condition,
    conditionLabel: description.label,
    aqi: air?.current?.us_aqi == null ? null : round(air.current.us_aqi),
    pm25: air?.current?.pm2_5 == null ? null : round(air.current.pm2_5, 0, 1),
    fetchedAt: current.time ?? new Date().toISOString(),
  };
}
