import { ref, onUnmounted, type Ref } from 'vue';
import type { AmapConfig, TripPlan } from '@/shared/types/contracts';
import { request } from '@/shared/api/client';
import { escapeHtml } from './markdown';

export const DAY_COLORS = ['#c23e32', '#2563eb', '#059669', '#7c3aed', '#d97706', '#0891b2', '#db2777'];

let cachedMapConfig: AmapConfig | null = null;
let amapSdkPromise: Promise<any> | null = null;

export async function loadMapConfig(): Promise<AmapConfig> {
  if (cachedMapConfig) return cachedMapConfig;
  try {
    const data = await request<{ map: AmapConfig }>('/api/map-config');
    cachedMapConfig = data.map;
  } catch {
    cachedMapConfig = { keyConfigured: false, mode: '路线数据模式' };
  }
  return cachedMapConfig;
}

export function loadAmapSdk(): Promise<any> {
  if ((window as any).AMap) return Promise.resolve((window as any).AMap);
  if (amapSdkPromise) return amapSdkPromise;

  amapSdkPromise = new Promise(async (resolve, reject) => {
    const config = await loadMapConfig();
    if (!config?.key) return reject(new Error('未配置高德 JS API Key'));

    (window as any)._AMapSecurityConfig = config.securityJsCode ? { securityJsCode: config.securityJsCode } : undefined;
    const callbackName = `__yuyouzhiceAmapReady_${Date.now()}`;
    const timer = window.setTimeout(() => {
      delete (window as any)[callbackName];
      amapSdkPromise = null;
      reject(new Error('高德 JS API 加载超时'));
    }, 8000);

    (window as any)[callbackName] = () => {
      window.clearTimeout(timer);
      delete (window as any)[callbackName];
      resolve((window as any).AMap);
    };

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      delete (window as any)[callbackName];
      amapSdkPromise = null;
      reject(new Error('高德 JS API 脚本加载失败'));
    };
    document.head.appendChild(script);
  });

  return amapSdkPromise;
}

export function mapPoints(trip?: TripPlan | null, dayFilter = 0) {
  if (!trip?.days) return [];
  const days = dayFilter > 0 ? trip.days.filter((d) => d.day === dayFilter) : trip.days;
  return days.flatMap((day) =>
    (day.stops || []).map((stop, idx) => ({
      stop,
      day: day.day,
      dayIndex: idx + 1,
      color: DAY_COLORS[(day.day - 1) % DAY_COLORS.length],
      coordinates: stop.mapContext?.coordinates
    }))
  ).filter((item) => Array.isArray(item.coordinates) && item.coordinates.length === 2 && item.coordinates.every(Number.isFinite));
}

export function mapPath(polyline: Array<string | [number, number]> = []) {
  return polyline
    .map((val) => (typeof val === 'string' ? val.split(',').map(Number) : val))
    .filter((point) => point.length === 2 && point.every(Number.isFinite));
}

export function navigateTo(name: string, location = '') {
  const targetName = encodeURIComponent(String(name || '目的地'));
  let coords = String(location || '').trim();
  let lng = '';
  let lat = '';
  if (coords.includes(',')) {
    const parts = coords.split(',');
    lng = parts[0].trim();
    lat = parts[1].trim();
  }

  const webNavUrl = coords
    ? `https://uri.amap.com/navigation?to=${lng},${lat},${targetName}&mode=walk&policy=1&src=yuyouzhice&coordinate=gaode&callnative=1`
    : `https://uri.amap.com/search?keyword=${targetName}&city=重庆&src=yuyouzhice&coordinate=gaode&callnative=1`;

  window.open(webNavUrl, '_blank', 'noopener,noreferrer');
}

/**
 * 现代 Vue 3 Composable: 响应式高德地图实例与生命周期自动销毁
 */
export function useAmap(containerRef: Ref<HTMLElement | null>) {
  const mapInstance = ref<any | null>(null);
  const overlays = ref<any[]>([]);
  const isKeyConfigured = ref(true);

  function clearOverlays() {
    if (mapInstance.value && overlays.value.length) {
      try {
        mapInstance.value.remove(overlays.value);
      } catch {}
      overlays.value = [];
    }
  }

  async function renderMap(
    trip: TripPlan | null,
    dayFilter = 0,
    userLocation?: { coordinates: [number, number]; accuracy: number; distanceText?: string } | null
  ) {
    if (!containerRef.value || !trip) return;
    const config = await loadMapConfig();
    isKeyConfigured.value = Boolean(config.keyConfigured && config.key);

    if (!isKeyConfigured.value) return;

    try {
      const AMap = await loadAmapSdk();
      if (!containerRef.value) return;

      const points = mapPoints(trip, dayFilter);
      if (!mapInstance.value) {
        const center = points[0]?.coordinates || [106.577, 29.557];
        mapInstance.value = new AMap.Map(containerRef.value, {
          zoom: points.length > 1 ? 12 : 14,
          center,
          resizeEnable: true
        });
      }

      clearOverlays();
      const currentOverlays: any[] = [];
      const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });

      // User location marker
      if (userLocation && Array.isArray(userLocation.coordinates)) {
        const userMarker = new AMap.Marker({
          position: userLocation.coordinates,
          title: '我的位置',
          content: `
            <div class="map-marker-user-location">
              <div class="user-pulse-ring"></div>
              <div class="user-marker-core">我的位置</div>
            </div>
          `,
          anchor: 'bottom-center'
        });
        userMarker.setMap(mapInstance.value);
        currentOverlays.push(userMarker);
      }

      // Stop markers
      points.forEach(({ stop, day, dayIndex, color, coordinates }) => {
        const marker = new AMap.Marker({
          position: coordinates,
          title: `第${day}天 · ${stop.name}`,
          content: `
            <div class="map-marker-pin" style="background:${color};">
              D${day}-${dayIndex} ${escapeHtml(stop.name)}
            </div>
          `,
          anchor: 'bottom-center'
        });

        marker.on('click', () => {
          const infoHtml = `
            <div class="map-info-popup">
              <div class="info-popup-meta">第 ${day} 天 · 第 ${dayIndex} 站 · ${escapeHtml(stop.district)}</div>
              <div class="info-popup-title">${escapeHtml(stop.name)}</div>
              <p class="info-popup-desc">${escapeHtml(stop.summary || '')}</p>
              <div class="info-popup-chips">
                <span class="info-chip duration">游玩 ${escapeHtml(stop.duration || '约90分钟')}</span>
                <span class="info-chip transit">${escapeHtml(stop.walk || '路线就绪')}</span>
              </div>
            </div>
          `;
          infoWindow.setContent(infoHtml);
          infoWindow.open(mapInstance.value, coordinates);
        });

        marker.setMap(mapInstance.value);
        currentOverlays.push(marker);
      });

      // Routes Polylines
      const targetDays = dayFilter > 0 ? trip.days.filter((d) => d.day === dayFilter) : trip.days;
      targetDays.forEach((day) => {
        (day.stops || []).forEach((stop) => {
          const polyline = mapPath(stop.mapContext?.polyline || []);
          if (polyline.length > 1) {
            const line = new AMap.Polyline({
              path: polyline,
              strokeColor: DAY_COLORS[(day.day - 1) % DAY_COLORS.length],
              strokeWeight: 5,
              strokeOpacity: 0.85,
              lineJoin: 'round',
              showDir: true
            });
            line.setMap(mapInstance.value);
            currentOverlays.push(line);
          }
        });
      });

      overlays.value = currentOverlays;
      if (currentOverlays.length) {
        mapInstance.value.setFitView(currentOverlays, false, [36, 36, 36, 36]);
      }
      mapInstance.value.resize();
    } catch (err) {
      console.warn('Map rendering warning:', err);
    }
  }

  function destroyMap() {
    clearOverlays();
    if (mapInstance.value) {
      try {
        mapInstance.value.destroy();
      } catch {}
      mapInstance.value = null;
    }
  }

  onUnmounted(() => {
    destroyMap();
  });

  return {
    mapInstance,
    isKeyConfigured,
    renderMap,
    destroyMap
  };
}
