import type { Achievement, HikingTrack } from '../types';

export class AchievementService {
  private static instance: AchievementService;

  private achievements: Achievement[] = [
    {
      id: 'first_step',
      name: '第一步',
      description: '完成第一次徒步记录',
      icon: '👣',
      unlocked: false,
    },
    {
      id: 'distance_5k',
      name: '5公里达人',
      description: '单次徒步达到5公里',
      icon: '🎯',
      unlocked: false,
    },
    {
      id: 'distance_10k',
      name: '10公里挑战',
      description: '单次徒步达到10公里',
      icon: '🏃',
      unlocked: false,
    },
    {
      id: 'distance_half_marathon',
      name: '半程马拉松',
      description: '单次徒步达到21公里',
      icon: '🏅',
      unlocked: false,
    },
    {
      id: 'distance_marathon',
      name: '全程马拉松',
      description: '单次徒步达到42公里',
      icon: '🏆',
      unlocked: false,
    },
    {
      id: 'time_1hour',
      name: '一小时挑战',
      description: '单次徒步超过1小时',
      icon: '⏰',
      unlocked: false,
    },
    {
      id: 'time_2hours',
      name: '耐力达人',
      description: '单次徒步超过2小时',
      icon: '💪',
      unlocked: false,
    },
    {
      id: 'streak_7days',
      name: '一周坚持',
      description: '连续7天徒步',
      icon: '🔥',
      unlocked: false,
    },
    {
      id: 'streak_30days',
      name: '月度坚持',
      description: '连续30天徒步',
      icon: '⭐',
      unlocked: false,
    },
    {
      id: 'total_100k',
      name: '百公里俱乐部',
      description: '累计徒步100公里',
      icon: '🌟',
      unlocked: false,
    },
    {
      id: 'total_500k',
      name: '长征者',
      description: '累计徒步500公里',
      icon: '🚀',
      unlocked: false,
    },
    {
      id: 'count_10',
      name: '十全十美',
      description: '完成10次徒步',
      icon: '🎊',
      unlocked: false,
    },
  ];

  private constructor() {}

  static getInstance(): AchievementService {
    if (!AchievementService.instance) {
      AchievementService.instance = new AchievementService();
    }
    return AchievementService.instance;
  }

  getAllAchievements(): Achievement[] {
    return [...this.achievements];
  }

  checkAchievements(track: HikingTrack, tracks: HikingTrack[]): Achievement[] {
    const unlocked: Achievement[] = [];
    const distanceKm = track.total_distance / 1000;
    const timeHours = track.total_time / 3600;

    if (tracks.length === 1) {
      unlocked.push(this.unlockAchievement('first_step'));
    }

    if (distanceKm >= 5 && !this.isUnlocked('distance_5k')) {
      unlocked.push(this.unlockAchievement('distance_5k'));
    }

    if (distanceKm >= 10 && !this.isUnlocked('distance_10k')) {
      unlocked.push(this.unlockAchievement('distance_10k'));
    }

    if (distanceKm >= 21 && !this.isUnlocked('distance_half_marathon')) {
      unlocked.push(this.unlockAchievement('distance_half_marathon'));
    }

    if (distanceKm >= 42 && !this.isUnlocked('distance_marathon')) {
      unlocked.push(this.unlockAchievement('distance_marathon'));
    }

    if (timeHours >= 1 && !this.isUnlocked('time_1hour')) {
      unlocked.push(this.unlockAchievement('time_1hour'));
    }

    if (timeHours >= 2 && !this.isUnlocked('time_2hours')) {
      unlocked.push(this.unlockAchievement('time_2hours'));
    }

    const totalDistance = tracks.reduce((sum, t) => sum + t.total_distance, 0) / 1000;
    if (totalDistance >= 100 && !this.isUnlocked('total_100k')) {
      unlocked.push(this.unlockAchievement('total_100k'));
    }

    if (totalDistance >= 500 && !this.isUnlocked('total_500k')) {
      unlocked.push(this.unlockAchievement('total_500k'));
    }

    if (tracks.length >= 10 && !this.isUnlocked('count_10')) {
      unlocked.push(this.unlockAchievement('count_10'));
    }

    return unlocked;
  }

  private unlockAchievement(id: string): Achievement {
    const achievement = this.achievements.find(a => a.id === id);
    if (achievement) {
      achievement.unlocked = true;
      achievement.unlockedAt = new Date().toISOString();
    }
    return achievement!;
  }

  private isUnlocked(id: string): boolean {
    return this.achievements.find(a => a.id === id)?.unlocked || false;
  }
}

export const achievementService = AchievementService.getInstance();
