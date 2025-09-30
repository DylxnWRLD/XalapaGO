/**
 * Esta funcion se encarga de añadir una parada al contenedor de paradas en el panel lateral y ademas 
 * cuando se hace clic en alguna parada se muestra un recuadro con la informacion de la parada y ruta,
 * esto sirve para marcar una parada y saber en donde debes bajarte del camion.
 * 
 * @param {Object} properties objeto con los datos de las paradas
 */

/** ===== Helpers de tiempo estimado por ruta (no invasivos) ===== */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function speedForMinute(minuteOfDay) {
  // Perfil simple: horas pico 07–09 y 18–20 más lentas
  const inWin = (m, a, b) => m >= a && m < b;
  const m = minuteOfDay % (24*60);
  if (inWin(m, 7*60, 9*60) || inWin(m, 18*60, 20*60)) return 16; // km/h
  return 22; // km/h
}
function normalizeDwell(x, fallback=30) {
  if (!Number.isFinite(x) || x < 0 || x > 300) return fallback;
  return Math.round(x);
}
function isSensibleTravelTime(x) {
  return Number.isFinite(x) && x >= 0 && x <= 1800; // 0–30 min por tramo
}
function formatHM_fromSeconds(totalSeconds) {
  const m = Math.round(totalSeconds / 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm} h` : `${m} min`;
}
/**
 * Lee data/rutas/<routeId>/stops.geojson y estima el total de la ruta en segundos.
 * - Usa travelTime/dwellTime si son razonables; si no, calcula por distancia (Haversine).
 * - NO escribe nada en disco; sólo calcula y devuelve el total en segundos.
 */
async function estimateRouteRuntimeSeconds(routeId) {
  try {
    const resp = await fetch(`data/rutas/${routeId}/stops.geojson`);
    if (!resp.ok) throw new Error('No se pudo leer stops.geojson');
    const fc = await resp.json();
    const feats = (fc.features || []).slice()
      .sort((a,b) => (a.properties?.sequence ?? 0) - (b.properties?.sequence ?? 0));

    let total = 0;
    let tmin = 7*60; // Minutos desde 00:00 (07:00 referencia para perfil velo.)

    for (let i=0; i<feats.length; i++) {
      const f = feats[i];
      const p = f.properties || {};
      let dwell = normalizeDwell(Number(p.dwellTime)); // si está rara, 30s

      if (i === 0) { // primer punto: sólo dwell
        total += dwell;
        continue;
      }

      const prev = feats[i-1];
      const [plon, plat] = prev.geometry.coordinates;
      const [lon, lat] = f.geometry.coordinates;

      const distM = haversineMeters(plat, plon, lat, lon);
      const vKmh = speedForMinute(tmin);
      const est = Math.round((distM/1000) / Math.max(vKmh, 1e-6) * 3600); // s

      const tt = isSensibleTravelTime(Number(p.travelTime)) ? Number(p.travelTime) : est;
      total += tt + dwell;

      // avanzar “reloj” de referencia para el perfil de velocidad
      tmin += Math.round((tt + dwell)/60);
    }
    return total;
  } catch (e) {
    console.warn('estimateRouteRuntimeSeconds error:', e);
    return null; // si falta archivo o falla, devolvemos null
  }
}


function addStopToList(properties) {
  const stopsContainer = document.getElementById('stops-container');
  const stopItem = document.createElement('div');
  stopItem.className = 'stop-item';
  stopItem.dataset.id = properties.id;
  stopItem.dataset.route = properties.routeId;
  
  // Mostrar el numero de la Parada
  stopItem.innerHTML = `
    <h4><i class="fas fa-map-marker-alt"></i> Parada #${properties.sequence}</h4>
    <p><strong>Ruta:</strong> ${properties.routeId}</p>
    <p><strong>ID:</strong> ${properties.id}</p>
  `;
  
  // se añade un evento para resaltar la parada al hacer clic
  stopItem.addEventListener('click', function() {
    highlightStop(properties.id);
    const stopLayer = allStopLayers.find(s => s.id === properties.id);
    if (stopLayer) {
      map.setView(stopLayer.marker.getLatLng(), 16);
      stopLayer.marker.openPopup();
    }
  });
  
  stopsContainer.appendChild(stopItem);
}


/**
 * Esta funcion se encarga de añadir una ruta al contenedor de rutas en el panel lateral y poder 
 * seleccionar una rutal hacer clic sobre su recuadro.
 * 
 * @param {object} properties objeto que contiene toda la informacion sobre las rutas 
 */
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;

const routeFolder = String(properties.name || properties.id || '').trim(); 
const rawImg = (properties.image || '').trim();
let imgSrc = '';

if (!rawImg) {
  imgSrc = `data/rutas/${routeFolder}/bus${routeFolder}.jpg`;
} else if (/^(https?:)?\/\//.test(rawImg) || rawImg.includes('/')) {
  imgSrc = rawImg;
} else {
  imgSrc = `data/rutas/${routeFolder}/${rawImg}`;
}

const imgHtml = `
  <p>
    <strong>Imagen:</strong><br>
    <img class="route-img"
         src="${imgSrc}"
         alt="${properties.name || properties.id}"
         style="max-width:100%; height:auto; border-radius:8px; margin:.25rem 0 .5rem;"
         onerror="
           // 1) si falla .jpg/.jpeg minúsculas -> intenta mayúsculas
           if (!this.dataset.up) { this.dataset.up = 1;
             this.src = this.src.replace(/\\.jpg$/,'\\.JPG').replace(/\\.jpeg$/i,'\\.JPEG'); return;
           }
           // 2) si falla, intenta .png
           if (!this.dataset.png) { this.dataset.png = 1;
             this.src = this.src.replace(/\\.(jpg|jpeg)$/i,'.png').replace(/\\.(JPG|JPEG)$/i,'.PNG'); return;
           }
           // 3) si también falla, muestra guión
           const p = this.closest('p'); if (p) p.innerHTML = '-';
         ">
  </p>
`;

// Soporta booleano y texto "si/sí"
const v = properties.mujer_segura;
const isSafe = (v === true) || (String(v).toLowerCase() === 'si') || (String(v).toLowerCase() === 'sí');


const mujerSeguraHtml = `
  <div class="kv mujer-segura-row">
    <span class="kv-label">¿Versión “Mujer segura”?</span>
    <span class="badge ${isSafe ? 'ok' : 'no'}">${isSafe ? 'Sí' : 'No'}</span>
  </div>
`;



routeItem.innerHTML = `
  <h4><i class="fas fa-route"></i> ${properties.name}</h4>

  ${imgHtml}

  <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>

  <div class="kv runtime-row">
    <span class="kv-label">Tiempo estimado:</span>
    <span class="kv-value" id="runtime-${properties.id}">calculando…</span>
  </div>


  ${mujerSeguraHtml}   <!-- ← agregado aquí, debajo de Descripción -->

  
  <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>

  <p><strong>Unidades:</strong>
    AM:${properties.peak_am ?? '—'}
    MD:${properties.midday ?? '—'}
    PM:${properties.peak_pm ?? '—'}
    NT:${properties.night ?? '—'}
  </p>
`;

estimateRouteRuntimeSeconds(properties.id).then(sec => {
  const span = routeItem.querySelector(`#runtime-${CSS.escape(String(properties.id))}`);
  if (span) {
    span.textContent = (sec == null) ? '—' : formatHM_fromSeconds(sec);
  }
});

  routeItem.addEventListener('click', function () { selectRoute(properties.id); });
  routesContainer.appendChild(routeItem);
}



/**
 * la funcion se encarga de resaltar la parada seleccionada en el panel lateral y en el mapa
 * ademas de restablecer las demas paradas a su estado original (color e icono).
 * 
 * @param {string} stopId id de la parada seleccionada
 */
function highlightStop(stopId) {
  // Restablecer todas las paradas
  allStopLayers.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    const color = route ? route.properties.color : '#f39c12';
    stop.marker.setIcon(createStopIcon(color));
  });
  
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
  });
  
  // Resaltar la parada seleccionada
  const selected = allStopLayers.find(stop => stop.id === stopId);
  if (selected) {
    selected.marker.setIcon(createStopIcon('#2ecc71'));
    document.querySelector(`.stop-item[data-id="${stopId}"]`).style.backgroundColor = '#f0f7ff';
  }
}
