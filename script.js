import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

let map;
let path = [];
let polyline = null;
let marker = null;
let totalDistance = 0;
let startTime = null;
let pausedTime = 0;
let lastPauseTime = null;
let timer = null;
let lastPoint = null;
let currentTrackId = null;
let currentUser = null;
let recordingState = 'stopped';
let pointSequence = 0;

const MOVE_THRESHOLD = 5;
const UPDATE_INTERVAL = 1000;
const SMOOTHING_WINDOW = 5;
let recentSpeeds = [];

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

function getInitialPosition(times) {
  const positions = [];
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
        }
      },
      (err) => {
        console.warn("定位失败: " + err.message);
      },
      { enableHighAccuracy: true }
    );
  }, 500);
}

function initMapView(lat, lng) {
  const startPoint = new BMap.Point(lng, lat);
  map.centerAndZoom(startPoint, 17);

  marker = new BMap.Marker(startPoint);
  map.addOverlay(marker);

  lastPoint = startPoint;
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

  timer = setInterval(updateTime, 1000);
  setInterval(updatePosition, UPDATE_INTERVAL);
}

function pauseTracking() {
  if (recordingState !== 'recording') return;

  recordingState = 'paused';
  updateControlButtons();

  lastPauseTime = new Date();
  clearInterval(timer);
}

function resumeTracking() {
  if (recordingState !== 'paused') return;

  recordingState = 'recording';
  updateControlButtons();

  if (lastPauseTime) {
    pausedTime += new Date() - lastPauseTime;
    lastPauseTime = null;
  }

  timer = setInterval(updateTime, 1000);
}

async function stopTracking() {
  if (recordingState === 'stopped') return;

  recordingState = 'stopped';
  updateControlButtons();

  clearInterval(timer);

  if (currentUser && path.length > 0) {
    await saveTrack();
    document.getElementById('export-panel').style.display = 'flex';
  }

  const shouldReset = confirm("轨迹已保存。是否清除地图上的轨迹？");
  if (shouldReset) {
    resetTracking();
    document.getElementById('export-panel').style.display = 'none';
  }
}

function updateControlButtons() {
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');

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
  const elapsed = now - startTime - pausedTime;
  if (recordingState === 'paused' && lastPauseTime) {
    return elapsed - (now - lastPauseTime);
  }
  return elapsed;
}

function updateTime() {
  updateStats();
}

function updateStats() {
  const elapsed = getElapsedTime() / 1000;

  const distanceKm = totalDistance / 1000;
  document.getElementById('distance').textContent = distanceKm.toFixed(2);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = Math.floor(elapsed % 60);
  document.getElementById('time').textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const avgSpeed = recentSpeeds.length > 0
    ? recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length
    : 0;
  const speedKmh = avgSpeed * 3.6;
  document.getElementById('speed').textContent = speedKmh.toFixed(1);

  const paceMinPerKm = speedKmh > 0 ? 60 / speedKmh : 0;
  const paceMin = Math.floor(paceMinPerKm);
  const paceSec = Math.floor((paceMinPerKm - paceMin) * 60);
  document.getElementById('pace').textContent =
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
  currentTrackId = null;
  pointSequence = 0;
  recentSpeeds = [];
  recordingState = 'stopped';

  document.getElementById('distance').textContent = '0.00';
  document.getElementById('time').textContent = '00:00:00';
  document.getElementById('speed').textContent = '0.0';
  document.getElementById('pace').textContent = '-';

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
  if (!currentUser) {
    alert("请先登录");
    return;
  }

  const endTime = new Date();
  const totalTime = Math.floor(getElapsedTime() / 1000);
  const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 0;
  const maxSpeed = recentSpeeds.length > 0 ? Math.max(...recentSpeeds) : 0;

  const trackName = `徒步 ${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

  try {
    const { data: track, error: trackError } = await supabase
      .from('hiking_tracks')
      .insert({
        user_id: currentUser.id,
        name: trackName,
        total_distance: totalDistance,
        total_time: totalTime,
        avg_speed: avgSpeed,
        max_speed: maxSpeed,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      })
      .select()
      .maybeSingle();

    if (trackError) throw trackError;

    if (track && path.length > 0) {
      const points = path.map((point, index) => ({
        track_id: track.id,
        latitude: point.lat,
        longitude: point.lng,
        sequence: index,
        timestamp: new Date(startTime.getTime() + index * UPDATE_INTERVAL).toISOString()
      }));

      const { error: pointsError } = await supabase
        .from('track_points')
        .insert(points);

      if (pointsError) throw pointsError;

      alert("轨迹保存成功！");
    }
  } catch (error) {
    console.error("保存轨迹失败:", error);
    alert("保存轨迹失败: " + error.message);
  }
}

async function loadTracks() {
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

    displayTracks(tracks || []);
  } catch (error) {
    console.error("加载轨迹失败:", error);
    alert("加载轨迹失败: " + error.message);
  }
}

function displayTracks(tracks) {
  const trackList = document.getElementById('track-list');

  if (tracks.length === 0) {
    trackList.innerHTML = '<div class="empty-state">暂无徒步记录</div>';
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

  document.querySelectorAll('.track-item').forEach(item => {
    item.addEventListener('click', () => loadTrackDetails(item.dataset.trackId));
  });
}

async function loadTrackDetails(trackId) {
  try {
    const { data: points, error } = await supabase
      .from('track_points')
      .select('*')
      .eq('track_id', trackId)
      .order('sequence', { ascending: true });

    if (error) throw error;

    if (points && points.length > 0) {
      path = points.map(p => new BMap.Point(p.longitude, p.latitude));

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

      currentTrackId = trackId;
      document.getElementById('export-panel').style.display = 'flex';
    }
  } catch (error) {
    console.error("加载轨迹详情失败:", error);
    alert("加载轨迹详情失败: " + error.message);
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

  const shareText = `我在 iHiker 上完成了一次徒步！
距离: ${distanceKm} 公里
用时: ${timeStr}
来一起加入徒步吧！`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'iHiker 徒步分享',
        text: shareText
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        fallbackShare(shareText);
      }
    }
  } else {
    fallbackShare(shareText);
  }
}

function fallbackShare(text) {
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

let isLogin = true;

function setupAuthModal() {
  const authBtn = document.getElementById('auth-btn');
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const switchAuth = document.getElementById('switch-auth');
  const authTitle = document.getElementById('auth-title');

  authBtn.addEventListener('click', () => {
    if (currentUser) {
      handleLogout();
    } else {
      openModal('auth-modal');
    }
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (isLogin) {
      await handleLogin(email, password);
    } else {
      await handleSignup(email, password);
    }
  });

  switchAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    authTitle.textContent = isLogin ? '登录账号' : '注册账号';
    authForm.querySelector('button[type="submit"]').textContent = isLogin ? '登录' : '注册';
    switchAuth.textContent = isLogin ? '注册' : '登录';
    document.querySelector('.auth-switch').firstChild.textContent =
      isLogin ? '还没有账号?' : '已有账号?';
  });
}

async function handleLogin(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    updateAuthUI();
    closeModal('auth-modal');
    alert("登录成功！");
  } catch (error) {
    console.error("登录失败:", error);
    alert("登录失败: " + error.message);
  }
}

async function handleSignup(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    alert("注册成功！请登录。");
    isLogin = true;
    document.getElementById('auth-title').textContent = '登录账号';
    document.getElementById('auth-form').querySelector('button[type="submit"]').textContent = '登录';
  } catch (error) {
    console.error("注册失败:", error);
    alert("注册失败: " + error.message);
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    currentUser = null;
    updateAuthUI();
    alert("已退出登录");
  } catch (error) {
    console.error("退出失败:", error);
    alert("退出失败: " + error.message);
  }
}

function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const historyBtn = document.getElementById('history-btn');

  if (currentUser) {
    authBtn.textContent = '退出';
    historyBtn.style.display = 'block';
  } else {
    authBtn.textContent = '登录';
    historyBtn.style.display = 'none';
  }
}

function setupHistoryModal() {
  const historyBtn = document.getElementById('history-btn');

  historyBtn.addEventListener('click', () => {
    openModal('history-modal');
    loadTracks();
  });
}

function setupModals() {
  const modals = document.querySelectorAll('.modal');
  const closeButtons = document.querySelectorAll('.close');

  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  window.addEventListener('click', (e) => {
    modals.forEach(modal => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
}

function openModal(modalId) {
  document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function setupControls() {
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportGpxBtn = document.getElementById('export-gpx-btn');
  const shareBtn = document.getElementById('share-btn');

  startBtn.addEventListener('click', startTracking);

  pauseBtn.addEventListener('click', () => {
    if (recordingState === 'recording') {
      pauseTracking();
    } else if (recordingState === 'paused') {
      resumeTracking();
    }
  });

  stopBtn.addEventListener('click', stopTracking);

  exportGpxBtn.addEventListener('click', downloadGPX);
  shareBtn.addEventListener('click', shareTrack);
}

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    currentUser = session.user;
    updateAuthUI();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    (() => {
      if (session) {
        currentUser = session.user;
      } else {
        currentUser = null;
      }
      updateAuthUI();
    })();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupAuthModal();
  setupHistoryModal();
  setupModals();
  setupControls();
  checkAuth();
});
