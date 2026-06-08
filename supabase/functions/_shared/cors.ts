export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function corsResponse(body: string | Record<string, unknown>, status = 200, headers: Record<string, string> = {}): Response {
  const responseHeaders = new Headers({
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
    ...headers,
  });
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDateKey(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
}

export function calculateHeatRisk(tempC: number, humidity: number): string {
  if (!tempC || !humidity) return 'unknown';
  if (tempC >= 35 || humidity >= 75) return 'critical';
  if (tempC >= 30 && humidity >= 60) return 'high';
  return 'low';
}

export function formatPaceFromSpeed(speedMps: number): string {
  const speed = num(speedMps);
  if (speed <= 0) return '';
  const minPerKm = 1000 / speed / 60;
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}/km`;
}

interface ActivityMapping {
  appType: string;
  cardioType: string;
  impactLevel: string;
}

export function mapActivityType(raw: Record<string, unknown>): ActivityMapping {
  const type = String(raw.sport_type || raw.type || raw.activity_type || '').toLowerCase();
  if (type.includes('ride') || type.includes('bike') || type.includes('cycling')) return { appType: 'bike', cardioType: 'CYCLING', impactLevel: 'zero' };
  if (type.includes('row')) return { appType: 'row', cardioType: 'ROWING', impactLevel: 'zero' };
  if (type.includes('swim')) return { appType: 'swim', cardioType: 'SWIMMING', impactLevel: 'zero' };
  if (type.includes('walk') || type.includes('hike')) return { appType: 'run_walk', cardioType: 'WALK_JOG', impactLevel: 'low' };
  if (type.includes('run')) return { appType: 'run_walk', cardioType: 'RUNNING', impactLevel: 'high' };
  return { appType: 'recovery', cardioType: 'NONE', impactLevel: 'low' };
}

export function normalizeExternalActivity(raw: Record<string, unknown>, source: string): Record<string, unknown> {
  const mapping = mapActivityType(raw);
  const startLocal = String(raw.start_date_local || raw.start_date || raw.startTime || new Date().toISOString());
  const rawDuration = num(raw.moving_time || raw.elapsed_time || raw.durationMin || raw.duration_min);
  const durationMin = rawDuration > 0 ? (num(raw.durationMin || raw.duration_min) > 0 ? rawDuration : Math.round(rawDuration / 60)) : 0;
  const rawDist = num(raw.distanceKm || raw.distance_km || raw.distance);
  const distanceKm = rawDist > 100 ? rawDist / 1000 : rawDist;
  const trainingLoad = num(raw.trainingLoad || raw.training_load || raw.suffer_score || raw.calc_relative_effort || raw.icu_training_load || raw.stravaEffort) || (durationMin ? durationMin * 5 : 0);

  return {
    id: `${source}:${raw.id || raw.activity_id || startLocal}`,
    source,
    externalActivityId: String(raw.id || raw.activity_id || startLocal),
    name: raw.name || raw.title || raw.type || raw.sport_type || 'Imported activity',
    type: mapping.appType,
    modality: raw.sport_type || raw.type || raw.activity_type || 'Workout',
    cardioType: mapping.cardioType,
    impactLevel: mapping.impactLevel,
    startLocal,
    dateKey: getDateKey(startLocal),
    durationMin,
    distanceKm,
    avgHR: num(raw.average_heartrate || raw.avg_hr) || '',
    maxHR: num(raw.max_heartrate || raw.max_hr) || '',
    avgPower: num(raw.average_watts || raw.weighted_average_watts || raw.avg_power) || '',
    avgPace: raw.avgPace || formatPaceFromSpeed(num(raw.average_speed)),
    caloriesBurned: num(raw.calories || raw.caloriesBurned || raw.kilojoules) || '',
    elevationGain: num(raw.total_elevation_gain || raw.elevation_gain) || '',
    trainingLoad,
    rpe: '',
    painRegion: '',
    painScore: '',
    fueled: '',
    intraCarbs: '',
    notes: '',
    raw,
    importedAt: new Date().toISOString(),
  };
}
