/**
 * Inicialización de la aplicación al cargar el DOM.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicialización INMEDIATA de UI y Mapa
  initMap();
  setupEventListeners();
  setupSearchFunctionality();

  // 2. Tareas secundarias y de fondo
  enableUserLocation();

  // 3. Carga de datos ASÍNCRONA (Debe terminar antes de actualizar la UI)
  await detectAvailableRoutes();
  await loadAllRoutesProgressively();

  // 4. Carga de alertas y Actualización final de la UI
  await loadAlerts();
  updateUI();
  clearHighlightedStops();
});

/** * Variables globales de la aplicación.
 */
let availableRoutes = [];
let searchProximityCircle = null;
let highlightedStops = [];
let searchProximityCircles = [];
let routeAlerts = {};
let proximityThreshold = 500; // Distancia en metros para buscar rutas cercanas
let isAllRoutesSelected = false; // Variable para el estado del botón "Todas las rutas"
window.routeLayers = {}; // {'Ruta-01': L.geoJson(...), 'Ruta-02': L.geoJson(...), ...}
window.stopLayers = {};   // {'Ruta-01': L.markerClusterGroup(...), ...}
window.allRoutesGroup = L.featureGroup(); // Un grupo que contendrá TODAS las capas de rutas
window.allStopsGroup = L.featureGroup();  // Un grupo que contendrá TODAS las capas de paradas
window.routesData = { type: "FeatureCollection", features: [] };
window.stopsData = { type: "FeatureCollection", features: [] };

const API_URL = 'https://xalapago-1.onrender.com';

/**
 * Configuración inicial del mapa y capas base.
 */
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
  "cem": "Centro de Alta Especialidad",
  "plaza museo": "Cinépolis Museo"
};

/**
 * Carga las rutas y paradas de forma progresiva y las dibuja.
 * Se ejecutan en paralelo pero se procesan individualmente.
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
 * Carga y dibuja una sola ruta y sus paradas.
 * @param {string} routeId  id de la ruta a cargar
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
    // Quitar la selección de cualquier ruta individual
    document.querySelectorAll('.route-item.selected-route').forEach(item => item.classList.remove('selected-route'));

    if (isAllRoutesSelected) {
      // Si ya está seleccionado, deseleccionar y limpiar el mapa
      selectRoute('none');
      isAllRoutesSelected = false;
      allItem.classList.remove('selected');
    } else {
      // Si no está seleccionado, seleccionar y mostrar todas las rutas
      selectRoute('all');
      isAllRoutesSelected = true;
      allItem.classList.add('selected');
    }
    clearHighlightedStops();
    document.getElementById('search-place').value = '';
  });

  // Si el estado ya era seleccionado, mantener el estilo al redibujar
  if (isAllRoutesSelected) {
    allItem.classList.add('selected');
  }

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

/**
 * Agrega una ruta individual al contenedor de rutas en el panel lateral y demas informacion.
 * @param {object} properties 
 */
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

        <div class="kv tiempo-ruta-row">
          <span class="kv-label">Tiempo:</span>
           <span class="kv-value">${properties.tiempo_ruta ?? '—'}</span>
        </div>

        <p><strong>Hora de inicio a las 5:30 am - Último camión a las 9:00 pm</strong></p>
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

      // Deseleccionar el botón "Todas las rutas"
      isAllRoutesSelected = false;
      const allRoutesButton = document.querySelector('.route-item--all');
      if (allRoutesButton) {
        allRoutesButton.classList.remove('selected');
      }

      // Marcar visualmente la ruta seleccionada
      document.querySelectorAll('.route-item.selected-route').forEach(item => item.classList.remove('selected-route'));
      routeItem.classList.add('selected-route');
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
    // ✅ INICIO DE LA VERIFICACIÓN DEL ESTADO DE LOGIN
    const token = localStorage.getItem('token');
    if (!token) {
      // El usuario NO está logueado. Redirigir a la página de registro.
      // Asegúrate de que la ruta sea correcta desde el index.html
      window.location.href = "InicioSesion/registroUsuario.html";
      return; // Detener la ejecución para no abrir el modal
    }
    // ✅ FIN DE LA VERIFICACIÓN DEL ESTADO DE LOGIN

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

    //Aplica el filtro para Mujer Segura
    applyMujerSeguraFilter(); 

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
 * Lógica de búsqueda de lugares y rutas (AHORA ORÍGEN-DESTINO).
 */
function setupSearchFunctionality() {
  const originInput = document.getElementById('origin-place');
  const destinationInput = document.getElementById('destination-place');
  const searchButton = document.getElementById('route-search-button');
  const toggleButton = document.getElementById('toggle-origin-type');
  const originStatus = document.getElementById('origin-status');

  // 1. Evento principal de búsqueda
  searchButton.addEventListener('click', performRouteSearch);
  destinationInput.addEventListener('keypress', e => e.key === 'Enter' && performRouteSearch());

  // 2. Evento para cambiar el tipo de origen (GPS vs. Manual)
  toggleButton.addEventListener('click', () => {
    isUsingGeolocation = !isUsingGeolocation;

    if (isUsingGeolocation) {
      originInput.value = '';
      originInput.placeholder = 'Mi ubicación actual';
      originInput.disabled = true;
      originStatus.innerHTML = `Usando mi ubicación actual (GPS)`;
      originStatus.style.color = '#2ecc71';
      toggleButton.title = 'Usar ubicación actual';
      toggleButton.querySelector('i').className = 'fas fa-location-arrow';
    } else {
      originInput.placeholder = 'Ingresa una ubicación de origen';
      originInput.disabled = false;
      originInput.focus();
      originStatus.innerHTML = `Ingresa una ubicación personalizada`;
      originStatus.style.color = '#e74c3c';
      toggleButton.title = 'Establecer origen personalizado';
      toggleButton.querySelector('i').className = 'fas fa-map-marker-alt';
    }
  });

  // Inicializar el estado de origen (por defecto: GPS)
  originInput.disabled = true;
  originInput.value = '';
}

/**
 * Orquestador principal de la búsqueda de rutas A a B.
 */
async function performRouteSearch() {
  const destinationTerm = document.getElementById('destination-place').value.trim();
  const originTerm = document.getElementById('origin-place').value.trim();

  showSearchLoading();

  // Limpiar resultados anteriores
  clearRouteSearchMarkers();
  selectRoute('none');
  isAllRoutesSelected = false;
  clearHighlightedStops();

  if (!destinationTerm) {
    return alert('Por favor, ingresa una ubicación de destino.');
  }

  try {
    let originLocationResult;

    // 1. Determinar y geocodificar el Origen (A)
    if (isUsingGeolocation) {
      if (!currentUserLocation) {
        return alert('No se ha podido obtener tu ubicación actual. Espera unos segundos o usa la entrada manual.');
      }
      originLocationResult = { ...currentUserLocation, name: 'Ubicación Actual (GPS)' };
    } else {
      if (!originTerm) return alert('Por favor, ingresa una ubicación de origen personalizada.');
      originLocationResult = await geocodeSearchTerm(originTerm);
      if (!originLocationResult) return alert(`No se encontró el origen: ${originTerm}.`);
      originLocationResult.name = originLocationResult.displayName;
    }

    // 2. Geocodificar el Destino (B)
    const destinationLocationResult = await geocodeSearchTerm(destinationTerm);
    if (!destinationLocationResult) return alert(`No se encontró el destino: ${destinationTerm}.`);
    destinationLocationResult.name = destinationLocationResult.displayName;

    const distance = calculateDistance(
      originLocationResult.lat,
      originLocationResult.lng,
      destinationLocationResult.lat,
      destinationLocationResult.lng
    );

    // Usamos una tolerancia de 50 metros (para evitar errores de precisión en geocodificación)
    if (distance < 50) {
      return alert('⛔ El Origen y el Destino son el mismo lugar. Por favor, selecciona dos puntos diferentes.');
    }

    // 3. Dibujar marcadores A y B
    drawRouteSearchMarkers(originLocationResult, destinationLocationResult);

    // 4. Buscar rutas que pasen cerca de A y B
    // Dibuja círculos de proximidad temporales para A y B
    updateSearchProximityCircle(originLocationResult, proximityThreshold, '#3498db');
    updateSearchProximityCircle(destinationLocationResult, proximityThreshold, '#e74c3c');

    findRoutesBetweenLocations(originLocationResult, destinationLocationResult, originTerm, destinationTerm);

  } catch (error) {
    console.error('Error en la búsqueda de rutas A-B:', error);
    alert('Error al realizar la búsqueda de rutas.');
  } finally {
    hideSearchLoading();
  }
}

/**
 * Normaliza términos de búsqueda usando un diccionario de alias.
 * @param {string} term 
 * @returns {string} Término normalizado (alias si aplica)
 */
function normalizeSearchTerm(term) {
  const normalized = term.trim().toLowerCase();
  return searchAliases[normalized] || term;
}

/**
 * Geocodifica un término de búsqueda usando Nominatim.
 * @param {string} searchTerm nombre o dirección a buscar
 * @returns {Object|null} {lat, lng, displayName} o null si no se encontró
 */
async function geocodeSearchTerm(searchTerm) {
  // Función para normalizar términos (debe estar definida previamente)
  const normalized = normalizeSearchTerm(searchTerm);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalized + ', Xalapa, Veracruz')}&limit=1`);
    const data = await response.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
    return null;
  } catch (error) {
    console.error('Error en geocodificación:', error);
    return null;
  }
}

/**
 * Busca rutas cuyo campo "desc" contenga el texto indicado.
 * @param {string} keyword - Texto a buscar dentro de las descripciones de las rutas.
 * @returns {Array} - Lista de rutas coincidentes (features).
 */
function findRouteByDescription(keyword) {
  if (!window.routesData || !Array.isArray(window.routesData.features) || window.routesData.features.length === 0) {
    console.warn("⚠️ No se encontró window.routesData o está vacío.");
    return [];
  }

  const lowerKeyword = keyword.toLowerCase().trim();
  if (!lowerKeyword) return [];

  const matchingRoutes = window.routesData.features.filter(feature => {
    const desc = feature.properties?.desc?.toLowerCase() || "";
    return desc.includes(lowerKeyword);
  });

  console.log(`🔍 Se encontraron ${matchingRoutes.length} rutas que coinciden con "${keyword}" en la descripción.`);
  return matchingRoutes;
}


/**
 * Encuentra rutas que pasan cerca del origen (A) Y cerca del destino (B).
 * @param {Object} origin - Coordenadas y nombre del origen.
 * @param {Object} destination - Coordenadas y nombre del destino.
 */
function findRoutesBetweenLocations(origin, destination, originSearchTerm = "", destinationSearchTerm = "") {
  const proximityThreshold = 500; // 500 metros

  // Conjuntos para registrar qué rutas tienen paradas cerca de A y B
  const routesNearOrigin = new Set();
  const routesNearDestination = new Set();

  // Resaltar el área de búsqueda en el mapa
  updateSearchProximityCircle(origin, proximityThreshold);
  updateSearchProximityCircle(destination, proximityThreshold);

  // 1. Mapear todas las paradas para determinar cercanía a A y B
  allStopLayers.forEach(stop => {
    const routeId = stop.routeId;

    // Distancia al Origen (A)
    const distA = calculateDistance(origin.lat, origin.lng, stop.coordinates[0], stop.coordinates[1]);
    if (distA <= proximityThreshold) {
      routesNearOrigin.add(routeId);
    }

    // Distancia al Destino (B)
    const distB = calculateDistance(destination.lat, destination.lng, stop.coordinates[0], stop.coordinates[1]);
    if (distB <= proximityThreshold) {
      routesNearDestination.add(routeId);
    }
  });

  // 2. Encontrar rutas que son comunes a AMBOS conjuntos
  const commonRoutes = [...routesNearOrigin].filter(id => routesNearDestination.has(id));

  // 3. Mostrar resultados
  if (commonRoutes.length > 0) {
    showSearchResults(
      commonRoutes,
      `Rutas de ${origin.name} a ${destination.name}`
    );
  } else {
    // Buscar coincidencias en descripción
    const originMatches = findRouteByDescription(originSearchTerm);
    const destinationMatches = findRouteByDescription(destinationSearchTerm);

    // Función para filtrar coincidencias verificando proximidad al otro punto
    function filterMatchesByOtherPoint(matches, otherPoint) {
      return matches.filter(routeFeature => {
        const routeId = routeFeature.properties.id;
        const stopsForRoute = window.stopsData.features.filter(f => f.properties.routeId === routeId);
        return stopsForRoute.some(stop => calculateDistance(stop.geometry.coordinates[1], stop.geometry.coordinates[0], otherPoint.lat, otherPoint.lng) <= proximityThreshold);
      });
    }

    const filteredOriginMatches = filterMatchesByOtherPoint(originMatches, destination);
    const filteredDestinationMatches = filterMatchesByOtherPoint(destinationMatches, origin);

    // Combinar resultados sin duplicados
    const combinedMatches = [
      ...filteredOriginMatches,
      ...filteredDestinationMatches.filter(r => !filteredOriginMatches.includes(r))
    ];

    if (combinedMatches.length > 0) {
      alert(`⚠️ No se encontraron rutas directas, pero sí ${combinedMatches.length} rutas que pasan cerca de ambos puntos según la descripción.`);
      showSearchResults(combinedMatches.map(r => r.properties.id), `Coincidencias filtradas por proximidad`);
    } else {
      alert('No se encontraron rutas directas ni coincidencias que conecten ambos puntos.');
      if (typeof clearRouteSearchMarkers === 'function') clearRouteSearchMarkers();
      if (typeof clearHighlightedStops === 'function') clearHighlightedStops();
    }

  }

}


let fixedRoutes = [];
let fixedStopsLayers = {};
let fixedRoutesLayers = {};

/**
 * Muestra los resultados de la búsqueda en el panel lateral.
 * @param {Array<string>} routeIds lista de IDs de rutas a mostrar
 * @param {string} title 
 */
function showSearchResults(routeIds, title) {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `<h3>${title}</h3><button id="clear-search" class="clear-search-btn"><i class="fas fa-times"></i> Limpiar búsqueda</button>`;
  routesContainer.appendChild(resultsHeader);

  document.getElementById('clear-search').addEventListener('click', () => {
    // 1) Limpiar inputs de búsqueda (origen/destino)
    const originInput = document.getElementById('origin-place');
    const destinationInput = document.getElementById('destination-place');
    if (originInput) originInput.value = '';
    if (destinationInput) destinationInput.value = '';

    // 2) Cerrar popups abiertos y eliminar marcadores A/B + círculos de proximidad
    if (typeof map !== 'undefined' && map.closePopup) map.closePopup();
    if (typeof clearRouteSearchMarkers === 'function') clearRouteSearchMarkers(); // elimina searchOriginMarker y searchDestinationMarker
    if (typeof clearHighlightedStops === 'function') clearHighlightedStops(); // elimina searchProximityCircles y restaura iconos

    // 3) Fallback robusto: eliminar cualquier marcador con el icono 'route-search-marker'
    // (por si quedara algún marcador huérfano debido a algún edge-case)
    if (typeof map !== 'undefined' && map.eachLayer) {
      map.eachLayer(layer => {
        try {
          if (layer instanceof L.Marker &&
            layer.options && layer.options.icon &&
            layer.options.icon.options && layer.options.icon.options.className === 'route-search-marker') {
            map.removeLayer(layer);
          }
        } catch (e) { /* si falla aquí, no bloqueamos el resto */ }
      });
    }

    // 4) Restaurar UI a "Todas las rutas"
    populateRoutesList();
    selectRoute('none'); // 🔹 Limpia rutas y paradas del mapa
    isAllRoutesSelected = false;
    const allRoutesButton = document.querySelector('.route-item--all');
    if (allRoutesButton) allRoutesButton.classList.add('selected');
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

/**
 * muestra un toast temporal en la parte inferior de la pantalla.
 * @param {string} message texto a mostrar
 */
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

/**
 * Cierra el modal de alertas con animación.
 */
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
 * Dibuja una ruta específica en el mapa.
 * @param {string} routeId 
 * @returns {null}
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

/**
 * Dibuja las paradas de una ruta específica en el mapa con leaflet.
 * @param {string} routeId id de la ruta cuyas paradas se dibujarán
 * @returns {null} si no hay paradas para la ruta
 */
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

/**
 * Elimina una ruta específica del mapa.
 * @param {string} routeId 
 */
function removeRouteFromMap(routeId) {
  if (fixedRoutesLayers[routeId]) {
    map.removeLayer(fixedRoutesLayers[routeId]);
    delete fixedRoutesLayers[routeId];
  }
}

/**
 * Elimina las paradas de una ruta específica del mapa.
 * @param {string} routeId 
 */
function removeStopsFromMap(routeId) {
  if (fixedStopsLayers[routeId]) {
    map.removeLayer(fixedStopsLayers[routeId]);
    delete fixedStopsLayers[routeId];
  }
}

/**
 * Elimina todas las rutas y paradas fijadas del mapa y limpia la lista.
 */
function clearFixedRoutes() {
  Object.values(fixedRoutesLayers).forEach(layer => map.removeLayer(layer));
  Object.values(fixedStopsLayers).forEach(layer => map.removeLayer(layer));
  fixedRoutesLayers = {};
  fixedStopsLayers = {};
  fixedRoutes = [];
  document.querySelectorAll('.fix-route').forEach(cb => cb.checked = false);
}

/**
 * Resalta las paradas en el mapa dentro de un radio específico de una ubicación dada.
 * @param {object} location 
 * @param {number} radius 
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

/**
 * Crea un icono personalizado para las paradas.
 * @param {string} color 
 * @returns {L.DivIcon} icono personalizado para paradas resaltadas
 */
function createHighlightedStopIcon(color) {
  return L.divIcon({
    className: 'highlighted-stop-icon',
    html: `<div style="position:relative;display:flex;justify-content:center;align-items:center;"><div style="background-color:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px ${color}, 0 0 10px rgba(0,0,0,0.5);animation:pulse 1.5s infinite;"></div></div><style>@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.2)}100%{transform:scale(1)}}</style>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

/**
 * Dibuja un círculo de proximidad en el mapa.
 * @param {object} location 
 * @param {number} radius 
 * @param {string} color 
 */
function updateSearchProximityCircle(location, radius, color = '#e74c3c') {
  // Limpia el círculo anterior antes de dibujar uno nuevo (si solo queremos uno)
  // Como estamos dibujando dos, usaremos el array `searchProximityCircles`.

  const circle = L.circle([location.lat, location.lng], {
    color: color,
    fillColor: color,
    fillOpacity: 0.1,
    weight: 2,
    radius: radius
  }).addTo(map);

  searchProximityCircles.push(circle);

  // Asegúrate de que clearHighlightedStops limpie estos círculos
}

/**
 * Resalta las paradas en la lista lateral.
 * @param {Array} stopIds 
 */
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

/**
 * Restaura los iconos de las paradas resaltadas y limpia los círculos de búsqueda.
 */
function clearHighlightedStops() {
  highlightedStops.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    stop.marker.setIcon(createStopIcon(route ? route.properties.color : '#f39c12'));
  });
  // Nuevo: Limpiar círculos de búsqueda A-B
  searchProximityCircles.forEach(circle => map.removeLayer(circle));
  searchProximityCircles = [];

  if (searchProximityCircle) { // El círculo de la búsqueda anterior, si aún existe
    map.removeLayer(searchProximityCircle);
    searchProximityCircle = null;
  }
}

/**
 * Carga las alertas desde el servidor y actualiza el objeto local.
 */
async function loadAlerts() {
  try {
    // ✅ CORREGIDO: Usando comillas invertidas (`)
    const res = await fetch(`${API_URL}/obtenerAlertas`);
    if (!res.ok) throw new Error('Error al cargar las alertas del servidor');

    const alertsArray = await res.json();

    // Convertir el array de alertas en el objeto routeAlerts local
    routeAlerts = {}; // Limpia el objeto
    alertsArray.forEach(alert => {
      routeAlerts[alert.routeId] = alert.tipo;
    });

    console.log("✅ Alertas cargadas en el cliente:", routeAlerts);
  } catch (error) {
    console.error('❌ Error al cargar las alertas iniciales:', error);
  }
}

/**
 * Función para enviar el estado de routeAlerts al servidor.
 */
async function syncAlerts() {
  try {
    // ✅ CORREGIDO: Usando comillas invertidas (`)
    const res = await fetch(`${API_URL}/agregarAlerta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Envía el OBJETO COMPLETO, incluyendo las eliminaciones (ausencias)
      body: JSON.stringify({ routeAlerts })
    });

    console.log("📡 Estado HTTP:", res.status);
    const text = await res.text();
    console.log("📦 Respuesta cruda:", text);

    if (!res.ok) throw new Error('Error al enviar la alerta al servidor');

    console.log("✅ Alertas sincronizadas con el servidor.");
  } catch (error) {
    console.error('❌ Error al sincronizar alertas:', error);
  }
}

// --- Lógica del Botón "Guardar Alerta" ---
document.getElementById("guardar-alerta").addEventListener("click", async () => {
  const modal = document.getElementById("alertas-modal");
  const routeId = modal.dataset.routeId;
  if (!routeId) return;

  const selectedAlert = document.querySelector('input[name="alerta_tipo"]:checked');
  if (selectedAlert) {
    routeAlerts[routeId] = selectedAlert.value;
  } else {
    delete routeAlerts[routeId];
  }

  await syncAlerts();

  populateRoutesList();
  closeModal();
});


// --- Lógica del Botón "Quitar Alerta" ---
document.getElementById("quitar-alerta").addEventListener("click", async () => {
  const modal = document.getElementById("alertas-modal");
  const routeId = modal.dataset.routeId;
  if (!routeId) return;

  delete routeAlerts[routeId];

  await syncAlerts();

  populateRoutesList();
  closeModal();
});

/**
 * Muestra el estado de carga en el botón de búsqueda.
 */
function showSearchLoading() {
  const btn = document.getElementById('route-search-button');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
  btn.classList.add('loading');
}

/**
 * Restaura el estado normal del botón de búsqueda.
 */
function hideSearchLoading() {
  const btn = document.getElementById('route-search-button');
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-search"></i> Buscar Rutas';
  btn.classList.remove('loading');
}

// Filtro "Solo Mujer Segura"
let filterMujerSeguraOnly = false;

/**
 * Boton para filtrar rutas "Solo Mujer Segura".
 * @returns {void}
 */
function ensureMujerSeguraButton() {
  const list = document.getElementById('routes-container');
  if (!list) return;
  if (document.getElementById('btnMujerSegura')) return;

  const bar = document.createElement('div');
  bar.className = 'filter-ms';
  bar.innerHTML = `
    <button id="btnMujerSegura" class="btn-ms" type="button" aria-pressed="false">
      Solo “Mujer segura”
    </button>
  `;
  // Inserta el botón justo encima de la lista
  list.parentNode.insertBefore(bar, list);

  const btn = document.getElementById('btnMujerSegura');
  btn.addEventListener('click', () => {
    filterMujerSeguraOnly = !filterMujerSeguraOnly;
    btn.classList.toggle('active', filterMujerSeguraOnly);
    btn.setAttribute('aria-pressed', String(filterMujerSeguraOnly));
    btn.textContent = filterMujerSeguraOnly ? 'Mostrar todas' : 'Solo “Mujer segura”';
    applyMujerSeguraFilter();
  });
}

/**
 * Aplica el filtro "Solo Mujer Segura" a la lista de rutas.
 */
function applyMujerSeguraFilter() {
  const items = document.querySelectorAll('#routes-container .route-item');
  items.forEach(item => {
    const badge = item.querySelector('.mujer-segura-row .badge');
    const isSafe = badge && /sí|si/i.test(badge.textContent.trim());
    item.style.display = (filterMujerSeguraOnly && !isSafe) ? 'none' : '';
  });
}

// crea el botón cuando cargue el DOM
document.addEventListener('DOMContentLoaded', ensureMujerSeguraButton);
