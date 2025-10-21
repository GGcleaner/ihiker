import type { HikingTrack, TrackPoint, RecordingState, WeatherData, Goal, Achievement } from '../types';

class AppStore {
  private listeners: Set<() => void> = new Set();

  state = {
    currentUser: null as any,
    recordingState: 'stopped' as RecordingState,
    currentTrack: null as HikingTrack | null,
    tracks: [] as HikingTrack[],
    path: [] as TrackPoint[],
    totalDistance: 0,
    startTime: null as Date | null,
    pausedTime: 0,
    weather: null as WeatherData | null,
    goals: [] as Goal[],
    achievements: [] as Achievement[],
    showHistory: false,
    showGoals: false,
    showAchievements: false,
    showStats: false,
  };

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  setState(updates: Partial<typeof this.state>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  setRecordingState(state: RecordingState) {
    this.setState({ recordingState: state });
  }

  setCurrentUser(user: any) {
    this.setState({ currentUser: user });
  }

  setTracks(tracks: HikingTrack[]) {
    this.setState({ tracks });
  }

  setWeather(weather: WeatherData) {
    this.setState({ weather });
  }

  setGoals(goals: Goal[]) {
    this.setState({ goals });
  }

  setAchievements(achievements: Achievement[]) {
    this.setState({ achievements });
  }

  addTrack(track: HikingTrack) {
    this.setState({ tracks: [track, ...this.state.tracks] });
  }

  updateDistance(distance: number) {
    this.setState({ totalDistance: distance });
  }

  startTracking() {
    this.setState({
      recordingState: 'recording',
      startTime: new Date(),
      totalDistance: 0,
      path: [],
      pausedTime: 0,
    });
  }

  stopTracking() {
    this.setState({
      recordingState: 'stopped',
    });
  }

  toggleModal(modal: 'showHistory' | 'showGoals' | 'showAchievements' | 'showStats') {
    this.setState({ [modal]: !this.state[modal] });
  }
}

export const appStore = new AppStore();
