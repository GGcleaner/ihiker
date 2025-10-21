import type { WeatherData } from '../types';

export class WeatherService {
  private static instance: WeatherService;

  private constructor() {}

  static getInstance(): WeatherService {
    if (!WeatherService.instance) {
      WeatherService.instance = new WeatherService();
    }
    return WeatherService.instance;
  }

  async getWeather(lat: number, lon: number): Promise<WeatherData | null> {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Asia/Shanghai`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch weather');
      }

      const data = await response.json();
      const current = data.current;

      return {
        temperature: Math.round(current.temperature_2m),
        condition: this.getWeatherCondition(current.weather_code),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
      };
    } catch (error) {
      console.error('Weather fetch error:', error);
      return null;
    }
  }

  private getWeatherCondition(code: number): string {
    if (code === 0) return '晴朗';
    if (code <= 3) return '多云';
    if (code <= 48) return '雾';
    if (code <= 67) return '雨';
    if (code <= 77) return '雪';
    if (code <= 82) return '阵雨';
    if (code <= 86) return '阵雪';
    if (code <= 99) return '雷暴';
    return '未知';
  }

  getWeatherEmoji(condition: string): string {
    const emojiMap: Record<string, string> = {
      '晴朗': '☀️',
      '多云': '⛅',
      '雾': '🌫️',
      '雨': '🌧️',
      '雪': '❄️',
      '阵雨': '🌦️',
      '阵雪': '🌨️',
      '雷暴': '⛈️',
    };
    return emojiMap[condition] || '🌤️';
  }
}

export const weatherService = WeatherService.getInstance();
