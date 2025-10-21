export interface TrackPoint {
  id?: string;
  track_id?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  timestamp: string;
  sequence: number;
}

export interface HikingTrack {
  id: string;
  user_id: string;
  name: string;
  total_distance: number;
  total_time: number;
  avg_speed: number;
  max_speed: number;
  start_time: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
  weather?: WeatherData;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}

export interface Goal {
  id: string;
  user_id: string;
  type: 'distance' | 'time' | 'frequency';
  target: number;
  current: number;
  period: 'daily' | 'weekly' | 'monthly';
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export type RecordingState = 'stopped' | 'recording' | 'paused';

export interface MapPoint {
  lat: number;
  lng: number;
}
