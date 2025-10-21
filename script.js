// 初始化地图
var map = new BMap.Map("map");
map.addControl(new BMap.NavigationControl());
map.addControl(new BMap.ScaleControl());

var path = [];
var polyline = null;
var marker = null;
var totalDistance = 0;
var startTime = null;
var timer = null;
var lastPoint = null;
var MOVE_THRESHOLD = 5; // 米，小于5米不计入轨迹

// 初始化起点（多次定位取平均）
if (navigator.geolocation) {
    getInitialPosition(5); // 连续获取5次
} else {
    alert("浏览器不支持定位");
}

function getInitialPosition(times) {
    var positions = [];
    var count = 0;

    var interval = setInterval(function() {
        navigator.geolocation.getCurrentPosition(function(pos) {
            positions.push(pos.coords);
            count++;
            if (count >= times) {
                clearInterval(interval);
                // 平均值作为起点
                var lat = positions.reduce((sum, c) => sum + c.latitude, 0) / positions.length;
                var lng = positions.reduce((sum, c) => sum + c.longitude, 0) / positions.length;
                initMapAndTracking(lat, lng);
            }
        }, function(err) {
            console.warn("定位失败: " + err.message);
        }, { enableHighAccuracy: true });
    }, 500); // 每0.5秒获取一次
}

function initMapAndTracking(lat, lng) {
    var startPoint = new BMap.Point(lng, lat);
    map.centerAndZoom(startPoint, 17);

    // 添加标记
    marker = new BMap.Marker(startPoint);
    map.addOverlay(marker);

    path.push(startPoint);
    lastPoint = startPoint;

    // 初始化折线
    polyline = new BMap.Polyline(path, {
        strokeColor: "red",
        strokeWeight: 5,
        strokeOpacity: 0.8
    });
    map.addOverlay(polyline);

    // 开始计时
    startTime = new Date();
    timer = setInterval(updateTime, 1000);

    // 实时更新位置
    setInterval(updatePosition, 1000);
}

function updatePosition() {
    navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var point = new BMap.Point(lng, lat);

        // 移动距离小于阈值则忽略
        var dist = lastPoint ? map.getDistance(lastPoint, point) : 0;
        if (dist < MOVE_THRESHOLD) return;

        // 平滑移动地图中心
        map.panTo(point);

        // 更新标记位置
        marker.setPosition(point);

        // 更新折线
        path.push(point);
        polyline.setPath(path);

        // 累计距离
        totalDistance += dist;
        document.getElementById('distance').innerText = totalDistance.toFixed(2);

        lastPoint = point;
    }, function(err) {
        console.warn("定位失败: " + err.message);
    }, { enableHighAccuracy: true });
}

function updateTime() {
    if (!startTime) return;
    var elapsed = (new Date() - startTime) / 1000;
    document.getElementById('time').innerText = elapsed.toFixed(0);
    var speed = elapsed > 0 ? totalDistance / elapsed : 0;
    document.getElementById('speed').innerText = speed.toFixed(2);
}

// 重置按钮
document.getElementById('reset').addEventListener('click', function() {
    path = [];
    totalDistance = 0;
    startTime = new Date();
    lastPoint = null;

    document.getElementById('distance').innerText = '0';
    document.getElementById('time').innerText = '0';
    document.getElementById('speed').innerText = '0';

    if (polyline) {
        map.removeOverlay(polyline);
        polyline = new BMap.Polyline(path, {
            strokeColor: "red",
            strokeWeight: 5,
            strokeOpacity: 0.8
        });
        map.addOverlay(polyline);
    }
});
