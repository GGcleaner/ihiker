export class VoiceService {
  private static instance: VoiceService;
  private synth: SpeechSynthesis;
  private enabled: boolean = true;

  private constructor() {
    this.synth = window.speechSynthesis;
  }

  static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  speak(text: string) {
    if (!this.enabled || !this.synth) return;

    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    this.synth.speak(utterance);
  }

  announceDistance(distanceKm: number) {
    const distance = Math.floor(distanceKm);
    if (distance > 0 && distance % 1 === 0) {
      this.speak(`已完成 ${distance} 公里`);
    }
  }

  announceTime(minutes: number) {
    if (minutes > 0 && minutes % 10 === 0) {
      this.speak(`已运动 ${minutes} 分钟`);
    }
  }

  announceStart() {
    this.speak('开始记录');
  }

  announcePause() {
    this.speak('暂停记录');
  }

  announceResume() {
    this.speak('继续记录');
  }

  announceStop(distanceKm: number, minutes: number) {
    this.speak(`运动结束，总距离 ${distanceKm.toFixed(1)} 公里，用时 ${minutes} 分钟`);
  }
}

export const voiceService = VoiceService.getInstance();
