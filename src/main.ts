import { supabase } from './services/supabase';
import { weatherService } from './services/weatherService';
import { voiceService } from './services/voiceService';
import { achievementService } from './services/achievementService';
import { appStore } from './stores/appStore';
import type { RecordingState, TrackPoint, HikingTrack } from './types';

declare const BMap: any;

let map: any;
let path: any[] = [];
let polyline: any = null;
let marker: any = null;
let totalDistance = 0;
let startTime: Date | null = null;
let pausedTime = 0;
let lastPauseTime: Date | null = null;
let timer: number | null = null;
let lastPoint: any = null;
let recordingState: RecordingState = 'stopped';
let pointSequence = 0;
let isLogin = true;
let voiceEnabled = true;
let lastDistanceAnnounced = 0;
let lastTimeAnnounced = 0;

const MOVE_THRESHOLD = 5;
const UPDATE_INTERVAL = 1000;
const SMOOTHING_WINDOW = 5;
let recentSpeeds: number[] = [];

function initMap() {
  map = new BMap.Map("map");
  map.addControl(new BMap.NavigationControl());
  map.addControl(new BMap.ScaleControl());

  if (navigator.geolocation) {
    getInitialPosition(3);
  } else {
    alert("浏览器不支持定位");
  }
}

function getInitialPosition(times: number) {
  const positions: GeolocationCoordinates[] = [];
  let count = 0;

  const interval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        positions.push(pos.coords);
        count++;
        if (count >= times) {
          clearInterval(interval);
          const lat = positions.reduce((sum, c) => sum + c.latitude, 0) / positions.length;
          const lng = positions.reduce((sum, c) => sum + c.longitude, 0) / positions.length;
          initMapView(lat, lng);
          loadWeather(lat, lng);
        }
      },
      (err) => {
        console.warn("定位失败: " + err.message);
      },
      { enableHighAccuracy: true }
    );
  }, 500);
}

function initMapView(lat: number, lng: number) {
  const startPoint = new BMap.Point(lng, lat);
  map.centerAndZoom(startPoint, 17);

  marker = new BMap.Marker(startPoint);
  map.addOverlay(marker);

  lastPoint = startPoint;
}

async function loadWeather(lat: number, lng: number) {
  const weather = await weatherService.getWeather(lat, lng);
  if (weather) {
    appStore.setWeather(weather);
    const widget = document.getElementById('weather-widget');
    const icon = document.getElementById('weather-icon');
    const temp = document.getElementById('weather-temp');

    if (widget && icon && temp) {
      widget.style.display = 'flex';
      icon.textContent = weatherService.getWeatherEmoji(weather.condition);
      temp.textContent = `${weather.temperature}°C`;
    }
  }
}

function startTracking() {
  if (recordingState !== 'stopped') return;

  recordingState = 'recording';
  updateControlButtons();

  path = [];
  totalDistance = 0;
  pausedTime = 0;
  lastPauseTime = null;
  pointSequence = 0;
  recentSpeeds = [];
  lastDistanceAnnounced = 0;
  lastTimeAnnounced = 0;
  startTime = new Date();

  if (polyline) {
    map.removeOverlay(polyline);
  }

  polyline = new BMap.Polyline(path, {
    strokeColor: "#10b981",
    strokeWeight: 5,
    strokeOpacity: 0.8
  });
  map.addOverlay(polyline);

  timer = window.setInterval(updateTime, 1000);
  setInterval(updatePosition, UPDATE_INTERVAL);

  voiceService.announceStart();
}

function pauseTracking() {
  if (recordingState !== 'recording') return;

  recordingState = 'paused';
  updateControlButtons();

  lastPauseTime = new Date();
  if (timer) clearInterval(timer);

  voiceService.announcePause();
}

function resumeTracking() {
  if (recordingState !== 'paused') return;

  recordingState = 'recording';
  updateControlButtons();

  if (lastPauseTime) {
    pausedTime += new Date().getTime() - lastPauseTime.getTime();
    lastPauseTime = null;
  }

  timer = window.setInterval(updateTime, 1000);

  voiceService.announceResume();
}

async function stopTracking() {
  if (recordingState === 'stopped') return;

  recordingState = 'stopped';
  updateControlButtons();

  if (timer) clearInterval(timer);

  const currentUser = appStore.state.currentUser;
  if (currentUser && path.length > 0) {
    await saveTrack();
    document.getElementById('export-panel')!.style.display = 'flex';
  }

  const distanceKm = totalDistance / 1000;
  const minutes = Math.floor(getElapsedTime() / 1000 / 60);
  voiceService.announceStop(distanceKm, minutes);

  const shouldReset = confirm("轨迹已保存。是否清除地图上的轨迹？");
  if (shouldReset) {
    resetTracking();
    document.getElementById('export-panel')!.style.display = 'none';
  }
}

function updateControlButtons() {
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;

  if (recordingState === 'stopped') {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    startBtn.textContent = '开始';
  } else if (recordingState === 'recording') {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    pauseBtn.textContent = '暂停';
  } else if (recordingState === 'paused') {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    pauseBtn.textContent = '继续';
  }
}

function updatePosition() {
  if (recordingState !== 'recording') return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const point = new BMap.Point(lng, lat);

      const dist = lastPoint ? map.getDistance(lastPoint, point) : 0;
      if (dist < MOVE_THRESHOLD) return;

      map.panTo(point);
      marker.setPosition(point);

      path.push(point);
      polyline.setPath(path);

      totalDistance += dist;

      const elapsed = getElapsedTime() / 1000;
      const currentSpeed = elapsed > 0 ? dist / (UPDATE_INTERVAL / 1000) : 0;

      recentSpeeds.push(currentSpeed);
      if (recentSpeeds.length > SMOOTHING_WINDOW) {
        recentSpeeds.shift();
      }

      updateStats();

      const distanceKm = totalDistance / 1000;
      if (Math.floor(distanceKm) > lastDistanceAnnounced) {
        lastDistanceAnnounced = Math.floor(distanceKm);
        voiceService.announceDistance(distanceKm);
      }

      const minutes = Math.floor(elapsed / 60);
      if (minutes > 0 && minutes % 10 === 0 && minutes > lastTimeAnnounced) {
        lastTimeAnnounced = minutes;
        voiceService.announceTime(minutes);
      }

      lastPoint = point;
      pointSequence++;
    },
    (err) => {
      console.warn("定位失败: " + err.message);
    },
    { enableHighAccuracy: true }
  );
}

function getElapsedTime() {
  if (!startTime) return 0;
  const now = new Date();
  const elapsed = now.getTime() - startTime.getTime() - pausedTime;
  if (recordingState === 'paused' && lastPauseTime) {
    return elapsed - (now.getTime() - lastPauseTime.getTime());
  }
  return elapsed;
}

function updateTime() {
  updateStats();
}

function updateStats() {
  const elapsed = getElapsedTime() / 1000;

  const distanceKm = totalDistance / 1000;
  (document.getElementById('distance') as HTMLElement).textContent = distanceKm.toFixed(2);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = Math.floor(elapsed % 60);
  (document.getElementById('time') as HTMLElement).textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const avgSpeed = recentSpeeds.length > 0
    ? recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length
    : 0;
  const speedKmh = avgSpeed * 3.6;
  (document.getElementById('speed') as HTMLElement).textContent = speedKmh.toFixed(1);

  const paceMinPerKm = speedKmh > 0 ? 60 / speedKmh : 0;
  const paceMin = Math.floor(paceMinPerKm);
  const paceSec = Math.floor((paceMinPerKm - paceMin) * 60);
  (document.getElementById('pace') as HTMLElement).textContent =
    paceMinPerKm > 0 && paceMinPerKm < 99
      ? `${paceMin}:${String(paceSec).padStart(2, '0')}`
      : '-';
}

function resetTracking() {
  path = [];
  totalDistance = 0;
  startTime = null;
  pausedTime = 0;
  lastPauseTime = null;
  lastPoint = null;
  pointSequence = 0;
  recentSpeeds = [];
  recordingState = 'stopped';

  (document.getElementById('distance') as HTMLElement).textContent = '0.00';
  (document.getElementById('time') as HTMLElement).textContent = '00:00:00';
  (document.getElementById('speed') as HTMLElement).textContent = '0.0';
  (document.getElementById('pace') as HTMLElement).textContent = '-';

  if (polyline) {
    map.removeOverlay(polyline);
    polyline = new BMap.Polyline(path, {
      strokeColor: "#10b981",
      strokeWeight: 5,
      strokeOpacity: 0.8
    });
    map.addOverlay(polyline);
  }

  updateControlButtons();
}

async function saveTrack() {
  const currentUser = appStore.state.currentUser;
  if (!currentUser) {
    alert("请先登录");
    return;
  }

  const endTime = new Date();
  const totalTime = Math.floor(getElapsedTime() / 1000);
  const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 0;
  const maxSpeed = recentSpeeds.length > 0 ? Math.max(...recentSpeeds) : 0;

  const trackName = `跑步 ${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

  try {
    const trackData: any = {
      user_id: currentUser.id,
      name: trackName,
      total_distance: totalDistance,
      total_time: totalTime,
      avg_speed: avgSpeed,
      max_speed: maxSpeed,
      start_time: startTime!.toISOString(),
      end_time: endTime.toISOString()
    };

    if (appStore.state.weather) {
      trackData.weather = appStore.state.weather;
    }

    const { data: track, error: trackError } = await supabase
      .from('hiking_tracks')
      .insert(trackData)
      .select()
      .maybeSingle();

    if (trackError) throw trackError;

    if (track && path.length > 0) {
      const points = path.map((point: any, index: number) => ({
        track_id: track.id,
        latitude: point.lat,
        longitude: point.lng,
        sequence: index,
        timestamp: new Date(startTime!.getTime() + index * UPDATE_INTERVAL).toISOString()
      }));

      const { error: pointsError } = await supabase
        .from('track_points')
        .insert(points);

      if (pointsError) throw pointsError;

      const tracks = appStore.state.tracks;
      const newAchievements = achievementService.checkAchievements(track, [...tracks, track]);

      if (newAchievements.length > 0) {
        for (const achievement of newAchievements) {
          await supabase.from('user_achievements').insert({
            user_id: currentUser.id,
            achievement_id: achievement.id
          });
          showAchievementToast(achievement);
        }
      }

      appStore.addTrack(track);
      alert("轨迹保存成功！");
    }
  } catch (error) {
    console.error("保存轨迹失败:", error);
    alert("保存轨迹失败: " + (error as Error).message);
  }
}

function showAchievementToast(achievement: any) {
  const toast = document.getElementById('achievement-toast');
  if (!toast) return;

  const icon = toast.querySelector('.achievement-icon');
  const name = toast.querySelector('.achievement-name');

  if (icon) icon.textContent = achievement.icon;
  if (name) name.textContent = achievement.name;

  toast.style.display = 'flex';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 5000);
}

async function loadTracks() {
  const currentUser = appStore.state.currentUser;
  if (!currentUser) {
    alert("请先登录");
    return;
  }

  try {
    const { data: tracks, error } = await supabase
      .from('hiking_tracks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('start_time', { ascending: false });

    if (error) throw error;

    appStore.setTracks(tracks || []);
    displayTracks(tracks || []);
  } catch (error) {
    console.error("加载轨迹失败:", error);
    alert("加载轨迹失败: " + (error as Error).message);
  }
}

function displayTracks(tracks: HikingTrack[]) {
  const trackList = document.getElementById('track-list');
  if (!trackList) return;

  if (tracks.length === 0) {
    trackList.innerHTML = '<div class="empty-state">暂无跑步记录</div>';
    return;
  }

  trackList.innerHTML = tracks.map(track => {
    const distanceKm = (track.total_distance / 1000).toFixed(2);
    const hours = Math.floor(track.total_time / 3600);
    const minutes = Math.floor((track.total_time % 3600) / 60);
    const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
    const avgSpeedKmh = (track.avg_speed * 3.6).toFixed(1);
    const date = new Date(track.start_time).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="track-item" data-track-id="${track.id}">
        <div class="track-header">
          <div class="track-name">${track.name}</div>
          <div class="track-date">${date}</div>
        </div>
        <div class="track-stats">
          <div class="track-stat">
            <div class="track-stat-label">距离</div>
            <div class="track-stat-value">${distanceKm} 公里</div>
          </div>
          <div class="track-stat">
            <div class="track-stat-label">用时</div>
            <div class="track-stat-value">${timeStr}</div>
          </div>
          <div class="track-stat">
            <div class="track-stat-label">平均速度</div>
            <div class="track-stat-value">${avgSpeedKmh} 公里/时</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  trackList.querySelectorAll('.track-item').forEach(item => {
    item.addEventListener('click', () => {
      const trackId = (item as HTMLElement).dataset.trackId;
      if (trackId) loadTrackDetails(trackId);
    });
  });
}

async function loadTrackDetails(trackId: string) {
  try {
    const { data: points, error } = await supabase
      .from('track_points')
      .select('*')
      .eq('track_id', trackId)
      .order('sequence', { ascending: true });

    if (error) throw error;

    if (points && points.length > 0) {
      path = points.map((p: any) => new BMap.Point(p.longitude, p.latitude));

      if (polyline) {
        map.removeOverlay(polyline);
      }

      polyline = new BMap.Polyline(path, {
        strokeColor: "#3b82f6",
        strokeWeight: 5,
        strokeOpacity: 0.8
      });
      map.addOverlay(polyline);

      map.setViewport(path);
      closeModal('history-modal');

      document.getElementById('export-panel')!.style.display = 'flex';
    }
  } catch (error) {
    console.error("加载轨迹详情失败:", error);
    alert("加载轨迹详情失败: " + (error as Error).message);
  }
}

function generateGPX() {
  if (path.length === 0) {
    alert("没有可导出的轨迹数据");
    return;
  }

  const now = new Date().toISOString();
  let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="iHiker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>iHiker Track</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>Hiking Track ${new Date().toLocaleDateString('zh-CN')}</name>
    <trkseg>
`;

  path.forEach(point => {
    gpxContent += `      <trkpt lat="${point.lat}" lon="${point.lng}">
        <time>${now}</time>
      </trkpt>
`;
  });

  gpxContent += `    </trkseg>
  </trk>
</gpx>`;

  return gpxContent;
}

function downloadGPX() {
  const gpxContent = generateGPX();
  if (!gpxContent) return;

  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ihiker-track-${new Date().toISOString().slice(0, 10)}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function shareTrack() {
  if (path.length === 0) {
    alert("没有可分享的轨迹数据");
    return;
  }

  const distanceKm = (totalDistance / 1000).toFixed(2);
  const elapsed = getElapsedTime() / 1000;
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;

  const shareText = `我在 iRunner 上完成了一次跑步！
距离: ${distanceKm} 公里
用时: ${timeStr}
来一起加入跑步吧！`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'iHiker 跑步分享',
        text: shareText
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        fallbackShare(shareText);
      }
    }
  } else {
    fallbackShare(shareText);
  }
}

function fallbackShare(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert("分享内容已复制到剪贴板！");
    }).catch(() => {
      alert("分享失败，请手动复制内容");
    });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert("分享内容已复制到剪贴板！");
    } catch (err) {
      alert("分享失败");
    }
    document.body.removeChild(textarea);
  }
}

function setupAuthModal() {
  const authBtn = document.getElementById('auth-btn');
  const authForm = document.getElementById('auth-form');
  const switchAuth = document.getElementById('switch-auth');
  const authTitle = document.getElementById('auth-title');

  authBtn?.addEventListener('click', () => {
    if (appStore.state.currentUser) {
      handleLogout();
    } else {
      openModal('auth-modal');
    }
  });

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;

    if (isLogin) {
      await handleLogin(email, password);
    } else {
      await handleSignup(email, password);
    }
  });

  switchAuth?.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    if (authTitle) authTitle.textContent = isLogin ? '登录账号' : '注册账号';
    const submitBtn = authForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = isLogin ? '登录' : '注册';
    if (switchAuth) switchAuth.textContent = isLogin ? '注册' : '登录';
    const switchText = document.querySelector('.auth-switch');
    if (switchText) {
      const firstChild = switchText.firstChild;
      if (firstChild) {
        firstChild.textContent = isLogin ? '还没有账号？' : '已有账号？';
      }
    }
  });
}

async function handleLogin(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    appStore.setCurrentUser(data.user);
    updateAuthUI();
    closeModal('auth-modal');
    await loadTracks();
    alert("登录成功！");
  } catch (error) {
    console.error("登录失败:", error);
    alert("登录失败: " + (error as Error).message);
  }
}

async function handleSignup(email: string, password: string) {
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    alert("注册成功！请登录。");
    isLogin = true;
    const authTitle = document.getElementById('auth-title');
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    if (authTitle) authTitle.textContent = '登录账号';
    if (submitBtn) submitBtn.textContent = '登录';
  } catch (error) {
    console.error("注册失败:", error);
    alert("注册失败: " + (error as Error).message);
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    appStore.setCurrentUser(null);
    updateAuthUI();
    alert("已退出登录");
  } catch (error) {
    console.error("退出失败:", error);
    alert("退出失败: " + (error as Error).message);
  }
}

function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const historyBtn = document.getElementById('history-btn');

  if (appStore.state.currentUser) {
    if (authBtn) authBtn.textContent = '退出';
    if (historyBtn) historyBtn.style.display = 'block';
  } else {
    if (authBtn) authBtn.textContent = '登录';
    if (historyBtn) historyBtn.style.display = 'none';
  }
}

function setupHistoryModal() {
  const historyBtn = document.getElementById('history-btn');

  historyBtn?.addEventListener('click', () => {
    openModal('history-modal');
    loadTracks();
  });
}

function setupStatsModal() {
  const statsBtn = document.getElementById('stats-btn');

  statsBtn?.addEventListener('click', async () => {
    openModal('stats-modal');
    await loadStats();
  });
}

async function loadStats() {
  const currentUser = appStore.state.currentUser;
  if (!currentUser) {
    alert("请先登录查看统计");
    return;
  }

  const tracks = appStore.state.tracks;
  if (tracks.length === 0) {
    await loadTracks();
  }

  const totalDistance = tracks.reduce((sum, t) => sum + t.total_distance, 0) / 1000;
  const totalTime = tracks.reduce((sum, t) => sum + t.total_time, 0) / 3600;
  const totalCount = tracks.length;
  const avgSpeed = totalTime > 0 ? (totalDistance / totalTime) : 0;

  const el = (id: string) => document.getElementById(id);
  if (el('total-distance')) el('total-distance')!.textContent = `${totalDistance.toFixed(2)} 公里`;
  if (el('total-time')) el('total-time')!.textContent = `${totalTime.toFixed(1)} 小时`;
  if (el('total-count')) el('total-count')!.textContent = `${totalCount} 次`;
  if (el('avg-speed')) el('avg-speed')!.textContent = `${avgSpeed.toFixed(1)} 公里/时`;

  drawTrendChart(tracks);
}

function drawTrendChart(tracks: HikingTrack[]) {
  const canvas = document.getElementById('trend-chart') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const last7Days = tracks.slice(0, 7).reverse();
  const maxDistance = Math.max(...last7Days.map(t => t.total_distance / 1000), 1);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = 40;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = (maxDistance * (5 - i) / 5).toFixed(1);
    const y = padding + (chartHeight / 5) * i;
    ctx.fillText(value, padding - 10, y + 4);
  }

  ctx.fillStyle = '#10b981';
  const barWidth = chartWidth / last7Days.length / 1.5;
  last7Days.forEach((track, index) => {
    const x = padding + (chartWidth / last7Days.length) * index + (chartWidth / last7Days.length - barWidth) / 2;
    const distance = track.total_distance / 1000;
    const height = (distance / maxDistance) * chartHeight;
    const y = padding + chartHeight - height;

    ctx.fillRect(x, y, barWidth, height);

    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    const date = new Date(track.start_time);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    ctx.fillText(dateStr, x + barWidth / 2, canvas.height - padding + 20);
    ctx.fillStyle = '#10b981';
  });
}

function setupAchievementsModal() {
  const achievementsBtn = document.getElementById('achievements-btn');

  achievementsBtn?.addEventListener('click', async () => {
    openModal('achievements-modal');
    await loadAchievements();
  });
}

async function loadAchievements() {
  const currentUser = appStore.state.currentUser;
  if (!currentUser) {
    alert("请先登录查看成就");
    return;
  }

  try {
    const { data: userAchievements } = await supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', currentUser.id);

    const unlockedIds = new Set(userAchievements?.map(a => a.achievement_id) || []);
    const achievements = achievementService.getAllAchievements();

    const achievementsList = document.getElementById('achievements-list');
    if (!achievementsList) return;

    achievementsList.innerHTML = achievements.map(achievement => {
      const unlocked = unlockedIds.has(achievement.id);
      return `
        <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="achievement-emoji">${unlocked ? achievement.icon : '🔒'}</div>
          <div class="achievement-name">${achievement.name}</div>
          <div class="achievement-desc">${achievement.description}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error("加载成就失败:", error);
  }
}

function setupModals() {
  const closeButtons = document.querySelectorAll('.close');

  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = (btn as HTMLElement).dataset.modal;
      if (modalId) closeModal(modalId);
    });
  });

  window.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('modal')) {
      (e.target as HTMLElement).style.display = 'none';
    }
  });
}

function openModal(modalId: string) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'block';
}

function closeModal(modalId: string) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function setupControls() {
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportGpxBtn = document.getElementById('export-gpx-btn');
  const shareBtn = document.getElementById('share-btn');
  const voiceToggleBtn = document.getElementById('voice-toggle-btn');

  startBtn?.addEventListener('click', startTracking);

  pauseBtn?.addEventListener('click', () => {
    if (recordingState === 'recording') {
      pauseTracking();
    } else if (recordingState === 'paused') {
      resumeTracking();
    }
  });

  stopBtn?.addEventListener('click', stopTracking);
  exportGpxBtn?.addEventListener('click', downloadGPX);
  shareBtn?.addEventListener('click', shareTrack);

  voiceToggleBtn?.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    voiceService.setEnabled(voiceEnabled);
    const icon = document.getElementById('voice-icon');
    if (icon) icon.textContent = voiceEnabled ? '🔊' : '🔇';
  });
}

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    appStore.setCurrentUser(session.user);
    updateAuthUI();
    await loadTracks();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    (() => {
      if (session) {
        appStore.setCurrentUser(session.user);
      } else {
        appStore.setCurrentUser(null);
      }
      updateAuthUI();
    })();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupAuthModal();
  setupHistoryModal();
  setupStatsModal();
  setupAchievementsModal();
  setupModals();
  setupControls();
  checkAuth();
});
