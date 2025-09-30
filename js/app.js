
/**
 * Inicialización de la aplicación al cargar el DOM.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicialización INMEDIATA de UI y Mapa para la percepción de velocidad.
    initMap(); 
    setupEventListeners();
    setupSearchFunctionality();
    
    // 2. Tareas secundarias y de fondo
    enableUserLocation();
    clearHighlightedStops();
    
    // 3. Carga de datos ASÍNCRONA y progresiva.
    await detectAvailableRoutes(); // Solo esperamos el índice
    await loadAllRoutesProgressively(); // Lanza la carga y el dibujo en el mapa
    
    // 4. Actualización final de la UI (listas y estadísticas)
    updateUI(); 
});

/** * Variables globales de la aplicación.
 */
let availableRoutes = [];
let searchProximityCircle = null;
let highlightedStops = [];
let routeAlerts = {};
window.routeLayers = {}; // {'Ruta-01': L.geoJson(...), 'Ruta-02': L.geoJson(...), ...}
window.stopLayers = {};   // {'Ruta-01': L.markerClusterGroup(...), ...}
window.allRoutesGroup = L.featureGroup(); // Un grupo que contendrá TODAS las capas de rutas
window.allStopsGroup = L.featureGroup();  // Un grupo que contendrá TODAS las capas de paradas
window.routesData = { type: "FeatureCollection", features: [] };
window.stopsData = { type: "FeatureCollection", features: [] };

const mapSettings = {
  defaultCenter: [19.54, -96.91],
  defaultZoom: 13,
  maxZoom: 19
};
const searchAliases = {
  "caxa": "Central de Autobuses de Xalapa, Veracruz",
  "zona uv": "Zona Universitaria, Xalapa, Veracruz",
  "uv": "Universidad Veracruzana, Xalapa, Veracruz",
  "plaza crystal": "Plaza Crystal, Xalapa, Veracruz",
  "usbi": "Campus para la Cultura las Artes y el Deporte",
  "cem": "Centro de Alta Especialidad"
};

/**
 * Carga las rutas y paradas de forma progresiva y las dibuja.
 */
async function loadAllRoutesProgressively() {
    try {
        // Usar Promise.all para cargar TODAS las rutas en paralelo
        // pero mapeando la promesa para que cada una se procese y dibuje individualmente.
        const loadingPromises = availableRoutes.map(routeId => 
            loadAndDrawSingleRoute(routeId)
        );

        // Esperar a que TODAS las promesas de carga y dibujo se completen.
        // Esto asegura que `updateUI` (que llama a `populateRoutesList`)
        // solo se ejecute cuando *todos* los datos estén en `window.routesData` y `window.stopsData`.
        await Promise.all(loadingPromises);
        
        assignRouteColors();

    } catch (error) {
        console.error('Error al cargar datos progresivamente:', error);
    }
}

/**
 * Carga y procesa una sola ruta (route y stops) y la añade a las estructuras globales.
 */
async function loadAndDrawSingleRoute(routeId) {
    try {
        const [routeResponse, stopsResponse] = await Promise.all([
            fetch(`data/rutas/${routeId}/routes.geojson`),
            fetch(`data/rutas/${routeId}/stops.geojson`)
        ]);

        const routeData = await routeResponse.json();
        const stopsData = await stopsResponse.json();

        // **PASO CLAVE:** Manipulación de datos y dibujo en el mapa
        // Se hace de forma síncrona DESPUÉS de recibir el JSON, pero
        // es no-bloqueante en relación con la carga de otras rutas.
        if (routeData.features?.length > 0) {
            const routeFeature = routeData.features[0];
            routeFeature.properties.id = routeId; // Asegura que el ID esté en las propiedades
            window.routesData.features.push(routeFeature);
        }

        if (stopsData.features?.length > 0) {
            // Asigna la ruta a cada parada para la futura identificación/filtrado
            stopsData.features.forEach(stop => stop.properties.routeId = routeId);
            window.stopsData.features = window.stopsData.features.concat(stopsData.features);
        }
        
    } catch (error) {
        console.error(`Error al cargar la ruta ${routeId}:`, error);
    }
}

/**
 * Detecta las rutas disponibles desde el archivo de índice.
 */
async function detectAvailableRoutes() {
  try {
    const response = await fetch('data/rutas/index.json');
    if (!response.ok) throw new Error('No se pudo cargar el índice de rutas');
    availableRoutes = await response.json();
  } catch (error) {
    console.error('Error al detectar rutas:', error);
    availableRoutes = [];
  }
}

/**
 * Asigna un color único a cada ruta de una paleta predefinida.
 */
function assignRouteColors() {
  const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#d35400', '#c0392b', '#16a085', '#27ae60', '#8e44ad', '#f1c40f', '#e67e22', '#7f8c8d', '#34495e'];
  window.routesData.features.forEach((feature, index) => {
    feature.properties.color = colors[index % colors.length];
  });
}

/**
 * Configura los event listeners principales de la UI.
 */
function setupEventListeners() {
  document.getElementById('style-default').addEventListener('click', () => changeMapStyle('Standard'));
  document.getElementById('style-satellite').addEventListener('click', () => changeMapStyle('Satélite'));
  document.getElementById('style-dark').addEventListener('click', () => changeMapStyle('Oscuro'));

  document.getElementById('sidebar-toggle').addEventListener('click', function () {
    const container = document.querySelector('.container');
    container.classList.toggle('sidebar-colapsada');
    this.innerHTML = container.classList.contains('sidebar-colapsada') ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-times"></i>';
    setTimeout(() => map.invalidateSize(), 300);
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
}

/**
 * Actualiza todos los componentes de la UI.
 */
function updateUI() {
  populateRoutesList();
  updateStats();
  loadRoutes();
  loadStops();
}

/**
 * Rellena la lista de rutas en el panel lateral.
 */
function populateRoutesList() {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'route-item route-item--all';
  allItem.innerHTML = `<h4><i class="fas fa-layer-group"></i> Todas las rutas</h4><p>Ver todas las rutas y paradas</p>`;
  allItem.addEventListener('click', () => {
    document.getElementById('search-place').value = '';
    selectRoute('all');
    clearHighlightedStops();
  });
  routesContainer.appendChild(allItem);

  const fixedRouteFeatures = [];
  const unfixedRouteFeatures = [];
  window.routesData.features.forEach(feature => {
    (fixedRoutes.includes(feature.properties.id) ? fixedRouteFeatures : unfixedRouteFeatures).push(feature);
  });

  if (fixedRouteFeatures.length > 0) {
    const fixedHeaderContainer = document.createElement('div');
    fixedHeaderContainer.className = 'fixed-header-container';
    fixedHeaderContainer.innerHTML = `<h5>Rutas Fijadas</h5><button id="unpin-all-btn" class="unpin-all-btn"><i class="fas fa-thumbtack"></i> Desfijar todo</button>`;
    routesContainer.appendChild(fixedHeaderContainer);
    document.getElementById('unpin-all-btn').addEventListener('click', () => {
      clearFixedRoutes();
      populateRoutesList();
    });
    fixedRouteFeatures.forEach(feature => addRouteToList(feature.properties));
  }

  const allHeader = document.createElement('h5');
  allHeader.textContent = 'Todas las Rutas';
  routesContainer.appendChild(allHeader);
  unfixedRouteFeatures.forEach(feature => addRouteToList(feature.properties));
}

function addRouteToList(properties) {
    const routesContainer = document.getElementById('routes-container');
    const routeItem = document.createElement('div');
    routeItem.className = 'route-item';
    routeItem.dataset.id = properties.id;
    const isFixed = fixedRoutes.includes(properties.id) ? 'checked' : '';

    // Verificamos si hay una alerta guardada para esta ruta.
    const currentAlert = routeAlerts[properties.id];
    const buttonText = currentAlert ? 'Modificar Alerta' : 'Agregar Alerta';
    
    //Construcción de mujer segura de acuerdo al booleano en la ruta:
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
        <p>
            <strong>Imagen:</strong><br>
            ${properties.image ? `<img src="data/rutas/${properties.name}/${properties.image}" alt="${properties.name}" style="max-width:100%; height:auto;">` : '-'}
        </p>
        
        <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
        
        ${mujerSeguraHtml} 

        <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
        <p><strong>Unidades:</strong> AM:${properties.peak_am ?? 0} MD:${properties.midday ?? 0} PM:${properties.peak_pm ?? 0} NT:${properties.night ?? 0}</p>
        
        <div class="route-item-actions-hybrid">
            <label class="action-label">
                <input type="checkbox" class="fix-route" ${isFixed}> Fijar Ruta
            </label>
            <button class="alert-btn-hybrid">
                <i class="fas fa-exclamation-triangle"></i> ${buttonText}
            </button>
        </div>
        <p class="alert-message" style="font-weight:bold; margin-top: 8px;"></p>
    `;

    // Si hay una alerta guardada, la mostramos al crear el elemento.
    if (currentAlert) {
        const alertMessage = routeItem.querySelector(".alert-message");
        if (currentAlert === 'trafico') {
            routeItem.classList.add('alert-trafico');
            alertMessage.textContent = "Reporte: Tráfico Intenso 🚦";
        } else if (currentAlert === 'construccion') {
            routeItem.classList.add('alert-construccion');
            alertMessage.textContent = "Reporte: Obra en la Vía 🚧";
        } else if (currentAlert === 'bloqueo') {
            routeItem.classList.add('alert-bloqueo');
            alertMessage.textContent = "Reporte: Ruta Bloqueada ⛔";
        }
    }

    routeItem.addEventListener("click", (e) => {
        if (!e.target.closest('input, label, button')) {
            selectRoute(properties.id);
        }
    });

    const checkboxFix = routeItem.querySelector(".fix-route");
    checkboxFix.addEventListener("change", (e) => {
        if (e.target.checked) {
            if (!fixedRoutes.includes(properties.id)) {
                fixedRoutes.push(properties.id);
                drawRouteOnMap(properties.id);
                drawStopsOnMap(properties.id);
                showToast("Ruta fijada ✅");
            }
        } else {
            fixedRoutes = fixedRoutes.filter(id => id !== properties.id);
            removeRouteFromMap(properties.id);
            removeStopsFromMap(properties.id);
        }
        populateRoutesList();
    });

    const alertButton = routeItem.querySelector(".alert-btn-hybrid");
    alertButton.addEventListener("click", () => {
        const modal = document.getElementById("alertas-modal");
        const removeButton = document.getElementById("quitar-alerta");
        const hasAlert = !!routeAlerts[properties.id];

        removeButton.style.display = hasAlert ? 'inline-block' : 'none';
        modal.style.display = "flex";
        setTimeout(() => {
            modal.style.opacity = 1;
            modal.querySelector('.modal-content').style.transform = 'scale(1)';
        }, 10);
        modal.dataset.routeId = properties.id;
        
        // Si hay una alerta, pre-seleccionamos la opción correspondiente en el modal.
        if (hasAlert) {
            document.querySelector(`input[name="alerta_tipo"][value="${routeAlerts[properties.id]}"]`).checked = true;
        } else {
            document.querySelectorAll('input[name="alerta_tipo"]').forEach(radio => radio.checked = false);
        }
    });

    routesContainer.appendChild(routeItem);
}


/**
 * Actualiza las estadísticas en la UI.
 */
function updateStats() {
  const totalRoutes = window.routesData.features.length;
  const totalStops = window.stopsData.features.length;
  const update = (id, val) => document.getElementById(id) && (document.getElementById(id).textContent = val);
  update('total-routes-count', totalRoutes);
  update('total-stops-count', totalStops);
  update('info-total-routes', totalRoutes);
  update('info-total-stops', totalStops);
  update('stats-total-routes', totalRoutes);
  update('stats-total-stops', totalStops);
}

/**
 * Manejo del área de autenticación.
 */
const authArea = document.getElementById("auth-area");
const usuario = localStorage.getItem("usuario");
if (usuario && authArea) {
  authArea.innerHTML = `<div class="user-info"><span>👤 ${usuario}</span><button onclick="cerrarSesion()">Cerrar sesión</button></div>`;
}
function cerrarSesion() {
  localStorage.removeItem("usuario");
  window.location.reload();
}

/**
 * Lógica de búsqueda de lugares y rutas.
 */
function setupSearchFunctionality() {
  const searchInput = document.getElementById('search-place');
  const searchButton = document.getElementById('search-button');
  searchButton.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', e => e.key === 'Enter' && performSearch());
}

async function performSearch() {
  const searchTerm = document.getElementById('search-place').value.trim();
  if (!searchTerm) return alert('Por favor, ingresa un lugar para buscar');
  selectRoute('none');
  clearHighlightedStops();
  document.getElementById('routes-container').innerHTML = '';
  try {
    const location = await geocodeSearchTerm(searchTerm);
    if (location) {
      map.setView([location.lat, location.lng], 16);
      findRoutesNearLocation(location);
    } else {
      searchInRouteData(searchTerm);
    }
  } catch (error) {
    console.error('Error en la búsqueda:', error);
    alert('Error al realizar la búsqueda.');
  }
}

function normalizeSearchTerm(term) {
  const normalized = term.trim().toLowerCase();
  return searchAliases[normalized] || term;
}

async function geocodeSearchTerm(searchTerm) {
  try {
    const normalized = normalizeSearchTerm(searchTerm);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalized + ', Xalapa, Veracruz')}&limit=1`);
    const data = await response.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
    return null;
  } catch (error) {
    console.error('Error en geocodificación:', error);
    return null;
  }
}

function findRoutesNearLocation(location) {
  const searchTerm = document.getElementById('search-place').value.trim();
  const proximityThreshold = 500;
  highlightStopsInRange(location, proximityThreshold);
  const nearbyStops = allStopLayers.filter(stop => calculateDistance(location.lat, location.lng, stop.coordinates[0], stop.coordinates[1]) <= proximityThreshold);
  const nearbyRouteIds = [...new Set(nearbyStops.map(stop => stop.routeId))];
  if (nearbyRouteIds.length > 0) {
    showSearchResults(nearbyRouteIds, `Rutas cerca de: ${location.displayName || 'tu búsqueda'}`);
  } else {
    searchInRouteData(searchTerm);
    alert('No se encontraron rutas cercanas. Mostrando resultados relacionados.');
  }
}

function searchInRouteData(searchTerm) {
  const term = searchTerm.toLowerCase();
  const matchingRoutes = window.routesData.features
    .filter(f => (f.properties.name && f.properties.name.toLowerCase().includes(term)) || (f.properties.desc && f.properties.desc.toLowerCase().includes(term)))
    .map(f => f.properties.id);
  if (matchingRoutes.length > 0) {
    showSearchResults(matchingRoutes, `Rutas relacionadas con: ${searchTerm}`);
  } else {
    alert('No se encontraron rutas relacionadas con tu búsqueda.');
    selectRoute('all');
  }
}

let fixedRoutes = [];
let fixedStopsLayers = {};
let fixedRoutesLayers = {};

function showSearchResults(routeIds, title) {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `<h3>${title}</h3><button id="clear-search" class="clear-search-btn"><i class="fas fa-times"></i> Limpiar búsqueda</button>`;
  routesContainer.appendChild(resultsHeader);
  document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('search-place').value = '';
    populateRoutesList();
    selectRoute('all');
    clearHighlightedStops();
  });

  const fixedMatches = [];
  const unfixedMatches = [];
  window.routesData.features.forEach(feature => {
    if (routeIds.includes(feature.properties.id)) {
      (fixedRoutes.includes(feature.properties.id) ? fixedMatches : unfixedMatches).push(feature);
    }
  });

  if (fixedMatches.length > 0) {
    const fixedHeader = document.createElement('h5');
    fixedHeader.textContent = 'Fijadas y Relacionadas';
    routesContainer.appendChild(fixedHeader);
    fixedMatches.forEach(feature => addRouteToList(feature.properties));
  }
  if (unfixedMatches.length > 0) {
    const unfixedHeader = document.createElement('h5');
    unfixedHeader.textContent = 'Resultados de la búsqueda';
    routesContainer.appendChild(unfixedHeader);
    unfixedMatches.forEach(feature => addRouteToList(feature.properties));
  }
}


function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}


// ==================================================================
// --- MANEJO CENTRALIZADO DE ALERTAS ---
// ==================================================================
function closeModal() {
  const modal = document.getElementById("alertas-modal");
  modal.style.opacity = 0;
  modal.querySelector('.modal-content').style.transform = 'scale(0.9)';
  setTimeout(() => modal.style.display = "none", 300);
}

document.getElementById("guardar-alerta").addEventListener("click", () => {
    const modal = document.getElementById("alertas-modal");
    const routeId = modal.dataset.routeId;
    if (!routeId) return;

    const selectedAlert = document.querySelector('input[name="alerta_tipo"]:checked');
    if (selectedAlert) {
        routeAlerts[routeId] = selectedAlert.value;
    } else {
        delete routeAlerts[routeId];
    }
    
    populateRoutesList();
    closeModal();
});

document.getElementById("quitar-alerta").addEventListener("click", () => {
    const modal = document.getElementById("alertas-modal");
    const routeId = modal.dataset.routeId;
    if (!routeId) return;

    delete routeAlerts[routeId];
    
    populateRoutesList();
    closeModal();
});

document.getElementById("cancelar-alerta").addEventListener("click", closeModal);
document.getElementById("alertas-modal").addEventListener("click", e => e.target.id === 'alertas-modal' && closeModal());


/**
 * Funciones para dibujar y remover rutas/paradas del mapa.
 */
function drawRouteOnMap(routeId) {
  const feature = window.routesData.features.find(f => f.properties.id === routeId);
  if (!feature) return;
  const color = feature.properties.color || "blue";
  const layer = L.geoJSON(feature, {
    style: () => ({ color, weight: 4 }),
  }).addTo(map);
  fixedRoutesLayers[routeId] = layer;
}

function drawStopsOnMap(routeId) {
  const stopsForRoute = window.stopsData.features.filter(f => f.properties.routeId === routeId);
  if (stopsForRoute.length === 0) return;
  const route = window.routesData.features.find(r => r.properties.id === routeId);
  const color = route ? route.properties.color : '#f39c12';
  const stopsLayer = L.geoJSON({ type: "FeatureCollection", features: stopsForRoute }, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: createStopIcon(color) }).bindPopup(`<b>Parada #${feature.properties.sequence}</b><br>Ruta: ${routeId}`)
  }).addTo(map);
  fixedStopsLayers[routeId] = stopsLayer;
}

function removeRouteFromMap(routeId) {
  if (fixedRoutesLayers[routeId]) {
    map.removeLayer(fixedRoutesLayers[routeId]);
    delete fixedRoutesLayers[routeId];
  }
}

function removeStopsFromMap(routeId) {
  if (fixedStopsLayers[routeId]) {
    map.removeLayer(fixedStopsLayers[routeId]);
    delete fixedStopsLayers[routeId];
  }
}

function clearFixedRoutes() {
  Object.values(fixedRoutesLayers).forEach(layer => map.removeLayer(layer));
  Object.values(fixedStopsLayers).forEach(layer => map.removeLayer(layer));
  fixedRoutesLayers = {};
  fixedStopsLayers = {};
  fixedRoutes = [];
  document.querySelectorAll('.fix-route').forEach(cb => cb.checked = false);
}

/**
 * Funciones para resaltar paradas en el mapa y la lista.
 */
function highlightStopsInRange(location, radius = 500) {
  clearHighlightedStops();
  updateSearchProximityCircle(location, radius);
  const stopsInRange = allStopLayers.filter(stop => calculateDistance(location.lat, location.lng, stop.coordinates[0], stop.coordinates[1]) <= radius);
  stopsInRange.forEach(stop => {
    stop.marker.setIcon(createHighlightedStopIcon('#e74c3c'));
    highlightedStops.push(stop);
  });
  if (stopsInRange.length > 0) {
    const closestStop = stopsInRange.reduce((prev, curr) => calculateDistance(location.lat, location.lng, prev.coordinates[0], prev.coordinates[1]) < calculateDistance(location.lat, location.lng, curr.coordinates[0], curr.coordinates[1]) ? prev : curr);
    closestStop.marker.openPopup();
  }
  highlightStopsInList(stopsInRange.map(stop => stop.id));
}

function createHighlightedStopIcon(color) {
  return L.divIcon({
    className: 'highlighted-stop-icon',
    html: `<div style="position:relative;display:flex;justify-content:center;align-items:center;"><div style="background-color:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px ${color}, 0 0 10px rgba(0,0,0,0.5);animation:pulse 1.5s infinite;"></div></div><style>@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.2)}100%{transform:scale(1)}}</style>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function updateSearchProximityCircle(location, radius) {
  if (searchProximityCircle) map.removeLayer(searchProximityCircle);
  searchProximityCircle = L.circle([location.lat, location.lng], {
    color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.1, weight: 2, radius: radius
  }).addTo(map).bindTooltip(`Radio de búsqueda: ${radius}m`, { permanent: false, direction: 'center' });
}

function highlightStopsInList(stopIds) {
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
    item.style.borderLeft = 'none';
  });
  stopIds.forEach(id => {
    const stopItem = document.querySelector(`.stop-item[data-id="${id}"]`);
    if (stopItem) {
      stopItem.style.backgroundColor = '#fff3f3';
      stopItem.style.borderLeft = '4px solid #e74c3c';
    }
  });
}

function clearHighlightedStops() {
  highlightedStops.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    stop.marker.setIcon(createStopIcon(route ? route.properties.color : '#f39c12'));
  });
  highlightedStops = [];
  if (searchProximityCircle) {
    map.removeLayer(searchProximityCircle);
    searchProximityCircle = null;
  }
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
    item.style.borderLeft = 'none';
  });
}
