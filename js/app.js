/**
 * Inicialización de la aplicación al cargar el DOM.
 * Se encarga de cargar datos, inicializar el mapa,
 * habilitar la ubicación del usuario, configurar eventos,
 * preparar la búsqueda y actualizar la interfaz de usuario.
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initMap();
  enableUserLocation();
  setupEventListeners();
  setupSearchFunctionality();
  clearHighlightedStops();
  updateUI();
});

/** * Variables globales que almacenan rutas disponibles,
 * el círculo de proximidad de búsqueda, las paradas resaltadas
 * y la configuración inicial del mapa.
 */
let availableRoutes = [];
let searchProximityCircle = null;
let highlightedStops = [];
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
 * Carga los datos de rutas y paradas desde archivos GeoJSON.
 * Detecta las rutas disponibles, obtiene la información
 * de cada ruta y sus paradas, y finalmente asigna colores.
 * * @async
 * @function loadData
 */
async function loadData() {
  try {
    window.routesData = { type: "FeatureCollection", features: [] };
    window.stopsData = { type: "FeatureCollection", features: [] };

    await detectAvailableRoutes();

    for (const routeId of availableRoutes) {
      try {
        const [routeResponse, stopsResponse] = await Promise.all([
          fetch(`data/rutas/${routeId}/routes.geojson`),
          fetch(`data/rutas/${routeId}/stops.geojson`)
        ]);

        const routeData = await routeResponse.json();
        const stopsData = await stopsResponse.json();

        if (routeData.features?.length > 0) {
          window.routesData.features.push(routeData.features[0]);
        }

        if (stopsData.features?.length > 0) {
          window.stopsData.features = window.stopsData.features.concat(stopsData.features);
        }
      } catch (error) {
        console.error(`Error al cargar la ruta ${routeId}:`, error);
      }
    }

    assignRouteColors();
  } catch (error) {
    console.error('Error al cargar los datos:', error);
  }
}

/**
 * Detecta las rutas disponibles leyendo el archivo índice.
 * Actualiza la variable global `availableRoutes`.
 * * @async
 * @function detectAvailableRoutes
 */
async function detectAvailableRoutes() {
  try {
    const response = await fetch('data/rutas/index.json');
    if (!response.ok) throw new Error('No se pudo cargar el índice de rutas');

    const routeIds = await response.json();
    availableRoutes = routeIds;
  } catch (error) {
    console.error('Error al detectar rutas:', error);
    availableRoutes = [];
  }
}

/**
 * Asigna colores a las rutas cargadas de forma cíclica
 * desde una paleta de colores predefinida.
 * * @function assignRouteColors
 */
function assignRouteColors() {
  const colors = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#d35400', '#c0392b', '#16a085', '#27ae60',
    '#8e44ad', '#f1c40f', '#e67e22', '#7f8c8d', '#34495e'
  ];

  window.routesData.features.forEach((feature, index) => {
    feature.properties.color = colors[index % colors.length];
  });
}

/**
 * Configura los event listeners de la aplicación,
 * incluyendo cambio de estilos del mapa, apertura/cierre
 * de la barra lateral y manejo de pestañas.
 * * @function setupEventListeners
 */
function setupEventListeners() {
  document.getElementById('style-default').addEventListener('click', () => changeMapStyle('Standard'));
  document.getElementById('style-satellite').addEventListener('click', () => changeMapStyle('Satélite'));
  document.getElementById('style-dark').addEventListener('click', () => changeMapStyle('Oscuro'));

  document.getElementById('sidebar-toggle').addEventListener('click', function () {
    const container = document.querySelector('.container');
    container.classList.toggle('sidebar-colapsada');

    this.innerHTML = container.classList.contains('sidebar-colapsada')
      ? '<i class="fas fa-bars"></i>'
      : '<i class="fas fa-times"></i>';

    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
}

/**
 * Actualiza la interfaz de usuario cargando rutas,
 * paradas y estadísticas.
 * * @function updateUI
 */
function updateUI() {
  populateRoutesList();
  updateStats();
  loadRoutes();
  loadStops();
}

/**
 * Pobla la lista de rutas en el contenedor lateral,
 * incluyendo un elemento para mostrar todas las rutas
 * y los elementos individuales para cada ruta.
 * * @function populateRoutesList
 */
function populateRoutesList() {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'route-item route-item--all';
  allItem.innerHTML = `
    <h4><i class="fas fa-layer-group"></i> Todas las rutas</h4>
    <p>Ver todas las rutas y paradas</p>
  `;
  allItem.addEventListener('click', () => {
    document.getElementById('search-place').value = '';
    selectRoute('all');
    clearHighlightedStops();
  });
  routesContainer.appendChild(allItem);

  const fixedRouteFeatures = [];
  const unfixedRouteFeatures = [];

  window.routesData.features.forEach(feature => {
    if (fixedRoutes.includes(feature.properties.id)) {
      fixedRouteFeatures.push(feature);
    } else {
      unfixedRouteFeatures.push(feature);
    }
  });

  if (fixedRouteFeatures.length > 0) {
    const fixedHeaderContainer = document.createElement('div');
    fixedHeaderContainer.className = 'fixed-header-container';
    fixedHeaderContainer.innerHTML = `
      <h5>Rutas Fijadas</h5>
      <button id="unpin-all-btn" class="unpin-all-btn">
        <i class="fas fa-thumbtack"></i> Desfijar todo
      </button>
    `;
    routesContainer.appendChild(fixedHeaderContainer);

    document.getElementById('unpin-all-btn').addEventListener('click', () => {
      clearFixedRoutes();
      populateRoutesList();
    });

    fixedRouteFeatures.forEach(feature => {
      addRouteToList(feature.properties);
    });
  }

  const allHeader = document.createElement('h5');
  allHeader.textContent = 'Todas las Rutas';
  routesContainer.appendChild(allHeader);
  unfixedRouteFeatures.forEach(feature => {
    addRouteToList(feature.properties);
  });
}

/**
 * Actualiza las estadísticas globales de la aplicación,
 * mostrando número total de rutas y paradas.
 * * @function updateStats
 */
function updateStats() {
  const totalRoutes = window.routesData.features.length;
  const totalStops = window.stopsData.features.length;

  const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  updateElement('total-routes-count', totalRoutes);
  updateElement('total-stops-count', totalStops);
  updateElement('info-total-routes', totalRoutes);
  updateElement('info-total-stops', totalStops);
  updateElement('stats-total-routes', totalRoutes);
  updateElement('stats-total-stops', totalStops);
}

/**
 * Manejo de login local con almacenamiento en `localStorage`.
 * Si hay un usuario guardado, se muestra su información
 * y la opción de cerrar sesión.
 */
const authArea = document.getElementById("auth-area");
const usuario = localStorage.getItem("usuario");

if (usuario && authArea) {
  authArea.innerHTML = `
    <div class="user-info">
      <span>👤 ${usuario}</span>
      <button onclick="cerrarSesion()">Cerrar sesión</button>
    </div>
  `;
}

/**
 * Cierra la sesión del usuario eliminando
 * su información de `localStorage` y recargando la página.
 * * @function cerrarSesion
 */
function cerrarSesion() {
  localStorage.removeItem("usuario");
  window.location.reload();
}

// Función para buscar lugares y filtrar rutas
function setupSearchFunctionality() {
  const searchInput = document.getElementById('search-place');
  const searchButton = document.getElementById('search-button');

  searchButton.addEventListener('click', performSearch);

  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
}

// Realizar la búsqueda
async function performSearch() {
  const searchTerm = document.getElementById('search-place').value.trim();

  if (!searchTerm) {
    alert('Por favor, ingresa un lugar para buscar');
    return;
  }

  selectRoute('none');
  clearHighlightedStops();

  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

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
    alert('Error al realizar la búsqueda. Intenta con otro término.');
  }
}

// Normaliza y reemplaza el término de búsqueda si es un alias
function normalizeSearchTerm(term) {
  const normalized = term.trim().toLowerCase();
  return searchAliases[normalized] || term;
}

// Geocodificar el término de búsqueda usando Nominatim (OpenStreetMap)
async function geocodeSearchTerm(searchTerm) {
  try {
    const normalizedTerm = normalizeSearchTerm(searchTerm);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedTerm + ', Xalapa, Veracruz')}&limit=1`);
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error('Error en geocodificación:', error);
    return null;
  }
}

// Encontrar rutas cercanas a una ubicación
function findRoutesNearLocation(location) {
  const searchTerm = document.getElementById('search-place').value.trim();
  const proximityThreshold = 500; // metros

  highlightStopsInRange(location, proximityThreshold);

  const nearbyStops = allStopLayers.filter(stop => {
    const distance = calculateDistance(
      location.lat, location.lng,
      stop.coordinates[0], stop.coordinates[1]
    );
    return distance <= proximityThreshold;
  });

  const nearbyRouteIds = [...new Set(nearbyStops.map(stop => stop.routeId))];

  if (nearbyRouteIds.length > 0) {
    showSearchResults(nearbyRouteIds, `Rutas cerca de: ${location.displayName || 'tu búsqueda'}`);
  } else {
    searchInRouteData(searchTerm);
    alert('No se encontraron rutas cercanas a este lugar. Mostrando resultados relacionados.');
  }
}

// Buscar en los datos de las rutas (nombres, descripciones)
function searchInRouteData(searchTerm) {
  const term = searchTerm.toLowerCase();
  const matchingRoutes = [];

  window.routesData.features.forEach(feature => {
    const props = feature.properties;
    const nameMatch = props.name && props.name.toLowerCase().includes(term);
    const descMatch = props.desc && props.desc.toLowerCase().includes(term);

    if (nameMatch || descMatch) {
      matchingRoutes.push(props.id);
    }
  });

  if (matchingRoutes.length > 0) {
    showSearchResults(matchingRoutes, `Rutas relacionadas con: ${searchTerm}`);
  } else {
    alert('No se encontraron rutas relacionadas con tu búsqueda.');
    selectRoute('all');
  }
}

// Array global para rutas y paradas fijadas
let fixedRoutes = [];
let fixedStopsLayers = {};
let fixedRoutesLayers = {};


// Mostrar resultados de búsqueda
function showSearchResults(routeIds, title) {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `
    <h3>${title}</h3>
    <button id="clear-search" class="clear-search-btn">
      <i class="fas fa-times"></i> Limpiar búsqueda
    </button>
  `;
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
      if (fixedRoutes.includes(feature.properties.id)) {
        fixedMatches.push(feature);
      } else {
        unfixedMatches.push(feature);
      }
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
// --- FUNCIÓN MODIFICADA PARA INTEGRAR LAS MEJORAS DE ALERTA ---
// ==================================================================
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;

  const isFixed = fixedRoutes.includes(properties.id) ? 'checked' : '';

  // Se mantiene tu estructura HTML original
  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    <p>
      <strong>Imagen:</strong><br>
      ${properties.image ? `<img src="data/rutas/${properties.name}/${properties.image}" alt="${properties.name}" style="max-width:100%; height:auto;">` : '-'}
    </p>
    <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
    <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
    <p><strong>Unidades:</strong> AM:${properties.peak_am ?? 0} MD:${properties.midday ?? 0} PM:${properties.peak_pm ?? 0} NT:${properties.night ?? 0}</p>
    <p><strong>Fijar ruta</strong><input type="checkbox" class="fix-route" ${isFixed}></p>
    <p><strong>Agregar alerta</strong><input type="checkbox" class="alertas-ruta"></p>
    <p class="alert-message" style="font-weight:bold;"></p>
    <span class="check-feedback" style="display:none; color:green; font-weight:bold; margin-left:10px;">✅ Fijada</span>
  `;

  routeItem.addEventListener("click", (e) => {
    if (e.target.tagName.toLowerCase() !== "input") {
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
      routeItem.style.backgroundColor = ""; // Limpiar si se desfija
    }
    populateRoutesList();
  });

  // --- LÓGICA MODIFICADA ---
  // Ahora el checkbox original abre la nueva ventana modal mejorada.
  const checkboxAlerta = routeItem.querySelector(".alertas-ruta");
  checkboxAlerta.addEventListener("change", (e) => {
    const modal = document.getElementById("alertas-modal"); // Apuntamos al nuevo modal

    if (e.target.checked) {
      modal.style.display = "flex";
      // Añadimos una pequeña animación de entrada
      setTimeout(() => {
        modal.style.opacity = 1;
        modal.querySelector('.modal-content').style.transform = 'scale(1)';
      }, 10);

      modal.dataset.routeId = properties.id;
      // Deseleccionamos cualquier opción previa en el modal
      modal.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);

    } else {
      // Si el usuario desmarca el checkbox, se elimina la alerta
      const alertMessage = routeItem.querySelector(".alert-message");
      routeItem.classList.remove('alert-trafico', 'alert-construccion', 'alert-bloqueo');
      alertMessage.textContent = "";
      closeModal(); // Se cierra el modal si estuviera abierto
    }
  });

  routesContainer.appendChild(routeItem);
}


// ==================================================================
// --- NUEVO BLOQUE DE CÓDIGO PARA MANEJAR LA VENTANA MODAL ---
// ==================================================================

// Función para cerrar el modal con animación
function closeModal() {
  const modal = document.getElementById("alertas-modal");
  modal.style.opacity = 0;
  modal.querySelector('.modal-content').style.transform = 'scale(0.9)';
  setTimeout(() => {
    modal.style.display = "none";
  }, 300); // Esperamos que la animación termine
}

// Listener para el botón de GUARDAR del nuevo modal
document.getElementById("guardar-alerta").addEventListener("click", () => {
  const modal = document.getElementById("alertas-modal");
  const routeId = modal.dataset.routeId;
  if (!routeId) return;

  const routeItem = document.querySelector(`.route-item[data-id="${routeId}"]`);
  const alertMessage = routeItem.querySelector(".alert-message");

  // Limpiamos clases y mensajes de alerta previos
  routeItem.classList.remove('alert-trafico', 'alert-construccion', 'alert-bloqueo');
  alertMessage.textContent = "";

  // Buscamos qué opción (radio button) fue seleccionada
  const selectedAlert = document.querySelector('input[name="alerta_tipo"]:checked');

  if (selectedAlert) {
    const alertType = selectedAlert.value;
    if (alertType === 'trafico') {
      routeItem.classList.add('alert-trafico');
      alertMessage.textContent = "Reporte: Tráfico Intenso 🚦";
    } else if (alertType === 'construccion') {
      routeItem.classList.add('alert-construccion');
      alertMessage.textContent = "Reporte: Obra en la Vía 🚧";
    } else if (alertType === 'bloqueo') {
      routeItem.classList.add('alert-bloqueo');
      alertMessage.textContent = "Reporte: Ruta Bloqueada ⛔";
    }
  } else {
    // Si no se seleccionó nada, desmarcamos el checkbox de alerta en la ruta
    const checkboxAlerta = routeItem.querySelector(".alertas-ruta");
    if (checkboxAlerta) checkboxAlerta.checked = false;
  }

  closeModal();
});

// Listener para el botón CANCELAR
document.getElementById("cancelar-alerta").addEventListener("click", () => {
  const modal = document.getElementById("alertas-modal");
  const routeId = modal.dataset.routeId;
  if (routeId) {
    // Si se cancela, nos aseguramos de que el checkbox de la ruta se desmarque
    const routeItem = document.querySelector(`.route-item[data-id="${routeId}"]`);
    const checkboxAlerta = routeItem.querySelector(".alertas-ruta");
    if (checkboxAlerta) checkboxAlerta.checked = false;
  }
  closeModal();
});

// Listener para cerrar el modal si se hace clic fuera de él
document.getElementById("alertas-modal").addEventListener("click", (e) => {
  if (e.target.id === 'alertas-modal') {
    const routeId = e.currentTarget.dataset.routeId;
    if (routeId) {
      const routeItem = document.querySelector(`.route-item[data-id="${routeId}"]`);
      const checkboxAlerta = routeItem.querySelector(".alertas-ruta");
      if (checkboxAlerta) checkboxAlerta.checked = false;
    }
    closeModal();
  }
});

function drawRouteOnMap(routeId) {
  const feature = window.routesData.features.find(f => f.properties.id === routeId);
  if (!feature) return;

  const color = feature.properties.color || "blue";

  const layer = L.geoJSON(feature, {
    style: (f) => {
      if (f.geometry.type === "LineString") {
        return { color, weight: 4 };
      }
    },
    pointToLayer: (f, latlng) => { // Corregido 'zintToLayer' por 'pointToLayer'
      if (f.geometry.type === "Point") {
        return L.marker(latlng).bindPopup(`<b>${f.properties.name || "Parada"}</b>`);
      }
    }
  }).addTo(map);

  fixedRoutesLayers[routeId] = layer;
}

function drawStopsOnMap(routeId) {
  const stopsForRoute = window.stopsData.features.filter(
    f => f.properties.routeId === routeId
  );

  if (stopsForRoute.length === 0) return;

  const route = window.routesData.features.find(r => r.properties.id === routeId);
  const color = route ? route.properties.color : '#f39c12';

  const stopsLayer = L.geoJSON({
    type: "FeatureCollection",
    features: stopsForRoute
  }, {
    pointToLayer: (feature, latlng) => {
      return L.marker(latlng, {
        icon: createStopIcon(color)
      }).bindPopup(`<b>${feature.properties.name || "Parada"}</b>`);
    }
  }).addTo(map);

  fixedStopsLayers[routeId] = stopsLayer;
}

function removeRouteFromMap(routeId) {
  const layer = fixedRoutesLayers[routeId];
  if (!layer) return;

  map.removeLayer(layer);
  delete fixedRoutesLayers[routeId];
}

function removeStopsFromMap(routeId) {
  const layer = fixedStopsLayers[routeId];
  if (!layer) return;

  map.removeLayer(layer);
  delete fixedStopsLayers[routeId];
}

function clearFixedRoutes() {
  for (const routeId in fixedRoutesLayers) {
    if (fixedRoutesLayers.hasOwnProperty(routeId)) {
      map.removeLayer(fixedRoutesLayers[routeId]);
    }
  }
  fixedRoutesLayers = {};

  for (const routeId in fixedStopsLayers) {
    if (fixedStopsLayers.hasOwnProperty(routeId)) {
      map.removeLayer(fixedStopsLayers[routeId]);
    }
  }
  fixedStopsLayers = {};

  fixedRoutes = [];

  document.querySelectorAll('.fix-route').forEach(checkbox => {
    checkbox.checked = false;
  });
}

function highlightStopsInRange(location, radius = 500) {
  clearHighlightedStops();
  updateSearchProximityCircle(location, radius);

  const stopsInRange = allStopLayers.filter(stop => {
    const distance = calculateDistance(
      location.lat, location.lng,
      stop.coordinates[0], stop.coordinates[1]
    );
    return distance <= radius;
  });

  stopsInRange.forEach(stop => {
    const highlightIcon = createHighlightedStopIcon('#e74c3c');
    stop.marker.setIcon(highlightIcon);
    highlightedStops.push(stop);
  });

  if (stopsInRange.length > 0) {
    const closestStop = stopsInRange.reduce((prev, curr) => {
      const prevDist = calculateDistance(location.lat, location.lng, prev.coordinates[0], prev.coordinates[1]);
      const currDist = calculateDistance(location.lat, location.lng, curr.coordinates[0], curr.coordinates[1]);
      return prevDist < currDist ? prev : curr;
    });
    closestStop.marker.openPopup();
  }

  highlightStopsInList(stopsInRange.map(stop => stop.id));
}

function createHighlightedStopIcon(color) {
  return L.divIcon({
    className: 'highlighted-stop-icon',
    html: `
      <div style="
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
      ">
        <div style="
          background-color: ${color};
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 0 0 3px ${color}, 0 0 10px rgba(0,0,0,0.5);
          animation: pulse 1.5s infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      </style>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function updateSearchProximityCircle(location, radius) {
  if (searchProximityCircle) {
    map.removeLayer(searchProximityCircle);
  }

  searchProximityCircle = L.circle([location.lat, location.lng], {
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.1,
    weight: 2,
    radius: radius
  }).addTo(map);

  searchProximityCircle.bindTooltip(
    `Radio de búsqueda: ${radius}m`,
    { permanent: false, direction: 'center' }
  );
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
    const color = route ? route.properties.color : '#f39c12';
    stop.marker.setIcon(createStopIcon(color));
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